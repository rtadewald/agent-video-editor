# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Cortes: o Claude escolhe quais palavras ficam (por ID); o código monta os clipes da V1 com as bordas nos silêncios reais
e as pausas longas cortadas (do 18: backend/app/cortes.py, sem a LLM).

    uv run ferramentas/cortes.py texto <slug>                    a transcrição, uma palavra por linha (ID<TAB>texto) + pausas
    uv run ferramentas/cortes.py aplicar <slug> <selecao.json>   {"manter": [["w00004","w00011"], …], "duvidas": [{ini, fim, motivo}],
                                                                  "mover": [{"trecho": [ini, fim], "antes_de": id}],
                                                                  "finais": [{"destino": "ManyChat", "manter": [[…], …], "mover": […]}, …]}

As saídas (corpo + final; edicao.json → `saidas`): `manter` é o CORPO, o que é comum a todas, até a última palavra comum;
cada final falado (gravado na mesma tomada: "comente X", "o prompt está na descrição") é uma faixa de palavras depois
dele. Um CTA gravado à parte é outro projeto (categoria CTA) que entra depois do corpo; "nenhum" é o corpo puro.
    uv run ferramentas/cortes.py saida <slug> "<Destino>" --falado w00215..w00225[,w00249..w00260]
    uv run ferramentas/cortes.py saida <slug> "<Destino>" --cta <slug do CTA> [--transicao <id>]
    uv run ferramentas/cortes.py saida <slug> "<Destino>" --nenhum
    uv run ferramentas/cortes.py tirar-saida <slug> <id>
    uv run ferramentas/cortes.py saidas <slug>                   as saídas (destino, final, aprovada, exportada)
