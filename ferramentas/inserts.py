# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Inserts e motions: liga as mídias do banco a cada pedido de insert e põe o motion de cada plano de motion (do 18:
backend/app/inserts.py `definir_midias` e motions.py `usar`). Os pedidos saem da direção (direcao.py aplicar).

    uv run ferramentas/inserts.py listar <slug>
    uv run ferramentas/inserts.py ligar <slug> <plano> <banco_id> [<banco_id>…]     (até 12, na ordem)
    uv run ferramentas/inserts.py juntar <slug>        liga o que cada subagente achou (projetos/<slug>/inserts/<plano>.json)
    uv run ferramentas/inserts.py briefs <slug> [--grupo 3] [--contexto "…"] [--todos]
                                                       os briefs dos subagentes de inserts, em grupos (etapas/04-brief-inserts.md)
    uv run ferramentas/inserts.py motion-brief <slug> <plano> --preset <id-novo> [--duracao s] [--pedido "…"]
                                                       o brief do subagente de um motion novo (etapas/06-brief-motion.md)
    uv run ferramentas/inserts.py brief <slug> <nome> --tarefa "<texto ou arquivo>" [--areas inserts,motions|todas]
                                                       o brief de qualquer outro subagente (revisor, busca de mídia, captura…:
                                                       etapas/brief-avulso.md), com os aprendizados das áreas dentro
    uv run ferramentas/inserts.py motion <slug> <plano> <preset> [--valores '{"campo": "texto"}'] [--fundo id]
    uv run ferramentas/inserts.py motion <slug> <plano> --video <banco_id>

