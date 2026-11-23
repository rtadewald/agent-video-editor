# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Os presets de enriquecimento dos inserts (SPEC §8.4 do 18): a lista dos aprovados e a escolha automática.

    uv run ferramentas/presets.py listar
    uv run ferramentas/presets.py escolher <slug>

`escolher`: cada pedido de insert com mídia e sem preset recebe o 1º favorito da sua situação (modo de tela × nº de
mídias × proporção, a ordem de biblioteca/presets/ordem.json) entre os aprovados que servem a ele. É a lista do insert no
18 (frontend/src/presets/presets.ts: presetsPara, serve, usosDe, comRecomendados, ordemDoInsert), portada para cá; os
ajustes rápidos que o preset não mostra saem, como ao trocar de preset no 18 (ajustes.ts: ajustesAoTrocar).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import banco  # noqa: E402
from base import BIBLIOTECA, gravar, ler, ler_json  # noqa: E402

PASTA = BIBLIOTECA / 'presets'
NOME_TELA = {'vertical': 'tela cheia', 'dividida': 'tela dividida', 'atras': 'ator embaixo'}
NOME_PROPORCAO = {'pe': 'em pé', 'quadrada': 'quadrada', 'deitada': 'horizontal'}


def biblioteca() -> list[dict]:
    """Os presets, na ordem do 18 (presets.py listar: formato, nº de cards, nome)."""
    out = [p for a in PASTA.glob('*.json') if len(a.stem) == 10 and (p := ler_json(a))]
    return sorted(out, key=lambda p: (p['formato'], len(p['receita']['cards']), p.get('nome', '')))


def ordem() -> dict[str, dict]:
    """A ordem de cada situação, `{ids, favoritos}` (a 1ª versão guardava só a lista: todos favoritos, até 3)."""
    o = ler_json(PASTA / 'ordem.json', {})
    return {k: v if isinstance(v, dict) else {'ids': v, 'favoritos': min(len(v), 3)} for k, v in o.items()}


# ---------------------------------------------------------------- onde um preset vale (do 18: presets.ts)

def n_midias(r: dict) -> int:
    """Quantas mídias a receita pede (os cards podem repetir mídias)."""
    return max((c['midia'] if c.get('midia') is not None else k) + 1 for k, c in enumerate(r['cards']))


def chave_midias(n: int) -> str:
    return '1' if n <= 1 else '2' if n == 2 else '2+'


def chave_proporcao(a: float) -> str:
    return 'pe' if a < 0.8 else 'quadrada' if a <= 1.2 else 'deitada'


def usos_de(p: dict) -> dict:
    """Onde o preset vale: o marcado, ou o que a receita suporta (as telas de `formatos`, e "ator embaixo" se vale na
    dividida; as que repetem servem a 2 e 2+)."""
    if p.get('usos'):
        return p['usos']
    telas = p.get('formatos') or ['dividida', 'vertical']
    return {'telas': [*telas, 'atras'] if 'dividida' in telas else telas,
            'midias': ['2', '2+'] if p['receita'].get('repete') else [chave_midias(n_midias(p['receita']))]}


def serve(p: dict, n: int, tela: str | None = None, aspectos: list[float] | None = None) -> bool:
    """O número de mídias marcado (e a receita dá conta dele), o modo de tela e as proporções das mídias."""
    u = usos_de(p)
    r = p['receita']
    cabe = n >= 1 if r.get('repete') else 1 <= n <= n_midias(r)
    props = not aspectos or not u.get('proporcoes') or all(chave_proporcao(a) in u['proporcoes'] for a in aspectos)
    return cabe and props and chave_midias(n) in u['midias'] and (not tela or tela in u['telas'])


def situacao(tela: str, aspectos: list[float]) -> str:
    """A situação de um insert ("vertical:2", "dividida:1:pe"): com 1 mídia, também em pé ou deitada (a quadrada junto)."""
    n = len(aspectos)
    prop = (':pe' if chave_proporcao(aspectos[0]) == 'pe' else ':deitada') if n == 1 else ''
    return f'{tela}:{chave_midias(n)}{prop}'


