# /// script
# requires-python = ">=3.11"
# ///
"""Um código curto e estável para cada coisa da biblioteca (e cada projeto), para o criador citar no chat.

    uv run ferramentas/codigo.py <código…>         resolve: tipo, id, nome, arquivo e um resumo útil
    uv run ferramentas/codigo.py listar [tipo]      os códigos (tipo: preset, motion, transicao, trilha, midia,
                                                    referencia, som, projeto, ou o prefixo: PRE, MOT…)

Prefixos: PRE presets · MOT motions · TRA transições · TRI trilhas · BAN mídias do banco (o trecho: BAN-012.2) ·
REF referências da Calibragem (um plano: REF-03·p7) · SOM sons · PRJ projetos (um plano: PRJ-02·p5; uma versão: PRJ-02·v3).
O registro é biblioteca/codigos.json ({código: {tipo, id}}): um código é dado uma vez, na ordem de criação, e nunca
muda nem é reaproveitado (o item apagado ou recusado leva o dele). `atribuir()` dá o próximo número aos itens novos;
quem lista (o servidor, este script) chama, sob uma trava de arquivo (sem corrida entre o servidor e o script).
Os planos (p7) e as versões (v3) não entram no registro: são os ids da direção da referência ou do projeto.
"""
import fcntl
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import BIBLIOTECA, PROJETOS, RAIZ, gravar_json, ler_json  # noqa: E402

REGISTRO = BIBLIOTECA / 'codigos.json'
PREFIXO = {'preset': 'PRE', 'motion': 'MOT', 'transicao': 'TRA', 'trilha': 'TRI', 'midia': 'BAN', 'referencia': 'REF',
           'som': 'SOM', 'projeto': 'PRJ'}
TIPO = {v: k for k, v in PREFIXO.items()}
NOME_TIPO = {'preset': 'preset', 'motion': 'motion', 'transicao': 'transição', 'trilha': 'trilha', 'midia': 'mídia do banco',
             'trecho': 'trecho de mídia do banco', 'referencia': 'referência da Calibragem', 'som': 'som', 'projeto': 'projeto'}
CODIGO = re.compile(r'(PRE|MOT|TRA|TRI|BAN|REF|SOM|PRJ)-?(\d+)(?:\.(\d+))?(?:\s*[·.:/ ]\s*([pv])(\d+))?', re.I)  # o resto (o nome) é ignorado
PLANOS = {'full_ator': 'Full ator', 'full_ator_lettering': 'Full ator + lettering', 'insert_tela_cheia': 'Insert tela cheia',
          'motion_tela_cheia': 'Motion tela cheia', 'tela_dividida_insert': 'Tela dividida · insert',
          'tela_dividida_motion': 'Tela dividida · motion', 'comentario_insert_ator': 'Comentário + insert + ator'}
JSON_DO_MOTION = re.compile(r'<script type="application/json" id="preset">(.*?)</script>', re.DOTALL)


def codigo(prefixo: str, n: int, sub: int | None = None) -> str:
    return f'{prefixo}-{n:0{3 if prefixo == "BAN" else 2}d}' + (f'.{sub}' if sub else '')


def _criado(arq: Path, iso: str | None = None) -> str:
    """A data de criação: a do JSON, senão a do arquivo (st_birthtime no Mac)."""
    if iso:
        return iso
    st = arq.stat()
    return datetime.fromtimestamp(getattr(st, 'st_birthtime', st.st_mtime)).isoformat(timespec='seconds')


def dados_motion(arq: Path) -> dict:
    m = JSON_DO_MOTION.search(arq.read_text(encoding='utf-8'))
    try:
        return json.loads(m.group(1)) if m else {}
    except ValueError:
        return {}


