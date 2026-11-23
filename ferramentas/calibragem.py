# /// script
# requires-python = ">=3.11"
# dependencies = ["scenedetect>=0.7.1", "opencv-python-headless", "httpx"]
# ///
"""Calibragem da direção (do 18: SPEC §8.11, docs/direcao.md §8.2.1; direcao.py, calibragem.py, referencias.py): os Reels
já editados do criador viram os roteiros dirigidos de exemplo que a direção lê (`biblioteca/exemplos/`).

    uv run ferramentas/calibragem.py listar
    uv run ferramentas/calibragem.py analisar <vídeo> [--nome N]   # enfileira e roda já, mostrando o andamento
    uv run ferramentas/calibragem.py analisar --id <id>            # o trabalho de fundo (o app dispara)
    uv run ferramentas/calibragem.py roteiros                      # reescreve exemplos/<categoria>/roteiros/*.md e favoritos.md
    uv run ferramentas/calibragem.py de-projeto <slug> [vN]        # a versão aprovada de um projeto vira referência
    uv run ferramentas/calibragem.py categorias                    # as categorias de vídeo (Reels, Ad, VSL, YouTube, Aula…)
    uv run ferramentas/calibragem.py categoria <ref> <categoria>   # muda a categoria de uma referência
    uv run ferramentas/calibragem.py categoria-projeto <slug> <categoria>
    uv run ferramentas/calibragem.py exemplos <slug>               # a pasta de exemplos que a direção do projeto lê

Categorias (Reels, Ad, VSL, YouTube, Aula; o criador cadastra mais no app): cada referência tem uma (`tipo` no
referencia.json; as antigas são Reels), cada projeto também (`formato` no edicao.json), e cada categoria tem os seus
exemplos (`exemplos/<categoria>/`: regras.md, roteiros/, favoritos.md). A direção de um projeto lê os da categoria dele;
nunca os de outra categoria (decisão do criador). Ensinam os vídeos analisados que não estão ocultos (o olho do card da
Calibragem) e estão com o interruptor "Ensina" ligado (`ensina` no referencia.json; sem o campo, ligado).

Uma pasta por referência em `biblioteca/referencias/<id>/` (o mesmo formato do 18): referencia.json (a fonte de verdade,
com o andamento em `analise.passos`), video.<ext>, proxy.mp4, palavras.json, silencios.json, cenas.json, trechos/NNN.json
(o cache da análise por trecho), analise.json, direcao.json (`itens` revisáveis, `itens_ia`, `cortes`), quadros/.
A análise: proxy → transcrição (ElevenLabs) → cortes de cena (PySceneDetect adaptativo) → uma chamada ao Gemini por trecho
(vídeo com áudio, saída estruturada nas categorias fixas) → montagem → cada plano com insert assistido de novo, inteiro →
"a revisar". Uma referência por vez (a trava `_fila`); os trechos de cada uma vão 2 em paralelo.
Um projeto aprovado também vira referência (`de_projeto`, id `prj-<slug>-vN`), sem análise: a direção já é conhecida.
Ela leva `origem` e `revisoes` (os comentários do criador) no referencia.json e só ensina a direção depois de revisada.

Importado pelo servidor do app, que roda sem dependências: no topo, só biblioteca padrão (scenedetect e httpx só dentro
das funções que os usam). Erros para o app: FileNotFoundError (referência que não existe) e ValueError (o resto), com a
mensagem pronta para mostrar.
"""
import argparse
import bisect
import fcntl
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import gemini  # noqa: E402
from base import BIBLIOTECA, CATEGORIA_PADRAO, EXEMPLOS, PROJETOS, RAIZ, env, ffmpeg, gravar_json, inspecionar, ler_json, para_lixeira, renomear_tags, tags_limpas  # noqa: E402

REFS = BIBLIOTECA / 'referencias'
FAVORITOS = REFS / '_favoritos.json'
TAGS = REFS / '_tags.json'  # as tags dos planos da galeria: [{ref, inicio, fim, tags}]
CATEGORIAS_ARQ = BIBLIOTECA / 'categorias-video.json'
CATEGORIAS = [
    {'id': 'hacks', 'nome': 'Hacks & Tips', 'emoji': '📱'},
    {'id': 'storytelling', 'nome': 'Storytelling Projects', 'emoji': '📱'},
    {'id': 'pico', 'nome': 'Pico', 'emoji': '💰'},
    {'id': 'ad', 'nome': 'Ad VSL', 'emoji': '💰'},
    {'id': 'cta', 'nome': 'CTA', 'emoji': '💰'},
    {'id': 'vsl', 'nome': 'VSL', 'emoji': '📺'},
]
URL = '/biblioteca/referencias'  # como o servidor serve a pasta

PLANOS = {'full_ator': 'Full ator', 'full_ator_lettering': 'Full ator com lettering', 'insert_tela_cheia': 'Insert tela cheia',
          'motion_tela_cheia': 'Motion tela cheia', 'tela_dividida_insert': 'Tela dividida · insert', 'tela_dividida_motion': 'Tela dividida · motion',
          'comentario_insert_ator': 'Comentário + insert + ator'}
PLANOS_COM_TEXTO = ('full_ator_lettering', 'comentario_insert_ator')  # o texto do lettering / do comentário fica no plano
ELEMENTOS = {'lettering': 'Lettering', 'palavra_manychat': 'Palavra ManyChat', 'caixinha_perguntas': 'Caixinha de perguntas',
             'print_sobreposto': 'Print/imagem sobreposta'}
PASSOS = ['proxy', 'transcricao', 'cenas', 'analise', 'montagem', 'inserts']
ROTULOS = {'proxy': 'proxy', 'transcricao': 'transcrição', 'cenas': 'cortes de cena', 'analise': 'análise dos trechos',
           'montagem': 'montagem', 'inserts': 'inserts'}
ANALISADAS = ('a_revisar', 'revisado')
FIM_DE_FRASE = ('.', '?', '!', '…')

ALTURA_QUADRO = 384  # até 384 px o Gemini cobra 258 tokens por imagem
PARALELO = 2
MIN_PLANO = 0.1
MIN_VIDEO_INSERT = 1.0  # abaixo disso o Gemini recusa o vídeo: vai o quadro do meio
VERSAO_ANALISE = 11  # muda quando o prompt ou o que é enviado muda (os trechos guardados com outra são refeitos); 11: a marcação mais longa, com a edição
# da chave do cache do 18 (config do app dele): só o formato "video" foi portado
FPS, FORMATO, GRADE = 2, 'video', '3x2'

SEM_CREDITO = 'Sem crédito no OpenRouter. Adicione créditos e clique em “Tentar de novo” (o que já foi analisado é reaproveitado).'
INTERROMPIDA = 'A análise foi interrompida. Clique em “Tentar de novo” (o que já foi analisado é reaproveitado).'


# ---------------------------------------------------------------- as referências (do 18: referencias.py)