def presets_para(lista: list[dict], formato: str, aspectos: list[float], atras: bool) -> list[dict]:
    """Os aprovados que servem ao insert, os do mesmo formato primeiro."""
    ok = [p for p in lista if p.get('aprovado') and serve(p, len(aspectos), 'atras' if atras else formato, aspectos)]
    return sorted(ok, key=lambda p: p['formato'] != formato)


def com_recomendados(lista: list[dict], o: dict | None) -> tuple[list[dict], list[dict]]:
    """Na ordem da situação: os favoritos que servem (Recomendados) e os outros (no fim, os de fora da ordem)."""
    if not o or not o.get('ids'):
        return [], lista
    pos = {pid: k for k, pid in enumerate(o['ids'])}
    todos = sorted(lista, key=lambda p: (pos.get(p['id'], len(o['ids'])), not p.get('aprovado')))
    fav = set(o['ids'][:o.get('favoritos', 0)])
    return [p for p in todos if p['id'] in fav], [p for p in todos if p['id'] not in fav]


# ---------------------------------------------------------------- os ajustes rápidos que o preset mostra (do 18: ajustes.ts)

def _estado(m: dict) -> dict:
    return m['de'] if 'de' in m else m['para']


def rapidos_de(p: dict) -> list[str]:
    """Os ajustes rápidos do preset: os marcados ou, sem marca, os deduzidos da receita (até 4); e o Som, se ele tem som."""
    r = p['receita']
    cs = r['cards']
    cheio = lambda c: c['repouso']['w'] >= 99 and c['repouso']['h'] >= 99  # noqa: E731
    desliza = lambda c: c['repouso']['w'] > 100 and abs(((c.get('saida') or {}).get('para') or {}).get('dx', 0)) >= 5 \
        and (((c.get('saida') or {}).get('para') or {}).get('escala', 1)) <= 1.05  # noqa: E731
    mergulho = lambda c: bool(c.get('saida')) and _estado(c['saida'])['escala'] > 1.05  # noqa: E731
    deduzidos = [
        any(desliza(c) for c in cs) and 'deslize',
        (len(cs) == 1 or r.get('repete')) and not any(c.get('quadros') for c in cs) and 'forma',
        any(c.get('entrada') for c in cs) and 'entrada',
        any(c.get('zoom') or mergulho(c) for c in cs) and 'zoom',
        any(mergulho(c) for c in cs) and 'zona',
        (len(cs) > 1 or r.get('repete')) and 'proximo',
        any(c.get('saida') for c in cs) and 'saida',
        any(c.get('entrada') and _estado(c['entrada'])['desfoque'] > 2 for c in cs) and 'desfoque',
        'camera',
        any(not cheio(c) for c in cs) and 'tamanho',
    ]
    ids = [x for x in (p.get('rapidos') if p.get('rapidos') is not None else [x for x in deduzidos if x][:4]) if x != 'som']
    return ids + ['som'] if any(s.get('som') for s in r.get('sons') or []) else ids


# ---------------------------------------------------------------- comandos

def aspectos_de(midias: list[dict]) -> list[float]:
    """A proporção (largura ÷ altura) de cada mídia, do item.json do banco (um trecho, a do original); sem medida, 16:9."""
    out = []
    for m in midias:
        i = banco.ler_item(m['banco']) if banco.existe(m['banco']) else {}
        out.append(i['largura'] / i['altura'] if i.get('largura') and i.get('altura') else 16 / 9)
    return out