O resultado de um subagente: {"plano": "p5", "midias": ["<banco_id>", …], "fontes": ["url", …], "nota": "…"}.
"""
import argparse
import json
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import banco  # noqa: E402
from base import BIBLIOTECA, CATEGORIA_PADRAO, EXEMPLOS, RAIZ, gravar, ler, ler_json, pasta  # noqa: E402
from cortes import num, seg  # noqa: E402
from direcao import PLANOS, saida_do, tempos  # noqa: E402

MAX_MIDIAS = 12
PRESETS_MOTION = BIBLIOTECA / 'motions' / 'presets'
FORMATO_MOTION = {'motion_tela_cheia': 'vertical', 'tela_dividida_motion': 'dividida'}
FUNDOS = ('verde_claro', 'papel', 'nevoa', 'chuva', 'gradiente')  # do 18: inserts.FUNDOS


def pedido(edicao: dict, plano: str) -> dict:
    for x in (edicao.get('inserts') or {}).get('pedidos') or []:
        if plano in (x.get('plano'), x.get('id')):
            return x
    planos = [x.get('plano') for x in (edicao.get('inserts') or {}).get('pedidos') or []]
    raise SystemExit(f'O plano {plano} não tem pedido de insert (têm: {", ".join(planos) or "nenhum; rode direcao.py aplicar"}).')


def definir_midias(x: dict, ids: list[str]) -> list[dict]:
    """As mídias do pedido, em ordem (a mesma mídia mantém o seu id de ligação)."""
    if len(ids) > MAX_MIDIAS:
        raise SystemExit(f'No máximo {MAX_MIDIAS} mídias por insert ({len(ids)} pedidas).')
    faltam = [b for b in ids if not banco.existe(b)]
    if faltam:
        raise SystemExit(f'Mídia não encontrada no banco: {", ".join(faltam)}')
    antigas = {m['banco']: m['id'] for m in x.get('midias') or []}
    x['midias'] = [{'id': antigas.pop(b, None) or uuid.uuid4().hex[:8], 'banco': b} for b in ids]
    return x['midias']


def descrever_midia(bid: str) -> str:
    if not banco.existe(bid):
        return f'{bid} (não existe mais no banco)'
    i = banco.ler_item(bid)
    tipo = 'trecho' if i.get('pai') else {'video': 'vídeo'}.get(i['tipo'], i['tipo'])
    dur = f', {num(i.get("duracao") or 0, 1)} s' if i['tipo'] == 'video' else ''
    return f'{bid} {i.get("nome")} ({tipo} {i.get("formato")}{dur})'


def nome_preset(pid: str | None) -> str:
    p = ler_json(BIBLIOTECA / 'presets' / f'{pid}.json') if pid else None
    return f'{pid} {p.get("nome")}' if p else (pid or '')


# ---------------------------------------------------------------- presets de motion

def ler_preset_motion(pid: str) -> dict:
    """O JSON do topo do preset (`id="preset"`: nome, fundo sugerido…) e os campos (`id="campos"`); do 18: motions.ler_preset."""
    arq = PRESETS_MOTION / f'{pid}.html'
    if not re.fullmatch(r'[a-z0-9-]{1,40}', pid or '') or not arq.exists():
        existentes = ', '.join(sorted(a.stem for a in PRESETS_MOTION.glob('*.html')))
        raise SystemExit(f'Preset de motion não encontrado: {pid} (existem: {existentes})')
    html = arq.read_text(encoding='utf-8')

    def bloco(sid):
        m = re.search(rf'<script[^>]*id=["\']{sid}["\'][^>]*>(.*?)</script>', html, re.S)
        try:
            d = json.loads(m.group(1)) if m else {}
        except ValueError:
            return {}
        return d if isinstance(d, dict) else {}
    info = bloco('preset')
    return {'id': pid, 'nome': str(info.get('nome') or pid), 'fundo': info.get('fundo') or 'gradiente', 'campos': bloco('campos')}


def motion(slug: str, plano: str, preset: str | None, valores: dict, fundo: str | None, video: str | None) -> None:
    edicao = ler(slug)
    item = next((i for i in (edicao.get('direcao') or {}).get('itens') or [] if i['id'] == plano and i['camada'] == 'plano'), None)
    if item is None:
        raise SystemExit(f'O plano {plano} não existe na direção.')
    formato = FORMATO_MOTION.get(item['tipo'])
    if formato is None:
        raise SystemExit(f'O plano {plano} é {PLANOS.get(item["tipo"], item["tipo"])}: só planos de motion (Motion tela cheia, '
                         'Tela dividida · motion) recebem motion.')
    if video:
        if not banco.existe(video):
            raise SystemExit(f'Mídia não encontrada no banco: {video}')
        i = banco.ler_item(video)
        if i['tipo'] != 'video':
            raise SystemExit(f'{video} é {i["tipo"]}: o motion por vídeo precisa de um vídeo do banco.')
        info = {'tipo': 'video', 'banco': video, 'nome': i.get('nome') or 'Vídeo', 'formato': formato}
    else:
        p = ler_preset_motion(preset)
        desconhecidos = [k for k in valores if k not in p['campos']]
        if desconhecidos:
            raise SystemExit(f'Campos que o preset {preset} não tem: {", ".join(desconhecidos)} (tem: {", ".join(p["campos"]) or "nenhum"})')
        for k, c in p['campos'].items():
            if (c or {}).get('tipo') == 'imagem' and k in valores and not banco.existe(str(valores[k])):
                raise SystemExit(f'O campo {k} é uma imagem do banco: {valores[k]} não existe lá.')
        fundo = fundo or p['fundo']
        if fundo not in FUNDOS:
            raise SystemExit(f'Fundo desconhecido: {fundo} (use: {", ".join(FUNDOS)})')
        info = {'tipo': 'preset', 'preset': p['id'], 'nome': p['nome'], 'formato': formato,
                'valores': {k: str(v)[:500] for k, v in valores.items()}, 'fundo': fundo}
    info['usado_em'] = datetime.now().isoformat(timespec='seconds')
    edicao.setdefault('motions', {})[plano] = info
    gravar(slug, edicao)
    print(f'{plano}: {resumo_motion(info)}')


def resumo_motion(m: dict | None) -> str:
    if not m:
        return 'SEM MOTION'
    if m['tipo'] == 'video':
        return f'vídeo {descrever_midia(m["banco"])}'
    valores = ', '.join(f'{k}: «{v}»' for k, v in (m.get('valores') or {}).items()) or 'valores padrão'
    return f'preset {m["preset"]} «{m.get("nome")}» · {valores} · fundo {m.get("fundo")}'


# ---------------------------------------------------------------- comandos

def listar(slug: str) -> None:
    edicao = ler(slug)
    itens = (edicao.get('direcao') or {}).get('itens') or []
    if not itens:
        raise SystemExit(f'O projeto {slug} ainda não tem direção (rode direcao.py aplicar).')
    saida = saida_do(slug, edicao)
    t = tempos(itens, saida)
    idx = {w['id']: k for k, w in enumerate(saida)}
    pedidos = {x.get('plano'): x for x in (edicao.get('inserts') or {}).get('pedidos') or []}
    motions = edicao.get('motions') or {}
    feitos = total = 0
    for pl in (i for i in itens if i['camada'] == 'plano'):
        x = pedidos.get(pl['id'])
        if x is None and pl['tipo'] not in FORMATO_MOTION:
            continue
        total += 1
        a, b = t[pl['id']]
        formato = x['formato'] if x else FORMATO_MOTION[pl['tipo']]
        print(f'{pl["id"]}  {PLANOS.get(pl["tipo"], pl["tipo"])} · {formato}  {seg(a)} +{num(b - a, 1)} s')
        fala = x['fala'] if x else ' '.join(w['texto'] for w in saida[idx[pl['palavra_ini']]:idx[pl['palavra_fim']] + 1])
        print(f'    fala: “{fala}”')
        print(f'    marcação: {pl.get("descricao") or "—"}')
        if pl.get('texto'):
            print(f'    texto: «{pl["texto"]}»')
        if x:
            midias = x.get('midias') or []
            feitos += bool(midias)
            print('    mídias: ' + ('; '.join(descrever_midia(m['banco']) for m in midias) if midias else 'SEM MÍDIA'))
            if (x.get('enriquecimento') or {}).get('preset'):
                print(f'    preset: {nome_preset(x["enriquecimento"]["preset"])}')
        else:
            feitos += pl['id'] in motions
            print(f'    motion: {resumo_motion(motions.get(pl["id"]))}')
        print()
    print(f'{feitos}/{total} com mídia ou motion')


def ligar(slug: str, plano: str, ids: list[str]) -> None:
    edicao = ler(slug)
    x = pedido(edicao, plano)
    midias = definir_midias(x, ids)
    gravar(slug, edicao)
    print(f'{x["plano"]}: ' + '; '.join(descrever_midia(m['banco']) for m in midias))


def juntar(slug: str) -> None:
    edicao = ler(slug)
    arquivos = sorted((pasta(slug) / 'inserts').glob('*.json'))
    if not arquivos:
        raise SystemExit(f'Nenhum resultado em projetos/{slug}/inserts/ (um <plano>.json por subagente).')
    for arq in arquivos:
        try:
            r = json.loads(arq.read_text(encoding='utf-8'))
        except ValueError as e:
            print(f'{arq.name}: JSON inválido ({e}); pulado')
            continue
        plano = str(r.get('plano') or arq.stem)
        nota = f'  ({r["nota"]})' if r.get('nota') else ''
        try:
            x = pedido(edicao, plano)
        except SystemExit as e:
            print(f'{arq.name}: {e}')
            continue
        ids = [str(b) for b in r.get('midias') or []]
        validos = [b for b in ids if banco.existe(b)]
        if len(validos) < len(ids):
            print(f'{plano}: fora do banco, ignoradas: {", ".join(b for b in ids if b not in validos)}')
        if not validos:
            print(f'{plano}: nada para ligar{nota}')
            continue
        definir_midias(x, validos[:MAX_MIDIAS])
        print(f'{plano}: ligou {"; ".join(descrever_midia(b) for b in validos[:MAX_MIDIAS])}{nota}')
    gravar(slug, edicao)
    sem = [x['plano'] for x in edicao['inserts']['pedidos'] if not x.get('midias')]
    print(f'\nSem mídia: {", ".join(sem)}' if sem else '\nTodos os inserts têm mídia.')


# ---------------------------------------------------------------- briefs dos subagentes (do 18: ferramentas/app.py)

ETAPAS = RAIZ / '.claude' / 'skills' / 'editor' / 'etapas'


def _briefs(slug: str) -> Path:
    d = pasta(slug) / 'briefs'
    d.mkdir(parents=True, exist_ok=True)
    return d


def _exemplos(edicao: dict) -> Path:
    """A pasta da categoria do vídeo (`exemplos/<categoria>/`), onde moram os aprendizados dela (`aprendizados/<área>.md`)."""
    return EXEMPLOS / (edicao.get('formato') or CATEGORIA_PADRAO)


def _categoria(edicao: dict) -> str:
    """O nome da categoria do vídeo (Reels, VSL…), dito aos subagentes junto com os aprendizados dela."""
    cat = edicao.get('formato') or CATEGORIA_PADRAO
    lista = ler_json(BIBLIOTECA / 'categorias-video.json', None) or []
    return next((c['nome'] for c in lista if c.get('id') == cat), cat)


AREAS = ('cortes', 'direcao', 'elementos', 'inserts', 'enriquecimento', 'motions', 'transicoes', 'audio', 'legenda', 'render')


def _aprendizados(edicao: dict, areas: list[str] | tuple[str, ...]) -> str:
    """O texto dos aprendizados das áreas (o geral e o da categoria do vídeo), para ir DENTRO do brief: o subagente não
    depende de lembrar de abrir os arquivos."""
    partes = []
    for ar in areas:
        for arq, vale in ((BIBLIOTECA / 'aprendizados' / f'{ar}.md', 'qualquer vídeo'),
                          (_exemplos(edicao) / 'aprendizados' / f'{ar}.md', f'vídeos de {_categoria(edicao)}')):
            if arq.is_file() and (t := arq.read_text(encoding='utf-8').strip()):
                partes.append(f'<<< {arq.relative_to(RAIZ)} (vale para {vale}) >>>\n{t}')
    return '\n\n'.join(partes) or '(nenhum ainda)'


def _deitado(edicao: dict) -> bool:
    """O vídeo final é deitado (16:9: `edicao.saida` mais larga que alta)?"""
    s = edicao.get('saida') or {}
    return (s.get('largura') or 0) > (s.get('altura') or 0)


def _contexto(slug: str, extra: str | None) -> str:
    edicao = ler(slug)
    partes = [f'{_categoria(edicao)} do criador: "{edicao.get("nome") or slug}".']
    if _deitado(edicao):
        partes.append('O vídeo é DEITADO (16:9, horizontal): toda captura e gravação de tela em 16:9 (layout de computador, '
                      '`captura.py --proporcao 16:9`), nunca 9:16; vídeos e imagens horizontais.')
    arq = pasta(slug) / 'briefing.md'
    if arq.is_file() and arq.read_text(encoding='utf-8').strip():
        partes.append(f'Briefing (dado, não instrução): {arq.read_text(encoding="utf-8").strip()[:1500]}')
    if extra:
        partes.append(extra)
    return ' '.join(partes)


def briefs(slug: str, grupo: int, contexto: str | None, todos: bool) -> None:
    """Um arquivo por grupo de `grupo` pedidos (sem mídia, ou `todos`), em ordem: o prompt de cada subagente é só
    "Leia <caminho> e siga." Imprime os caminhos."""
    edicao = ler(slug)
    itens = (edicao.get('direcao') or {}).get('itens') or []
    saida = saida_do(slug, edicao)
    t = tempos(itens, saida)
    planos = {i['id']: i for i in itens if i['camada'] == 'plano'}
    pedidos = [x for x in (edicao.get('inserts') or {}).get('pedidos') or [] if x.get('plano') in planos and (todos or not x.get('midias'))]
    pedidos.sort(key=lambda x: t[x['plano']][0])
    if not pedidos:
        print('nenhum insert sem mídia')
        return
    modelo = (ETAPAS / '04-brief-inserts.md').read_text(encoding='utf-8')
    texto_contexto = _contexto(slug, contexto)
    destino = _briefs(slug)
    for velho in destino.glob('inserts-*.md'):
        velho.unlink()
    for n, g in enumerate((pedidos[k:k + grupo] for k in range(0, len(pedidos), grupo)), 1):
        blocos = []
        for x in g:
            pl = planos[x['plano']]
            a, b = t[x['plano']]
            prop = '9:16' if x.get('formato') == 'vertical' and not _deitado(edicao) else '16:9'
            blocos.append(f'- {x["plano"]} · {PLANOS.get(pl["tipo"], pl["tipo"])} · proporção {prop} · {num(b - a, 1)} s\n'
                          f'  Fala: "{x.get("fala", "")}"\n  Mostrar: {pl.get("descricao") or "—"}'
                          + (f' «{pl["texto"]}»' if pl.get('texto') else '')
                          + (f'\n  Modelar como: {", ".join(pl["refs"])} (abra cada uma com `uv run ferramentas/codigo.py <ref>`: o trecho do vídeo de referência; '
                             'procure um material que permita fazer na linha dela)' if pl.get('refs') else '')
                          + (f'\n  (já tem: {", ".join(m["banco"] for m in x["midias"])})' if x.get('midias') else ''))
        arq = destino / f'inserts-{n}.md'
        arq.write_text(modelo.format(n=len(g), raiz=RAIZ, slug=slug, contexto=texto_contexto, pedidos='\n'.join(blocos),
                                     categoria=_categoria(edicao), aprendizados=_aprendizados(edicao, ['inserts'])),
                       encoding='utf-8')
        print(f'{arq}  ({", ".join(x["plano"] for x in g)})')


def motion_brief(slug: str, plano: str, preset: str, duracao: float | None, pedido_extra: str | None) -> None:
    """O brief do subagente que escreve um preset de motion novo para o plano. Imprime o caminho."""
    if not re.fullmatch(r'[a-z0-9-]{2,40}', preset):
        raise SystemExit('O id do preset novo: minúsculas, números e hífens.')
    edicao = ler(slug)
    itens = (edicao.get('direcao') or {}).get('itens') or []
    pl = next((i for i in itens if i['id'] == plano and i['camada'] == 'plano'), None)
    if not pl:
        raise SystemExit(f'O plano {plano} não está na direção.')
    saida = saida_do(slug, edicao)
    a, b = tempos(itens, saida)[plano]
    idx = {w['id']: k for k, w in enumerate(saida)}
    fala = ' '.join(w['texto'] for w in saida[idx[pl['palavra_ini']]:idx[pl['palavra_fim']] + 1])
    dividida = pl['tipo'].startswith('tela_dividida')
    # deitado (16:9), todo motion toca no palco da dividida (render/src/desenho.ts, `motionNoLugar`)
    palco = ('1080×960 (o vídeo é deitado, 16:9: na tela dividida, a área do insert, à esquerda, com o ator à direita; '
             'na tela cheia, o palco fica centrado na altura toda, com o fundo nas laterais)' if _deitado(edicao)
             else '1080×960, a metade de cima; o ator fica embaixo' if dividida else '1080×1920, a tela toda')
    texto = (ETAPAS / '06-brief-motion.md').read_text(encoding='utf-8').format(
        raiz=RAIZ, preset=preset, projeto=slug, pedido=pl.get('descricao') or pedido_extra or '—', formato='dividida' if dividida or _deitado(edicao) else 'vertical',
        categoria=_categoria(edicao), aprendizados=_aprendizados(edicao, ['motions']),
        palco=palco,
        duracao=num(duracao or (b - a), 1), fala=fala,
        extra='\n'.join(x for x in [f'Mais: {pedido_extra}' if pedido_extra else '',
                                     f'Modele na linha destas refs da Calibragem: {", ".join(pl["refs"])}. Antes de escrever, abra cada uma '
                                     '(`uv run ferramentas/codigo.py <ref>` dá o vídeo e o intervalo; tire 4 a 6 quadros do trecho com o ffmpeg e '
                                     'olhe-os) e recrie o que ela faz (composição, como entra, o movimento), com o conteúdo deste plano.'
                                     if pl.get('refs') else ''] if x))
    arq = _briefs(slug) / f'motion-{plano}.md'
    arq.write_text(texto, encoding='utf-8')
    print(arq)


def brief(slug: str, nome: str, tarefa: str, areas: str) -> None:
    """O brief de um subagente fora do fluxo dos inserts e dos motions (revisor, busca de uma mídia, captura, pesquisa):
    a tarefa, as regras de sempre e os aprendizados das áreas dentro. O prompt do subagente é só "Leia <caminho> e siga."
    Imprime o caminho."""
    if not re.fullmatch(r'[a-z0-9-]{2,40}', nome):
        raise SystemExit('O nome do brief: minúsculas, números e hífens.')
    lista = list(AREAS) if areas == 'todas' else [x.strip() for x in areas.split(',') if x.strip()]
    if fora := [x for x in lista if x not in AREAS]:
        raise SystemExit(f'Área desconhecida: {", ".join(fora)}. As áreas: {", ".join(AREAS)} (ou "todas").')
    arq_tarefa = Path(tarefa)
    texto_tarefa = arq_tarefa.read_text(encoding='utf-8').strip() if arq_tarefa.suffix == '.md' and arq_tarefa.is_file() else tarefa.strip()
    edicao = ler(slug)
    rascunho = _briefs(slug) / nome
    rascunho.mkdir(exist_ok=True)
    texto = (ETAPAS / 'brief-avulso.md').read_text(encoding='utf-8').format(
        raiz=RAIZ, slug=slug, contexto=_contexto(slug, None), tarefa=texto_tarefa, rascunho=rascunho,
        categoria=_categoria(edicao), areas=', '.join(lista), aprendizados=_aprendizados(edicao, lista))
    arq = _briefs(slug) / f'{nome}.md'
    arq.write_text(texto, encoding='utf-8')
    print(f'{arq}  ({len(texto) // 1000} mil caracteres; áreas: {", ".join(lista)})')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Inserts e motions de um projeto.', usage=__doc__)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('listar').add_argument('slug')
    li = sub.add_parser('ligar')
    li.add_argument('slug')
    li.add_argument('plano')
    li.add_argument('ids', nargs='+')
    sub.add_parser('juntar').add_argument('slug')
    br = sub.add_parser('briefs')
    br.add_argument('slug')
    br.add_argument('--grupo', type=int, default=3, help='pedidos por subagente')
    br.add_argument('--contexto', help='uma frase sobre o vídeo, para os subagentes')
    br.add_argument('--todos', action='store_true', help='também os que já têm mídia')
    mb = sub.add_parser('motion-brief')
    mb.add_argument('slug')
    mb.add_argument('plano')
    mb.add_argument('--preset', required=True, help='o id do preset novo (minúsculas e hífens)')
    mb.add_argument('--duracao', type=float)
    mb.add_argument('--pedido', help='o que mais o motion deve mostrar')
    bv = sub.add_parser('brief')
    bv.add_argument('slug')
    bv.add_argument('nome', help='o nome do brief (minúsculas e hífens): vira briefs/<nome>.md')
    bv.add_argument('--tarefa', required=True, help='a tarefa: o texto, ou um arquivo .md com ela')
    bv.add_argument('--areas', default='todas', help=f'as áreas dos aprendizados, separadas por vírgula: {", ".join(AREAS)} (padrão: todas)')
    mo = sub.add_parser('motion')
    mo.add_argument('slug')
    mo.add_argument('plano')
    mo.add_argument('preset', nargs='?')
    mo.add_argument('--valores', default='{}')
    mo.add_argument('--fundo')
    mo.add_argument('--video')
    a = ap.parse_args()
    if a.cmd == 'listar':
        listar(a.slug)
    elif a.cmd == 'ligar':
        ligar(a.slug, a.plano, a.ids)
    elif a.cmd == 'juntar':
        juntar(a.slug)
    elif a.cmd == 'briefs':
        briefs(a.slug, max(1, a.grupo), a.contexto, a.todos)
    elif a.cmd == 'motion-brief':
        motion_brief(a.slug, a.plano, a.preset, a.duracao, a.pedido)
    elif a.cmd == 'brief':
        brief(a.slug, a.nome, a.tarefa, a.areas)
    else:
        if bool(a.preset) == bool(a.video):
            raise SystemExit('Diga um preset ou --video <banco_id> (um dos dois).')
        try:
            valores = json.loads(a.valores)
            assert isinstance(valores, dict)
        except (ValueError, AssertionError):
            raise SystemExit('--valores é um objeto JSON: \'{"campo": "texto"}\'')
        motion(a.slug, a.plano, a.preset, valores, a.fundo, a.video)