def existentes() -> dict[str, list[tuple[str, str]]]:
    """Os itens que existem hoje, por tipo, como (id, criado), na ordem de criação; os trechos do banco como
    ('pai/id', criado)."""
    out: dict[str, list[tuple[str, str]]] = {t: [] for t in PREFIXO}
    out['trecho'] = []
    for a in (BIBLIOTECA / 'presets').glob('*.json'):
        if a.name != 'ordem.json':
            p = ler_json(a, {}) or {}
            out['preset'].append((a.stem, _criado(a, p.get('criado_em'))))
    for a in (BIBLIOTECA / 'motions' / 'presets').glob('*.html'):
        out['motion'].append((a.stem, _criado(a, dados_motion(a).get('criado_em'))))
    for a in (BIBLIOTECA / 'transicoes').glob('*.json'):
        if a.name not in ('ordem.json', 'pares.json'):
            out['transicao'].append((a.stem, _criado(a, (ler_json(a, {}) or {}).get('criado_em'))))
    cat = ler_json(BIBLIOTECA / 'trilhas' / 'catalogo.json', {}) or {}
    out['trilha'] = [(f['id'], f'{k:06d}') for k, f in enumerate(cat.get('faixas', cat) if isinstance(cat, dict) else cat)]
    out['som'] = [(s['id'], f'{k:06d}') for k, s in enumerate(ler_json(BIBLIOTECA / 'sons' / 'catalogo.json', []) or [])]
    for a in (BIBLIOTECA / 'banco').glob('*/item.json'):
        i = ler_json(a, {}) or {}
        if i.get('pai'):
            out['trecho'].append((f'{i["pai"]}/{a.parent.name}', _criado(a, i.get('criado_em'))))
        else:
            out['midia'].append((a.parent.name, _criado(a, i.get('criado_em'))))
    for a in (BIBLIOTECA / 'referencias').glob('*/referencia.json'):
        out['referencia'].append((a.parent.name, _criado(a, (ler_json(a, {}) or {}).get('criado_em'))))
    for a in PROJETOS.glob('*/edicao.json'):
        out['projeto'].append((a.parent.name, _criado(a, (ler_json(a, {}) or {}).get('criado_em'))))
    for l in out.values():
        l.sort(key=lambda x: (x[1], x[0]))
    return out