def listar() -> None:
    o = ordem()
    aprovados = [p for p in biblioteca() if p.get('aprovado')]
    print(f'{len(aprovados)} presets aprovados (Vale em: telas · mídias · proporções; ★ = favorito na situação)\n')
    for p in aprovados:
        u = usos_de(p)
        props = ', '.join(NOME_PROPORCAO[x] for x in u.get('proporcoes') or []) or 'todas'
        sons = ', '.join(f"{s['momento']}: {s['som']}" for s in p['receita'].get('sons') or [] if s.get('som')) or 'sem som'
        fav = [f'{k}({v["ids"].index(p["id"]) + 1}º)' for k, v in o.items() if p['id'] in v['ids'][:v.get('favoritos', 0)]]
        print(f"{p['id']}  {p['nome']}")
        print(f"   {' / '.join(NOME_TELA.get(t, t) for t in u['telas'])} · {', '.join(u['midias'])} mídia(s) · {props} · a receita pede "
              f"{n_midias(p['receita'])}{' (repete)' if p['receita'].get('repete') else ''} · sons: {sons}")
        if p.get('descricao'):
            print(f"   {p['descricao']}")
        if fav:
            print(f"   ★ {', '.join(fav)}")


# a tela dividida padrão (impeccable v4 c1): o ator numa janela embaixo, como no Claude Code Apps
ATOR_JANELA = {'modo': 'janela', 'escala': 0.75, 'y': 1.0125, 'topo': 0.103}


def escolher(slug: str) -> None:
    edicao = ler(slug)
    lista, o = biblioteca(), ordem()
    mudou = False
    for x in (edicao.get('inserts') or {}).get('pedidos') or []:
        e = x.get('enriquecimento') or {}
        rotulo = f"{x['plano']:>4} {x['tipo']}"
        if not x.get('midias'):
            print(f'{rotulo}: sem mídia, fica sem preset')
            continue
        if x['formato'] == 'dividida' and not e.get('divisao'):
            # a tela dividida padrão: o ator na janela embaixo, a cabeça saindo por cima (05-enriquecimento.md)
            e = {**e, 'divisao': 'atras', 'ator': dict(ATOR_JANELA)}
            x['enriquecimento'] = e
            mudou = True
        if e.get('preset'):
            p = next((p for p in lista if p['id'] == e['preset']), None)
            print(f"{rotulo}: já tem {e['preset']} ({p['nome'] if p else 'apagado da biblioteca'})")
            continue
        aspectos = aspectos_de(x['midias'])
        atras = e.get('divisao') == 'atras'
        tela = 'atras' if atras else x['formato']
        sit = situacao(tela, aspectos)
        recomendados, outros = com_recomendados(presets_para(lista, x['formato'], aspectos, atras), o.get(sit))
        descricao = f"{NOME_TELA[tela]}, {len(aspectos)} mídia(s) {'/'.join(NOME_PROPORCAO[chave_proporcao(a)] for a in aspectos)}"
        if recomendados:
            p, motivo = recomendados[0], f'1º favorito de {sit} que serve'
        elif outros:
            p, motivo = outros[0], f'nenhum favorito de {sit} serve: o 1º da ordem' if o.get(sit) else f'{sit} sem ordem: o 1º aprovado que serve'
        else:
            print(f'{rotulo} ({descricao}): nenhum preset aprovado serve; fica sem preset')
            continue
        novo = {**e, 'preset': p['id']}
        # os ajustes que o preset novo não mostra sairiam escondidos: ficam só os dele (e os dois sliders)
        if e.get('ajustes'):
            fica = {k: v for k, v in e['ajustes'].items() if k in {*rapidos_de(p), 'y', 'largura'}}
            if fica:
                novo['ajustes'] = fica
            else:
                novo.pop('ajustes')
        x['enriquecimento'] = novo
        mudou = True
        print(f"{rotulo} ({descricao}): {p['id']} {p['nome']} — {motivo}")
    if mudou:
        gravar(slug, edicao)
        print(f'\nGravado em projetos/{slug}/edicao.json')
    else:
        print('\nNada a escolher.')


if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'listar':
        listar()
    elif len(sys.argv) >= 3 and sys.argv[1] == 'escolher':
        escolher(sys.argv[2])
    else:
        raise SystemExit(__doc__)
