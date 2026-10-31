"""Servidor local: serve a raiz do repositório (app de revisão, página de render, projetos e biblioteca) com Range
(o player e o Chromium precisam pular no vídeo) e as rotas do app (revisões, calibragem, referências e biblioteca).

    uv run ferramentas/servidor.py [porta]      → http://localhost:8719/app/
Também importado pelo render (`servir(0)` sobe numa porta livre, numa thread). Só biblioteca padrão.

    uv run ferramentas/servidor.py --limpar-caches [dias]   → o cache do render dos aprovados parados (padrão: 3 dias)

Ao subir, e a cada hora, o servidor apaga o cache do render (.cache/camadas e .cache/trechos: as fotos da camada em
ProRes 4444, o grosso do disco) dos projetos aprovados e parados há `CACHE_DIAS` dias (`limpar_caches_parados`) e as
pastas temporárias de renders que morreram no meio (`.render-*` com mais de 6 h, `limpar_temporarios`).

Rotas (JSON; um erro volta como {"erro": "…"}, com 422 numa validação):
- GET /api/lista?pasta=… (nomes numa pasta pública) · GET /api/projetos (o início do app) · GET /api/motions/fonte/<pro|
  rounded|mono> (as SF da Apple, lidas do Mac: o render/motion/fonts.css as pede) · PUT /api/revisao/<slug>/v<N> (a
  revisão inteira; as respostas do Claude no arquivo são mantidas).
- Calibragem (chama ferramentas/calibragem.py): GET|POST /api/referencias (POST: o vídeo cru no corpo, o nome do arquivo
  no cabeçalho X-Nome) · GET /api/referencias/clipes · GET /api/referencias/<id>/revisao · PUT …/<id>/direcao {itens} ·
  PUT …/<id>/status {revisado} · PUT …/<id>/oculto {oculto} (oculto: sai da Heurística) · PUT …/<id>/ensina {ensina}
  (o interruptor do card: desligado, sai dos roteiros de exemplo da Heurística) · PUT …/<id>/nome {nome} ·
  PUT …/<id>/favorito {inicio, fim, favorito} · POST …/<id>/reanalisar · POST …/<id>/tentar · DELETE /api/referencias/<id>.
- GET|PUT /api/heuristica?categoria=<id>: as regras da direção da categoria (exemplos/<categoria>/regras.md) e os
  roteiros de exemplo dela, com os tempos dos planos. · GET|PUT /api/categorias {categorias} (as categorias de vídeo:
  Reels, Ad…; uma em uso não sai) · PUT /api/referencias/<id>/categoria {categoria} · PUT /api/projetos/<slug>/categoria
  {categoria} · o POST /api/referencias aceita a categoria no cabeçalho X-Categoria.
- Carrosséis (ferramentas/carrossel.py): GET|POST /api/carrosseis {nome, tipo, origem, pedido} · GET /api/carrosseis/<slug>
  (com as revisões) · POST …/<slug>/entrada (o arquivo cru no corpo, nome em X-Nome) · PUT …/<slug>/preset {preset}
  (num aprovado, exporta de novo) · PUT …/<slug>/nome {nome} · PUT …/<slug>/revisao/v<N> (aprovar exporta, em segundo
  plano) · POST …/<slug>/abrir-final · DELETE /api/carrosseis/<slug> (vai para a lixeira).
- POST /api/projetos/<slug>/abrir-final: abre no Finder a pasta dos exports (final/: as saídas, cada uma com o .md).
- GET /api/aprendizados (as áreas, com os bullets "Do criador", do geral e das categorias) · GET|PUT
  /api/aprendizados/<área>[?categoria=…] {texto} (o aprendizados/<área>.md, ou o exemplos/<categoria>/aprendizados/<área>.md)
  · GET /api/aprendizados/imagens/<nome> (as imagens que os .md mostram).
- GET /api/presets/amostras (o ator e as mídias do banco da simulação dos presets, render/preset.html)
  · PUT /api/presets/<id> {aprovado} · PUT /api/presets/ordem {chave, ids, favoritos} · PUT /api/transicoes/<id> {aprovado}
  · PUT /api/transicoes/ordem {chave, ids, favoritas} · GET|PUT|DELETE /api/banco/<id> ({estado} marca o selo à mão; {tags} as tags, aninhadas com /) · PUT /api/motions/<id>/tags {tags} · PUT /api/referencias/<id>/tags {inicio, fim, tags} · POST /api/tags/<banco|motions|referencias> {de, para} (renomeia ou tira em todos) · GET /api/estados (selos do banco e usos dos motions nos
  vídeos aprovados) · POST /api/limpar-recusados (vão para a lixeira) · POST /api/banco (subir: o arquivo cru, nome em X-Nome) ·
  POST /api/banco/<id>/trechos {inicio, fim, nome} · POST /api/banco/<id>/recorte {x, y, w, h} (px do original: um
  item novo com o quadro recortado; banco.py recortar) · GET /api/banco/<id>/tira · PUT /api/motions/<id>/aprovar.
- Recusar: GET /api/presets/<id>/usos e /api/motions/<id>/usos (os projetos que usam) · POST /api/presets/<id>/recusar
  e /api/motions/<id>/recusar {motivo}: o arquivo vai para _recusados/ (com recusado_em e motivo), o preset sai do
  ordem.json e os inserts que o usavam voltam ao 1º favorito da situação (presets.py escolher).
- GET /api/projetos/<slug>/versoes: cada versão com a data do render, a duração e o estado da revisão dela. · DELETE
  /api/projetos/<slug>: a pasta vai para a lixeira (nada sai do disco).
- A lixeira única (biblioteca/lixeira/, base.para_lixeira: projetos, mídias do banco e referências apagados): GET
  /api/lixeira · POST /api/lixeira/<entrada>/restaurar · DELETE /api/lixeira/<entrada> (apaga de vez) · POST
  /api/lixeira/esvaziar {tipo?} (apaga de vez tudo, ou só um tipo).
- Anexos da revisão: POST /api/revisao/<slug>/v<N>/anexo?comentario=<c3|geral> (a imagem ou o vídeo cru no corpo) →
  {caminho: "revisoes/anexos/c3-1.png"} · DELETE /api/revisao/<slug>/v<N>/anexo?caminho=revisoes/anexos/c3-1.png.
- GET /api/codigos: {tipo: {id: código}} (ferramentas/codigo.py; dá o próximo número aos itens novos).
- O provador de look da revisão: GET /api/projetos/<slug>/look (o look, os LUTs, as vinhetas e se há um render rodando)
  · POST …/look/amostra {t, lut, intensidade, vinheta} → {video} (3 s do ator com aquele look; render.py amostra-look)
  · PUT …/look {lut, intensidade, vinheta}: grava no edicao.json e renderiza a próxima versão em segundo plano.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

sys.path.insert(0, str(Path(__file__).parent))
from base import (APRENDIZADOS, BIBLIOTECA, CATEGORIA_PADRAO, EXEMPLOS, PROJETOS, RAIZ, apagar_de_vez, gravar_json, ler_json, listar_lixeira, migrar_lixeiras_antigas,  # noqa: E402
                  para_lixeira, preparar_biblioteca, renders_rodando, tamanho, renomear_tags, restaurar_da_lixeira, tag_limpa, tags_limpas)

PORTA = 8719
PUBLICOS = ('app', 'render', 'projetos', 'biblioteca', 'carrosseis')
FONTES_DO_MAC = {'pro': 'SFNS.ttf', 'rounded': 'SFNSRounded.ttf', 'mono': 'SFNSMono.ttf'}  # não vão para o git
AREAS = {'direcao': 'Direção', 'cortes': 'Cortes', 'inserts': 'Inserts', 'enriquecimento': 'Enriquecimento', 'motions': 'Motions', 'elementos': 'Elementos',
         'transicoes': 'Transições', 'audio': 'Áudio', 'legenda': 'Legenda', 'render': 'Render', 'carrossel': 'Carrossel'}
IMAGEM = re.compile(r'^[\w.-]+\.(png|jpe?g|webp|gif)$', re.I)
REFERENCIAS = BIBLIOTECA / 'referencias'
ID = r'([\w.-]+)'
CHAVE_PRESET = re.compile(r'^(dividida|vertical|atras):(1:(pe|deitada)|2|2\+)$')
CHAVE_TRANSICAO = re.compile(r'^familia:(ator|dividida|cheia)>(ator|dividida|cheia)$')
JSON_DO_MOTION = re.compile(r'(<script type="application/json" id="preset">)(.*?)(</script>)', re.DOTALL)


class Erro(Exception):
    """Um erro que vai para o app como {"erro": mensagem}, com o status."""

    def __init__(self, mensagem: str, status: int = 400):
        super().__init__(mensagem)
        self.status = status


def versoes(projeto: Path) -> list[int]:
    """As versões entregues (as que já têm o proxy.mp4), em ordem."""
    return sorted(int(v.name[1:]) for v in projeto.glob('versoes/v*') if v.name[1:].isdigit() and (v / 'proxy.mp4').is_file())


def _ts(iso) -> float:
    from datetime import datetime
    try:
        return datetime.fromisoformat(str(iso)).timestamp()
    except ValueError:
        return 0.0


def ultima_edicao(p: Path, vs: list[int]) -> float:
    """Quando o projeto foi mexido de verdade pela última vez: a versão mais nova (o render do Claude) ou a revisão —
    nesta, a `mexido_em` (muda só quando um comentário, uma resposta ou uma aprovação muda, `_revisao`), nunca a data do
    arquivo: só abrir o projeto regrava a revisão. O edicao.json não conta (tags, categoria e nome também o gravam). É a
    ordem "Recentes" e a data do card."""
    proxy = p / 'versoes' / f'v{vs[-1]}' / 'proxy.mp4'
    marcas = [proxy.stat().st_mtime if proxy.is_file() else 0.0]
    for arq in (p / 'revisoes').glob('v*.json'):
        rev = ler_json(arq, {}) or {}
        # as de antes da `mexido_em`: o comentário mais novo
        marcas.append(_ts(rev.get('mexido_em')) or max((_ts(c.get('criado_em')) for c in rev.get('comentarios') or []), default=0.0))
    return max(marcas)


def assinatura_revisao(rev: dict) -> str:
    """O que conta como mexer numa revisão: os comentários (texto, anexos, status, resposta), a aprovação e os blocos e
    finais finalizados. Os blocos criados ao abrir, a posição e o resto não contam."""
    return json.dumps([rev.get('comentarios') or [], bool(rev.get('aprovado')), rev.get('resposta_geral'),
                       sorted(b.get('id') for b in rev.get('blocos') or [] if b.get('aprovado')),
                       sorted(k for k, f in (rev.get('finais') or {}).items() if (f or {}).get('aprovado'))], sort_keys=True, ensure_ascii=False)


def projetos() -> list[dict]:
    """Os projetos com ao menos uma versão, do mais recente para o mais antigo, com o estado da revisão da última."""
    lista = []
    carros = carrossel().de_projetos()  # os carrosséis derivados de cada projeto (o chip no card)
    for p in PROJETOS.iterdir() if PROJETOS.is_dir() else []:
        if p.name.startswith(('_', '.')):  # o que não é projeto (pastas internas)
            continue
        vs = versoes(p)
        if not vs:
            continue
        ultima = vs[-1]
        rev = ler_json(p / 'revisoes' / f'v{ultima}.json', {}) or {}
        info = ler_json(p / 'versoes' / f'v{ultima}' / 'info.json', {}) or {}
        estado = 'aprovado' if rev.get('aprovado') else 'em_revisao'
        # nos vídeos com blocos, o quanto está concluído (os blocos finalizados, da revisão mais nova que os tem)
        blocos = next(((ler_json(p / 'revisoes' / f'v{x}.json', {}) or {}).get('blocos') for x in reversed(vs)
                       if (ler_json(p / 'revisoes' / f'v{x}.json', {}) or {}).get('blocos')), None)
        ed = ler_json(p / 'edicao.json', {}) or {}
        lista.append({'slug': p.name, 'nome': ed.get('nome') or p.name, 'formato': ed.get('formato') or CATEGORIA_PADRAO,
                      'tags': ed.get('tags') or [], 'oculto': bool(ed.get('oculto')), 'versoes': vs, 'ultima': ultima, 'duracao': info.get('duracao'), 'estado': estado,
                      'comentarios': len(rev.get('comentarios', [])),
                      'conclusao': (100 if estado == 'aprovado' else round(100 * sum(1 for b in blocos if b.get('aprovado')) / len(blocos))) if blocos else None,
                      'saidas': len([x for x in ed.get('saidas') or [] if isinstance(x, dict) and not x.get('final')]),
                      'saidas_novas': resumo_saidas(ed), 'usos_cta': usos_cta(ed), 'tem_final': any((p / 'final').rglob('*.mp4')) if (p / 'final').is_dir() else False,
                      'carrosseis': carros.get(p.name, []), 'atualizado': ultima_edicao(p, vs)})
    return sorted(lista, key=lambda x: -x['atualizado'])


def juntar_respostas(nova: dict, atual: dict) -> dict:
    """O app grava a revisão inteira; o que o Claude respondeu no arquivo (status, resposta) nunca é apagado por ela."""
    respondidos = {c.get('id'): c for c in atual.get('comentarios', []) if c.get('resposta') or c.get('status', 'pendente') != 'pendente'}
    for c in nova.get('comentarios', []):
        r = respondidos.get(c.get('id'))
        if r and c.get('status', 'pendente') == 'pendente' and not c.get('resposta'):
            c['status'], c['resposta'] = r.get('status'), r.get('resposta')
    if atual.get('resposta_geral') and not nova.get('resposta_geral'):
        nova['resposta_geral'] = atual['resposta_geral']
    return nova


# ---------------------------------------------------------------- rotas

ROTAS: list[tuple[str, re.Pattern, callable]] = []


def rota(metodo: str, padrao: str):
    def registrar(f):
        ROTAS.append((metodo, re.compile(f'^{padrao}$'), f))
        return f
    return registrar


def calibragem():
    """O módulo da calibragem (importado na hora: ele é escrito à parte e só usa a biblioteca padrão na importação)."""
    try:
        import calibragem as c
    except ImportError as e:
        raise Erro(f'A calibragem ainda não está disponível no servidor ({e}).', 503) from e
    return c


def arquivo_json(pasta: Path, id_: str) -> Path:
    caminho = pasta / f'{id_}.json'
    if not caminho.is_file():
        raise Erro(f'Não encontrei {id_} em {pasta.relative_to(RAIZ)}', 404)
    return caminho


@rota('GET', '/api/projetos')
def _projetos(h, q):
    return projetos()


@rota('GET', '/api/lista')
def _lista(h, q):  # nomes de arquivos de uma pasta pública: ?pasta=biblioteca/presets
    alvo = (RAIZ / q.get('pasta', [''])[0]).resolve()
    if not alvo.is_dir() or not str(alvo).startswith(str(RAIZ)) or alvo.relative_to(RAIZ).parts[:1] not in [(p,) for p in PUBLICOS]:
        raise Erro('pasta inválida')
    return sorted(p.name + ('/' if p.is_dir() else '') for p in alvo.iterdir() if not p.name.startswith('.'))


@rota('PUT', r'/api/revisao/([\w-]+)/v(\d+)')
def _revisao(h, q, slug, v):  # o app grava a revisão inteira
    if not (PROJETOS / slug).is_dir():
        raise Erro('rota inválida', 404)
    destino = PROJETOS / slug / 'revisoes' / f'v{v}.json'
    antes = ler_json(destino, {}) or {}
    rev = juntar_respostas(h.corpo(), antes)
    # a data do card só anda quando algo mudou de verdade (comentário, aprovação, bloco finalizado), não ao abrir
    rev['mexido_em'] = agora_iso() if assinatura_revisao(rev) != assinatura_revisao(antes) else antes.get('mexido_em')
    if not rev['mexido_em']:
        rev.pop('mexido_em')
    gravar_json(destino, rev)
    if rev.get('aprovado') and not antes.get('aprovado'):  # o Aprovar da revisão: o mesmo que pelo card
        exportar_cta(slug) if eh_cta(slug) else pre_render_final(slug)
    return {'ok': True}


def versoes_detalhe(slug: str) -> list[dict]:
    """Cada versão (da mais nova para a mais antiga): a data do render, a duração e o estado da revisão dela."""
    p = PROJETOS / slug
    out = []
    for v in reversed(versoes(p)):
        info = ler_json(p / 'versoes' / f'v{v}' / 'info.json', {}) or {}
        rev = ler_json(p / 'revisoes' / f'v{v}.json', None)
        cs = [c for c in (rev or {}).get('comentarios', []) if (c.get('texto') or '').strip() or c.get('anexos')]
        tem = bool(cs or ((rev or {}).get('geral') or '').strip())
        estado = 'aprovada' if (rev or {}).get('aprovado') else 'em_revisao' if tem else 'sem'
        out.append({'v': v, 'criado_em': info.get('criado_em'), 'duracao': info.get('duracao'), 'estado': estado,
                    'comentarios': len(cs), 'aplicados': sum(1 for c in cs if c.get('status') == 'aplicado')})
    return out


@rota('GET', r'/api/projetos/([\w-]+)/versoes')
def _versoes(h, q, slug):
    if not (PROJETOS / slug).is_dir():
        raise Erro('Projeto não encontrado', 404)
    return versoes_detalhe(slug)


# ---- o provador de look: LUT, intensidade e vinheta do ator (montagem/look.py), testados em 3 s e aplicados num render

def _look():
    from montagem import look  # só biblioteca padrão na importação (numpy e Pillow só na máscara, que roda no render.py)
    return look


def _edicao(slug: str) -> Path:
    arq = PROJETOS / slug / 'edicao.json'
    if slug.startswith(('_', '.')) or not arq.is_file():
        raise Erro('Projeto não encontrado', 404)
    return arq


def _render_rodando(slug: str) -> bool:
    pid = ler_json(PROJETOS / slug / '.cache' / 'render.json', {}) or {}
    if not pid.get('pid'):
        return False
    try:
        os.kill(int(pid['pid']), 0)
        return True
    except (ProcessLookupError, ValueError):
        return False
    except PermissionError:
        return True


def _look_pedido(c: dict) -> dict:
    look = _look()
    lut = c.get('lut') or None
    if lut is not None and lut not in look.NOMES:
        raise Erro(f'LUT desconhecido: {lut}', 422)
    if c.get('vinheta') not in look.VINHETAS:
        raise Erro('Vinheta desconhecida', 422)
    try:
        k = round(min(max(float(c.get('intensidade', 1)), 0), 1), 2)
    except (TypeError, ValueError):
        raise Erro('Intensidade inválida', 422) from None
    nitidez = c.get('nitidez') or 'sem'
    if nitidez not in look.NITIDEZ:
        raise Erro('Nitidez desconhecida', 422)
    return {'lut': lut, 'intensidade': k, 'vinheta': c['vinheta'], 'nitidez': nitidez}


@rota('GET', r'/api/projetos/([\w-]+)/look')
def _ler_look(h, q, slug):
    look = _look()
    return {'look': look.do_projeto(ler_json(_edicao(slug), {}) or {}), 'luts': look.NOMES, 'vinhetas': list(look.VINHETAS), 'nitidezes': list(look.NITIDEZ),
            'renderizando': _render_rodando(slug)}


@rota('POST', r'/api/projetos/([\w-]+)/look/amostra')
def _amostra_look(h, q, slug):
    _edicao(slug)
    c = h.corpo()
    lk = _look_pedido(c)
    r = subprocess.run([shutil.which('uv') or 'uv', 'run', '--quiet', str(Path(__file__).parent / 'render.py'), 'amostra-look', slug,
                        f'{float(c.get("t") or 0):.2f}', lk['lut'] or '-', str(lk['intensidade']), lk['vinheta'], lk['nitidez']],
                       cwd=RAIZ, capture_output=True, text=True, timeout=180)
    if r.returncode:
        raise Erro(f'A amostra falhou: {(r.stderr or r.stdout).strip()[-300:]}', 500)
    rel = r.stdout.strip().splitlines()[-1]
    return {'video': f'/{rel}?{int((RAIZ / rel).stat().st_mtime)}'}  # o carimbo: o navegador nunca reaproveita uma amostra velha


@rota('PUT', r'/api/projetos/([\w-]+)/look')
def _aplicar_look(h, q, slug):
    """Grava o look no projeto e renderiza a próxima versão em segundo plano (a camada dos inserts vem do cache: só a
    montagem é refeita). Um render que já está rodando não é duplicado."""
    arq = _edicao(slug)
    lk = _look_pedido(h.corpo())
    if _render_rodando(slug):
        raise Erro('Já há um render deste projeto rodando: espere ele terminar.', 409)
    edicao = ler_json(arq, {})
    edicao['look'] = lk
    gravar_json(arq, edicao)
    cache = PROJETOS / slug / '.cache'
    cache.mkdir(parents=True, exist_ok=True)
    with open(cache / 'render.log', 'w') as log:
        proc = subprocess.Popen([shutil.which('uv') or 'uv', 'run', '--quiet', str(Path(__file__).parent / 'render.py'), slug],
                                cwd=RAIZ, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    threading.Thread(target=proc.wait, daemon=True).start()
    gravar_json(cache / 'render.json', {'pid': proc.pid, 'motivo': 'look'})
    return {'ok': True, 'proxima': (versoes(PROJETOS / slug) or [0])[-1] + 1}


@rota('DELETE', r'/api/projetos/([\w-]+)')
def _apagar_projeto(h, q, slug):
    """Apagar um projeto não apaga nada do disco: a pasta vai para a lixeira (biblioteca/lixeira/), de onde a página
    Lixeira restaura."""
    origem = PROJETOS / slug
    if slug.startswith('_') or not origem.is_dir():
        raise Erro('Projeto não encontrado', 404)
    vs = versoes(origem)
    nome = (ler_json(origem / 'edicao.json', {}) or {}).get('nome') or slug
    return {'ok': True, 'lixeira': para_lixeira([origem], 'projeto', slug, nome, video=f'versoes/v{vs[-1]}/proxy.mp4' if vs else None)['entrada']}


# ---- a lixeira única: o que se apaga no app (projetos, mídias do banco, referências)

@rota('GET', '/api/lixeira')
def _lixeira(h, q):
    return listar_lixeira()


@rota('POST', r'/api/lixeira/([\w.-]+)/restaurar')
def _restaurar(h, q, nome):
    try:
        meta = restaurar_da_lixeira(nome)
    except SystemExit as e:
        raise Erro(str(e), 409) from e
    if meta['tipo'] == 'referencia':
        calibragem().regenerar_exemplos()  # a referência volta para os roteiros de exemplo
    return meta


@rota('DELETE', r'/api/lixeira/([\w.-]+)')
def _apagar_de_vez(h, q, nome):
    try:
        return {'apagados': apagar_de_vez(nome)}
    except SystemExit as e:
        raise Erro(str(e), 404) from e


@rota('POST', '/api/lixeira/esvaziar')
def _esvaziar(h, q):
    return {'apagados': apagar_de_vez(tipo=h.corpo().get('tipo') or None)}


TIPOS_ANEXO = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
               'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm'}
ANEXO = r'revisoes/anexos/(c\d+|geral)-\d+\.(png|jpg|webp|gif|mp4|mov|webm)'


@rota('POST', r'/api/revisao/([\w-]+)/v(\d+)/anexo')
def _anexar(h, q, slug, v):
    """Uma imagem ou um vídeo colado, arrastado ou escolhido num comentário:
    projetos/<slug>/revisoes/anexos/<comentário>-<n>.<ext> (n: o próximo livre; a extensão, a do tipo)."""
    cid = q.get('comentario', [''])[0]
    if not (PROJETOS / slug / 'versoes' / f'v{v}').is_dir() or not re.fullmatch(r'c\d+|geral', cid):
        raise Erro('Comentário ou versão inválida', 422)
    ext = TIPOS_ANEXO.get((h.headers.get('Content-Type') or '').split(';')[0].strip())
    if not ext:
        raise Erro('Só imagens (png, jpg, webp, gif) e vídeos (mp4, mov, webm).', 422)
    resta = int(h.headers.get('Content-Length') or 0)
    if not 0 < resta <= 500 << 20:
        raise Erro('O arquivo está vazio ou passou de 500 MB.', 422)
    pasta = PROJETOS / slug / 'revisoes' / 'anexos'
    pasta.mkdir(parents=True, exist_ok=True)
    with TRAVA_ANEXO:  # reserva o nome (o arquivo vazio) antes de receber
        usados = [int(m.group(1)) for a in pasta.glob(f'{cid}-*') if (m := re.fullmatch(rf'{cid}-(\d+)\.\w+', a.name))]
        destino = pasta / f'{cid}-{max(usados, default=0) + 1}{ext}'
        destino.touch()
    try:
        with open(destino, 'wb') as f:
            while resta > 0:
                bloco = h.rfile.read(min(1 << 20, resta))
                if not bloco:
                    break
                f.write(bloco)
                resta -= len(bloco)
        if resta:
            raise Erro('O envio parou no meio.', 400)
    except BaseException:
        destino.unlink(missing_ok=True)
        raise
    return {'caminho': str(destino.relative_to(PROJETOS / slug))}


@rota('DELETE', r'/api/revisao/([\w-]+)/v(\d+)/anexo')
def _tirar_anexo(h, q, slug, v):
    caminho = q.get('caminho', [''])[0]
    if not re.fullmatch(ANEXO, caminho):
        raise Erro('Anexo inválido', 422)
    (PROJETOS / slug / caminho).unlink(missing_ok=True)
    return {'ok': True}


TRAVA_ANEXO = threading.Lock()


# ---- códigos

@rota('GET', '/api/codigos')
def _codigos(h, q):
    import codigo
    return codigo.mapa()


# ---- calibragem e referências

@rota('GET', '/api/referencias')
def _referencias(h, q):
    return calibragem().listar_referencias()


@rota('POST', '/api/referencias')
def _subir_referencia(h, q):
    """O vídeo vem cru no corpo (o nome em X-Nome): vai para um temporário com o nome original e entra na fila."""
    nome = Path(unquote(h.headers.get('X-Nome') or 'video.mp4')).name
    if Path(nome).suffix.lower() not in ('.mp4', '.mov', '.m4v', '.webm'):
        raise Erro(f'{nome}: não é um vídeo (mp4, mov, m4v ou webm).', 422)
    resta = int(h.headers.get('Content-Length') or 0)
    if not resta:
        raise Erro('Arquivo vazio.', 422)
    pasta = Path(tempfile.mkdtemp(prefix='referencia-'))
    try:
        destino = pasta / re.sub(r'[^\w. -]', '_', nome)
        with open(destino, 'wb') as f:
            while resta > 0:
                bloco = h.rfile.read(min(1 << 20, resta))
                if not bloco:
                    break
                f.write(bloco)
                resta -= len(bloco)
        if resta:
            raise Erro('O envio parou no meio.', 400)
        cat = unquote(h.headers.get('X-Categoria') or '') or CATEGORIA_PADRAO
        return {'id': calibragem().enfileirar_analise(str(destino), Path(nome).stem, cat)}
    finally:
        shutil.rmtree(pasta, ignore_errors=True)


@rota('GET', '/api/referencias/clipes')
def _clipes(h, q):
    return calibragem().clipes()


@rota('GET', f'/api/referencias/{ID}/revisao')
def _revisao_referencia(h, q, id_):
    return calibragem().revisao(id_)


@rota('PUT', f'/api/referencias/{ID}/direcao')
def _salvar_direcao(h, q, id_):
    return calibragem().salvar_edicao(id_, h.corpo().get('itens') or [])


@rota('PUT', f'/api/referencias/{ID}/oculto')
def _oculto(h, q, id_):  # o Ocultar do card: sai da grade principal (vista Ocultos) e não ensina a direção
    return calibragem().definir_oculto(id_, bool(h.corpo().get('oculto')))


@rota('PUT', f'/api/referencias/{ID}/ensina')
def _ensina(h, q, id_):  # o interruptor do card: ligado, entra nos roteiros de exemplo da direção; desligado, sai
    return calibragem().definir_ensina(id_, bool(h.corpo().get('ensina')))


@rota('PUT', f'/api/referencias/{ID}/status')
def _status(h, q, id_):
    return calibragem().marcar_revisada(id_, bool(h.corpo().get('revisado'))) or {'ok': True}


@rota('PUT', f'/api/referencias/{ID}/nome')
def _renomear(h, q, id_):
    return calibragem().renomear(id_, str(h.corpo().get('nome') or '').strip()[:120]) or {'ok': True}


@rota('PUT', f'/api/referencias/{ID}/categoria')
def _categoria_referencia(h, q, id_):
    return calibragem().definir_categoria(id_, str(h.corpo().get('categoria') or ''))


@rota('POST', r'/api/projetos/([\w-]+)/abrir-final')
def _abrir_final(h, q, slug):
    """Abre no Finder a pasta dos exports do projeto (final/: só as entregas, cada uma com o .md)."""
    alvo = PROJETOS / slug / 'final'
    if not alvo.is_dir():
        raise Erro('Este projeto ainda não tem export final.', 404)
    subprocess.run(['open', str(alvo)], check=False)
    return {'ok': True}


@rota('PUT', r'/api/projetos/([\w-]+)/nome')
def _nome_projeto(h, q, slug):
    """O nome do projeto (só o nome: a pasta e o slug ficam)."""
    nome = str(h.corpo().get('nome') or '').strip()[:120]
    if not nome:
        raise Erro('O nome não pode ficar vazio.', 422)
    arq = _edicao(slug)
    edicao = ler_json(arq, {})
    edicao['nome'] = nome
    gravar_json(arq, edicao)
    return {'nome': nome}


def eh_cta(slug: str) -> bool:
    """O projeto é um CTA (a página CTAs): a categoria dele (`formato`) tem "CTA" no nome."""
    cat = (ler_json(PROJETOS / slug / 'edicao.json', {}) or {}).get('formato')
    nomes = {c.get('id'): c.get('nome', '') for c in ler_json(BIBLIOTECA / 'categorias-video.json', []) or []}
    return 'cta' in (nomes.get(cat) or cat or '').lower()


def exportar_cta(slug: str) -> None:
    """Um CTA aprovado é exportado logo, em segundo plano (`render.py <cta> --final`): as saídas que o plugam usam esse final
    pronto (`etapas/12-final.md`). Um export dele já rodando: não começa outro. O log fica em `.cache/export-final.log`."""
    _em_segundo_plano(slug, ['--final'])


def pre_render_final(slug: str) -> None:
    """Um corpo aprovado tem a camada dos inserts e motions fotografada em 4K logo, em segundo plano (`render.py <slug>
    --camadas --final`): o export das saídas, quando o criador pedir, só monta (a foto do 4K é a maior parte dele)."""
    _em_segundo_plano(slug, ['--camadas', '--final'])


def _em_segundo_plano(slug: str, args: list[str]) -> None:
    trava = PROJETOS / slug / '.cache' / 'exportando.json'
    pid = (ler_json(trava, {}) or {}).get('pid')
    if pid:
        try:
            os.kill(pid, 0)
            return
        except OSError:
            pass
    trava.parent.mkdir(parents=True, exist_ok=True)
    log = open(PROJETOS / slug / '.cache' / 'export-final.log', 'w')
    pr = subprocess.Popen(['uv', 'run', str(RAIZ / 'ferramentas' / 'render.py'), slug, *args], cwd=RAIZ, stdout=log,
                          stderr=subprocess.STDOUT, start_new_session=True)
    gravar_json(trava, {'pid': pr.pid, 'desde': agora_iso()})


@rota('POST', r'/api/projetos/([\w-]+)/aprovar')
def _aprovar_projeto(h, q, slug):
    """Aprovar pelo card do projeto: a revisão da última versão ganha `aprovado` (o resto dela fica como está), como o
    Aprovar da página de revisão, e todas as saídas ficam aprovadas. O app copia o "Aprovado · <slug> · vN" para o chat."""
    vs = versoes(PROJETOS / slug)
    if not vs:
        raise Erro('Projeto sem versão', 404)
    arq = PROJETOS / slug / 'revisoes' / f'v{vs[-1]}.json'
    rev = ler_json(arq, None) or {'projeto': slug, 'versao': vs[-1], 'comentarios': []}
    rev['aprovado'] = True
    rev['mexido_em'] = agora_iso()
    gravar_json(arq, rev)
    aprovar_saidas(slug, True)
    exportar_cta(slug) if eh_cta(slug) else pre_render_final(slug)
    return {'versao': vs[-1]}


# ---- as saídas (corpo + final: edicao.json → saidas; cortes.py as monta)

def usos_cta(ed: dict) -> list[list]:
    """Os CTAs que este projeto usa nas saídas (as de agora e as antigas, do encaixe), com quando: [[slug, em], …]. O
    + Saída do app ordena os CTAs pelos mais usados (ontem e hoje, depois no total)."""
    out = []
    for x in ed.get('saidas') or []:
        if isinstance(x, dict) and (cta := x.get('cta') or (x.get('final') or {}).get('cta')):
            out.append([cta, x.get('criada_em') or x.get('criado_em')])
    return out


def resumo_saidas(ed: dict) -> list[dict]:
    """As saídas para o app: id, destino, o tipo do final (e o CTA), aprovada e exportada."""
    return [{'id': x['id'], 'destino': x['destino'], 'tipo': x['final'].get('tipo'), 'cta': x['final'].get('cta'),
             'aprovado': bool(x.get('aprovado')), 'exportado': (x.get('exportado') or {}).get('em')}
            for x in ed.get('saidas') or [] if isinstance(x, dict) and x.get('final')]


def aprovar_saidas(slug: str, valor: bool, sid: str | None = None) -> None:
    arq = _edicao(slug)
    ed = ler_json(arq, {})
    for x in ed.get('saidas') or []:
        if isinstance(x, dict) and x.get('final') and (sid is None or x.get('id') == sid):
            x['aprovado'] = valor
    gravar_json(arq, ed)


@rota('POST', r'/api/projetos/([\w-]+)/saidas-aprovadas')
def _aprovar_todas_saidas(h, q, slug):
    """O Aprovar (ou desaprovar) do projeto inteiro, pela revisão: todas as saídas juntas."""
    aprovar_saidas(slug, bool(h.corpo().get('aprovado')))
    return {'saidas': resumo_saidas(ler_json(_edicao(slug), {}))}


@rota('PUT', r'/api/projetos/([\w-]+)/saidas/([\w-]+)')
def _aprovar_saida(h, q, slug, sid):
    """Aprovar uma saída (dentro do projeto): o Claude exporta só ela."""
    aprovar_saidas(slug, bool(h.corpo().get('aprovado')), sid)
    return {'saidas': resumo_saidas(ler_json(_edicao(slug), {}))}


@rota('POST', r'/api/projetos/([\w-]+)/saidas')
def _nova_saida(h, q, slug):
    """+ Saída pelo app: um CTA gravado à parte ({destino, cta}) ou o corpo puro ({destino, nenhum: true}). Os finais
    falados (palavras do bruto) entram pelo Claude (cortes.py saida … --falado)."""
    import cortes
    c = h.corpo()
    destino = str(c.get('destino') or '').strip()[:60]
    if not destino:
        raise Erro('Dê um nome para a saída (o destino: LP, VSL, Isca…).', 422)
    if c.get('cta'):
        if not (PROJETOS / c['cta'] / 'edicao.json').is_file():
            raise Erro('Esse CTA não existe.', 404)
        final = {'tipo': 'cta', 'cta': c['cta']}
    else:
        final = {'tipo': 'nenhum'}
    arq = _edicao(slug)
    ed = ler_json(arq, {})
    try:
        x = cortes.por_saida(ed, destino, final)
    except SystemExit as e:
        raise Erro(str(e), 422)
    gravar_json(arq, ed)
    reabrir(slug)
    if final['tipo'] == 'cta':  # a prévia dela na versão mais nova, em segundo plano (o app a abre quando fica pronta)
        cache = PROJETOS / slug / '.cache'
        cache.mkdir(parents=True, exist_ok=True)
        with open(cache / f'previa-{x["id"]}.log', 'w') as log:
            proc = subprocess.Popen([shutil.which('uv') or 'uv', 'run', '--quiet', str(Path(__file__).parent / 'render.py'), slug, '--previa-saida', x['id']],
                                    cwd=RAIZ, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        threading.Thread(target=proc.wait, daemon=True).start()
    return {'saidas': resumo_saidas(ed)}


@rota('DELETE', r'/api/projetos/([\w-]+)/saidas/([\w-]+)')
def _tirar_saida(h, q, slug, sid):
    arq = _edicao(slug)
    ed = ler_json(arq, {})
    ed['saidas'] = [x for x in ed.get('saidas') or [] if not (isinstance(x, dict) and x.get('final') and x.get('id') == sid)]
    gravar_json(arq, ed)
    return {'saidas': resumo_saidas(ed)}


def reabrir(slug: str) -> None:
    """Uma saída nova é edição: a data do card anda e, se o projeto estava aprovado, ele volta para Em edição (a saída
    nova ainda não foi vista). As saídas já aprovadas continuam aprovadas."""
    vs = versoes(PROJETOS / slug)
    if not vs:
        return
    arq = PROJETOS / slug / 'revisoes' / f'v{vs[-1]}.json'
    rev = ler_json(arq, None) or {'projeto': slug, 'versao': vs[-1], 'aprovado': False, 'enviado_em': None, 'comentarios': []}
    rev['aprovado'] = False
    rev['mexido_em'] = agora_iso()
    gravar_json(arq, rev)


@rota('POST', r'/api/projetos/([\w-]+)/desaprovar')
def _desaprovar_projeto(h, q, slug):
    """Desfazer a aprovação: a revisão aprovada mais nova perde o `aprovado` e o projeto volta para Em edição. O final já
    exportado (final/) fica onde está."""
    for v in reversed(versoes(PROJETOS / slug)):
        arq = PROJETOS / slug / 'revisoes' / f'v{v}.json'
        rev = ler_json(arq, None)
        if rev and rev.get('aprovado'):
            rev['aprovado'] = False
            rev['mexido_em'] = agora_iso()
            gravar_json(arq, rev)
            aprovar_saidas(slug, False)
            return {'versao': v}
    raise Erro('Este projeto não está aprovado.', 422)


@rota('PUT', r'/api/projetos/([\w-]+)/oculto')
def _ocultar_projeto(h, q, slug):
    """Ocultar: o projeto sai da lista de Projetos (ou de CTAs) e vai para a vista Ocultos; nada mais muda."""
    oculto = bool(h.corpo().get('oculto'))
    arq = _edicao(slug)
    edicao = ler_json(arq, {})
    if oculto:
        edicao['oculto'] = True
    else:
        edicao.pop('oculto', None)
    gravar_json(arq, edicao)
    return {'oculto': oculto}


@rota('PUT', r'/api/projetos/([\w-]+)/tags')
def _tags_projeto(h, q, slug):
    tags = tags_limpas(h.corpo().get('tags'))
    arq = _edicao(slug)
    edicao = ler_json(arq, {})
    if tags:
        edicao['tags'] = tags
    else:
        edicao.pop('tags', None)
    gravar_json(arq, edicao)
    return {'tags': tags}


@rota('PUT', r'/api/projetos/([\w-]+)/categoria')
def _categoria_projeto(h, q, slug):
    calibragem().categoria_projeto(slug, str(h.corpo().get('categoria') or ''))
    return {'ok': True}


@rota('GET', '/api/categorias')
def _categorias(h, q):
    return {'categorias': calibragem().categorias()}


@rota('PUT', '/api/categorias')
def _salvar_categorias(h, q):
    return {'categorias': calibragem().salvar_categorias(h.corpo().get('categorias') or [])}


@rota('PUT', f'/api/referencias/{ID}/favorito')
def _favoritar(h, q, id_):
    c = h.corpo()
    return calibragem().favoritar(id_, float(c['inicio']), float(c['fim']), bool(c.get('favorito'))) or {'ok': True}


@rota('POST', f'/api/referencias/{ID}/reanalisar')
def _reanalisar(h, q, id_):
    return calibragem().reanalisar(id_) or {'ok': True}


@rota('POST', f'/api/referencias/{ID}/tentar')
def _tentar(h, q, id_):
    return calibragem().tentar_de_novo(id_) or {'ok': True}


@rota('DELETE', f'/api/referencias/{ID}')
def _apagar_referencia(h, q, id_):
    return calibragem().apagar(id_) or {'ok': True}


# ---- heurística: as regras (Markdown) e os roteiros de exemplo

def _categoria(q) -> str:
    """A categoria pedida (?categoria=…), entre as cadastradas; sem ela, Reels."""
    cat = q.get('categoria', [CATEGORIA_PADRAO])[0] or CATEGORIA_PADRAO
    if cat not in {c['id'] for c in calibragem().categorias()}:
        raise Erro(f'Categoria desconhecida: {cat}', 422)
    return cat


def roteiros(cat: str = CATEGORIA_PADRAO) -> list[dict]:
    """Os roteiros de exemplo da categoria (exemplos/<categoria>/roteiros/<ref>.md), linha a linha: a marcação entre [ ],
    a ref do corte (`ref: REF-12·p4`) e a fala. A linha k é o plano k da direção da referência (os roteiros são escritos dela, um bloco por plano): daí vêm
    o tipo e os tempos."""
    out = []
    for md in sorted((EXEMPLOS / cat / 'roteiros').glob('*.md')):
        base = REFERENCIAS / md.stem
        info = ler_json(base / 'referencia.json', {}) or {}
        itens = (ler_json(base / 'direcao.json', {}) or {}).get('itens') or []
        planos = sorted((i for i in itens if i.get('camada') == 'plano'), key=lambda i: i['inicio'])
        titulo, linhas = md.stem, []
        for s in md.read_text(encoding='utf-8').splitlines():
            s = s.strip()
            if s.startswith('# '):
                titulo = s[2:].strip()
            elif s.startswith('[') and s.endswith(']'):
                linhas.append({'marcacao': s[1:-1], 'fala': ''})
            elif s.startswith('ref:') and linhas:
                linhas[-1]['ref'] = s[4:].strip()
            elif s and linhas:
                linhas[-1]['fala'] = (linhas[-1]['fala'] + ' ' + s.strip('“”"')).strip()
        if len(planos) == len(linhas):
            for linha, p in zip(linhas, planos):
                linha |= {'tipo': p.get('tipo'), 'inicio': p['inicio'], 'fim': p['fim']}
        out.append({'ref': md.stem, 'nome': info.get('nome') or titulo, 'revisado': info.get('status') == 'revisado',
                    'proxy': (base / 'proxy.mp4').is_file(), 'linhas': linhas})
    return out


@rota('GET', '/api/heuristica')
def _heuristica(h, q):
    cat = _categoria(q)
    arq = calibragem().semear_regras(cat)  # sem regras ainda: começa com uma cópia das do Reels
    return {'categoria': cat, 'regras': arq.read_text(encoding='utf-8') if arq.is_file() else '', 'roteiros': roteiros(cat)}


@rota('PUT', '/api/heuristica')
def _salvar_heuristica(h, q):
    regras = h.corpo().get('regras')
    if not isinstance(regras, str) or not regras.strip():
        raise Erro('As regras não podem ficar vazias.', 422)
    if len(regras) > 20000:
        raise Erro('As regras passaram de 20.000 caracteres.', 422)
    arq = EXEMPLOS / _categoria(q) / 'regras.md'
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(regras.rstrip() + '\n', encoding='utf-8')
    return {'ok': True}


# ---- aprendizados: um .md por área (etapas/14-concluir.md), o geral e o de cada categoria

def do_criador(texto: str) -> int:
    """Os bullets da seção "## Do criador" de um arquivo de aprendizados geral."""
    secao = re.search(r'^## Do criador\s*$(.*?)(?=^## |\Z)', texto, re.M | re.S)
    return len(re.findall(r'^[-*]\s', secao.group(1), re.M)) if secao else 0


def arquivo_aprendizado(area: str, cat: str | None = None) -> Path:
    """O arquivo geral da área (`aprendizados/<área>.md`) ou o da categoria (`exemplos/<cat>/aprendizados/<área>.md`)."""
    if area not in AREAS:
        raise Erro(f'Área desconhecida: {area}', 404)
    return (EXEMPLOS / cat / 'aprendizados' if cat else APRENDIZADOS) / f'{area}.md'


def aprendizados_das_categorias(area: str) -> dict[str, str]:
    """Os gostos da área em cada categoria que tem o arquivo: {categoria: texto}."""
    out = {}
    for c in calibragem().categorias():
        arq = arquivo_aprendizado(area, c['id'])
        if arq.is_file():
            out[c['id']] = arq.read_text(encoding='utf-8')
    return out


def imagem_aprendizado(nome: str) -> Path | None:
    """Uma imagem de aprendizados/imagens/ (só o nome, sem subpastas)."""
    arq = APRENDIZADOS / 'imagens' / nome
    return arq if IMAGEM.match(nome) and arq.is_file() else None


def _conta_criador(area: str) -> int:
    arq = arquivo_aprendizado(area)
    geral = do_criador(arq.read_text(encoding='utf-8')) if arq.is_file() else 0
    return geral + sum(len(re.findall(r'^[-*]\s', t, re.M)) for t in aprendizados_das_categorias(area).values())


@rota('GET', '/api/aprendizados')
def _aprendizados(h, q):
    return [{'area': area, 'nome': nome, 'criador': _conta_criador(area)} for area, nome in AREAS.items()]


@rota('GET', r'/api/aprendizados/([a-z]+)')
def _aprendizado(h, q, area):
    arq = arquivo_aprendizado(area)
    return {'area': area, 'nome': AREAS[area], 'texto': arq.read_text(encoding='utf-8') if arq.is_file() else '',
            'categorias': aprendizados_das_categorias(area)}


@rota('PUT', r'/api/aprendizados/([a-z]+)')
def _salvar_aprendizado(h, q, area):
    """Grava o arquivo geral da área ou, com ?categoria=…, o daquela categoria."""
    arq = arquivo_aprendizado(area, _categoria(q) if q.get('categoria', [''])[0] else None)
    texto = h.corpo().get('texto')
    if not isinstance(texto, str) or not texto.strip():
        raise Erro('O arquivo não pode ficar vazio.', 422)
    if len(texto) > 20000:
        raise Erro('O arquivo passou de 20.000 caracteres.', 422)
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(texto.rstrip() + '\n', encoding='utf-8')
    return {'ok': True, 'criador': _conta_criador(area)}


# ---- presets, transições, banco e motions

def gravar_ordem(arq: Path, chave: str, ids, favoritos, campo: str, maximo: int) -> dict:
    """A ordem de uma situação (presets) ou de um par (transições), no formato do 18: {ids, favoritos|favoritas}."""
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
        raise Erro('ids deve ser uma lista de ids', 422)
    ordem = ler_json(arq, {}) or {}
    if ids:
        ordem[chave] = {'ids': ids, campo: max(0, min(int(favoritos or 0), maximo, len(ids)))}
    else:
        ordem.pop(chave, None)  # "Limpar a ordem": volta a uma lista só
    gravar_json(arq, ordem)
    return ordem


@rota('PUT', '/api/presets/ordem')
def _ordem_presets(h, q):
    c = h.corpo()
    if not CHAVE_PRESET.match(str(c.get('chave'))):
        raise Erro(f'Situação inválida: {c.get("chave")}', 422)
    return gravar_ordem(BIBLIOTECA / 'presets' / 'ordem.json', c['chave'], c.get('ids'), c.get('favoritos'), 'favoritos', 3)


@rota('PUT', '/api/transicoes/ordem')
def _ordem_transicoes(h, q):
    c = h.corpo()
    if not CHAVE_TRANSICAO.match(str(c.get('chave'))):
        raise Erro(f'Par inválido: {c.get("chave")}', 422)
    return gravar_ordem(BIBLIOTECA / 'transicoes' / 'ordem.json', c['chave'], c.get('ids'), c.get('favoritas'), 'favoritas', 2)


def aprovar_json(pasta: Path, id_: str, aprovado) -> dict:
    arq = arquivo_json(pasta, id_)
    dados = ler_json(arq)
    dados['aprovado'] = bool(aprovado)
    gravar_json(arq, dados)
    return dados


LUZ: dict[tuple[str, float], int | None] = {}


def luz(img: Path) -> int | None:
    """O brilho médio (0–255) de uma miniatura do banco: a simulação dos presets evita as quase pretas (um site escuro
    parado parece um card vazio) e as quase brancas. Medido uma vez por arquivo (o ffmpeg reduz a imagem a 1 pixel cinza)."""
    if not img.is_file():
        return None
    chave = (str(img), img.stat().st_mtime)
    if chave not in LUZ:
        r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(img), '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True)
        LUZ[chave] = r.stdout[0] if r.returncode == 0 and r.stdout else None
    return LUZ[chave]


def amostras_simulacao() -> dict:
    """O que a simulação dos presets (render/preset.html) usa de verdade: o ator — o proxy do bruto do projeto mais
    recente que tem um (de preferência com a pessoa recortada), com o trecho de 8 s em que o rosto aparece melhor (`t0`), o rosto típico nele, já no recorte
    9:16 (como `ator.rostoDoArquivo`), e a pessoa recortada se houver — e os vídeos do banco (os originais) com a
    proporção de cada um."""
    ator = None
    candidatos = []
    for p in PROJETOS.iterdir() if PROJETOS.is_dir() else []:
        ed = ler_json(p / 'edicao.json', {}) or {}
        bruto = next((f for f in ed.get('fontes', []) if f.get('papel') == 'bruto'), None)
        proxy = bruto and p / 'midia' / 'proxy' / f'{bruto["id"]}.mp4'
        if proxy and proxy.is_file():
            recortado = (p / 'midia' / 'recorte' / f'{bruto["id"]}_pessoa.webm').is_file()
            candidatos.append(((recortado, proxy.stat().st_mtime), p, bruto, ed))
    if candidatos:
        # o mais recente já com a pessoa recortada (no "ator embaixo" a cabeça sai da janela, como na exportação com a
        # máscara); sem nenhum, o mais recente
        _, p, bruto, ed = max(candidatos, key=lambda c: c[0])
        proxy = p / 'midia' / 'proxy' / f'{bruto["id"]}.mp4'
        rosto = ler_json(p / 'midia' / 'rosto' / f'{bruto["id"]}.json', {}) or {}
        am = rosto.get('amostras') or []
        janela = int(8 * (rosto.get('por_segundo') or 6))
        # o trecho de 8 s (a partir de 1 s) com mais amostras confiáveis
        t0, melhor = 1.0, -1
        for i in range(0, max(len(am) - janela, 0), max(janela // 4, 1)):
            boas = sum(1 for a in am[i:i + janela] if a.get('conf', 0) > 0.5)
            if am[i]['t'] >= 1 and boas > melhor:
                t0, melhor = am[i]['t'], boas
        trecho = [a for a in am if t0 <= a['t'] < t0 + 8 and a.get('conf', 0) > 0] or am
        med = lambda k: sorted(a[k] for a in trecho)[len(trecho) // 2]  # noqa: E731
        r = {k: med(k) for k in ('cx', 'cy', 'w', 'h')} if trecho else None
        L, A = rosto.get('largura') or bruto.get('largura') or 0, rosto.get('altura') or bruto.get('altura') or 0
        x = (ed.get('enquadramento') or {}).get('x', 0.5)
        rw = A * 9 / 16 / L if L > A > 0 else 1  # bruto deitado: o rosto vai para o recorte 9:16 em `x`
        if r and rw < 1:
            r = {**r, 'cx': (r['cx'] - (1 - rw) * x) / rw, 'w': r['w'] / rw}
        pessoa = p / 'midia' / 'recorte' / f'{bruto["id"]}_pessoa.webm'  # o recorte da pessoa: a cabeça sai da janela
        ator = {'projeto': p.name, 'video': f'/projetos/{p.name}/midia/proxy/{bruto["id"]}.mp4', 't0': t0, 'rosto': r, 'deitado': rw < 1, 'x': x,
                'poster': '/api/presets/ator.jpg', 'arquivo': str(proxy),
                'pessoa': f'/projetos/{p.name}/midia/recorte/{pessoa.name}' if pessoa.is_file() else None}
    midias = []
    for d in sorted((BIBLIOTECA / 'banco').iterdir()) if (BIBLIOTECA / 'banco').is_dir() else []:
        i = ler_json(d / 'item.json', {}) or {}
        # (fora as capturas que pegaram a tela de espera do Cloudflare: "Um momento…", toda branca)
        if i.get('tipo') != 'video' or i.get('pai') or not i.get('largura') or not i.get('altura') or re.match(r'(um momento|just a moment)', i.get('nome') or '', re.I):
            continue
        video = i.get('proxy') or i.get('arquivo')
        if video and (d / video).is_file():
            midias.append({'id': d.name, 'video': f'/biblioteca/banco/{d.name}/{video}', 'imagem': f'/biblioteca/banco/{d.name}/miniatura.jpg',
                           'aspecto': round(i['largura'] / i['altura'], 4), 'duracao': i.get('duracao') or 0, 'luz': luz(d / 'miniatura.jpg')})
    return {'ator': ator, 'midias': midias}


@rota('GET', '/api/presets/amostras')
def _amostras(h, q):
    a = amostras_simulacao()
    if a['ator']:
        a['ator'].pop('arquivo')
    return a


def poster_do_ator() -> Path | None:
    """Um quadro do ator da simulação (1 s depois de `t0`), para a miniatura parada não precisar abrir o vídeo (a página
    Presets tem uma simulação por card). Feito uma vez por proxy, numa pasta temporária."""
    ator = amostras_simulacao()['ator']
    if not ator:
        return None
    proxy = Path(ator['arquivo'])
    chave = hashlib.md5(f'{proxy}|{proxy.stat().st_mtime}|{ator["t0"]}'.encode()).hexdigest()[:12]
    destino = Path(tempfile.gettempdir()) / f'editor19-ator-{chave}.jpg'
    with TRAVA_POSTER:  # os cards pedem todos juntos
        if not destino.is_file():
            from base import ffmpeg
            ffmpeg('-ss', f'{ator["t0"] + 1:.3f}', '-i', str(proxy), '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', str(destino))
    return destino


TRAVA_POSTER = threading.Lock()


@rota('PUT', f'/api/presets/{ID}')
def _aprovar_preset(h, q, id_):
    return aprovar_json(BIBLIOTECA / 'presets', id_, h.corpo().get('aprovado'))


@rota('PUT', f'/api/transicoes/{ID}')
def _aprovar_transicao(h, q, id_):
    return aprovar_json(BIBLIOTECA / 'transicoes', id_, h.corpo().get('aprovado'))


def _banco():
    import banco
    return banco


def ler_midia(b, id_: str) -> dict:
    try:
        return b.ler_item(id_)
    except SystemExit as e:
        raise Erro(str(e), 404) from e


@rota('GET', r'/api/banco/(\w+)')
def _midia(h, q, id_):
    b = _banco()
    item, usos = ler_midia(b, id_), b.usos()
    trechos = sorted((t for t in b.todos() if t.get('pai') == id_), key=lambda t: t.get('inicio', 0))
    return {'item': item, 'usos': usos.get(id_, []), 'trechos': [{**t, 'usos': usos.get(t['id'], [])} for t in trechos]}


@rota('GET', '/api/banco')
def _banco_todos(h, q):
    """Todas as mídias do banco (o item.json de cada uma) numa resposta só: a página do Banco lia um item.json por mídia."""
    return _banco().todos()


@rota('POST', '/api/banco')
def _subir_midia(h, q):
    """O criador sobe uma mídia pelo app: o arquivo cru no corpo (o nome em X-Nome). Nasce Aprovada (`do_criador`) e o
    Gemini a descreve em segundo plano."""
    b = _banco()
    nome = Path(unquote(h.headers.get('X-Nome') or 'midia.mp4')).name
    if Path(nome).suffix.lower() not in b.EXT_VIDEO + b.EXT_IMAGEM:
        raise Erro(f'{nome}: use MP4, MOV, WebM, PNG, JPG ou WebP.', 422)
    resta = int(h.headers.get('Content-Length') or 0)
    if not resta:
        raise Erro('Arquivo vazio.', 422)
    pasta = Path(tempfile.mkdtemp(prefix='banco-'))
    try:
        destino = pasta / re.sub(r'[^\w. -]', '_', nome)
        with open(destino, 'wb') as f:
            while resta > 0:
                bloco = h.rfile.read(min(1 << 20, resta))
                if not bloco:
                    break
                f.write(bloco)
                resta -= len(bloco)
        if resta:
            raise Erro('O envio parou no meio.', 400)
        try:
            item = b.adicionar(destino, nome=Path(nome).stem, fonte='upload', mover=True)
        except SystemExit as e:
            raise Erro(str(e), 422) from e
        item['do_criador'] = True
        b.salvar_item(item)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
    descrever_depois(b, item['id'])
    return {'item': item}


def descrever_depois(b, id_: str) -> None:
    """O Gemini descreve a mídia nova em segundo plano."""
    def descrever():
        try:
            b.descrever(id_)
        except (Exception, SystemExit) as e:  # sem a descrição, a mídia fica como subiu
            print(f'descrever {id_}: {e}', file=sys.stderr)
    threading.Thread(target=descrever, daemon=True).start()


@rota('POST', r'/api/banco/(\w+)/recorte')
def _recortar(h, q, id_):
    """Recorta o quadro de um original ({x, y, w, h} em px dele) e, num vídeo, o tempo ({inicio, fim} em s) num item
    novo, feito pelo criador no app (nasce Aprovado)."""
    b, c = _banco(), h.corpo()
    ler_midia(b, id_)
    try:
        tempo = {k: float(c[k]) for k in ('inicio', 'fim') if c.get(k) is not None}
        item = b.recortar(id_, *(float(c[k]) for k in ('x', 'y', 'w', 'h')), **tempo)
    except (KeyError, TypeError, ValueError) as e:
        raise Erro('Mande x, y, w e h (px do original).', 422) from e
    except SystemExit as e:
        raise Erro(str(e), 422) from e
    item['do_criador'] = True
    b.salvar_item(item)
    descrever_depois(b, item['id'])
    return {'item': item}


@rota('POST', r'/api/banco/(\w+)/trechos')
def _criar_trecho(h, q, id_):
    b, c = _banco(), h.corpo()
    ler_midia(b, id_)
    try:
        return {'item': b.criar_trecho(id_, c.get('inicio', 0), c.get('fim', 0), c.get('nome'))}
    except SystemExit as e:
        raise Erro(str(e), 422) from e


@rota('GET', r'/api/banco/(\w+)/tira')
def _tira(h, q, id_):
    b = _banco()
    ler_midia(b, id_)
    b.tira(id_)
    return {'url': f'/biblioteca/banco/{id_}/tira.jpg'}


@rota('GET', '/api/estados')
def _estados(h, q):
    """Os selos do banco (usado · aprovado · recusado, com os usos nos vídeos aprovados), os usos aprovados dos motions e
    os projetos aprovados (o selo de um motion: `estado_motion`, igual no app)."""
    b = _banco()
    _, motions, aprovados = b.usos_aprovados()
    return {'midias': b.estados(), 'motions': motions, 'aprovados': sorted(aprovados)}


MOTION_TAGS = BIBLIOTECA / 'motions' / '_tags.json'  # {preset: [tags]}


@rota('PUT', r'/api/motions/([\w-]+)/tags')
def _tags_motion(h, q, id_):
    tags = tags_limpas(h.corpo().get('tags'))
    mapa = ler_json(MOTION_TAGS, {}) or {}
    if tags:
        mapa[id_] = tags
    else:
        mapa.pop(id_, None)
    gravar_json(MOTION_TAGS, mapa)
    return {'tags': tags}


@rota('PUT', f'/api/referencias/{ID}/tags')
def _tags_referencia(h, q, id_):
    c = h.corpo()
    return calibragem().marcar_tags(id_, float(c['inicio']), float(c['fim']), c.get('tags') or [])


@rota('POST', r'/api/tags/(banco|motions|referencias|projetos)')
def _renomear_tag(h, q, onde):
    """Renomeia (ou, com `para` vazio, tira) uma tag, com as de dentro dela, em tudo do Banco, dos Motions, das
    Referências ou dos Projetos."""
    c = h.corpo()
    de, para = tag_limpa(c.get('de')), tag_limpa(c.get('para'))
    if not de:
        raise Erro('Qual tag?', 422)
    if onde == 'banco':
        return {'mudaram': _banco().renomear_tag(de, para)}
    if onde == 'referencias':
        return {'mudaram': calibragem().renomear_tag(de, para)}
    if onde == 'projetos':
        n = 0
        for p in projetos():
            arq = _edicao(p['slug'])
            edicao = ler_json(arq, {})
            novas = renomear_tags(edicao.get('tags'), de, para)
            if novas != (edicao.get('tags') or []):
                if novas:
                    edicao['tags'] = novas
                else:
                    edicao.pop('tags')
                gravar_json(arq, edicao)
                n += 1
        return {'mudaram': n}
    mapa, n = ler_json(MOTION_TAGS, {}) or {}, 0
    for k, tags in list(mapa.items()):
        novas = renomear_tags(tags, de, para)
        if novas != tags:
            n += 1
            if novas:
                mapa[k] = novas
            else:
                mapa.pop(k)
    gravar_json(MOTION_TAGS, mapa)
    return {'mudaram': n}


@rota('POST', '/api/limpar-recusados')
def _limpar_recusados(h, q):
    return {'levados': _banco().limpar_recusados()}


@rota('PUT', r'/api/banco/(\w+)')
def _editar_midia(h, q, id_):
    b = _banco()
    ler_midia(b, id_)
    c, item = h.corpo(), ler_json(b.pasta_item(id_) / 'item.json')
    if 'nome' in c:
        if not str(c['nome']).strip():
            raise Erro('O nome não pode ficar vazio.', 422)
        item['nome'] = str(c['nome']).strip()[:200]
    if 'descricao' in c and not item.get('pai'):
        item['descricao'] = str(c['descricao'] or '').strip()
    if 'palavras' in c and not item.get('pai'):
        item['palavras'] = [str(p).strip() for p in c['palavras'] or [] if str(p).strip()][:30]
    if 'tags' in c:  # como no Obsidian: sem o #, sem espaços, níveis com / ("fia/ad-vsl")
        item['tags'] = tags_limpas(c['tags'])
    if item.get('pai') and ('inicio' in c or 'fim' in c):  # o intervalo de um trecho
        try:
            t = b.editar_trecho(id_, c.get('inicio', item['inicio']), c.get('fim', item['fim']))
        except SystemExit as e:
            raise Erro(str(e), 422) from e
        item['inicio'], item['fim'] = t['inicio'], t['fim']  # o nome e o selo, se vieram, ficam no `item`
    if 'estado' in c:  # o selo à mão: aprovado, recusado ou None (volta ao automático)
        if c['estado'] in ('aprovado', 'recusado'):
            item['estado'] = c['estado']
        else:
            item.pop('estado', None)
    b.salvar_item(item)
    return {'item': b.ler_item(id_)}


@rota('DELETE', r'/api/banco/(\w+)')
def _apagar_midia(h, q, id_):
    b = _banco()
    ler_midia(b, id_)
    try:
        return {'apagados': b.apagar(id_)}
    except SystemExit as e:  # está em uso num projeto
        raise Erro(str(e), 409) from e


@rota('PUT', r'/api/motions/([\w-]+)/aprovar')
def _aprovar_motion(h, q, id_):
    """Tira o "a_revisar" do JSON do topo do preset (só aquele JSON é reescrito; o resto do arquivo fica igual)."""
    arq = BIBLIOTECA / 'motions' / 'presets' / f'{id_}.html'
    if not arq.is_file():
        raise Erro(f'Motion não encontrado: {id_}', 404)
    html = arq.read_text(encoding='utf-8')
    m = JSON_DO_MOTION.search(html)
    if not m:
        raise Erro(f'{arq.name} não tem o JSON do preset no topo.', 422)
    dados = json.loads(m.group(2))
    dados.pop('a_revisar', None)
    arq.write_text(html[:m.start(2)] + json.dumps(dados, ensure_ascii=False) + html[m.end(2):], encoding='utf-8')
    return dados


# ---- recusar (os presets e motions que o Claude sugeriu; ou descartar um aprovado)

def usos_preset(id_: str) -> dict[str, list[str]]:
    """{projeto: [planos]} dos inserts que usam o preset."""
    out = {}
    for arq in sorted(PROJETOS.glob('*/edicao.json')):
        planos = [x.get('plano') for x in ((ler_json(arq, {}) or {}).get('inserts') or {}).get('pedidos') or []
                  if (x.get('enriquecimento') or {}).get('preset') == id_]
        if planos:
            out[arq.parent.name] = planos
    return out


def editar_json_motion(id_: str, mudar) -> dict:
    """Reescreve só o JSON do topo de um preset de motion (`mudar(dados)`); o resto do arquivo fica igual."""
    arq = BIBLIOTECA / 'motions' / 'presets' / f'{id_}.html'
    if not arq.is_file():
        raise Erro(f'Motion não encontrado: {id_}', 404)
    html = arq.read_text(encoding='utf-8')
    m = JSON_DO_MOTION.search(html)
    if not m:
        raise Erro(f'{arq.name} não tem o JSON do preset no topo.', 422)
    dados = json.loads(m.group(2))
    mudar(dados)
    arq.write_text(html[:m.start(2)] + json.dumps(dados, ensure_ascii=False) + html[m.end(2):], encoding='utf-8')
    return dados


def estado_motion(dados: dict, usos: list, aprovados: set[str]) -> str:
    """O selo de um motion, como o das mídias do banco: `usado` (entrou num vídeo aprovado), o selo à mão (`estado`:
    aprovado ou recusado), `recusado` (escrito para um projeto já aprovado, `projeto`, e que ficou de fora), `sem` (a
    revisar, de um projeto em edição) ou `aprovado` (sem a marca "a revisar"). O app calcula igual (biblioteca.js)."""
    if usos:
        return 'usado'
    if dados.get('estado') in ('aprovado', 'recusado'):
        return dados['estado']
    if dados.get('a_revisar'):
        return 'recusado' if dados.get('projeto') in aprovados else 'sem'
    return 'aprovado'


def usos_motion(id_: str) -> dict[str, list[str]]:
    out = {}
    for arq in sorted(PROJETOS.glob('*/edicao.json')):
        planos = [k for k, m in ((ler_json(arq, {}) or {}).get('motions') or {}).items() if m.get('preset') == id_]
        if planos:
            out[arq.parent.name] = planos
    return out


def agora_iso() -> str:
    from datetime import datetime
    return datetime.now().isoformat(timespec='seconds')


@rota('GET', f'/api/presets/{ID}/usos')
def _usos_preset(h, q, id_):
    arquivo_json(BIBLIOTECA / 'presets', id_)
    return usos_preset(id_)


@rota('POST', f'/api/presets/{ID}/recusar')
def _recusar_preset(h, q, id_):
    """Move o preset para presets/_recusados/<id>.json (com recusado_em e o motivo, que o Claude lê antes de sugerir
    outro), tira-o de todas as situações do ordem.json e devolve os inserts que o usavam ao 1º favorito da situação."""
    import contextlib
    import io
    pasta = BIBLIOTECA / 'presets'
    arq = arquivo_json(pasta, id_)
    if id_ == 'ordem':
        raise Erro('ordem.json não é um preset', 422)
    motivo = str(h.corpo().get('motivo') or '').strip()[:1000]
    dados = ler_json(arq) | {'recusado_em': agora_iso(), **({'motivo': motivo} if motivo else {})}
    gravar_json(pasta / '_recusados' / f'{id_}.json', dados)
    arq.unlink()
    ordem = ler_json(pasta / 'ordem.json', {}) or {}
    for chave, o in list(ordem.items()):
        ids = o.get('ids') or []
        if id_ in ids:
            k = ids.index(id_)
            o['ids'] = [x for x in ids if x != id_]
            if k < o.get('favoritos', 0):
                o['favoritos'] -= 1
            if not o['ids']:
                ordem.pop(chave)
    gravar_json(pasta / 'ordem.json', ordem)
    usos = usos_preset(id_)
    trocas = {}
    if usos:
        import presets as P
        from base import gravar, ler
        for slug in usos:
            ed = ler(slug)
            for x in (ed.get('inserts') or {}).get('pedidos') or []:
                if (x.get('enriquecimento') or {}).get('preset') == id_:
                    x['enriquecimento'].pop('preset')
            gravar(slug, ed)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                P.escolher(slug)
            trocas[slug] = [l for l in saida.getvalue().splitlines() if '—' in l or 'nenhum preset' in l]
    return {'ok': True, 'usos': usos, 'trocas': trocas}


@rota('GET', r'/api/motions/([\w-]+)/usos')
def _usos_motion(h, q, id_):
    if not (BIBLIOTECA / 'motions' / 'presets' / f'{id_}.html').is_file():
        raise Erro(f'Motion não encontrado: {id_}', 404)
    return usos_motion(id_)


@rota('PUT', r'/api/motions/([\w-]+)/estado')
def _estado_motion(h, q, id_):
    """O selo à mão de um motion: aprovado (tira o "a revisar"), recusado (com o motivo: fica na biblioteca, em
    Recusados, até o Limpar recusados) ou None (volta ao automático)."""
    c = h.corpo()
    estado = c.get('estado')
    motivo = str(c.get('motivo') or '').strip()[:1000]

    def mudar(d):
        d.pop('estado', None)
        if estado == 'aprovado':
            d.pop('a_revisar', None)
            d['estado'] = 'aprovado'
        elif estado == 'recusado':
            d.update(estado='recusado', recusado_em=agora_iso(), **({'motivo': motivo} if motivo else {}))
    return editar_json_motion(id_, mudar)


@rota('POST', '/api/motions/limpar-recusados')
def _limpar_motions_recusados(h, q):
    """Tira da biblioteca os motions recusados (que nenhum vídeo aprovado usa): vão para motions/presets/_recusados/, o
    registro que o subagente de motion lê para não repetir o que o criador não quis (não é uma lixeira)."""
    _, usos, aprovados = _banco().usos_aprovados()
    pasta_p = BIBLIOTECA / 'motions' / 'presets'
    levados = []
    for arq in sorted(pasta_p.glob('*.html')):
        m = JSON_DO_MOTION.search(arq.read_text(encoding='utf-8'))
        dados = json.loads(m.group(2)) if m else {}
        if estado_motion(dados, usos.get(arq.stem), aprovados) != 'recusado':
            continue
        (pasta_p / '_recusados').mkdir(exist_ok=True)
        arq.replace(pasta_p / '_recusados' / arq.name)
        levados.append(arq.stem)
    return {'levados': levados}


@rota('POST', r'/api/motions/([\w-]+)/recusar')
def _recusar_motion(h, q, id_):
    """Move o motion para motions/presets/_recusados/<id>.html, com recusado_em e o motivo no JSON do topo."""
    arq = BIBLIOTECA / 'motions' / 'presets' / f'{id_}.html'
    if not arq.is_file():
        raise Erro(f'Motion não encontrado: {id_}', 404)
    motivo = str(h.corpo().get('motivo') or '').strip()[:1000]
    html = arq.read_text(encoding='utf-8')
    m = JSON_DO_MOTION.search(html)
    if m:
        dados = json.loads(m.group(2)) | {'recusado_em': agora_iso(), **({'motivo': motivo} if motivo else {})}
        html = html[:m.start(2)] + json.dumps(dados, ensure_ascii=False) + html[m.end(2):]
    destino = BIBLIOTECA / 'motions' / 'presets' / '_recusados' / arq.name
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(html, encoding='utf-8')
    arq.unlink()
    return {'ok': True, 'usos': usos_motion(id_)}


# ---- os carrosséis (ferramentas/carrossel.py: carrosseis/<slug>/)

def carrossel():
    import carrossel as c
    return c


def _pasta_carrossel(slug: str) -> Path:
    try:
        return carrossel().pasta(slug)
    except SystemExit as e:
        raise Erro(str(e), 404) from e


def _exportar_carrossel(slug: str) -> None:
    """Exporta em segundo plano (carrossel.py exportar): ao aprovar e, num aprovado, ao trocar o preset."""
    p = _pasta_carrossel(slug)
    log = open(p / 'exportar.log', 'w')
    pr = subprocess.Popen(['uv', 'run', str(RAIZ / 'ferramentas' / 'carrossel.py'), 'exportar', slug], cwd=RAIZ, stdout=log,
                          stderr=subprocess.STDOUT, start_new_session=True)
    gravar_json(p / 'exportando.json', {'pid': pr.pid, 'desde': agora_iso()})


def _exportando(p: Path) -> bool:
    pid = (ler_json(p / 'exportando.json', {}) or {}).get('pid')
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return os.waitpid(pid, os.WNOHANG) == (0, 0)  # filho deste servidor: um zumbi já terminou
    except ChildProcessError:
        return True  # de outro processo (vivo, pelo kill acima)
    except OSError:
        return False


@rota('GET', '/api/carrosseis')
def _carrosseis(h, q):
    return {'carrosseis': carrossel().listar(), 'presets': carrossel().PRESETS}


@rota('POST', '/api/carrosseis')
def _novo_carrossel(h, q):
    c = h.corpo()
    slug = carrossel().novo(str(c.get('nome') or ''), c.get('tipo') or 'cru', c.get('origem'), str(c.get('pedido') or ''), c.get('preset'))
    return {'slug': slug}


@rota('GET', r'/api/carrosseis/([\w-]+)')
def _ver_carrossel(h, q, slug):
    c = carrossel()
    p = _pasta_carrossel(slug)
    vs = c.versoes(p)
    return {**c.resumo(p), 'pedido': (ler_json(p / 'carrossel.json', {}) or {}).get('pedido') or '',
            'entrada': sorted(a.name for a in (p / 'entrada').iterdir()) if (p / 'entrada').is_dir() else [],
            'revisoes': {v: c.revisao(p, v) for v in vs}, 'exportando': _exportando(p), 'presets': c.PRESETS}


@rota('POST', r'/api/carrosseis/([\w-]+)/entrada')
def _entrada_carrossel(h, q, slug):
    """Um arquivo da criação de um cru (imagem, vídeo ou texto), cru no corpo, nome em X-Nome: carrosseis/<slug>/entrada/."""
    p = _pasta_carrossel(slug)
    nome = re.sub(r'[^\w. -]+', '_', unquote(h.headers.get('X-Nome') or 'arquivo')).strip() or 'arquivo'
    resta = int(h.headers.get('Content-Length') or 0)
    if not 0 < resta <= 2 << 30:
        raise Erro('O arquivo está vazio ou passou de 2 GB.', 422)
    (p / 'entrada').mkdir(exist_ok=True)
    destino = p / 'entrada' / nome
    with open(destino, 'wb') as f:
        while resta > 0:
            bloco = h.rfile.read(min(1 << 20, resta))
            if not bloco:
                break
            f.write(bloco)
            resta -= len(bloco)
    if resta:
        destino.unlink(missing_ok=True)
        raise Erro('O envio parou no meio.')
    return {'arquivo': nome}


@rota('PUT', r'/api/carrosseis/([\w-]+)/preset')
def _preset_carrossel(h, q, slug):
    c = carrossel()
    p = _pasta_carrossel(slug)
    preset = h.corpo().get('preset')
    if preset not in c.ids_presets():
        raise Erro(f'Preset desconhecido: {preset}', 422)
    meta = ler_json(p / 'carrossel.json', {})
    meta['preset'] = preset
    gravar_json(p / 'carrossel.json', meta)
    vs = c.versoes(p)
    reexporta = bool(vs and c.revisao(p, vs[-1]).get('aprovado') and (meta.get('exportado') or {}).get('preset') != preset)
    if reexporta:
        _exportar_carrossel(slug)
    return {'ok': True, 'exportando': reexporta}


@rota('PUT', r'/api/carrosseis/([\w-]+)/nome')
def _nome_carrossel(h, q, slug):
    p = _pasta_carrossel(slug)
    nome = str(h.corpo().get('nome') or '').strip()[:120]
    if not nome:
        raise Erro('O nome não pode ficar vazio.', 422)
    meta = ler_json(p / 'carrossel.json', {})
    meta['nome'] = nome
    gravar_json(p / 'carrossel.json', meta)
    return {'ok': True}


@rota('PUT', r'/api/carrosseis/([\w-]+)/revisao/v(\d+)')
def _revisao_carrossel(h, q, slug, v):
    """A revisão inteira da vN (comentários por slide, aprovado); as respostas do Claude no arquivo ficam. Aprovar exporta."""
    p = _pasta_carrossel(slug)
    if not (p / 'versoes' / f'v{v}.json').is_file():
        raise Erro('Versão não encontrada', 404)
    destino = p / 'revisoes' / f'v{v}.json'
    antes = ler_json(destino, {}) or {}
    rev = juntar_respostas(h.corpo(), antes)
    assina = lambda r: json.dumps([r.get('comentarios') or [], bool(r.get('aprovado'))], sort_keys=True, ensure_ascii=False)  # noqa: E731
    rev['mexido_em'] = agora_iso() if assina(rev) != assina(antes) else antes.get('mexido_em')
    if not rev['mexido_em']:
        rev.pop('mexido_em')
    gravar_json(destino, rev)
    exporta = bool(rev.get('aprovado') and not antes.get('aprovado') and int(v) == carrossel().versoes(p)[-1])
    if exporta:
        _exportar_carrossel(slug)
    return {'ok': True, 'exportando': exporta}


@rota('POST', r'/api/carrosseis/([\w-]+)/abrir-final')
def _abrir_final_carrossel(h, q, slug):
    final = _pasta_carrossel(slug) / 'final'
    if not final.is_dir():
        raise Erro('Ainda não há export (aprove o carrossel).', 404)
    subprocess.run(['open', str(final)], check=False)
    return {'ok': True}


@rota('DELETE', r'/api/carrosseis/([\w-]+)')
def _apagar_carrossel(h, q, slug):
    p = _pasta_carrossel(slug)
    nome = (ler_json(p / 'carrossel.json', {}) or {}).get('nome') or slug
    return {'ok': True, 'lixeira': para_lixeira([p], 'carrossel', slug, nome)['entrada']}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(RAIZ), **k)

    def log_message(self, format, *args):  # noqa: A002 — silencioso: o render faz milhares de pedidos
        pass

    def end_headers(self):
        # as fontes não mudam e são grandes (a SF Pro tem 8 MB): ficam no cache do navegador (cada slide de carrossel é
        # um iframe que as pede); o resto, nunca
        fonte = self.path.startswith(('/api/motions/fonte/', '/render/motion/fonts/', '/app/fontes/'))
        self.send_header('Cache-Control', 'public, max-age=604800, immutable' if fonte else 'no-store')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def _json(self, dados, status=200):
        corpo = json.dumps(dados, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def corpo(self) -> dict:
        try:
            return json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        except ValueError as e:
            raise Erro('JSON inválido no corpo') from e

    def _api(self, metodo: str) -> bool:
        """Responde se a rota é da API (True); senão, deixa para os arquivos estáticos."""
        url = urlparse(self.path)
        for m, padrao, f in ROTAS:
            achou = padrao.match(url.path)
            if achou and m == metodo:
                break
        else:
            if url.path.startswith('/api/'):
                self._json({'erro': 'rota inválida'}, 404)
                return True
            return False
        try:
            self._json(f(self, parse_qs(url.query), *achou.groups()))
        except Erro as e:
            self._json({'erro': str(e)}, e.status)
        except ValueError as e:  # a validação da calibragem: a mensagem é para o criador ler
            self._json({'erro': str(e)}, 422)
        except (FileNotFoundError, KeyError) as e:
            self._json({'erro': f'Não encontrado: {e}'}, 404)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001 — o app mostra a mensagem em vez de ficar sem resposta
            self._json({'erro': f'{type(e).__name__}: {e}'}, 500)
        return True

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/':
            self.send_response(HTTPStatus.FOUND)
            self.send_header('Location', '/app/')
            self.end_headers()
            return
        if url.path.startswith('/api/motions/fonte/'):
            fonte = Path('/System/Library/Fonts') / FONTES_DO_MAC.get(url.path.rsplit('/', 1)[1], '-')
            if not fonte.is_file():
                return self.send_error(404)
            corpo = fonte.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'font/ttf')
            self.send_header('Content-Length', str(len(corpo)))
            self.end_headers()
            return self.wfile.write(corpo)
        if url.path == '/api/presets/ator.jpg' or url.path.startswith('/api/aprendizados/imagens/'):
            arq = poster_do_ator() if url.path == '/api/presets/ator.jpg' else imagem_aprendizado(unquote(url.path[26:]))
            if not arq:
                return self.send_error(404)
            corpo = arq.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(arq)))
            self.send_header('Content-Length', str(len(corpo)))
            self.end_headers()
            return self.wfile.write(corpo)
        if self._api('GET'):
            return
        partes = Path(url.path).parts
        if len(partes) < 2 or partes[1] not in PUBLICOS:
            return self.send_error(404)
        if 'Range' in self.headers:
            return self._range()
        super().do_GET()

    def do_PUT(self):
        self._api('PUT') or self._json({'erro': 'rota inválida'}, 404)

    def do_POST(self):
        self._api('POST') or self._json({'erro': 'rota inválida'}, 404)

    def do_DELETE(self):
        self._api('DELETE') or self._json({'erro': 'rota inválida'}, 404)

    def _range(self):
        caminho = Path(self.translate_path(self.path))
        if not caminho.is_file():
            return self.send_error(404)
        tamanho = caminho.stat().st_size
        m = re.match(r'bytes=(\d*)-(\d*)', self.headers['Range'])
        ini = int(m.group(1)) if m and m.group(1) else 0
        fim = int(m.group(2)) if m and m.group(2) else tamanho - 1
        if m and not m.group(1) and m.group(2):  # bytes=-N: os últimos N
            ini, fim = max(tamanho - int(m.group(2)), 0), tamanho - 1
        fim = min(fim, tamanho - 1)
        if ini > fim:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header('Content-Range', f'bytes */{tamanho}')
            return self.end_headers()
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header('Content-Type', self.guess_type(str(caminho)))
        self.send_header('Content-Range', f'bytes {ini}-{fim}/{tamanho}')
        self.send_header('Content-Length', str(fim - ini + 1))
        self.end_headers()
        with open(caminho, 'rb') as f:
            f.seek(ini)
            resta = fim - ini + 1
            try:
                while resta > 0:
                    bloco = f.read(min(1 << 20, resta))
                    if not bloco:
                        break
                    self.wfile.write(bloco)
                    resta -= len(bloco)
            except (BrokenPipeError, ConnectionResetError):
                pass


Handler.extensions_map |= {'.mjs': 'text/javascript', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.cube': 'text/plain'}


def servir(porta: int = 0) -> ThreadingHTTPServer:
    """Sobe o servidor numa thread (porta 0 = livre) e devolve-o; a porta fica em `.server_address[1]`."""
    srv = ThreadingHTTPServer(('127.0.0.1', porta), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ---------------------------------------------------------------- o cache do render dos aprovados

CACHE_DIAS = 3  # um projeto aprovado e parado há esses dias perde o cache do render (um render novo refaz)


def limpar_caches_parados(dias: float = CACHE_DIAS) -> list[tuple[str, int]]:
    """Apaga o cache do render (`.cache/camadas` e `.cache/trechos`: refeitos por um render novo) dos projetos aprovados
    e parados há `dias` dias (a data do card, `ultima_edicao`). Pula o que tem um render rodando ou a camada travada.
    Devolve [(slug, bytes liberados)]."""
    import fcntl
    import time
    ocupados, limite, feitos = renders_rodando(), time.time() - dias * 86400, []
    for p in projetos():
        cache = PROJETOS / p['slug'] / '.cache'
        alvos = [cache / x for x in ('camadas', 'trechos') if (cache / x).is_dir()]
        if p['estado'] != 'aprovado' or p['atualizado'] > limite or p['slug'] in ocupados or not alvos:
            continue
        trava = cache / 'camadas.trava'
        with open(trava, 'a') as f:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)  # um render fotografando: fica para a próxima
            except BlockingIOError:
                continue
            n = sum(tamanho(a) for a in alvos)
            for a in alvos:
                shutil.rmtree(a, ignore_errors=True)
        feitos.append((p['slug'], n))
    return feitos


def limpar_temporarios(horas: float = 6) -> list[tuple[str, int]]:
    """Apaga as pastas temporárias de renders que morreram no meio (`projetos/<slug>/.render-*`, que o render apaga ao
    terminar): as com mais de `horas` horas, de projetos sem render rodando. Devolve [(pasta, bytes)]."""
    import time
    ocupados, limite, feitos = renders_rodando(), time.time() - horas * 3600, []
    for d in PROJETOS.glob('*/.render-*'):
        if d.is_dir() and d.parent.name not in ocupados and d.stat().st_mtime < limite:
            n = tamanho(d)
            shutil.rmtree(d, ignore_errors=True)
            feitos.append((str(d.relative_to(PROJETOS)), n))
    return feitos


def _limpar_de_hora_em_hora() -> None:
    import time
    while True:
        try:
            for slug, n in limpar_caches_parados():
                print(f'Cache do render de {slug} apagado (aprovado e parado): {n / 1e9:.1f} GB', flush=True)
            for d, n in limpar_temporarios():
                print(f'Temporário de render que morreu no meio apagado: {d} ({n / 1e9:.1f} GB)', flush=True)
        except Exception as e:  # noqa: BLE001 — a limpeza nunca derruba o servidor
            print(f'Limpeza do cache falhou: {e}', flush=True)
        time.sleep(3600)


if __name__ == '__main__':
    if sys.argv[1:2] == ['--limpar-caches']:
        feitos = limpar_caches_parados(float(sys.argv[2]) if len(sys.argv) > 2 else CACHE_DIAS) + limpar_temporarios()
        for slug, n in feitos:
            print(f'{slug}: {n / 1e9:.1f} GB')
        print(f'Total: {sum(n for _, n in feitos) / 1e9:.1f} GB liberados em {len(feitos)} projeto(s)')
        sys.exit(0)
    preparar_biblioteca()  # uma instalação nova: a biblioteca inicial e a pasta dos projetos
    migrar_lixeiras_antigas()  # as lixeiras de antes (projetos/_lixeira, banco/_lixeira, referencias/_lixeira) vão para a única
    threading.Thread(target=_limpar_de_hora_em_hora, daemon=True).start()  # o cache do render dos aprovados parados
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORTA', PORTA))
    print(f'Editor: http://localhost:{porta}/app/')
    ThreadingHTTPServer(('127.0.0.1', porta), Handler).serve_forever()