"""
import json
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import gravar, ler, ler_json, pasta  # noqa: E402

PAUSA_NO_TEXTO = 0.3  # todas as pausas detectadas aparecem: recomeços seguidos têm pausas de ~0,4 s
JANELA_ANTES, JANELA_DEPOIS = 0.5, 0.35  # quão longe da borda da palavra o silêncio pode estar (o ASR erra ~0,2 s)
# pausa dentro de um trecho mantido só é cortada se passar de `pausa_max`; `folga_inicio`/`folga_fim`: o ar que fica antes
# da primeira palavra e depois da última de cada trecho (do 18: os padrões das Configurações)
PARAMETROS = {'pausa_max': 2.0, 'folga_inicio': 0.1, 'folga_fim': 0.1}
VELOCIDADE = (1.0, 1.5)


# ---------------------------------------------------------------- dados do projeto

def palavras(slug: str) -> list[dict]:
    t = ler_json(pasta(slug) / 'transcricao.json')
    if not t or not t.get('palavras'):
        raise SystemExit(f'O projeto {slug} não tem transcricao.json (rode preparar.py).')
    return t['palavras']


def silencios(slug: str) -> list[dict]:
    return (ler_json(pasta(slug) / 'silencios.json') or {}).get('silencios', [])


def velocidade(edicao: dict) -> float:
    """A aceleração do ator (1 a 1,5; do 18: projeto.velocidade)."""
    try:
        v = float(edicao.get('velocidade') or 1)
    except (TypeError, ValueError):
        v = 1.0
    return round(min(max(v, VELOCIDADE[0]), VELOCIDADE[1]), 3)


def ordem(c: dict) -> float:
    """Onde o clipe toca: no seu tempo do bruto, ou em `ordem` (um trecho movido, só a pedido do criador)."""
    return c.get('ordem', c['inicio'])


def v1_tocada(edicao: dict) -> list[dict]:
    """Os clipes da V1 em ordem, cada um com a aceleração (`vel`) (do 18: projeto.v1_tocada)."""
    v = velocidade(edicao)
    return [{**c, 'vel': v} for c in sorted((edicao.get('timeline') or {}).get('V1') or [], key=ordem)]


def dur_saida(c: dict) -> float:
    return (c['fim'] - c['inicio']) / c.get('vel', 1)


def mmss(t: float) -> str:
    return f'{int(t // 60)}:{int(t % 60):02d}'


def seg(t: float) -> str:
    return f'{int(t // 60)}:{t % 60:04.1f}'.replace('.', ',')


def num(x: float, casas: int = 2) -> str:
    return f'{x:.{casas}f}'.replace('.', ',')


# ---------------------------------------------------------------- o texto para o Claude decidir

def linhas(palavras: list[dict], silencios: list[dict]) -> str:
    """Uma palavra por linha (ID<TAB>texto), com `[pausa N.Ns]` nas pausas reais (do 18: cortes._linhas)."""
    pausas = iter(s for s in silencios if s['dur'] >= PAUSA_NO_TEXTO)
    prox, out = next(pausas, None), []
    for p in palavras:
        while prox and p['inicio'] >= prox['inicio'] - 0.05:
            out.append(f'[pausa {prox["dur"]:.1f}s]')
            prox = next(pausas, None)
        out.append(f'{p["id"]}\t{p["texto"]}')
    return '\n'.join(out)


# ---------------------------------------------------------------- a seleção → clipes

def validar(manter: list, palavras: list[dict]) -> list[list[str]]:
    """IDs existem, intervalos em ordem e sem sobreposição, seleção não vazia."""
    pos = {p['id']: i for i, p in enumerate(palavras)}
    ultimo, out = -1, []
    for t in manter:
        if not (isinstance(t, (list, tuple)) and len(t) == 2):
            raise SystemExit(f'Cada trecho de "manter" é [ini, fim]: {t!r}')
        ini, fim = t
        if ini not in pos or fim not in pos:
            raise SystemExit(f'ID que não existe na transcrição: {ini}..{fim}')
        a, b = pos[ini], pos[fim]
        if b < a or a <= ultimo:
            raise SystemExit(f'Intervalo invertido, fora de ordem ou sobreposto: {ini}..{fim}')
        out.append([ini, fim])
        ultimo = b
    if not out:
        raise SystemExit('A seleção não mantém nenhuma palavra.')
    return out


def mantidas_por_indice(palavras: list[dict], mantidas: list[list[str]]) -> list[bool]:
    pos = {p['id']: i for i, p in enumerate(palavras)}
    fica = [False] * len(palavras)
    for ini, fim in mantidas:
        for i in range(pos[ini], pos[fim] + 1):
            fica[i] = True
    return fica


def montar_clipes(palavras: list[dict], fica: list[bool], silencios: list[dict], duracao: float,
                  pausa_max: float = PARAMETROS['pausa_max'],
                  folga_inicio: float = PARAMETROS['folga_inicio'], folga_fim: float = PARAMETROS['folga_fim']) -> list[dict]:
    """Transforma as palavras mantidas em clipes da V1 (tempo do bruto). Do 18: cortes.montar_clipes, sem mudanças."""

    # `lim` é a palavra removida vizinha: a borda nunca invade o áudio dela
    def inicio(t: float, lim: float) -> float:
        c = [s for s in silencios if t - JANELA_ANTES <= s['fim'] <= t + JANELA_DEPOIS and s['inicio'] >= lim - 0.02]
        if not c:
            return max(t - folga_inicio, min(lim, t))
        s = min(c, key=lambda s: abs(s['fim'] - t))
        return max(s['fim'] - min(folga_inicio, s['dur']), s['inicio'], min(lim, t))

    def fim(t: float, lim: float) -> float:
        c = [s for s in silencios if t - JANELA_DEPOIS <= s['inicio'] <= t + JANELA_ANTES and s['inicio'] <= lim + 0.02]
        if not c:
            return min(t + folga_fim, max(lim, t), duracao)
        s = min(c, key=lambda s: abs(s['inicio'] - t))
        return min(s['inicio'] + min(folga_fim, s['dur']), s['fim'], max(lim, t))

    # uma pausa longa entre duas palavras mantidas parte o trecho em dois (o vão entre elas ou um silêncio longo detectado)
    def pausa_longa(k: int) -> bool:
        p, q = palavras[k], palavras[k + 1]
        return q['inicio'] - p['fim'] >= pausa_max or any(
            s['dur'] >= pausa_max and s['inicio'] >= p['inicio'] and s['fim'] <= q['fim'] for s in silencios)

    intervalos: list[list[float]] = []
    i = 0
    while i < len(palavras):
        if not fica[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(palavras) and fica[j + 1] and not pausa_longa(j):
            j += 1
        lim_a = palavras[i - 1]['fim'] if i > 0 else 0.0
        lim_b = palavras[j + 1]['inicio'] if j + 1 < len(palavras) else duracao
        a = inicio(palavras[i]['inicio'], lim_a)
        b = fim(palavras[j]['fim'], lim_b)
        # uma palavra fraca na borda (o "e" quase sem voz) cai dentro de um silêncio detectado e a borda no silêncio a
        # deixava de fora, sem aviso (vsl-isca-fid v15 c4): a borda recua até incluí-la
        pi, pj = palavras[i], palavras[j]
        if (pi['inicio'] + pi['fim']) / 2 < a:
            a = max(pi['inicio'] - 0.04, min(lim_a, pi['inicio']))
        if (pj['inicio'] + pj['fim']) / 2 > b:
            b = min(pj['fim'] + 0.04, max(lim_b, pj['fim']))
        # o contrário: o transcritor esticou a palavra da borda por cima do silêncio que vem depois dela ("chat." de 73,8 a
        # 76,6 s com a voz acabando em 74,1; PRJ-34 v2 c3, v3 c2) e o clipe levava o silêncio junto. Um silêncio de pelo
        # menos `pausa_max` dentro da palavra é sobra, não voz fraca (o "s" final ocupa bem menos): a borda vai até a voz
        for s in silencios:
            if pj['inicio'] + 0.08 <= s['inicio'] < b and min(s['fim'], pj['fim']) - s['inicio'] >= pausa_max:
                b = min(b, s['inicio'] + folga_fim)
            if a < s['fim'] <= pi['fim'] - 0.08 and s['fim'] - max(s['inicio'], pi['inicio']) >= pausa_max:
                a = max(a, s['fim'] - folga_inicio)
        if intervalos and a <= intervalos[-1][1] + 0.02:  # nada relevante entre os dois: junta
            intervalos[-1][1] = b
        else:
            intervalos.append([a, b])
        i = j + 1

    clipes = []
    for a, b in intervalos:
        # a palavra conta se o meio dela está no clipe ou, numa palavra esticada que a borda aparou, se ela entra nele
        dentro = [p for p, ok in zip(palavras, fica) if ok and (a <= (p['inicio'] + p['fim']) / 2 <= b
                                                               or min(p['fim'], b) - max(p['inicio'], a) >= 0.05)]
        if not dentro:
            continue
        clipes.append({'id': f'c{len(clipes) + 1}', 'fonte': 'f1', 'inicio': round(a, 3), 'fim': round(b, 3),
                       'palavra_ini': dentro[0]['id'], 'palavra_fim': dentro[-1]['id']})
    return clipes


def lacunas(clipes: list[dict], duracao: float) -> list[tuple[dict | None, dict | None]]:
    """Os cortes entre os clipes (e antes do 1º e depois do último), como a tela do 18 conta (preprocessamento/cortes.ts)."""
    cs = sorted(clipes, key=lambda c: c['inicio'])
    if not cs:
        return []
    out = [(None, cs[0])] if cs[0]['inicio'] > 0.05 else []
    out += [(a, b) for a, b in zip(cs, cs[1:]) if b['inicio'] - a['fim'] > 0.001]
    if duracao - cs[-1]['fim'] > 0.05:
        out.append((cs[-1], None))
    return out


def resumo(edicao: dict, palavras: list[dict], fica: list[bool]) -> str:
    """Bruto → final, nº de cortes e o texto de cada trecho, com o que saiu antes dele ~riscado~."""
    duracao = edicao['fontes'][0]['duracao']
    clipes = v1_tocada(edicao)
    total = sum(dur_saida(c) for c in clipes)
    vel = velocidade(edicao)
    pos = {p['id']: i for i, p in enumerate(palavras)}
    cortes = lacunas(clipes, duracao)
    saem = fica.count(False)
    out = [f'Bruto {mmss(duracao)} → {mmss(total)} ({num(total, 1)} s{f", velocidade {num(vel)}×" if vel != 1 else ""}) · '
           f'{len(cortes)} cortes · {len(palavras) - saem} palavras ficam, {saem} saem', '']
    t, ultimo = 0.0, -1
    for c in clipes:
        a, b = pos[c['palavra_ini']], pos[c['palavra_fim']]
        fora = [p['texto'] for p, ok in zip(palavras[ultimo + 1:a], fica[ultimo + 1:a]) if not ok]
        if 'ordem' in c:
            out.append('      ↷ movido para cá (gravado depois)')
        elif c is not clipes[0] and 'ordem' in clipes[clipes.index(c) - 1]:
            out.append('      ↩ volta à ordem da fala')
        elif c is not clipes[0] or c['inicio'] > 0.05:
            ant_fim = clipes[clipes.index(c) - 1]['fim'] if c is not clipes[0] else 0.0
            out.append(f'      ✂ −{num(c["inicio"] - ant_fim)} s' + (f'  ~{" ".join(fora)}~' if fora else ' (pausa)'))
        texto = []
        for p, ok in zip(palavras[a:b + 1], fica[a:b + 1]):  # palavras de dentro que saíram (raro: fica junto na mesma borda)
            texto.append(p['texto'] if ok else f'~{p["texto"]}~')
        out.append(f'{c["id"]:>4}  {seg(t)}  {" ".join(texto)}')
        t += dur_saida(c)
        ultimo = max(ultimo, b)
    resto = [p['texto'] for p, ok in zip(palavras[ultimo + 1:], fica[ultimo + 1:]) if not ok]
    if clipes and (resto or duracao - clipes[-1]['fim'] > 0.05):
        out.append(f'      ✂ −{num(duracao - clipes[-1]["fim"])} s' + (f'  ~{" ".join(resto)}~' if resto else ' (pausa)'))
    return '\n'.join(out)


def mover_clipes(clipes: list[dict], mover: list, palavras: list[dict]) -> None:
    """Os trechos que o criador pediu para tocar noutro lugar: os clipes de dentro de `trecho` ganham `ordem` logo antes
    do clipe que começa em `antes_de`."""
    pos = {p['id']: i for i, p in enumerate(palavras)}
    for m in mover:
        (ini, fim), alvo = m['trecho'], m['antes_de']
        if ini not in pos or fim not in pos or alvo not in pos:
            raise SystemExit(f'mover: ID que não existe na transcrição: {m}')
        dentro = [c for c in clipes if pos[ini] <= pos[c['palavra_ini']] and pos[c['palavra_fim']] <= pos[fim]]
        partidos = [c for c in clipes if c not in dentro and pos[c['palavra_ini']] <= pos[fim] and pos[c['palavra_fim']] >= pos[ini]]
        destino = next((c for c in clipes if c['palavra_ini'] == alvo), None)
        if not dentro or partidos or not destino:
            raise SystemExit(f'mover: o trecho precisa ser clipes inteiros e `antes_de` o começo de um clipe: {m}')
        for k, c in enumerate(dentro):
            c['ordem'] = round(ordem(destino) - 0.001 * (len(dentro) - k), 4)


# ---------------------------------------------------------------- as saídas (corpo + final)

def id_da_saida(destino: str) -> str:
    """O id de uma saída pelo destino ("BF Captura" → "bf-captura")."""
    t = unicodedata.normalize('NFKD', destino).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-') or 'saida'


def saidas_novas(edicao: dict) -> list[dict]:
    """As saídas do modelo de agora (com `final`); as linhas antigas do encaixar (só `tipo`/`cta`) ficam de fora."""
    return [x for x in edicao.get('saidas') or [] if isinstance(x, dict) and x.get('final')]


def checar_final(palavras: list[dict], mantidas: list[list[str]], manter: list[list[str]], destino: str) -> None:
    """Um final falado vem depois do corpo: a 1ª palavra dele depois da última do corpo. Se não, o ponto comum tem de
    recuar (o corpo termina antes, e o que sai dele vai para os finais que o usam)."""
    pos = {p['id']: i for i, p in enumerate(palavras)}
    fim_corpo = max((pos[f] for _, f in mantidas), default=-1)
    ini_final = min(pos[i] for i, _ in manter)
    if ini_final <= fim_corpo:
        raise SystemExit(f'O final "{destino}" começa em {palavras[ini_final]["id"]}, antes do fim do corpo ({palavras[fim_corpo]["id"]}). '
                         'O corpo é só o que é comum a todas as saídas: recue o fim dele (aplicar com o `manter` mais curto) e ponha '
                         'o trecho que sai em cada final que o usa.')


def montar_saidas(edicao: dict, ws: list[dict], sil: list[dict]) -> None:
    """Refaz os cortes de cada saída falada (o corpo + o final dela, em clipes da V1): sempre que o corpo muda."""
    cortes = edicao.get('cortes') or {}
    mantidas = cortes.get('mantidas') or []
    parametros = {k: float((cortes.get('parametros') or {}).get(k, v)) for k, v in PARAMETROS.items()}
    for x in saidas_novas(edicao):
        if x['final'].get('tipo') != 'falado':
            x.pop('V1', None)
            continue
        checar_final(ws, mantidas, x['final']['manter'], x['destino'])
        clipes = montar_clipes(ws, mantidas_por_indice(ws, mantidas + x['final']['manter']), sil, edicao['fontes'][0]['duracao'], **parametros)
        # o final pode reordenar os trechos dele (`mover` no final, como o do corpo): uma frase gravada depois que entra antes
        mover_clipes(clipes, (cortes.get('mover') or []) + (x['final'].get('mover') or []), ws)
        x['V1'] = clipes


def e_cta(edicao: dict) -> bool:
    """Um projeto da categoria CTA (o nome dela tem "CTA", como no app): ele não tem saídas."""
    from calibragem import categoria_de, categorias
    cid = categoria_de(edicao, 'formato')
    nome = next((c.get('nome') for c in categorias() if c.get('id') == cid), cid)
    return bool(re.search(r'\bcta\b', nome or '', re.I))


def por_saida(edicao: dict, destino: str, final: dict) -> dict:
    """Cria ou atualiza a saída do destino (o id sai do destino); trocar o final desfaz a aprovação dela."""
    if e_cta(edicao):
        raise SystemExit('Um CTA não tem saídas: ele é o final das saídas dos outros projetos.')
    lista = edicao.setdefault('saidas', [])
    sid = id_da_saida(destino)
    x = next((s for s in lista if isinstance(s, dict) and s.get('id') == sid and s.get('final')), None)
    if x is None:
        x = {'id': sid, 'destino': destino, 'criada_em': datetime.now().isoformat(timespec='seconds')}
        lista.append(x)
    if x.get('final') != final:
        x['aprovado'] = False
    x.update(destino=destino, final=final)
    return x


def faixas(texto: str, palavras: list[dict]) -> list[list[str]]:
    """"w00215..w00225,w00249..w00260" → [["w00215","w00225"], ["w00249","w00260"]] (validado)."""
    pares = [[a.strip() for a in f.split('..')] for f in texto.split(',') if f.strip()]
    return validar([p if len(p) == 2 else [p[0], p[0]] for p in pares], palavras)


def comando_saida(slug: str, destino: str, args: list[str]) -> None:
    edicao = ler(slug)
    ws = palavras(slug)
    if '--falado' in args:
        manter = faixas(args[args.index('--falado') + 1], ws)
        checar_final(ws, (edicao.get('cortes') or {}).get('mantidas') or [], manter, destino)
        final = {'tipo': 'falado', 'manter': manter}
    elif '--cta' in args:
        cta = args[args.index('--cta') + 1]
        if not (pasta(cta) / 'edicao.json').is_file():
            raise SystemExit(f'O CTA {cta} não existe (é o slug de um projeto da página CTAs).')
        final = {'tipo': 'cta', 'cta': cta} | ({'transicao': args[args.index('--transicao') + 1]} if '--transicao' in args else {})
    elif '--nenhum' in args:
        final = {'tipo': 'nenhum'}
    else:
        raise SystemExit('Diga o final: --falado <faixas> | --cta <slug> | --nenhum')
    x = por_saida(edicao, destino, final)
    montar_saidas(edicao, ws, silencios(slug))
    gravar(slug, edicao)
    print(f'Saída {x["id"]} ({destino}): {descrever(x)}. Ela entra no próximo render (render.py {slug}).')


def descrever(x: dict) -> str:
    f = x['final']
    if f['tipo'] == 'falado':
        return 'final falado ' + ', '.join(f'{a}..{b}' for a, b in f['manter'])
    return f'CTA {f["cta"]}' if f['tipo'] == 'cta' else 'sem final (o corpo puro)'


def listar_saidas(slug: str) -> None:
    lista = saidas_novas(ler(slug))
    if not lista:
        print('Sem saídas: o projeto tem um final só (o corpo).')
    for x in lista:
        exp = x.get('exportado') or {}
        print(f'{x["id"]} · {x["destino"]} · {descrever(x)}{" · aprovada" if x.get("aprovado") else ""}'
              f'{" · exportada " + exp["em"][:16] if exp.get("em") else ""}')


def tirar_saida(slug: str, sid: str) -> None:
    edicao = ler(slug)
    antes = len(edicao.get('saidas') or [])
    edicao['saidas'] = [x for x in edicao.get('saidas') or [] if not (isinstance(x, dict) and x.get('id') == sid and x.get('final'))]
    if len(edicao['saidas']) == antes:
        raise SystemExit(f'Não há a saída {sid}.')
    gravar(slug, edicao)
    print(f'Saída {sid} tirada.')


def apertar_inicios(clipes: list[dict], palavras: list[dict], audio: Path) -> None:
    """O começo de cada clipe colado na voz: o respiro antes da frase (até ~0,3 s, acima do limiar dos silêncios) saía
    junto e soava como silêncio na emenda (claude-mods v5 c1). Mede a energia em janelas de 10 ms no `audio.wav` e põe a
    borda 0,04 s antes da primeira janela com voz (o limiar é relativo ao volume da fala), sem passar do começo da
    primeira palavra: uma palavra fraca na borda (o "e" a −52 dB) continua dentro. O fim não muda (a cauda é curta e o
    "s" final fraco cairia)."""
    import array
    import math
    import wave
    if not audio.exists():
        return
    with wave.open(str(audio)) as w:
        if w.getsampwidth() != 2:
            return
        sr, canais = w.getframerate(), w.getnchannels()
        amostras = array.array('h', w.readframes(w.getnframes()))[::canais]
    jan = sr // 100

    def nivel(i: int) -> float:
        bloco = amostras[i:i + jan]
        return 20 * math.log10(math.sqrt(sum(x * x for x in bloco) / max(len(bloco), 1)) / 32768 + 1e-9)

    niveis = sorted(nivel(i) for i in range(0, len(amostras) - jan, jan * 50))
    limiar = niveis[int(len(niveis) * 0.95)] - 26 if niveis else -40
    por_id = {p['id']: p for p in palavras}
    for c in clipes:
        s0, ate = int(c['inicio'] * sr), int(min(c['inicio'] + 0.5, c['fim']) * sr)
        voz = next((i for i in range(s0, ate, jan) if nivel(i) > limiar), None)
        if voz is None:
            continue
        novo = min(voz / sr - 0.04, por_id[c['palavra_ini']]['inicio'])
        if novo > c['inicio'] + 0.02:
            c['inicio'] = round(novo, 3)


def aplicar(slug: str, arquivo: str) -> None:
    try:
        sel = json.loads(Path(arquivo).read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        raise SystemExit(f'Não consegui ler a seleção {arquivo}: {e}')
    edicao = ler(slug)
    ws = palavras(slug)
    mantidas = validar(sel.get('manter') or [], ws)
    pos = {p['id'] for p in ws}
    duvidas = []
    for d in sel.get('duvidas') or []:
        if d.get('ini') in pos and d.get('fim') in pos:
            duvidas.append({'ini': d['ini'], 'fim': d['fim'], 'motivo': str(d.get('motivo') or '').strip()})
        else:
            print(f'Aviso: dúvida com ID que não existe, ignorada: {d}', file=sys.stderr)
    # os parâmetros que o projeto já tem (um projeto do 18 traz os dele); senão, os padrões
    guardados = (edicao.get('cortes') or {}).get('parametros') or {}
    parametros = {k: float(guardados.get(k, v)) for k, v in PARAMETROS.items()}
    fica = mantidas_por_indice(ws, mantidas)
    clipes = montar_clipes(ws, fica, silencios(slug), edicao['fontes'][0]['duracao'], **parametros)
    apertar_inicios(clipes, ws, pasta(slug) / 'audio.wav')
    mover = sel.get('mover') or []
    mover_clipes(clipes, mover, ws)
    edicao['cortes'] = {'mantidas': mantidas, 'duvidas': duvidas, 'parametros': parametros} | ({'mover': mover} if mover else {})
    edicao.setdefault('timeline', {})['V1'] = clipes
    # os finais falados da seleção viram saídas; as que já existem (e as de CTA) ficam, com os cortes refeitos
    for f in sel.get('finais') or []:
        por_saida(edicao, f['destino'], {'tipo': 'falado', 'manter': validar(f.get('manter') or [], ws)}
                  | ({'mover': f['mover']} if f.get('mover') else {}))
    montar_saidas(edicao, ws, silencios(slug))
    gravar(slug, edicao)
    print(resumo(edicao, ws, fica))
    for d in duvidas:
        print(f'\nDúvida {d["ini"]}..{d["fim"]}: {d["motivo"]}')


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'texto':
        print(linhas(palavras(sys.argv[2]), silencios(sys.argv[2])))
    elif len(sys.argv) >= 4 and sys.argv[1] == 'aplicar':
        aplicar(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 5 and sys.argv[1] == 'saida':
        comando_saida(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif len(sys.argv) >= 4 and sys.argv[1] == 'tirar-saida':
        tirar_saida(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 3 and sys.argv[1] == 'saidas':
        listar_saidas(sys.argv[2])
    else:
        raise SystemExit(__doc__)