def atribuir() -> dict:
    """O registro, com os itens novos numerados (o próximo número depois do maior já dado). Sob a trava de
    biblioteca/: o servidor (várias threads) e o script podem chamar ao mesmo tempo."""
    fd = os.open(BIBLIOTECA, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        reg = ler_json(REGISTRO, {}) or {}
        reg = {c: v for c, v in reg.items() if CODIGO.match(c)}  # um tipo que deixou de existir (os CTAs, que viraram projetos) sai
        tem = {(v['tipo'], v['id']) for v in reg.values()}
        maior: dict[str, int] = {}
        sub: dict[str, int] = {}  # o maior trecho dado em cada mídia (pelo código dela)
        for c in reg:
            m = CODIGO.match(c)
            maior[m.group(1)] = max(maior.get(m.group(1), 0), int(m.group(2)))
            if m.group(3):
                base = codigo(m.group(1), int(m.group(2)))
                sub[base] = max(sub.get(base, 0), int(m.group(3)))
        novos = 0
        ex = existentes()
        for tipo, prefixo in PREFIXO.items():
            for id_, _ in ex[tipo]:
                if (tipo, id_) not in tem:
                    maior[prefixo] = maior.get(prefixo, 0) + 1
                    reg[codigo(prefixo, maior[prefixo])] = {'tipo': tipo, 'id': id_}
                    tem.add((tipo, id_))
                    novos += 1
        do_banco = {v['id']: c for c, v in reg.items() if v['tipo'] == 'midia'}
        for chave, _ in ex['trecho']:
            pai, id_ = chave.split('/')
            if ('trecho', id_) in tem or pai not in do_banco:
                continue
            base = do_banco[pai]
            sub[base] = sub.get(base, 0) + 1
            reg[f'{base}.{sub[base]}'] = {'tipo': 'trecho', 'id': id_, 'pai': pai}
            tem.add(('trecho', id_))
            novos += 1
        if novos:
            def ordem(c):
                m = CODIGO.match(c)
                return (list(TIPO).index(m.group(1)), int(m.group(2)), int(m.group(3) or 0))
            reg = {c: reg[c] for c in sorted(reg, key=ordem)}
            gravar_json(REGISTRO, reg)
        return reg
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def mapa() -> dict[str, dict[str, str]]:
    """{tipo: {id: código}} (os trechos ficam junto das mídias): o que o app usa para mostrar os códigos."""
    out: dict[str, dict[str, str]] = {t: {} for t in PREFIXO}
    for c, v in atribuir().items():
        out['midia' if v['tipo'] == 'trecho' else v['tipo']][v['id']] = c
    return out


# ---------------------------------------------------------------- resolver

def tempo(t: float) -> str:
    d = int(max(0.0, t or 0) * 10 + 1e-6)
    return f'{d // 600}:{(d % 600) // 10:02d},{d % 10}'


def rel(p: Path) -> str:
    return str(p.relative_to(RAIZ))


def fala_entre(palavras: list[dict], a: float, b: float) -> str:
    return ' '.join(w['texto'] for w in palavras if (w.get('fim') or 0) > a + 0.01 and (w.get('ini', w.get('inicio')) or 0) < b)


def nome_de(tipo: str, id_: str) -> str:
    """O nome de um item (o que o botão copiar põe depois do código)."""
    if tipo == 'preset':
        a = BIBLIOTECA / 'presets' / f'{id_}.json'
        p = ler_json(a if a.is_file() else BIBLIOTECA / 'presets' / '_recusados' / f'{id_}.json', {}) or {}
        return p.get('nome') or id_
    if tipo == 'motion':
        a = BIBLIOTECA / 'motions' / 'presets' / f'{id_}.html'
        a = a if a.is_file() else BIBLIOTECA / 'motions' / 'presets' / '_recusados' / f'{id_}.html'
        return (dados_motion(a).get('nome') if a.is_file() else None) or id_
    if tipo == 'transicao':
        return (ler_json(BIBLIOTECA / 'transicoes' / f'{id_}.json', {}) or {}).get('nome') or id_
    if tipo in ('midia', 'trecho'):
        return (ler_json(BIBLIOTECA / 'banco' / id_ / 'item.json', {}) or {}).get('nome') or id_
    if tipo == 'referencia':
        return (ler_json(BIBLIOTECA / 'referencias' / id_ / 'referencia.json', {}) or {}).get('nome') or id_
    if tipo == 'projeto':
        return (ler_json(PROJETOS / id_ / 'edicao.json', {}) or {}).get('nome') or id_
    if tipo == 'trilha':
        cat = ler_json(BIBLIOTECA / 'trilhas' / 'catalogo.json', {}) or {}
        return next((f.get('nome') for f in (cat.get('faixas', cat) if isinstance(cat, dict) else cat) if f['id'] == id_), id_)
    if tipo == 'som':
        return next((s.get('nome') for s in ler_json(BIBLIOTECA / 'sons' / 'catalogo.json', []) or [] if s['id'] == id_), id_)
    return id_


def usos_projetos(campo) -> list[str]:
    """`projeto/plano` dos projetos em que `campo(edicao)` acha o item."""
    out = []
    for a in sorted(PROJETOS.glob('*/edicao.json')):
        out += [f'{a.parent.name}/{x}' for x in campo(ler_json(a, {}) or {})]
    return out


def resumo_preset(id_: str, reg_inv: dict) -> list[str]:
    import presets as P
    a = BIBLIOTECA / 'presets' / f'{id_}.json'
    recusado = not a.is_file()
    if recusado:
        a = BIBLIOTECA / 'presets' / '_recusados' / f'{id_}.json'
    p = ler_json(a, {}) or {}
    u = P.usos_de(p)
    props = ', '.join(P.NOME_PROPORCAO.get(x, x) for x in u.get('proporcoes') or []) or 'todas'
    estado = f'RECUSADO em {p.get("recusado_em")}' + (f' — motivo: {p["motivo"]}' if p.get('motivo') else '') if recusado \
        else 'aprovado' if p.get('aprovado') else 'a revisar'
    ordem = ler_json(BIBLIOTECA / 'presets' / 'ordem.json', {}) or {}
    fav = [f'{k} ({v["ids"].index(id_) + 1}º)' for k, v in ordem.items() if id_ in v.get('ids', [])[:v.get('favoritos', 0)]]
    usos = usos_projetos(lambda e: [x.get('plano') for x in (e.get('inserts') or {}).get('pedidos') or []
                                    if (x.get('enriquecimento') or {}).get('preset') == id_])
    return [f'estado: {estado}',
            f'vale em: {" / ".join(P.NOME_TELA.get(t, t) for t in u["telas"])} · {", ".join(u["midias"])} mídia(s) · proporções: {props}',
            (f'nº de mídias da receita: {P.n_midias(p["receita"])}{" (repete)" if p["receita"].get("repete") else ""} · '
             f'duração da referência: {p["receita"].get("duracao_ref")} s'),
            *([f'descrição: {p["descricao"]}'] if p.get('descricao') else []),
            f'favorito em: {", ".join(fav) or "nenhuma situação"}',
            f'usado em: {", ".join(usos) or "nenhum projeto"}']


def presets_do_plano(ref: str, ini: float, fim: float) -> str:
    """Os presets que nasceram deste trecho da referência (`fontes` do preset sobre o plano, com ±0,5 s, como a galeria)."""
    reg = {(v['tipo'], v['id']): c for c, v in (ler_json(REGISTRO, {}) or {}).items()}
    achados = []
    for arq in sorted((BIBLIOTECA / 'presets').glob('*.json')):
        p = ler_json(arq, {}) or {}
        if not isinstance(p, dict) or not p.get('receita'):
            continue
        if any(f.get('ref') == ref and f.get('inicio', 0) < fim + 0.5 and f.get('fim', 0) > ini - 0.5 for f in p.get('fontes') or []):
            achados.append(f'{reg.get(("preset", arq.stem), arq.stem)} {p.get("nome") or ""}'.strip())
    return ' · '.join(achados)


def resolver(texto: str) -> None:
    m = CODIGO.match(texto.strip().lstrip('@').replace(' · ', '·'))  # o @ do comentário (a marcação do app)
    if not m:
        raise SystemExit(f'{texto}: não é um código (ex.: PRE-07, BAN-012.2, REF-03·p7, PRJ-02·v3).')
    prefixo, n, trecho, letra, k = m.group(1).upper(), int(m.group(2)), m.group(3), (m.group(4) or '').lower(), m.group(5)
    reg = atribuir()
    cod = codigo(prefixo, n, int(trecho) if trecho else None)
    item = reg.get(cod)
    if not item:
        raise SystemExit(f'{cod}: não existe (veja `codigo.py listar {TIPO[prefixo]}`).')
    tipo, id_ = item['tipo'], item['id']
    print(f'{cod} · {nome_de(tipo, id_)}\n  tipo: {NOME_TIPO[tipo]} · id: {id_}')
    linhas: list[str] = []
    if tipo == 'preset':
        a = BIBLIOTECA / 'presets' / f'{id_}.json'
        linhas = [f'arquivo: {rel(a if a.is_file() else BIBLIOTECA / "presets" / "_recusados" / f"{id_}.json")}', *resumo_preset(id_, reg)]
    elif tipo == 'motion':
        a = BIBLIOTECA / 'motions' / 'presets' / f'{id_}.html'
        recusado = not a.is_file()
        a = BIBLIOTECA / 'motions' / 'presets' / '_recusados' / f'{id_}.html' if recusado else a
        d = dados_motion(a) if a.is_file() else {}
        usos = usos_projetos(lambda e: [k for k, x in (e.get('motions') or {}).items() if x.get('preset') == id_])
        linhas = [f'arquivo: {rel(a)}',
                  'estado: ' + (f'RECUSADO em {d.get("recusado_em")}' + (f' — motivo: {d["motivo"]}' if d.get('motivo') else '') if recusado
                                else 'a revisar' if d.get('a_revisar') else 'aprovado'),
                  f'descrição: {d.get("descricao", "")}', f'duração: {d.get("duracao")} s · fundo: {d.get("fundo")}',
                  f'usado em: {", ".join(usos) or "nenhum projeto"}']
    elif tipo == 'transicao':
        a = BIBLIOTECA / 'transicoes' / f'{id_}.json'
        t = ler_json(a, {}) or {}
        linhas = [f'arquivo: {rel(a)}', f'estado: {"aprovada" if t.get("aprovado") else "a revisar"}',
                  f'efeito: {json.dumps(t.get("efeito"), ensure_ascii=False)} · som: {json.dumps(t.get("som"), ensure_ascii=False)}',
                  f'descrição: {t.get("descricao", "")}']
    elif tipo == 'trilha':
        cat = ler_json(BIBLIOTECA / 'trilhas' / 'catalogo.json', {}) or {}
        f = next(x for x in (cat.get('faixas', cat) if isinstance(cat, dict) else cat) if x['id'] == id_)
        linhas = [f'arquivo: biblioteca/trilhas/{f.get("arquivo") or id_ + ".m4a"}', f'clima: {f.get("clima")} · {f.get("bpm")} BPM · {f.get("duracao")} s']
    elif tipo == 'som':
        s = next(x for x in ler_json(BIBLIOTECA / 'sons' / 'catalogo.json', []) if x['id'] == id_)
        linhas = [f'arquivo: biblioteca/sons/{id_}.m4a', f'família: {s.get("familia")} · {s.get("duracao")} s']
    elif tipo in ('midia', 'trecho'):
        import banco as B
        i = B.ler_item(id_)
        base = BIBLIOTECA / 'banco' / (i.get('pai') or id_)
        usos = B.usos().get(id_, [])
        linhas = [f'arquivo: {rel(base / (i.get("arquivo") or "miniatura.jpg"))} · miniatura: {rel(base / "miniatura.jpg")}',
                  f'{i.get("tipo")} {i.get("formato")} · {i.get("largura")}×{i.get("altura")}' + (f' · {i.get("duracao")} s' if i.get('duracao') else ''),
                  *([f'trecho de {reg_codigo(reg, "midia", i["pai"])} «{i.get("nome_pai")}» · {tempo(i["inicio"])}–{tempo(i["fim"])}'] if i.get('pai') else []),
                  f'descrição: {i.get("descricao") or "—"}', f'palavras: {", ".join(i.get("palavras") or []) or "—"}',
                  f'usado em: {", ".join(usos) or "nenhum projeto"}']
    elif tipo == 'referencia':
        base = BIBLIOTECA / 'referencias' / id_
        r = ler_json(base / 'referencia.json', {}) or {}
        itens = (ler_json(base / 'direcao.json', {}) or {}).get('itens') or []
        planos = sorted((x for x in itens if x.get('camada') == 'plano'), key=lambda x: x['inicio'])
        if letra == 'p':
            q = next((x for x in planos if re.fullmatch(rf'p0*{int(k)}', x['id'])), None)
            if not q:
                raise SystemExit(f'{cod} não tem o plano p{k} (planos: {", ".join(x["id"] for x in planos)}).')
            pal = ler_json(base / 'palavras.json', []) or []
            pal = pal.get('palavras', pal) if isinstance(pal, dict) else pal
            pal = [{'texto': w['texto'], 'ini': w.get('inicio', w.get('ini')), 'fim': w['fim']} for w in pal]
            els = [x for x in itens if x.get('camada') == 'elemento' and x['fim'] > q['inicio'] and x['inicio'] < q['fim']]
            print(f'  plano {q["id"]} ({planos.index(q) + 1} de {len(planos)}): {PLANOS.get(q["tipo"], q["tipo"])}')
            linhas = [f'vídeo: {rel(base / "proxy.mp4")} · {tempo(q["inicio"])}–{tempo(q["fim"])} ({q["fim"] - q["inicio"]:.2f} s)',
                      f'marcação: {q.get("descricao") or "—"}', *([f'texto na tela: {q["texto"]}'] if q.get('texto') else []),
                      f'fala: “{fala_entre(pal, q["inicio"], q["fim"])}”',
                      *(['elementos: ' + '; '.join(f'{e["tipo"]} {tempo(e["inicio"])}' + (f' “{e["texto"]}”' if e.get('texto') else '') for e in els)] if els else []),
                      *([f'miniatura: {rel(base / q["miniatura"])}'] if q.get('miniatura') else []),
                      *([f'virou preset: {v}'] if (v := presets_do_plano(id_, q['inicio'], q['fim'])) else [])]
        else:
            linhas = [f'pasta: {rel(base)} · vídeo: {rel(base / "proxy.mp4")}',
                      f'estado: {r.get("status")} · {(r.get("video") or {}).get("duracao")} s · {len(planos)} planos',
                      'planos: ' + ' '.join(f'{x["id"]}={x["tipo"]}' for x in planos)]
    elif tipo == 'projeto':
        p = PROJETOS / id_
        vs = sorted(int(v.name[1:]) for v in p.glob('versoes/v*') if v.name[1:].isdigit() and (v / 'proxy.mp4').is_file())
        if letra == 'v':
            v = int(k)
            if v not in vs:
                raise SystemExit(f'{cod} não tem a v{v} (versões: {", ".join(f"v{x}" for x in vs) or "nenhuma"}).')
            info = ler_json(p / 'versoes' / f'v{v}' / 'info.json', {}) or {}
            rev = ler_json(p / 'revisoes' / f'v{v}.json', {}) or {}
            cs = [c for c in rev.get('comentarios', []) if (c.get('texto') or '').strip() or c.get('anexos')]
            print(f'  versão v{v}{" (a última)" if v == vs[-1] else ""}')
            linhas = [f'vídeo: {rel(p / "versoes" / f"v{v}" / "proxy.mp4")} · {info.get("duracao")} s · render em {info.get("criado_em")}',
                      f'revisão: {rel(p / "revisoes" / f"v{v}.json")} · ' + ('aprovada' if rev.get('aprovado') else 'enviada' if rev.get('enviado_em')
                                                                             else 'em revisão' if cs else 'sem revisão') + f' · {len(cs)} comentários',
                      *([f'o que mudou: {info["resumo"]}'] if info.get('resumo') else [])]
        elif letra == 'p':
            if not vs:
                raise SystemExit(f'{cod} ainda não tem versão (os planos vêm da última).')
            vdir = p / 'versoes' / f'v{vs[-1]}'
            planos = ler_json(vdir / 'planos.json', []) or []
            planos = planos.get('planos', planos) if isinstance(planos, dict) else planos
            q = next((x for x in planos if re.fullmatch(rf'p0*{int(k)}', str(x['id']))), None)
            if not q:
                raise SystemExit(f'{cod} não tem o plano p{k} na v{vs[-1]} (planos: {", ".join(x["id"] for x in planos)}).')
            pal = ler_json(vdir / 'palavras.json', []) or []
            pal = pal.get('palavras', pal) if isinstance(pal, dict) else pal
            ed = ler_json(p / 'edicao.json', {}) or {}
            pedido = next((x for x in (ed.get('inserts') or {}).get('pedidos') or [] if x.get('plano') == q['id']), None)
            motion = (ed.get('motions') or {}).get(q['id'])
            mid = [f'{reg_codigo(reg, "midia", x["banco"])} {nome_de("midia", x["banco"])}' for x in (pedido or {}).get('midias') or [] if x.get('banco')]
            pre = (pedido or {}).get('enriquecimento', {}).get('preset')
            print(f'  plano {q["id"]} da v{vs[-1]} (a última): {PLANOS.get(q["tipo"], q["tipo"])}')
            linhas = [f'tempo na v{vs[-1]}: {tempo(q["ini"])}–{tempo(q["fim"])} ({q["fim"] - q["ini"]:.2f} s) · vídeo: {rel(vdir / "proxy.mp4")}',
                      f'marcação: {q.get("descricao") or "—"}', *([f'texto na tela: {q["texto"]}'] if q.get('texto') else []),
                      f'fala: “{fala_entre(pal, q["ini"], q["fim"])}”',
                      f'mídias: {"; ".join(mid) or "nenhuma"}',
                      *([f'preset: {reg_codigo(reg, "preset", pre)} {nome_de("preset", pre)}'] if pre else []),
                      *([f'motion: {reg_codigo(reg, "motion", motion.get("preset"))} {motion.get("nome")}' if motion.get('preset') else f'motion: {motion}'] if motion else []),
                      f'edição: {rel(p / "edicao.json")} · roteiro: {rel(p / "roteiro.md")}']
        else:
            ed = ler_json(p / 'edicao.json', {}) or {}
            linhas = [f'pasta: {rel(p)} · edição: {rel(p / "edicao.json")}',
                      f'versões: {", ".join(f"v{x}" for x in vs) or "nenhuma"} · criado em {ed.get("criado_em")}']
    for l in linhas:
        print(f'  {l}')


def reg_codigo(reg: dict, tipo: str, id_: str | None) -> str:
    return next((c for c, v in reg.items() if v['tipo'] == tipo and v['id'] == id_), '?')


def listar(filtro: str | None) -> None:
    tipo = TIPO.get((filtro or '').upper(), filtro)
    if filtro and tipo not in PREFIXO:
        raise SystemExit(f'Tipo desconhecido: {filtro} (use {", ".join(PREFIXO)} ou {", ".join(TIPO)}).')
    for c, v in atribuir().items():
        if not tipo or v['tipo'] == tipo or (tipo == 'midia' and v['tipo'] == 'trecho'):
            print(f'{c:12} {nome_de(v["tipo"], v["id"])}  ({v["id"]})')


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    if args[0] == 'listar':
        listar(args[1] if len(args) > 1 else None)
    else:
        for k, a in enumerate(args):
            if k:
                print()
            resolver(a)