@contextmanager
def _trava(nome: str = '.trava', bloquear: bool = True):
    """Uma trava entre processos (o servidor e o trabalho de fundo mexem no mesmo referencia.json)."""
    REFS.mkdir(parents=True, exist_ok=True)
    with open(REFS / nome, 'a') as f:
        fcntl.flock(f, fcntl.LOCK_EX if bloquear else fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def pasta(id: str) -> Path:
    p = (REFS / str(id)).resolve()
    if p.parent != REFS.resolve() or not (p / 'referencia.json').exists():
        raise FileNotFoundError('Referência não encontrada')
    return p


def ler(id: str) -> dict:
    return ler_json(pasta(id) / 'referencia.json')


def atualizar(id: str, mudar) -> dict:
    with _trava():
        ref = ler(id)
        mudar(ref)
        gravar_json(pasta(id) / 'referencia.json', ref)
        return ref


def slug(nome: str) -> str:
    """Do 18: projeto.slug (minúsculas, sem acentos, hífens)."""
    s = unicodedata.normalize('NFKD', nome).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower() or 'referencia'


def novo_id(nome: str) -> str:
    base, n = slug(nome), 1
    id = base
    while (REFS / id).exists():
        n += 1
        id = f'{base}-{n}'
    return id


# ---------------------------------------------------------------- categorias de vídeo

def categorias() -> list[dict]:
    """As categorias cadastradas (o painel Categorias do app); sem cadastro, as de fábrica. O Reels sempre existe."""
    lista = ler_json(CATEGORIAS_ARQ, None) or [dict(c) for c in CATEGORIAS]
    return lista if any(c['id'] == CATEGORIA_PADRAO for c in lista) else [dict(CATEGORIAS[0]), *lista]


def categoria_de(x: dict, campo: str = 'tipo') -> str:
    """A categoria de uma referência (`tipo`) ou de um projeto (`formato`); sem ela, Reels."""
    return x.get(campo) or CATEGORIA_PADRAO


def _checar_categoria(cat: str) -> str:
    if cat not in {c['id'] for c in categorias()}:
        raise ValueError(f'Categoria desconhecida: {cat} (cadastre no app, na Calibragem › Categorias)')
    return cat


def _em_uso() -> set[str]:
    usadas = {categoria_de(r) for r in _todas()}
    for p in PROJETOS.glob('*/edicao.json'):
        if not p.parent.name.startswith(('_', '.')):
            usadas.add(categoria_de(ler_json(p, {}) or {}, 'formato'))
    return usadas


def salvar_categorias(lista: list[dict]) -> list[dict]:
    """Grava a lista inteira (nome e emoji editados; as novas ganham o id do nome). Uma categoria com referências ou
    projetos não sai (ValueError com quais)."""
    out, vistos = [], set()
    for c in lista:
        nome = str(c.get('nome') or '').strip()[:40]
        cid = str(c.get('id') or '').strip() or slug(nome)
        if not nome or cid in vistos:
            continue
        vistos.add(cid)
        out.append({'id': cid, 'nome': nome, 'emoji': str(c.get('emoji') or '').strip()[:8]})
    if CATEGORIA_PADRAO not in vistos:
        out.insert(0, next(c for c in categorias() if c['id'] == CATEGORIA_PADRAO))
    if saem := sorted(_em_uso() - {c['id'] for c in out}):
        nomes = {c['id']: c['nome'] for c in categorias()}
        raise ValueError(f'Ainda há referências ou projetos de {", ".join(nomes.get(x, x) for x in saem)}: mude a categoria deles antes')
    gravar_json(CATEGORIAS_ARQ, out)
    for c in out:  # uma categoria nova já nasce com as regras de direção do Reels
        semear_regras(c['id'])
    return out


def pasta_exemplos(cat: str) -> Path:
    return EXEMPLOS / cat


def semear_regras(cat: str) -> Path:
    """As regras de direção de uma categoria (`exemplos/<categoria>/regras.md`). Uma categoria sem regras ainda começa
    com uma cópia das do Reels, as de fábrica (decisão do criador); depois cada uma segue as suas."""
    arq = pasta_exemplos(cat) / 'regras.md'
    padrao = pasta_exemplos(CATEGORIA_PADRAO) / 'regras.md'
    if not arq.exists() and cat != CATEGORIA_PADRAO and padrao.exists():
        arq.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(padrao, arq)
    return arq


def definir_categoria(id: str, cat: str) -> dict:
    """Muda a categoria de uma referência; os roteiros de exemplo vão para a pasta da categoria nova."""
    _checar_categoria(cat)
    r = atualizar(id, lambda x: x.update(tipo=cat))
    regenerar_exemplos()
    return r


def categoria_projeto(slug: str, cat: str) -> dict:
    """Muda a categoria de um projeto (`formato` no edicao.json)."""
    _checar_categoria(cat)
    arq = PROJETOS / slug / 'edicao.json'
    edicao = ler_json(arq, None)
    if edicao is None:
        raise FileNotFoundError(f'O projeto {slug} não existe')
    edicao['formato'] = cat
    gravar_json(arq, edicao)
    return edicao


def exemplos_para(slug: str) -> tuple[str, Path, int]:
    """O que a direção do projeto lê (decisão do criador: sempre e só a categoria do vídeo em edição): a categoria, a
    pasta de exemplos dela e quantos vídeos dela estão em uso (os não ocultos e com o Ensina ligado; 0 = só as regras)."""
    edicao = ler_json(PROJETOS / slug / 'edicao.json', None)
    if edicao is None:
        raise FileNotFoundError(f'O projeto {slug} não existe')
    cat = categoria_de(edicao, 'formato')
    n = sum(1 for r in _todas() if r['status'] in ANALISADAS and ensina(r) and categoria_de(r) == cat)
    return cat, pasta_exemplos(cat), n


def _vivo(pid) -> bool:
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except (PermissionError, ValueError, TypeError):
        return True
    return True


def _todas() -> list[dict]:
    """As referências, das mais novas para as mais antigas. Uma que estava na fila ou analisando sem o processo vivo
    (máquina reiniciada, processo morto) vira erro "interrompida"."""
    refs = []
    for arq in REFS.glob('*/referencia.json'):
        try:
            r = ler_json(arq)
        except ValueError:
            continue
        pid = (r.get('analise') or {}).get('pid')
        if r.get('status') in ('na_fila', 'analisando') and pid and not _vivo(pid):
            try:
                r = atualizar(r['id'], lambda x: x.update(status='erro', erro=INTERROMPIDA))
            except FileNotFoundError:
                continue
        refs.append(r)
    return sorted(refs, key=lambda r: r.get('criado_em') or '', reverse=True)


def _analisadas() -> list[tuple[dict, list[dict], list[dict]]]:
    """(referência, itens da direção, palavras) das que já foram analisadas, das mais novas para as mais antigas."""
    lista = []
    for r in _todas():
        if r['status'] not in ANALISADAS:
            continue
        base = REFS / r['id']
        dados, palavras = ler_json(base / 'direcao.json'), ler_json(base / 'palavras.json')
        if dados and palavras:
            lista.append((r, dados['itens'], palavras['palavras']))
    return lista


def listar_referencias() -> list[dict]:
    """O que a lista do app precisa: uma linha por referência, das mais novas para as mais antigas, com o passo da análise
    que está rodando e o progresso dele (0–1, quando se sabe)."""
    lista = []
    for r in _todas():
        passos = (r.get('analise') or {}).get('passos') or {}
        atual = next((p for p in PASSOS if passos.get(p, {}).get('status') == 'rodando'), None)
        base = REFS / r['id']
        v = r.get('video') or {}
        lista.append({
            'id': r['id'], 'nome': r['nome'], 'status': r['status'], 'erro': r.get('erro'),
            'duracao': v.get('duracao'), 'largura': v.get('largura'), 'altura': v.get('altura'), 'criado_em': r.get('criado_em'),
            'passo': atual, 'passo_rotulo': ROTULOS.get(atual), 'progresso': passos.get(atual, {}).get('progresso') if atual else None,
            'passos': passos, 'origem': r.get('origem'), 'tipo': categoria_de(r), 'oculto': bool(r.get('oculto')),
            'ensina': r.get('ensina', True) is not False,
            'miniatura': f'{URL}/{r["id"]}/miniatura.jpg' if (base / 'miniatura.jpg').exists() else None,
            'video': f'{URL}/{r["id"]}/proxy.mp4' if (base / 'proxy.mp4').exists() else None,
        })
    return lista


def _analisada(id: str) -> dict:
    r = ler(id)
    if r['status'] not in ANALISADAS:
        raise ValueError('A análise ainda não terminou')
    return r


def revisao(id: str) -> dict:
    """O que a tela de revisão precisa (como `GET /api/referencias/{id}/revisao` do 18). As miniaturas dos itens são
    relativas à pasta da referência (`base`); o vídeo é o proxy."""
    r = ler(id)
    base = pasta(id)
    dados = ler_json(base / 'direcao.json')
    if dados is None:
        raise ValueError('A análise ainda não terminou')
    return {'referencia': r, 'origem': r.get('origem'), 'base': f'{URL}/{id}/', 'video': f'{URL}/{id}/proxy.mp4',
            'palavras': ler_json(base / 'palavras.json')['palavras'],
            'itens': dados['itens'], 'itens_ia': dados.get('itens_ia', []), 'cortes': dados.get('cortes', []),
            'categorias': {'planos': PLANOS, 'elementos': ELEMENTOS}}


def tipo_atual(tipo: str, conteudo: str | None = None) -> str:
    """Do 18: a tela dividida antiga era um tipo só, com o que vai em cima em `conteudo`."""
    if tipo == 'tela_dividida':
        return 'tela_dividida_motion' if conteudo == 'motion' else 'tela_dividida_insert'
    return tipo


def tem_insert(tipo: str, conteudo: str | None = None) -> bool:
    return tipo_atual(tipo, conteudo) in ('insert_tela_cheia', 'tela_dividida_insert', 'comentario_insert_ator')


def validar_edicao(itens: list[dict], duracao: float) -> list[dict]:
    """Do 18 (direcao.validar_edicao): categorias fixas, tempos dentro do vídeo e planos contíguos (sem buracos nem
    sobreposição). Devolve os itens normalizados ou levanta ValueError com o motivo."""
    planos, elementos, ids = [], [], set()
    for i in itens:
        if not isinstance(i, dict):
            raise ValueError('Item inválido')
        camada = i.get('camada')
        if camada == 'plano':
            i = {**i, 'tipo': tipo_atual(i.get('tipo'), i.get('conteudo'))}
        tipos = PLANOS if camada == 'plano' else ELEMENTOS if camada == 'elemento' else None
        if tipos is None or i.get('tipo') not in tipos:
            raise ValueError(f'Categoria inválida: {i.get("tipo")}')
        try:
            ini, fim = max(float(i['inicio']), 0.0), min(float(i['fim']), duracao)
        except (KeyError, TypeError, ValueError):
            raise ValueError(f'{tipos[i["tipo"]]} sem início ou fim') from None
        if fim - ini < (MIN_PLANO if camada == 'plano' else 0.05) - 1e-6:  # folga da conta em ponto flutuante
            raise ValueError(f'{tipos[i["tipo"]]} curto demais ({ini:.2f}–{fim:.2f} s)')
        id = str(i.get('id') or '')
        if not id or id in ids:
            raise ValueError('Item sem id ou com id repetido')
        ids.add(id)
        limpo = {'id': id, 'camada': camada, 'tipo': i['tipo'], 'conteudo': None, 'inicio': round(ini, 3), 'fim': round(fim, 3),
                 'descricao': str(i.get('descricao') or '').strip(), 'texto': (str(i['texto']).strip() or None) if i.get('texto') else None,
                 'miniatura': i.get('miniatura'), 'miniatura_t': i.get('miniatura_t'),
                 **({'porque': str(i['porque']).strip()} if i.get('porque') else {})}  # o porquê das referências de projeto
        (planos if camada == 'plano' else elementos).append(limpo)
    planos.sort(key=lambda p: p['inicio'])
    if not planos:
        raise ValueError('O vídeo precisa de pelo menos um plano-base')
    if abs(planos[0]['inicio']) > 0.05 or abs(planos[-1]['fim'] - duracao) > 0.05:
        raise ValueError('Os planos-base precisam cobrir o vídeo do começo ao fim')
    planos[0]['inicio'], planos[-1]['fim'] = 0.0, round(duracao, 3)
    for a, b in zip(planos, planos[1:]):
        if abs(a['fim'] - b['inicio']) > 0.05:
            raise ValueError(f'Buraco ou sobreposição entre planos em {a["fim"]:.2f} s')
        b['inicio'] = a['fim']
    return planos + sorted(elementos, key=lambda e: e['inicio'])


def ancorar(item: dict, palavras: list[dict]) -> dict:
    """Prende o item às palavras que ele cobre. Sem fala no intervalo, fica sem âncora."""
    a, b = item['inicio'], item['fim']
    dentro = [w for w in palavras if min(w['fim'], b) - max(w['inicio'], a) > 0.01]
    item['palavra_ini'] = dentro[0]['id'] if dentro else None
    item['palavra_fim'] = dentro[-1]['id'] if dentro else None
    return item


def quadro(video: Path, t: float, destino: Path, altura: int = ALTURA_QUADRO) -> Path:
    ffmpeg('-ss', f'{max(t, 0):.3f}', '-i', str(video), '-frames:v', '1', '-vf', f'scale=-2:{altura}', '-q:v', '4', str(destino))
    return destino


def _miniatura(base: Path, item: dict) -> None:
    _existe(base)
    (base / 'quadros').mkdir(exist_ok=True)
    nome = f"quadros/{item['id']}.jpg"
    quadro(base / 'proxy.mp4', (item['inicio'] + item['fim']) / 2, base / nome, 427)
    item['miniatura'] = nome
    item['miniatura_t'] = round((item['inicio'] + item['fim']) / 2, 3)


def salvar_edicao(id: str, itens: list[dict]) -> dict:
    """Do 18 (direcao.salvar_edicao): valida, prende às palavras e refaz as miniaturas que ficaram fora do item."""
    r = _analisada(id)
    base = pasta(id)
    dados = ler_json(base / 'direcao.json')
    palavras = ler_json(base / 'palavras.json')['palavras']
    novos = validar_edicao(itens, r['video']['duracao'])
    for i in novos:
        ancorar(i, palavras)
        if not i.get('miniatura') or not (i['inicio'] <= (i.get('miniatura_t') or -1) <= i['fim']) or not (base / i['miniatura']).exists():
            _miniatura(base, i)
        elif i.get('miniatura_t') is None:
            i['miniatura_t'] = round((i['inicio'] + i['fim']) / 2, 3)
    dados['itens'] = novos
    gravar_json(base / 'direcao.json', dados)
    regenerar_exemplos()
    return dados


def marcar_revisada(id: str, revisado: bool) -> dict:
    _analisada(id)
    r = atualizar(id, lambda x: x.update(status='revisado' if revisado else 'a_revisar'))
    regenerar_exemplos()
    return r


def renomear(id: str, nome: str) -> dict:
    """O nome aparece nos roteiros de exemplo e na galeria."""
    nome = str(nome or '').strip()[:120]
    if not nome:
        raise ValueError('Nome vazio')
    r = atualizar(id, lambda x: x.update(nome=nome))
    regenerar_exemplos()
    return r


def apagar(id: str) -> None:
    """Manda para a lixeira única (`base.para_lixeira`; e para a análise, se estiver rodando)."""
    base = pasta(id)
    r = ler(id)
    pid = (r.get('analise') or {}).get('pid')
    if r['status'] in ('na_fila', 'analisando') and pid and int(pid) != os.getpid() and _vivo(pid):
        try:
            os.kill(int(pid), signal.SIGTERM)
        except OSError:
            pass
    with _trava():
        para_lixeira([base], 'referencia', id, r.get('nome') or id, 'miniatura.jpg', 'proxy.mp4')
    regenerar_exemplos()


# ---------------------------------------------------------------- favoritos e galeria (do 18: referencias.py, direcao.clipes)

def ler_favoritos() -> list[dict]:
    try:
        return json.loads(FAVORITOS.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        return []


def mesmo_trecho(f: dict, ref: str, inicio: float, fim: float) -> bool:
    return f['ref'] == ref and abs(f['inicio'] - inicio) < 0.05 and abs(f['fim'] - fim) < 0.05


def favoritar(ref: str, inicio: float, fim: float, favorito: bool) -> dict:
    """Marca ou desmarca um plano como favorito. Identificado pela referência e pelo intervalo (o id do plano muda quando o
    vídeo é reanalisado), com uma cópia dos dados do plano no momento."""
    base = pasta(ref)
    inicio, fim = float(inicio), float(fim)
    itens = (ler_json(base / 'direcao.json') or {}).get('itens', [])
    plano = next((i for i in itens if i['camada'] == 'plano' and abs(i['inicio'] - inicio) < 0.05 and abs(i['fim'] - fim) < 0.05), None)
    if favorito and plano is None:
        raise ValueError('Trecho não encontrado nesta referência')
    dados = {k: plano.get(k) for k in ('tipo', 'conteudo', 'descricao', 'texto')} if plano else {}
    with _trava():
        favs = [f for f in ler_favoritos() if not mesmo_trecho(f, ref, inicio, fim)]
        if favorito:
            favs.append({'ref': ref, 'inicio': round(inicio, 3), 'fim': round(fim, 3), 'criado_em': datetime.now().isoformat(timespec='seconds'), **dados})
        gravar_json(FAVORITOS, favs)
    regenerar_exemplos()
    return {'favorito': bool(favorito)}


def ler_tags() -> list[dict]:
    try:
        return json.loads(TAGS.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        return []


def marcar_tags(ref: str, inicio: float, fim: float, tags: list[str]) -> dict:
    """As tags de um plano da galeria (pela referência e pelo intervalo, como o favorito); lista vazia tira."""
    tags = tags_limpas(tags)
    with _trava():
        l = [t for t in ler_tags() if not mesmo_trecho(t, ref, float(inicio), float(fim))]
        if tags:
            l.append({'ref': ref, 'inicio': round(float(inicio), 3), 'fim': round(float(fim), 3), 'tags': tags})
        gravar_json(TAGS, l)
    return {'tags': tags}


def renomear_tag(de: str, para: str) -> int:
    """Renomeia (ou tira) uma tag, com as de dentro dela, em todos os planos da galeria."""
    n = 0
    with _trava():
        l = []
        for t in ler_tags():
            novas = renomear_tags(t['tags'], de, para)
            n += novas != t['tags']
            if novas:
                l.append({**t, 'tags': novas})
        gravar_json(TAGS, l)
    return n


def entrada(t: float, palavras: list[dict], inicios: list[float], fins: list[float]) -> dict | None:
    """Como um plano entra em relação à fala: numa pausa (≥ 150 ms sem fala), entre palavras coladas ou no meio de uma
    palavra; no começo ou no meio de uma frase; e a quantos ms do começo da palavra mais próxima. `inicios` e `fins`:
    os tempos das palavras (em ordem), para a busca binária."""
    if not palavras:
        return None
    prox = bisect.bisect_right(fins, t)
    if prox == len(palavras):
        return {'onde': 'depois_da_fala', 'frase': None, 'palavra': None, 'ms': None}
    w, ant = palavras[prox], palavras[prox - 1] if prox else None
    if w['inicio'] < t:
        onde = 'dentro_da_palavra'
    elif ant is None or w['inicio'] - ant['fim'] >= 0.15:
        onde = 'na_pausa'
    else:
        onde = 'entre_palavras'
    comeco = onde != 'dentro_da_palavra' and (ant is None or ant['texto'].rstrip().endswith(FIM_DE_FRASE))
    k = bisect.bisect_left(inicios, t)
    perto = min(palavras[max(k - 1, 0):k + 1], key=lambda x: abs(x['inicio'] - t))
    return {'onde': onde, 'frase': 'inicio' if comeco else 'meio', 'palavra': perto['texto'], 'ms': round((t - perto['inicio']) * 1000)}


def _clipes_de(ref: dict, itens: list[dict], palavras: list[dict]) -> tuple[list[dict], dict]:
    """Os planos de uma referência como clipes da galeria e o resumo do vídeo de origem (do 18: direcao.clipes)."""
    planos = sorted((i for i in itens if i['camada'] == 'plano'), key=lambda i: i['inicio'])
    elementos = [i for i in itens if i['camada'] == 'elemento']
    dur = ref['video']['duracao']
    video = f'{URL}/{ref["id"]}/proxy.mp4'
    resumo = {'nome': ref['nome'], 'duracao': dur, 'revisado': ref['status'] == 'revisado', 'video': video,
              'planos': [{'id': p['id'], 'tipo': p['tipo'], 'inicio': p['inicio'], 'fim': p['fim']} for p in planos],
              'proporcao': {}}
    for p in planos:
        resumo['proporcao'][p['tipo']] = round(resumo['proporcao'].get(p['tipo'], 0) + (p['fim'] - p['inicio']) / dur, 3)
    lista = []
    inicios, fins = [w['inicio'] for w in palavras], [w['fim'] for w in palavras]
    for k, p in enumerate(planos):
        faladas = palavras[bisect.bisect_right(fins, p['inicio'] + 0.01):bisect.bisect_left(inicios, p['fim'])]
        d = p['fim'] - p['inicio']
        vizinho = lambda q: {'tipo': q['tipo'], 'duracao': round(q['fim'] - q['inicio'], 2)} if q else None  # noqa: E731
        lista.append({
            'ref': ref['id'], 'ref_nome': ref['nome'], 'revisado': ref['status'] == 'revisado', 'id': p['id'], 'tipo': p['tipo'],
            'conteudo': p.get('conteudo'), 'inicio': p['inicio'], 'fim': p['fim'], 'descricao': p.get('descricao') or '',
            'texto': p.get('texto'), 'video': video,
            'miniatura': f'{URL}/{ref["id"]}/{p["miniatura"]}' if p.get('miniatura') else None,
            'fala': ' '.join(w['texto'] for w in faladas),
            'numero': k + 1, 'total': len(planos), 'posicao': round(p['inicio'] / dur, 3) if dur else 0,
            'palavras': len(faladas), 'por_minuto': round(len(faladas) / d * 60) if d >= 2 and len(faladas) >= 3 else None,
            'entrada': entrada(p['inicio'], palavras, inicios, fins) if k else None,
            'anterior': vizinho(planos[k - 1] if k else None), 'seguinte': vizinho(planos[k + 1] if k + 1 < len(planos) else None),
            'elementos': [{'tipo': e['tipo'], 'texto': e.get('texto'), 'inicio': e['inicio'], 'fim': e['fim']}
                          for e in elementos if e['fim'] > p['inicio'] and e['inicio'] < p['fim']],
        })
    return lista, resumo


def clipes() -> dict:
    """A galeria de Referências (como `GET /api/referencias/clipes` do 18): cada plano de cada referência analisada, com
    os seus dados, e por vídeo de origem um resumo. `video` e `miniatura` já são os endereços servidos."""
    todos, origens = [], {}
    for r, itens, palavras in _analisadas():
        lista, origens[r['id']] = _clipes_de(r, itens, palavras)
        # a categoria do vídeo de origem (o filtro) e quando ele entrou (a ordem "Mais recentes")
        todos += [{**c, 'tipo_video': categoria_de(r), 'ref_criado_em': r.get('criado_em') or ''} for c in lista]
    favoritos, tags = ler_favoritos(), ler_tags()
    for c in todos:
        c['favorito'] = any(mesmo_trecho(f, c['ref'], c['inicio'], c['fim']) for f in favoritos)
        c['tags'] = next((t['tags'] for t in tags if mesmo_trecho(t, c['ref'], c['inicio'], c['fim'])), [])
    return {'clipes': todos, 'origens': origens, 'categorias': PLANOS, 'elementos': ELEMENTOS}


# ---------------------------------------------------------------- roteiros de exemplo (do 18: calibragem.roteiro)

def norm(t: str) -> str:
    return re.sub(r'[^\wÀ-ÿ]', '', t.lower())


def tag_lettering(falado: str, texto: str | None) -> str:
    """`<lettering>falado</lettering>`, com `texto="…"` quando o que aparece na tela é diferente do que é falado."""
    texto = (texto or '').strip()
    attr = f' texto="{texto.replace(chr(34), chr(39))}"' if texto and norm(texto) != norm(falado) else ''
    return f'<lettering{attr}>{falado}</lettering>'


def _fala(palavras: list[dict], a: float, b: float, letterings: list[dict] = ()) -> str:
    """A fala do trecho [a, b), com as palavras dos letterings em `<lettering>` (uma palavra é do lettering se o meio
    dela cai dentro dele)."""
    ws = [w for w in palavras if w['fim'] > a + 0.01 and w['inicio'] < b]
    dono = [next((n for n, e in enumerate(letterings) if e['inicio'] <= (w['inicio'] + w['fim']) / 2 <= e['fim']), None) for w in ws]
    out, k = [], 0
    while k < len(ws):
        if dono[k] is None:
            out.append(ws[k]['texto'])
            k += 1
            continue
        j = k
        while j + 1 < len(ws) and dono[j + 1] == dono[k]:
            j += 1
        out.append(tag_lettering(' '.join(w['texto'] for w in ws[k:j + 1]), letterings[dono[k]].get('texto')))
        k = j + 1
    return ' '.join(out)


def nome_tipo(tipo: str, conteudo: str | None = None) -> str:
    return (PLANOS | ELEMENTOS).get(tipo_atual(tipo, conteudo), tipo)


def marcacao(plano: dict, elementos: list[dict]) -> str:
    """A linha `[...]` do roteiro: o plano, a marcação e os elementos que aparecem nele."""
    texto = f"{nome_tipo(plano['tipo'], plano.get('conteudo'))}: {plano.get('descricao') or '—'}"
    if plano.get('texto'):
        texto += f" «{plano['texto']}»"
    for e in elementos:
        texto += f" + {ELEMENTOS.get(e['tipo'], e['tipo']).lower()}" + (f" «{e['texto']}»" if e.get('texto') else '')
    return f'[{texto}]'


def roteiro(itens: list[dict], palavras: list[dict], codigo_ref: str | None = None) -> list[dict]:
    """As linhas do roteiro de um vídeo: uma por plano (um por corte de cena), com a marcação, a fala e, com o código da
    referência (`codigo_ref`, ex.: REF-12), a ref daquele corte (REF-12·p4: o plano que a direção pode abrir para modelar)."""
    planos = sorted((i for i in itens if i['camada'] == 'plano'), key=lambda i: i['inicio'])
    elementos = [i for i in itens if i['camada'] == 'elemento' and i['tipo'] != 'lettering']  # o lettering vai na fala
    letterings = [i for i in itens if i['camada'] == 'elemento' and i['tipo'] == 'lettering']
    return [{'plano': p['id'], 'tipo': p['tipo'], 'inicio': p['inicio'], 'fim': p['fim'],
             'marcacao': marcacao(p, [e for e in elementos if p['inicio'] <= e['inicio'] < p['fim']]),
             'fala': _fala(palavras, p['inicio'], p['fim'], letterings),
             **({'ref': f"{codigo_ref}·{p['id']}"} if codigo_ref else {})} for p in planos]


def _bloco(linha: dict) -> str:
    """Um corte do roteiro de exemplo: a marcação, a ref dele (o plano, para a direção abrir e modelar) e a fala."""
    return f"{linha['marcacao']}\n" + (f"ref: {linha['ref']}\n" if linha.get('ref') else '') + (f"“{linha['fala']}”" if linha['fala'] else '(sem fala)')


def _minuto(t: float) -> str:
    m, s = divmod(int(t), 60)
    return f'{m}:{s:02d}'


def _escrever(arq: Path, texto: str) -> bool:
    if arq.exists() and arq.read_text(encoding='utf-8') == texto:
        return False
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(texto, encoding='utf-8')
    return True


def ensina(r: dict) -> bool:
    """Se a referência entra nos exemplos (a Heurística da categoria dela): a que não está oculta na Calibragem e tem o
    interruptor "Ensina" do card ligado (sem o campo, ligado)."""
    return not r.get('oculto') and r.get('ensina', True) is not False


def definir_ensina(id: str, liga: bool) -> dict:
    """O interruptor "Ensina" do card da Calibragem: ligado, o vídeo entra nos roteiros de exemplo da categoria (a
    Heurística, que a direção lê); desligado, sai, sem sair da grade."""
    pasta(id)
    r = atualizar(id, lambda x: x.update(ensina=bool(liga)))
    regenerar_exemplos()
    return r


def definir_oculto(id: str, oculto: bool) -> dict:
    """Oculta (ou mostra de volta) um vídeo da Calibragem: oculto, ele sai da grade principal (fica na vista Ocultos) e
    não ensina a direção; mostrado, volta a ensinar."""
    pasta(id)
    r = atualizar(id, lambda x: x.update(oculto=bool(oculto)))
    regenerar_exemplos()
    return r


def _correcoes(r: dict) -> str:
    """O bloco do fim do roteiro de uma referência de projeto: os comentários do criador que o Claude aplicou."""
    linhas = [f"- v{c['versao']}, {_minuto(c['tempo']) if c.get('tempo') is not None else 'geral'}"
              + (f" (“{c['fala']}”)" if c.get('fala') else '') + f": {' / '.join(x.strip() for x in c['texto'].splitlines() if x.strip())}"
              + (f" → {c['resposta']}" if c.get('resposta') else '')
              for c in r.get('revisoes') or [] if c.get('status') == 'aplicado']
    return '\n## O que o criador corrigiu nas revisões\n\n' + '\n'.join(linhas) + '\n' if linhas else ''


def regenerar_exemplos() -> dict:
    """Reescreve `exemplos/<categoria>/roteiros/<id>.md` (um por referência analisada, na pasta da categoria dela; com o
    mesmo nome, só uma: a revisada, ou a mais nova; as de projeto só revisadas), apaga os das que não estão mais lá (ou
    mudaram de categoria) e escreve o `favoritos.md` de cada categoria. Devolve o que mudou."""
    escolhidas: dict[tuple, tuple] = {}
    for r, itens, palavras in _analisadas():  # das mais novas para as mais antigas: fica a primeira, salvo uma revisada depois
        if not ensina(r):
            continue
        chave = (categoria_de(r), r['nome'])
        atual = escolhidas.get(chave)
        if atual is None or (r['status'] == 'revisado' and atual[0]['status'] != 'revisado'):
            escolhidas[chave] = (r, itens, palavras)
    mudou, apagados, ficam = [], [], set()
    cods = _codigos_refs()
    for (cat, _), (r, itens, palavras) in escolhidas.items():
        arq = pasta_exemplos(cat) / 'roteiros' / f"{r['id']}.md"
        ficam.add(arq)
        texto = (f"# {r['nome']}{' (revisado)' if r['status'] == 'revisado' else ''}\n\n"
                 + '\n\n'.join(_bloco(x) for x in roteiro(itens, palavras, cods.get(r['id']))) + '\n' + _correcoes(r))
        if _escrever(arq, texto):
            mudou.append(r['id'])
    for arq in EXEMPLOS.glob('*/roteiros/*.md'):
        if arq not in ficam:
            arq.unlink()
            apagados.append(arq.stem)
    # o favoritos.md de cada categoria que tem exemplos (uma categoria sem referências não ganha pasta)
    cats = {cat for cat, _ in escolhidas} | {p.name for p in EXEMPLOS.iterdir() if p.is_dir()}
    favoritos = sum(_favoritos_md(cat, cods) for cat in sorted(cats))
    return {'roteiros': sorted(r['id'] for r, _, _ in escolhidas.values()), 'mudaram': mudou, 'apagados': apagados, 'favoritos': favoritos}


def _codigos_refs() -> dict[str, str]:
    """{id da referência: código REF} (o registro de códigos dá o número às novas)."""
    import codigo
    return codigo.mapa()['referencia']


def _favoritos_md(cat: str, cods: dict[str, str] | None = None) -> int:
    """`exemplos/<categoria>/favoritos.md`: os planos das referências da categoria marcados com ★ na galeria, agrupados
    por tipo de plano, cada um com o roteiro daquele plano (do jeito que está agora; se o vídeo foi reanalisado e o plano
    mudou, a cópia guardada ao favoritar)."""
    grupos: dict[str, list[tuple]] = {}
    for f in ler_favoritos():
        base = REFS / f['ref']
        r = ler_json(base / 'referencia.json')
        palavras = (ler_json(base / 'palavras.json') or {}).get('palavras')
        if r is None or palavras is None or not ensina(r) or categoria_de(r) != cat:
            continue
        itens = (ler_json(base / 'direcao.json') or {}).get('itens', []) if r['status'] in ANALISADAS else []
        cods = cods if cods is not None else _codigos_refs()
        linha = next((x for x in roteiro(itens, palavras, cods.get(f['ref'])) if abs(x['inicio'] - f['inicio']) < 0.05 and abs(x['fim'] - f['fim']) < 0.05), None)
        if linha is None:
            letterings = [i for i in itens if i['camada'] == 'elemento' and i['tipo'] == 'lettering']
            plano = {'tipo': f.get('tipo') or 'full_ator', 'conteudo': f.get('conteudo'), 'descricao': f.get('descricao'), 'texto': f.get('texto')}
            linha = {'tipo': plano['tipo'], 'marcacao': marcacao(plano, []), 'fala': _fala(palavras, f['inicio'], f['fim'], letterings)}
        grupos.setdefault(tipo_atual(linha['tipo'], f.get('conteudo')), []).append((r['nome'], f['inicio'], linha))
    partes = ['# Favoritos\n\nSão os exemplos que o criador considera os melhores: os planos que ele marcou com ★ na galeria de '
              'Referências do app. Na direção, prefira esses padrões (o material, como entra, o ritmo) quando a fala pedir algo parecido, '
              'e ponha a `ref:` deles entre as refs candidatas do plano (03-direcao.md).']
    total = 0
    for tipo in [*PLANOS, *[t for t in grupos if t not in PLANOS]]:
        if tipo not in grupos:
            continue
        partes.append(f'## {nome_tipo(tipo)}')
        for nome, inicio, linha in sorted(grupos[tipo], key=lambda x: (x[0], x[1])):
            partes.append(f'### {nome}, em {_minuto(inicio)}\n\n{_bloco(linha)}')
            total += 1
    if not total:
        partes.append('(Nenhum plano marcado ainda.)')
    _escrever(pasta_exemplos(cat) / 'favoritos.md', '\n\n'.join(partes) + '\n')
    return total


# ---------------------------------------------------------------- de um projeto aprovado

def no_tempo_da_saida(itens: list[dict], saida: list[dict], duracao: float) -> list[dict]:
    """Os itens da direção de um projeto (presos a palavras + off) no tempo do vídeo final, pelas palavras que tocam nele
    (`versoes/vN/palavras.json`): a conta da página de render (render/src/direcaoProjeto.ts, `paraTempo`), sem a trava
    nas emendas. A âncora cortada vira a primeira (ou a última) palavra que sobrou no intervalo; sem nenhuma, o item sai."""
    tempo = {w['id']: w for w in saida}
    vistos = []
    for i in itens:
        a = i.get('palavra_ini')
        b = i.get('palavra_fim') or a
        dentro = [w for w in saida if a and a <= w['id'] <= b]  # os ids da transcrição (w00000…) vão em ordem
        if not dentro:
            continue
        w0, w1 = tempo.get(a), tempo.get(b)
        vistos.append({**i, 'inicio': w0['ini'] + (i.get('off_ini') or 0) if w0 else dentro[0]['ini'],
                       'fim': w1['fim'] + (i.get('off_fim') or 0) if w1 else dentro[-1]['fim']})
    planos = sorted((x for x in vistos if x['camada'] == 'plano'), key=lambda x: x['inicio'])
    for k, q in enumerate(planos):  # contíguos: cada um vai até o começo do seguinte
        q['inicio'] = 0.0 if k == 0 else max(q['inicio'], planos[k - 1]['inicio'] + 0.05)
    for k, q in enumerate(planos):
        q['fim'] = planos[k + 1]['inicio'] if k + 1 < len(planos) else duracao
    elementos = sorted((x for x in vistos if x['camada'] == 'elemento'), key=lambda x: x['inicio'])
    for e in elementos:
        e['inicio'] = max(0.0, e['inicio'])
        e['fim'] = min(duracao, max(e['fim'], e['inicio'] + 0.05))
    return [{'id': x['id'], 'camada': x['camada'], 'tipo': tipo_atual(x['tipo'], x.get('conteudo')), 'conteudo': None,
             'inicio': round(x['inicio'], 3), 'fim': round(x['fim'], 3), 'descricao': x.get('descricao') or '',
             'texto': x.get('texto') or None, **({'porque': x['porque']} if x.get('porque') else {})} for x in planos + elementos]


def _revisoes(p: Path) -> dict[int, tuple[dict, Path]]:
    revs = {}
    for arq in (p / 'revisoes').glob('v*.json'):
        if arq.stem[1:].isdigit():
            revs[int(arq.stem[1:])] = (ler_json(arq) or {}, arq)
    return revs


def de_projeto(slug: str, versao: int | str | None = None) -> str:
    """A versão aprovada de um projeto (a última aprovada, senão a última; ou a dada) vira a referência `prj-<slug>-vN`,
    sem o Gemini: o proxy da versão, as palavras e a direção no tempo do vídeo final (`itens`), a da v1 para comparar
    (`itens_ia`) e os comentários das revisões. Fica "a revisar": só ensina a direção depois que o criador revisa.
    Refazer substitui; a referência de uma versão anterior do mesmo projeto vai para a lixeira. Devolve o id."""
    p = PROJETOS / str(slug)
    feitas = sorted(int(x.name[1:]) for x in p.glob('versoes/v*') if re.fullmatch(r'v\d+', x.name) and (x / 'proxy.mp4').exists())
    if not feitas:
        raise FileNotFoundError(f'O projeto {slug} não tem versão renderizada')
    revs = _revisoes(p)
    if versao is None:
        n = ([v for v in feitas if revs.get(v, ({},))[0].get('aprovado')] or feitas)[-1]
    else:
        n = int(str(versao).lstrip('vV'))
        if n not in feitas:
            raise ValueError(f'O projeto {slug} não tem a v{n} (tem {", ".join(f"v{v}" for v in feitas)})')
    vdir = p / 'versoes' / f'v{n}'
    edicao, saida = ler_json(vdir / 'edicao.json') or {}, ler_json(vdir / 'palavras.json') or []
    info = inspecionar(vdir / 'proxy.mp4')
    dur = info['duracao']
    palavras = [{'id': w['id'], 'texto': w['texto'], 'inicio': round(w['ini'], 3), 'fim': round(w['fim'], 3)} for w in saida]
    itens = no_tempo_da_saida((edicao.get('direcao') or {}).get('itens') or [], saida, dur)
    tocados = {q['id']: q for q in ler_json(vdir / 'planos.json') or []}  # os planos como a página os pôs no vídeo
    for i in itens:
        if i['camada'] == 'plano' and i['id'] in tocados:
            i['inicio'], i['fim'] = round(tocados[i['id']]['ini'], 3), round(tocados[i['id']]['fim'], 3)
    itens = [ancorar(i, palavras) for i in validar_edicao(itens, dur)]
    v1 = ler_json(p / 'versoes' / 'v1' / 'edicao.json') or {}
    itens_ia = [ancorar(i, palavras) for i in no_tempo_da_saida((v1.get('direcao') or {}).get('itens') or [], saida, dur)]
    revisoes = []
    for v in sorted(revs):
        rev = revs[v][0]
        for c in sorted(rev.get('comentarios') or [], key=lambda c: c.get('t') or 0):
            if (c.get('texto') or '').strip():
                revisoes.append({'versao': v, 'tempo': c.get('t'), 'fala': c.get('fala'), 'texto': c['texto'].strip(),
                                 'status': c.get('status') or 'pendente', 'resposta': c.get('resposta')})
        if (rev.get('geral') or '').strip():
            g = rev.get('resposta_geral') or {}
            revisoes.append({'versao': v, 'tempo': None, 'fala': None, 'texto': rev['geral'].strip(),
                             'status': g.get('status') or 'pendente', 'resposta': g.get('resposta')})
    rev_n, arq_n = revs.get(n, ({}, None))
    aprovado_em = rev_n.get('aprovado_em') or (datetime.fromtimestamp(arq_n.stat().st_mtime).isoformat(timespec='seconds')
                                               if rev_n.get('aprovado') else None)

    id = f'prj-{slug}-v{n}'
    base = REFS / id
    with _trava():
        shutil.rmtree(base, ignore_errors=True)
        base.mkdir(parents=True)
    try:
        if subprocess.run(['cp', '-c', str(vdir / 'proxy.mp4'), str(base / 'proxy.mp4')], capture_output=True).returncode:
            shutil.copy2(vdir / 'proxy.mp4', base / 'proxy.mp4')
        ffmpeg('-ss', str(min(1.0, dur / 2)), '-i', str(base / 'proxy.mp4'), '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4',
               str(base / 'miniatura.jpg'))
        gravar_json(base / 'palavras.json', {'motor': (ler_json(p / 'transcricao.json') or {}).get('motor'), 'palavras': palavras})
        cortes = [q['inicio'] for q in itens if q['camada'] == 'plano'][1:]
        gravar_json(base / 'cenas.json', {'cortes': cortes})
        gravar_json(base / 'referencia.json', {
            'id': id, 'nome': f"{edicao.get('nome') or slug} (aprovado)", 'criado_em': datetime.now().isoformat(timespec='seconds'),
            'formato': 'vertical', 'video': {'arquivo': 'proxy.mp4', 'nome_original': f'projetos/{slug}/versoes/v{n}/proxy.mp4', **info},
            'status': 'a_revisar', 'erro': None, 'analise': {'passos': {x: {'status': 'pronto'} for x in PASSOS}},
            'origem': {'projeto': slug, 'versao': n, 'aprovado_em': aprovado_em}, 'revisoes': revisoes,
            'tipo': categoria_de(ler_json(p / 'edicao.json') or edicao, 'formato')})  # a categoria do projeto (a de agora, não a da versão): ensina a direção dos projetos da mesma
        for i in itens:
            _miniatura(base, i)
        gravar_json(base / 'direcao.json', {'itens': itens, 'itens_ia': itens_ia, 'cortes': cortes})
    except BaseException:
        shutil.rmtree(base, ignore_errors=True)
        raise
    # um projeto ensina por uma referência só: as de versões anteriores dele (aprovado de novo depois) vão para a lixeira
    for velha in REFS.glob(f'prj-{slug}-v*'):
        if velha.name != id and re.fullmatch(rf'prj-{re.escape(slug)}-v\d+', velha.name) and (velha / 'referencia.json').is_file():
            apagar(velha.name)
    regenerar_exemplos()
    return id


# ---------------------------------------------------------------- a fila

def _criar(arquivo: str, nome: str | None, categoria: str = CATEGORIA_PADRAO) -> str:
    """Copia o vídeo para a pasta nova e cria o referencia.json "na fila". Recusa (ValueError) o que não serve."""
    origem = Path(arquivo).expanduser()
    if not origem.is_file():
        raise ValueError(f'Não achei o vídeo: {origem.name}')
    _checar_categoria(categoria)
    nome = (nome or origem.stem).strip()[:120] or origem.stem
    with _trava():
        id = novo_id(nome)
        base = REFS / id
        base.mkdir(parents=True)
    destino = base / f'video{origem.suffix.lower() or ".mp4"}'
    try:
        if subprocess.run(['cp', '-c', str(origem), str(destino)], capture_output=True).returncode:
            shutil.copy2(origem, destino)  # entre volumes diferentes, uma cópia comum
        try:
            info = inspecionar(destino)
        except RuntimeError:
            raise ValueError('Não consegui ler o vídeo (formato não suportado ou arquivo corrompido).') from None
        if 'largura' not in info:
            raise ValueError('Este arquivo não tem imagem: escolha um vídeo.')
        if info['altura'] <= info['largura']:
            raise ValueError(f"Este vídeo é {info['largura']}×{info['altura']}: por enquanto, só vídeos verticais.")
        ffmpeg('-ss', str(min(1.0, info['duracao'] / 2)), '-i', str(destino), '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4',
               str(base / 'miniatura.jpg'))
        gravar_json(base / 'referencia.json', {
            'id': id, 'nome': nome, 'criado_em': datetime.now().isoformat(timespec='seconds'), 'formato': 'vertical',
            'video': {'arquivo': destino.name, 'nome_original': origem.name, **info},
            'status': 'na_fila', 'erro': None, 'analise': {'passos': {p: {'status': 'pendente'} for p in PASSOS}}, 'tipo': categoria})
    except Exception:
        shutil.rmtree(base, ignore_errors=True)
        raise
    return id


def _por_na_fila(id: str, pid: int | None = None) -> None:
    def marcar(r):
        r['status'], r['erro'] = 'na_fila', None
        r['analise'] = {'passos': {p: {'status': 'pendente'} for p in PASSOS}, **({'pid': pid} if pid else {})}
    atualizar(id, marcar)


def _disparar(id: str) -> None:
    """Roda `calibragem.py analisar --id` em segundo plano, desacoplado de quem chamou (sobrevive ao servidor)."""
    base = pasta(id)
    with open(base / 'analise.log', 'a') as log:
        proc = subprocess.Popen([shutil.which('uv') or 'uv', 'run', '--quiet', str(Path(__file__).resolve()), 'analisar', '--id', id],
                                cwd=RAIZ, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    threading.Thread(target=proc.wait, daemon=True).start()  # recolhe o processo quando acabar (sem zumbi)
    atualizar(id, lambda r: r.setdefault('analise', {}).update(pid=proc.pid))


def enfileirar_analise(arquivo: str, nome: str | None = None, categoria: str = CATEGORIA_PADRAO) -> str:
    """Copia o vídeo para `biblioteca/referencias/<id>/`, põe na fila e dispara a análise em segundo plano. Devolve o id."""
    id = _criar(arquivo, nome, categoria)
    _disparar(id)
    return id


def _livre(id: str) -> dict:
    r = ler(id)
    if r['status'] in ('na_fila', 'analisando'):
        raise ValueError('Essa referência já está na fila')
    return r


def tentar_de_novo(id: str) -> None:
    """Põe de novo na fila, reaproveitando o que já foi feito (proxy, transcrição, trechos com a mesma chave)."""
    _livre(id)
    _por_na_fila(id)
    _disparar(id)


def reanalisar(id: str) -> None:
    """Refaz a análise da IA e a revisão (como o "Reanalisar" do 18): apaga trechos, análise e cenas; a direção anterior
    fica em direcao.anterior.json para comparar. Proxy e transcrição são reaproveitados."""
    _livre(id)
    base = pasta(id)
    _por_na_fila(id)
    shutil.rmtree(base / 'trechos', ignore_errors=True)
    if (base / 'direcao.json').exists():
        (base / 'direcao.json').replace(base / 'direcao.anterior.json')
    for nome in ('analise.json', 'cenas.json'):
        (base / nome).unlink(missing_ok=True)
    _disparar(id)


# ---------------------------------------------------------------- a análise (do 18: direcao.py)

class SemCredito(RuntimeError):
    pass


def _falta_credito(e: BaseException) -> bool:
    t = str(e).lower()
    return 'crédito' in t or 'credit' in t or '402' in t


def _existe(base: Path) -> None:
    """Antes de gravar: a referência pode ter ido para a lixeira no meio (a gravação recriaria a pasta)."""
    if not (base / 'referencia.json').exists():
        raise FileNotFoundError('Referência não encontrada')


def _gravar(base: Path, rel: str, dados) -> None:
    _existe(base)
    gravar_json(base / rel, dados)


_mostrar = [False]  # a CLI imprime o andamento


def _passo(id: str, nome: str, **campos) -> None:
    atualizar(id, lambda r: r.setdefault('analise', {}).setdefault('passos', {}).setdefault(nome, {}).update(campos))


def _video(base: Path) -> Path:
    """O original; nas referências trazidas do 18 sem ele, o proxy."""
    return next((p for p in base.iterdir() if p.stem == 'video' and p.suffix), base / 'proxy.mp4')


def _proxy(id: str, base: Path):
    """Do 18: midia.proxy. Lado menor 720 px, H.264 por hardware, um quadro-chave a cada 0,5 s, AAC 128k."""
    destino = base / 'proxy.mp4'
    if destino.exists():
        return {'reaproveitado': True}
    dur = ler(id)['video']['duracao']
    tmp = base / f'proxy.{os.getpid()}.tmp.mp4'
    escala = "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'"
    cmd = ['ffmpeg', '-v', 'error', '-y', '-hwaccel', 'videotoolbox', '-i', str(_video(base)), '-vf', escala,
           '-c:v', 'h264_videotoolbox', '-b:v', '3M', '-force_key_frames', 'expr:gte(t,n_forced*0.5)',
           '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', str(tmp)]
    ultimo = 0.0
    try:
        with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as proc:
            for linha in proc.stdout:
                if linha.startswith('out_time_us=') and linha.strip()[12:].isdigit():
                    f = min(int(linha.strip()[12:]) / 1e6 / max(dur, 0.1), 1)
                    if f - ultimo >= 0.1:
                        ultimo = f
                        _passo(id, 'proxy', progresso=round(f, 2))
            erro = proc.stderr.read()
        if proc.returncode:
            raise RuntimeError(f'o ffmpeg falhou: {erro.strip()[-300:]}')
        _existe(base)
        tmp.replace(destino)
    finally:
        tmp.unlink(missing_ok=True)


def _transcricao(id: str, base: Path):
    """O áudio, os silêncios e a transcrição com o ElevenLabs Scribe v2 (o motor padrão do 18), como o preparar."""
    if (base / 'palavras.json').exists():
        return {'reaproveitado': True}
    from transcricao import extrair_audio, silencios, transcrever

    audio = base / 'audio.wav'
    try:
        extrair_audio(_video(base), audio)
        _gravar(base, 'silencios.json', {'silencios': silencios(audio)})
        palavras = transcrever(audio)
    finally:
        audio.unlink(missing_ok=True)
    _gravar(base, 'palavras.json', {'motor': 'elevenlabs', 'palavras': palavras})
    return {'motor': 'elevenlabs', 'palavras': len(palavras)}


def detectar_cortes(video: Path) -> list[float]:
    """Cortes duros de cena, em segundos (sem o 0)."""
    from scenedetect import AdaptiveDetector, detect

    return [round(a.seconds, 3) for a, _ in detect(str(video), AdaptiveDetector())][1:]


def _cenas(id: str, base: Path):
    dur = ler(id)['video']['duracao']
    cortes = [t for t in detectar_cortes(base / 'proxy.mp4') if 0.05 < t < dur - 0.05]
    _gravar(base, 'cenas.json', {'cortes': cortes})
    return {'trechos': len(cortes) + 1}


def trechos(cortes: list[float], duracao: float) -> list[tuple[float, float]]:
    bordas = [0.0, *cortes, duracao]
    return [(a, b) for a, b in zip(bordas, bordas[1:]) if b - a > 0.02]


def _clipe(video: Path, a: float, b: float, destino: Path) -> Path:
    """O trecho [a, b) como um MP4 pequeno com áudio (640 px de altura): o Gemini amostra o vídeo e ouve o áudio."""
    ffmpeg('-ss', f'{a:.3f}', '-i', str(video), '-t', f'{b - a:.3f}', '-vf', 'scale=-2:640',
           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '64k', str(destino))
    return destino


def _no_video_inteiro(analise: dict, a: float, b: float) -> dict:
    """Se o modelo respondeu com tempos do clipe (0 = início do trecho) em vez do vídeo inteiro, soma o início."""
    tempos = [x[k] for x in analise['planos'] + analise['elementos'] for k in ('inicio', 'fim')]
    if a > 0.5 and tempos and max(tempos) <= (b - a) + 0.3 and min(tempos) < a - 0.3:
        for x in analise['planos'] + analise['elementos']:
            x['inicio'], x['fim'] = round(x['inicio'] + a, 3), round(x['fim'] + a, 3)
    return analise


def transcricao_ate(palavras: list[dict], a: float, b: float) -> str:
    """A fala do começo do vídeo até o fim do trecho [a, b), com o que é dito durante o trecho marcado e com tempos."""
    antes = [w for w in palavras if w['fim'] <= a + 0.01]
    durante = [w for w in palavras if w['fim'] > a + 0.01 and w['inicio'] < b]
    linhas: list[list[dict]] = []
    for k, w in enumerate(antes):
        if not linhas or w['inicio'] - antes[k - 1]['fim'] >= 0.6 or antes[k - 1]['texto'].rstrip().endswith(FIM_DE_FRASE):
            linhas.append([])
        linhas[-1].append(w)
    texto = '\n'.join(f"[{l[0]['inicio']:.1f} s] " + ' '.join(w['texto'] for w in l) for l in linhas)
    momento = ' '.join(f"{w['texto']}[{w['inicio']:.2f}]" for w in durante) or '(sem fala neste trecho)'
    return (texto + '\n' if texto else '(começo do vídeo)\n') + f'<momento_analisado de="{a:.2f} s" ate="{b:.2f} s">\n{momento}\n</momento_analisado>'


# o esquema estruturado do 18 (os modelos pydantic PlanoIA, ElementoIA, AnaliseTrecho e InsertVisto), em JSON Schema
_TEXTO_OU_NADA = {'anyOf': [{'type': 'string'}, {'type': 'null'}]}
ESQUEMA_TRECHO = {
    'title': 'AnaliseTrecho', 'type': 'object',
    'properties': {
        'continua_anterior': {'type': 'boolean', 'description': 'O primeiro plano continua o MESMO conteúdo do quadro de contexto anterior'},
        'planos': {'type': 'array', 'minItems': 1, 'items': {
            'title': 'PlanoIA', 'type': 'object',
            'properties': {
                'tipo': {'type': 'string', 'enum': list(PLANOS)},
                'texto': {**_TEXTO_OU_NADA, 'description': 'Só para full_ator_lettering (texto exato do lettering) e comentario_insert_ator (texto exato do comentário)'},
                'inicio': {'type': 'number', 'description': 'Segundos do vídeo (use os tempos t= dos quadros)'},
                'fim': {'type': 'number'},
                'descricao': {'type': 'string', 'description': 'A marcação do roteiro: só o que o nome do plano não diz (o que aparece, o que acontece e como foi editado: entrada, zoom, mergulho, saída), ligado à fala, em 2 a 3 frases; vazia num full_ator sem nada de especial'}},
            'required': ['tipo', 'texto', 'inicio', 'fim', 'descricao']}},
        'elementos': {'type': 'array', 'items': {
            'title': 'ElementoIA', 'type': 'object',
            'properties': {
                'tipo': {'type': 'string', 'enum': list(ELEMENTOS)},
                'inicio': {'type': 'number'},
                'fim': {'type': 'number'},
                'texto': {**_TEXTO_OU_NADA, 'description': 'Texto exato do elemento, quando houver'},
                'descricao': {'type': 'string', 'description': 'O que é e o que destaca, em poucas palavras'}},
            'required': ['tipo', 'inicio', 'fim', 'texto', 'descricao']}}},
    'required': ['continua_anterior', 'planos', 'elementos']}
ESQUEMA_INSERT = {
    'title': 'InsertVisto', 'type': 'object',
    'properties': {'marcacao': {'type': 'string', 'description': 'o que acontece no insert, em ordem, com a edição: o que entra e como, zooms, destaques, trocas'}},
    'required': ['marcacao']}

PROMPT = """Você analisa um vídeo vertical curto (Reels/Shorts/TikTok) JÁ EDITADO de um criador de conteúdo para descobrir como ele foi dirigido visualmente: o que aparece na tela em cada momento da fala.

Você recebe UM trecho entre dois cortes de cena:
- a transcrição do vídeo DO COMEÇO ATÉ O FIM DESTE TRECHO (nada do que vem depois), para você saber do que o vídeo está falando e o que já foi dito. O que é falado durante o trecho está marcado entre <momento_analisado> e </momento_analisado>, com o tempo de início de cada palavra;
- o trecho em si: um VÍDEO com áudio (o tempo 0 dele é o início do trecho) ou, em outra configuração, mosaicos de quadros com o tempo de cada um escrito no canto (t= segundos), como a mensagem indicar;
- um quadro logo antes do trecho (e às vezes um logo depois), só como contexto.

PLANOS-BASE (um por vez; cobrem o trecho inteiro, sem buracos):
- full_ator: o apresentador ocupa a tela (com ou sem coisas pequenas por cima). Zoom/reenquadramento no apresentador continua sendo full_ator.
- full_ator_lettering: o apresentador ocupa a tela E há um lettering (texto grande de destaque, palavra ou expressão-chave) sobre ele. O plano dura enquanto o lettering está na tela: se ele entra e sai sem corte de cena, divida o trecho em full_ator → full_ator_lettering → full_ator. Ponha o texto exato do lettering no campo texto (e NÃO crie também um elemento lettering para ele).
- insert_tela_cheia: material ilustrativo REAL ocupa a tela toda, sem o apresentador: gravação de tela, site, app, print, foto, vídeo de apoio.
- motion_tela_cheia: peça gráfica ANIMADA criada para o vídeo ocupa a tela toda, sem o apresentador: logos animados, mockups estilizados, textos e formas animadas, infográficos.
- comentario_insert_ator: o COMENTÁRIO de um seguidor (card de comentário de post do Instagram/YouTube, com foto, nome, curtidas, "Responder") aparece sobre um insert ou motion na parte de cima, e o apresentador embaixo, respondendo. Ponha o texto exato do comentário no campo texto. Não confunda com a caixinha de perguntas dos Stories (elemento caixinha_perguntas).
- tela_dividida_insert: o apresentador aparece JUNTO com um INSERT (material real: gravação de tela, site, app, print, filmagem), sem comentário de seguidor. Normalmente o insert fica em cima e o apresentador embaixo; se o apresentador estiver numa janela menor sobre o conteúdo, também vale (diga "apresentador em janela" na descrição).
- tela_dividida_motion: o mesmo, mas o que aparece junto com o apresentador é um MOTION (peça gráfica animada produzida).
Insert × motion: insert é a captura de algo que existe (tela, site, print, filmagem), mesmo com zoom ou destaque simples; motion é uma peça gráfica animada produzida. Compare os quadros em sequência: o que muda entre eles (rolagem, cursor, digitação, elementos que se montam) ajuda a decidir.

ELEMENTOS (sobrepostos ao plano; podem durar menos que ele):
- lettering: texto grande de destaque com uma palavra ou expressão-chave sobre um plano que NÃO é o apresentador em tela cheia (ex.: um título sobre um insert). Sobre o apresentador em tela cheia, use o plano full_ator_lettering.
- palavra_manychat: chamada para comentar uma palavra (CTA de ManyChat, ex.: Comente "PROMPT").
- caixinha_perguntas: a caixinha de perguntas dos Stories do Instagram (sticker "faça uma pergunta" com a pergunta de um seguidor) na tela. Comentário de post não é caixinha (veja comentario_insert_ator).
- print_sobreposto: print, imagem ou logo pequeno sobre o plano, sem tomar a tela.

IGNORE a legenda palavra a palavra queimada no vídeo (texto curto que acompanha a fala, uma ou poucas palavras por vez): ela é outra etapa e NÃO é lettering.
Se o texto em destaque É o próprio motion em tela cheia (ex.: uma animação tipográfica sem o apresentador), ele já é o plano motion_tela_cheia: não crie um lettering repetindo-o. Lettering é texto SOBRE outro plano.

MARCAÇÃO (o campo descricao, o mais importante): é a anotação de roteiro deste trecho, como um diretor anota ao lado da fala o que deve aparecer na tela. Ela vai virar uma linha `[plano: marcação]` acima da fala, então diga SÓ o que o nome do plano não diz: nunca descreva o layout (tela dividida, apresentador embaixo, conteúdo em cima, apresentador falando para a câmera — o plano já diz isso). Em 2 a 3 frases, diga o que aparece e o que acontece na tela (qual site, app, ferramenta, gráfico, texto; o que se mexe: entra, abre, digita, rola, dá zoom, destaca, troca), ligado ao que está sendo dito, e como foi editado: como o material entra (no corte, subindo, crescendo, desfocado), se fica parado ou tem zoom lento, se mergulha num detalhe (em qual), se o apresentador tem zoom, e como sai ou troca no corte seguinte. Concreto e acionável, como instrução para quem vai editar; sem cores, texturas e posições. Num full_ator sem nada de especial, deixe vazia.
Exemplos de marcação: "em cima, o YouTube abrindo e alguém digitando 'IA' na busca; embaixo, o apresentador" · "o ChatGPT respondendo, com a lista de ferramentas aparecendo enquanto ele cita ChatGPT, Claude, Python, n8n…" · "motion minimalista: a pasta SKILL.md e o ícone do Claude saindo dela, enquanto ele fala 'eu criei uma skill'".
Para elementos, diga o que é e o que destaca, em poucas palavras.

Regras:
- Use as categorias acima e nenhuma outra. Tempos SEMPRE em segundos do vídeo inteiro (não do clipe), dentro do trecho.
- Normalmente o trecho tem UM plano. Devolva mais de um quando o layout muda dentro do trecho (inclusive um lettering que entra e sai sobre o apresentador).
- Escreva em português.
- continua_anterior: true só se o primeiro plano do trecho mostra o MESMO conteúdo do quadro de contexto anterior (mesma tela/insert/motion, só mudou zoom ou posição)."""

PROMPT_INSERT = """Você está vendo um bloco de INSERT de um vídeo vertical curto já editado: material real (site, página, ferramenta, vídeo, print) que aparece enquanto o criador fala.

Escreva a MARCAÇÃO do roteiro para este bloco: conte o que acontece no insert, em ordem, como um editor contaria a outro — qual material aparece (o site, a página, a ferramenta, concretos), como entra (no corte, subindo, crescendo, desfocado, num card ou na tela toda), se fica parado ou tem zoom lento, zooms e mergulhos (em quê, e em que palavra), destaques (caixas, setas, blur), rolagens, trocas de um material para outro e como sai. 2 a 4 frases, concretas.
NÃO descreva o layout do plano (tela dividida, apresentador embaixo, conteúdo em cima, apresentador falando): o nome do plano já diz isso.
O bloco tem {duracao:.1f} s."""


def _sistema(prompt: str) -> str:
    """O prompt com o "Sobre o criador" (exemplos/criador.md), como o 18 fazia com o perfil das Configurações."""
    arq = EXEMPLOS / 'criador.md'
    perfil = arq.read_text(encoding='utf-8').strip()[:1000] if arq.exists() else ''
    return prompt + (f'\n\nSOBRE O CRIADOR (contexto): {perfil}' if perfil else '')


def _perguntar(sistema: str, conteudo: list[dict], esquema: dict, max_tokens: int, timeout: float) -> tuple[dict, dict]:
    """Uma chamada ao Gemini com saída estruturada; os erros do gemini.py (SystemExit) viram exceções comuns."""
    uso: dict = {}
    try:
        r = gemini.chamar([{'role': 'system', 'content': sistema}, {'role': 'user', 'content': conteudo}], esquema, max_tokens, timeout, uso)
    except SystemExit as e:
        if _falta_credito(e):
            raise SemCredito(SEM_CREDITO) from None
        raise RuntimeError(str(e)) from None
    if not isinstance(r, dict):
        raise RuntimeError('resposta fora do formato pedido')
    return r, uso


def _conferir(r: dict) -> dict:
    """O que o pydantic do 18 conferia: as categorias fixas, os tempos, ao menos um plano."""
    try:
        planos = [{'tipo': p['tipo'], 'texto': p.get('texto') or None, 'inicio': float(p['inicio']), 'fim': float(p['fim']),
                   'descricao': str(p.get('descricao') or '')} for p in r['planos']]
        elementos = [{'tipo': e['tipo'], 'inicio': float(e['inicio']), 'fim': float(e['fim']), 'texto': e.get('texto') or None,
                      'descricao': str(e.get('descricao') or '')} for e in r.get('elementos') or []]
    except (KeyError, TypeError, ValueError) as e:
        raise RuntimeError(f'resposta incompleta ({e})') from None
    if not planos or any(p['tipo'] not in PLANOS for p in planos) or any(e['tipo'] not in ELEMENTOS for e in elementos):
        raise RuntimeError('resposta fora das categorias')
    return {'continua_anterior': bool(r.get('continua_anterior')), 'planos': planos, 'elementos': elementos}


def analisar_trecho(video: Path, palavras: list[dict], n: int, a: float, b: float, duracao: float) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        conteudo: list[dict] = [{'type': 'text', 'text': (
            f'TRECHO {n + 1}: de {a:.2f} s a {b:.2f} s (o vídeo tem {duracao:.1f} s).\n\n'
            f'TRANSCRIÇÃO ATÉ O FIM DESTE TRECHO:\n{transcricao_ate(palavras, a, b)}')}]
        if a > 0.05:
            conteudo += [{'type': 'text', 'text': f'QUADRO DE CONTEXTO ANTERIOR (t={max(a - 0.15, 0):.2f}, antes do trecho):'},
                         gemini.bloco(quadro(video, a - 0.15, tmp / 'antes.jpg'), tmp)]
        conteudo += [{'type': 'text', 'text': (
            f'VÍDEO DO TRECHO (com áudio): o tempo 0 deste vídeo é {a:.2f} s do vídeo inteiro, e ele termina em {b:.2f} s. '
            f'Responda os tempos em segundos do vídeo inteiro (some {a:.2f}).')},
            gemini.bloco(_clipe(video, a, b, tmp / 'trecho.mp4'), tmp, preparado=True)]
        # saída limitada (o OpenRouter reserva crédito pelo máximo) e timeout curto: uma chamada travada não prende a fila
        try:
            r, uso = _perguntar(_sistema(PROMPT), conteudo, ESQUEMA_TRECHO, 4096, 90)
        except RuntimeError as e:
            # trecho cheio de planos: a resposta passou do limite e veio cortada no meio do JSON; de novo, com o dobro
            if 'formato' not in str(e):
                raise
            r, uso = _perguntar(_sistema(PROMPT), conteudo, ESQUEMA_TRECHO, 8192, 120)
    analise = _no_video_inteiro(_conferir(r), a, b)
    return {'inicio': a, 'fim': b, **analise, 'tokens': uso.get('total_tokens'), 'custo': uso.get('cost')}


def _em_paralelo(fazer, lista: list, n: int) -> list:
    """`fazer` em cada item, n por vez, na ordem; no primeiro erro, cancela o que não começou e levanta o erro."""
    with ThreadPoolExecutor(max_workers=n) as ex:
        futuros = {ex.submit(fazer, x): k for k, x in enumerate(lista)}
        resultados = [None] * len(lista)
        try:
            for f in as_completed(futuros):
                resultados[futuros[f]] = f.result()
        except BaseException:
            for f in futuros:
                f.cancel()
            raise
    return resultados


def _analise(id: str, base: Path):
    modelo = env('OPENROUTER_MODEL')
    dur = ler(id)['video']['duracao']
    cortes = ler_json(base / 'cenas.json')['cortes']
    palavras = ler_json(base / 'palavras.json')['palavras']
    lista = trechos(cortes, dur)
    feitos, trava = [0], threading.Lock()

    def um(n_ab):
        n, (a, b) = n_ab
        rel = f'trechos/{n:03d}.json'
        chave = {'inicio': a, 'fim': b, 'modelo': modelo, 'fps': FPS, 'formato': FORMATO, 'grade': GRADE, 'versao': VERSAO_ANALISE}
        salvo = ler_json(base / rel)
        if salvo and salvo.get('chave') == chave:
            return salvo['analise']
        for tentativa in (1, 2):
            try:
                analise = analisar_trecho(base / 'proxy.mp4', palavras, n, a, b, dur)
                break
            except SemCredito:
                raise
            except Exception:
                if tentativa == 2:
                    raise
        _gravar(base, rel, {'chave': chave, 'analise': analise})
        with trava:
            feitos[0] += 1
            _passo(id, 'analise', progresso=round(feitos[0] / len(lista), 2), feitos=feitos[0], total=len(lista))
            if _mostrar[0]:
                print(f'    trecho {feitos[0]}/{len(lista)}', flush=True)
        return analise

    _passo(id, 'analise', feitos=0, total=len(lista), modelo=modelo)
    resultados = _em_paralelo(um, list(enumerate(lista)), PARALELO)
    _gravar(base, 'analise.json', {'modelo': modelo, 'trechos': resultados})
    custo = sum(r.get('custo') or 0 for r in resultados)
    return {'trechos': len(resultados), 'tokens': sum(r.get('tokens') or 0 for r in resultados), **({'custo': round(custo, 4)} if custo else {})}


def montar(resultados: list[dict], duracao: float) -> list[dict]:
    """Itens da revisão a partir da análise por trecho: planos contíguos (um por corte de cena; só os jump cuts do Full
    ator se juntam) e elementos dentro de cada trecho."""
    planos: list[dict] = []
    elementos: list[dict] = []
    for r in sorted(resultados, key=lambda r: r['inicio']):
        a, b = r['inicio'], r['fim']
        ps = sorted(r['planos'], key=lambda p: p['inicio'])
        for k, p in enumerate(ps):  # contíguos dentro do trecho
            ini = a if k == 0 else max(min(p['inicio'], b), a)
            fim = b if k == len(ps) - 1 else max(min(p['fim'], b), ini)
            if fim - ini < MIN_PLANO and k:
                planos[-1]['fim'] = fim
                continue
            tipo = tipo_atual(p['tipo'], p.get('conteudo_em_cima'))  # o cache de trechos antigos do 18 tem o formato antigo
            novo = {'camada': 'plano', 'tipo': tipo, 'conteudo': None, 'inicio': ini, 'fim': fim, 'descricao': p['descricao'],
                    'texto': (p.get('texto') or None) if tipo in PLANOS_COM_TEXTO else None}
            ant = planos[-1] if planos else None
            mesmo = ant and ant['tipo'] == novo['tipo'] and ant['conteudo'] == novo['conteudo'] and ant['texto'] == novo['texto']
            if mesmo and novo['tipo'] == 'full_ator':  # só os jump cuts do ator se juntam: cada corte de cena é uma linha do roteiro
                ant['fim'] = fim
            else:
                planos.append(novo)
        for e in r['elementos']:
            ini, fim = max(e['inicio'], a), min(e['fim'], b)
            if fim - ini < 0.05:
                continue
            ant = elementos[-1] if elementos else None
            if ant and ant['tipo'] == e['tipo'] and ant['texto'] == e['texto'] and ini - ant['fim'] < 0.3:  # o mesmo elemento atravessando um corte
                ant['fim'] = fim
                continue
            elementos.append({'camada': 'elemento', 'tipo': e['tipo'], 'conteudo': None, 'inicio': ini, 'fim': fim,
                              'descricao': e['descricao'], 'texto': e['texto']})
    if planos:
        planos[0]['inicio'], planos[-1]['fim'] = 0.0, duracao
    for k, i in enumerate(planos, 1):
        i['id'] = f'p{k}'
    for k, i in enumerate(elementos, 1):
        i['id'] = f'e{k}'
    itens = planos + elementos
    for i in itens:
        i['inicio'], i['fim'] = round(i['inicio'], 3), round(i['fim'], 3)
    return itens


def _montagem(id: str, base: Path):
    dur = ler(id)['video']['duracao']
    resultados = ler_json(base / 'analise.json')['trechos']
    palavras = ler_json(base / 'palavras.json')['palavras']
    itens = [ancorar(i, palavras) for i in montar(resultados, dur)]
    for i in itens:
        _miniatura(base, i)
    _gravar(base, 'direcao.json', {'itens': itens, 'itens_ia': itens, 'cortes': ler_json(base / 'cenas.json')['cortes']})
    return {'planos': sum(i['camada'] == 'plano' for i in itens), 'elementos': sum(i['camada'] == 'elemento' for i in itens)}


def analisar_insert(base: Path, bloco: dict) -> tuple[str, dict]:
    """Assiste um bloco de insert inteiro e devolve a marcação (o que acontece nele). Um bloco curto demais para vídeo vai
    como o quadro do meio (é praticamente uma imagem parada)."""
    video = base / 'proxy.mp4'
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if bloco['fim'] - bloco['inicio'] < MIN_VIDEO_INSERT:
            visto = gemini.bloco(quadro(video, (bloco['inicio'] + bloco['fim']) / 2, tmp / 'bloco.jpg', 640), tmp)
        else:
            visto = gemini.bloco(_clipe(video, bloco['inicio'], bloco['fim'], tmp / 'bloco.mp4'), tmp, preparado=True)
        conteudo = [{'type': 'text', 'text': f"Bloco: {PLANOS.get(bloco['tipo'], bloco['tipo'])}. Marcação de antes, vista em pedaços: {bloco.get('descricao') or '—'}"},
                    visto]
        r, uso = _perguntar(_sistema(PROMPT_INSERT.format(duracao=bloco['fim'] - bloco['inicio'])), conteudo, ESQUEMA_INSERT, 2000, 120)
    marcacao_ = str(r.get('marcacao') or '').strip()[:1200]
    if not marcacao_:
        raise RuntimeError('marcação vazia')
    return marcacao_, uso


def _inserts(id: str, base: Path):
    """Cada plano com insert é assistido inteiro (a análise vê só pedaços entre cortes de cena) e ganha a marcação do que
    acontece nele (3 por vez). Um bloco que falha fica com a marcação da análise em pedaços; só a falta de crédito para."""
    dados = ler_json(base / 'direcao.json')
    blocos = [i for i in dados['itens'] if i['camada'] == 'plano' and tem_insert(i['tipo'], i.get('conteudo'))]
    falhas, tokens, feitos, trava = [], [0], [0], threading.Lock()

    def um(b: dict) -> tuple[str, str | None]:
        try:
            marc, uso = analisar_insert(base, b)
        except SemCredito:
            raise
        except Exception:
            traceback.print_exc()
            falhas.append(b['id'])
            return b['id'], None
        with trava:
            tokens[0] += uso.get('total_tokens') or 0
            feitos[0] += 1
            _passo(id, 'inserts', progresso=round(feitos[0] / len(blocos), 2), feitos=feitos[0], total=len(blocos))
        return b['id'], marc

    _passo(id, 'inserts', feitos=0, total=len(blocos))
    feito = dict(_em_paralelo(um, blocos, 3))
    dados = ler_json(base / 'direcao.json')
    for i in dados['itens']:
        if feito.get(i['id']):
            i['descricao'] = feito[i['id']]
        for velho in ('captura', 'insert', 'como_gerar'):  # formatos anteriores do 18
            i.pop(velho, None)
    _gravar(base, 'direcao.json', dados)
    return {'blocos': len(blocos), 'tokens': tokens[0], **({'falhas': falhas} if falhas else {})}


FAZER = {'proxy': _proxy, 'transcricao': _transcricao, 'cenas': _cenas, 'analise': _analise, 'montagem': _montagem, 'inserts': _inserts}


def _resumo(extra: dict) -> str:
    return ', '.join(f'{k} {v}' for k, v in extra.items() if k not in ('progresso', 'feitos', 'total'))


def analisar(id: str) -> bool:
    """O trabalho de uma referência: espera a vez na fila (uma por vez), roda os passos e deixa "a revisar" (ou "erro",
    com a mensagem). Devolve se terminou bem."""
    base = pasta(id)

    def interrompido(*_):
        raise KeyboardInterrupt
    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGTERM, interrompido)
    passo = None
    try:
        with _trava('.fila'):
            r = atualizar(id, lambda x: x.setdefault('analise', {}).update(pid=os.getpid()))
            if r['status'] != 'na_fila':
                return False
            atualizar(id, lambda x: x.update(status='analisando'))
            t0 = time.time()
            for passo in PASSOS:
                _passo(id, passo, status='rodando')
                t = time.time()
                extra = FAZER[passo](id, base) or {}
                _passo(id, passo, status='pronto', segundos=round(time.time() - t, 1), **extra)
                if _mostrar[0]:
                    print(f'  ✓ {ROTULOS[passo]:<20}{time.time() - t:6.1f} s   {_resumo(extra)}', flush=True)
            atualizar(id, lambda x: x.update(status='a_revisar', erro=None))
            if _mostrar[0]:
                print(f'Pronto em {time.time() - t0:.0f} s: "{ler(id)["nome"]}" está a revisar.', flush=True)
        regenerar_exemplos()
        return True
    except FileNotFoundError:  # apagada no meio
        return False
    except BaseException as e:  # noqa: BLE001 — vira a mensagem da referência
        if isinstance(e, KeyboardInterrupt):
            msg = INTERROMPIDA
        elif isinstance(e, SemCredito) or _falta_credito(e):
            msg = SEM_CREDITO
        else:
            traceback.print_exc()
            msg = f'{ROTULOS.get(passo, passo or "fila")}: {str(e).strip()[:300]}'
        try:
            if passo:
                _passo(id, passo, status='erro')
            atualizar(id, lambda x: x.update(status='erro', erro=msg))
        except FileNotFoundError:
            pass
        if _mostrar[0]:
            print(f'  ✗ {msg}', flush=True)
        return False


# ---------------------------------------------------------------- CLI

def main() -> None:
    ap = argparse.ArgumentParser(description='Calibragem da direção: os Reels do criador viram roteiros de exemplo.')
    sub = ap.add_subparsers(dest='comando', required=True)
    sub.add_parser('listar', help='as referências e o estado de cada uma')
    an = sub.add_parser('analisar', help='analisa um vídeo já editado (ou, com --id, uma referência que está na fila)')
    an.add_argument('video', nargs='?')
    an.add_argument('--nome')
    an.add_argument('--id')
    an.add_argument('--categoria', default=CATEGORIA_PADRAO, help='hacks, storytelling, pico, ad, cta, vsl… (calibragem.py categorias; padrão: hacks)')
    sub.add_parser('roteiros', help='reescreve exemplos/<categoria>/roteiros/*.md e os favoritos.md')
    sub.add_parser('categorias', help='as categorias de vídeo')
    ca = sub.add_parser('categoria', help='muda a categoria de uma referência')
    ca.add_argument('id')
    ca.add_argument('categoria')
    cp = sub.add_parser('categoria-projeto', help='muda a categoria de um projeto')
    cp.add_argument('slug')
    cp.add_argument('categoria')
    ex = sub.add_parser('exemplos', help='a(s) pasta(s) de exemplos que a direção do projeto lê')
    ex.add_argument('slug')
    pj = sub.add_parser('de-projeto', help='a versão aprovada de um projeto vira uma referência a revisar')
    pj.add_argument('slug')
    pj.add_argument('versao', nargs='?', help='vN (sem: a última aprovada, senão a última)')
    a = ap.parse_args()

    if a.comando == 'listar':
        for r in listar_referencias():
            pct = f" {r['progresso']:.0%}" if r['progresso'] is not None else ''
            andamento = f" ({r['passo_rotulo']}{pct})" if r['passo'] else ''
            dur = f"{r['duracao']:.0f} s" if r['duracao'] else '—'
            print(f"{r['id']:<32} {r['status']:<10}{andamento} {dur:>6}  {r['nome']}" + (f"\n    {r['erro']}" if r['erro'] else ''))
    elif a.comando == 'roteiros':
        r = regenerar_exemplos()
        print(f"{len(r['roteiros'])} roteiros em {EXEMPLOS.relative_to(RAIZ)}/<categoria>/roteiros/ ({len(r['mudaram'])} reescritos"
              + (f", apagados: {', '.join(r['apagados'])}" if r['apagados'] else '') + f"); {r['favoritos']} favoritos")
    elif a.comando == 'categorias':
        usadas = {}
        for r in _todas():
            usadas[categoria_de(r)] = usadas.get(categoria_de(r), 0) + 1
        for c in categorias():
            print(f"{c['id']:<12} {c['emoji']} {c['nome']}  ({usadas.get(c['id'], 0)} referências)")
    elif a.comando in ('categoria', 'categoria-projeto'):
        try:
            if a.comando == 'categoria':
                definir_categoria(a.id, a.categoria)
            else:
                categoria_projeto(a.slug, a.categoria)
        except (FileNotFoundError, ValueError) as e:
            raise SystemExit(str(e)) from None
        print(f'categoria: {a.categoria}')
    elif a.comando == 'exemplos':
        regenerar_exemplos()  # os roteiros na pasta seguem a Calibragem de agora (uma regra mudada não deixa a pasta velha)
        try:
            cat, pasta, n = exemplos_para(a.slug)
        except FileNotFoundError as e:
            raise SystemExit(str(e)) from None
        print(f'Categoria do projeto: {cat} · {n} vídeo(s) em uso na Calibragem')
        print(f'  {pasta.relative_to(RAIZ)}/  (favoritos.md, roteiros/: exemplos para consultar; o gosto está no guia de estilo da skill)')
        if not n:
            print(f'Nenhum vídeo de {cat} em uso: dirija pelo guia de estilo.')
    elif a.comando == 'de-projeto':
        try:
            id = de_projeto(a.slug, a.versao)
        except (FileNotFoundError, ValueError) as e:
            raise SystemExit(str(e)) from None
        r, d = ler(id), ler_json(REFS / id / 'direcao.json')
        aplicados = sum(c['status'] == 'aplicado' for c in r['revisoes'])
        print(f"\"{r['nome']}\" em biblioteca/referencias/{id}/: {sum(i['camada'] == 'plano' for i in d['itens'])} planos, "
              f"{sum(i['camada'] == 'elemento' for i in d['itens'])} elementos, {len(r['revisoes'])} comentários ({aplicados} aplicados).\n"
              'A revisar na Calibragem: só ensina a direção depois de marcada como revisada.'
              + ('' if r['origem']['aprovado_em'] else f"\nAviso: a v{r['origem']['versao']} não está aprovada no app."))
    elif a.id:
        _mostrar[0] = sys.stdout.isatty()
        sys.exit(0 if analisar(a.id) else 1)
    else:
        if not a.video:
            ap.error('diga o vídeo (ou --id)')
        env('OPENROUTER_API_KEY')  # sem as chaves, nem começa
        env('ELEVENLABS_API_KEY')
        try:
            id = _criar(a.video, a.nome, a.categoria)
        except ValueError as e:
            raise SystemExit(str(e)) from None
        atualizar(id, lambda x: x.setdefault('analise', {}).update(pid=os.getpid()))
        print(f'Analisando "{ler(id)["nome"]}" em biblioteca/referencias/{id}/', flush=True)
        _mostrar[0] = True
        sys.exit(0 if analisar(id) else 1)


if __name__ == '__main__':
    main()
