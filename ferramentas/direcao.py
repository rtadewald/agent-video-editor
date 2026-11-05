# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Direção visual: o Claude escreve o roteiro dirigido (no formato de biblioteca/exemplos/<categoria>/roteiros/); o código
casa a fala de cada bloco com as palavras reais e prende cada plano e elemento a elas (do 18: backend/app/direcao_projeto.py,
sem as LLMs: a formatadora virou o `formatar` abaixo).

    uv run ferramentas/direcao.py fala <slug>                  a fala do vídeo cortado, para dirigir
    uv run ferramentas/direcao.py aplicar <slug> <roteiro.md>  grava edicao.direcao e sincroniza os pedidos de insert

No roteiro, uma linha logo abaixo do `[...]` começando com `> ` é o porquê do plano (vai em `porque`), e uma começando
com `refs:` são as refs candidatas para modelar o plano (os cortes da Calibragem, `REF-12·p4`; vão em `refs`).
"""
import difflib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import gravar, ler  # noqa: E402
from cortes import dur_saida, mantidas_por_indice, num, ordem, palavras, seg, v1_tocada  # noqa: E402

FIM_DE_FRASE = ('.', '?', '!', '…')
# do 18: direcao.PLANOS / PLANOS_COM_TEXTO / ELEMENTOS
PLANOS = {'full_ator': 'Full ator', 'full_ator_lettering': 'Full ator com lettering', 'insert_tela_cheia': 'Insert tela cheia',
          'motion_tela_cheia': 'Motion tela cheia', 'tela_dividida_insert': 'Tela dividida · insert', 'tela_dividida_motion': 'Tela dividida · motion',
          'comentario_insert_ator': 'Comentário + insert + ator'}
PLANOS_COM_TEXTO = ('full_ator_lettering', 'comentario_insert_ator')  # o texto do lettering / do comentário fica no plano
COM_INSERT = ('insert_tela_cheia', 'tela_dividida_insert', 'comentario_insert_ator')


def norm(t: str) -> str:
    """Uma palavra só com letras e números, em minúsculas (do 18: comum.norm)."""
    return re.sub(r'[^\wÀ-ÿ]', '', t.lower())


def chave_nome(t: str) -> str:
    """O nome de um plano sem acentos, caixa e pontuação: "Tela dividida · Insert" → "tela dividida insert"."""
    t = ''.join(c for c in unicodedata.normalize('NFD', t.lower()) if unicodedata.category(c) != 'Mn')
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', t).split())


NOMES = {chave_nome(v): k for k, v in PLANOS.items()} | {'tela dividida': 'tela_dividida_insert'}


# ---------------------------------------------------------------- a fala do vídeo cortado

def palavras_na_saida(palavras: list[dict], clipes: list[dict]) -> list[dict]:
    """As palavras que tocam no vídeo final, com início e fim no tempo da saída (do 18, igual)."""
    acc, posicoes = 0.0, []
    for c in sorted(clipes, key=ordem):
        posicoes.append((c, acc))
        acc += dur_saida(c)
    out = []
    for w in palavras:
        for c, base in posicoes:
            if w['inicio'] < c['fim'] and w['fim'] > c['inicio']:
                v = c.get('vel', 1)
                out.append({**w, 'clipe': (c.get('id'), c['inicio']), 'clipe_saida': round(base, 3), 'saida_ini': round(base + (max(w['inicio'], c['inicio']) - c['inicio']) / v, 3),
                            'saida_fim': round(base + (min(w['fim'], c['fim']) - c['inicio']) / v, 3)})
                break
    return sorted(out, key=lambda w: w['saida_ini'])


def saida_do(slug: str, edicao: dict) -> list[dict]:
    """As palavras mantidas, no tempo da saída (do 18: direcao_projeto._palavras_mantidas)."""
    ws = palavras(slug)
    mantidas = (edicao.get('cortes') or {}).get('mantidas')
    if not mantidas or not (edicao.get('timeline') or {}).get('V1'):
        raise SystemExit(f'O projeto {slug} ainda não tem cortes (rode cortes.py aplicar).')
    fica = mantidas_por_indice(ws, mantidas)
    return palavras_na_saida([w for w, ok in zip(ws, fica) if ok], v1_tocada(edicao))


def transcricao_corrida(saida: list[dict]) -> str:
    """A fala como texto corrido, uma linha por frase ou pausa ≥ 0,6 s (do 18, igual)."""
    linhas: list[list[str]] = []
    for k, w in enumerate(saida):
        ant = saida[k - 1] if k else None
        if not ant or ant['texto'].rstrip().endswith(FIM_DE_FRASE) or w['saida_ini'] - ant['saida_fim'] >= 0.6:
            linhas.append([])
        linhas[-1].append(w['texto'])
    return '\n'.join(' '.join(l) for l in linhas)


# ---------------------------------------------------------------- o roteiro → blocos

BLOCO = re.compile(r'^\s*\[(.+?)\]\s*$', re.M)
COMENTARIO = re.compile(r'\{💬[^}]*\}')


# uma ref da Calibragem: o código da referência e o plano (REF-12·p4, REF-12 p4, REF12.p4…)
REF = re.compile(r'REF-?\s*(\d+)\s*[·.:/ ]\s*p\s*(\d+)', re.I)


def normalizar_ref(m: tuple[str, str]) -> str:
    return f'REF-{int(m[0]):02d}·p{int(m[1])}'


def conferir_refs(refs: list[str]) -> list[str]:
    """As refs que não existem (o código não é de uma referência, ou ela não tem aquele plano)."""
    import codigo
    from base import BIBLIOTECA, ler_json
    reg = {c: v for c, v in codigo.atribuir().items() if v['tipo'] == 'referencia'}
    ruins = []
    for r in refs:
        cod, plano = r.split('·')
        v = reg.get(cod)
        itens = (ler_json(BIBLIOTECA / 'referencias' / v['id'] / 'direcao.json', {}) or {}).get('itens', []) if v else []
        if not any(i.get('camada') == 'plano' and i.get('id') == plano for i in itens):
            ruins.append(r)
    return ruins


def ler_roteiro(texto: str) -> list[dict]:
    """O roteiro em blocos: [{marcacao, porque, refs, fala}]. Linhas `[...]` abrem um bloco; `> …` logo abaixo é o porquê;
    `refs: REF-12·p4, REF-27·p3` são as refs candidatas para modelar o plano; o resto é fala (do 18, mais o porquê)."""
    blocos: list[dict] = []
    for linha in texto.splitlines():
        m = BLOCO.match(linha)
        if m:
            blocos.append({'marcacao': m.group(1).strip(), 'porque': '', 'refs': [], 'fala': ''})
        elif blocos and re.match(r'\s*refs?\s*:', linha, re.I) and not blocos[-1]['fala']:
            blocos[-1]['refs'] += [normalizar_ref(x) for x in REF.findall(linha)]
        elif blocos and linha.lstrip().startswith('>') and not blocos[-1]['fala']:
            blocos[-1]['porque'] = (blocos[-1]['porque'] + ' ' + linha.lstrip()[1:].strip()).strip()
        elif blocos and linha.strip() and not linha.lstrip().startswith('#'):
            blocos[-1]['fala'] = (blocos[-1]['fala'] + ' ' + COMENTARIO.sub(' ', linha).strip().strip('“”"')).strip()
    return [b for b in blocos if b['marcacao']]


# `<lettering>palavras</lettering>` ou `<lettering texto="o que aparece">palavras faladas</lettering>`, dentro da fala
LETTERING = re.compile(r'<lettering(?:\s+texto\s*=\s*["“]([^"”]*)["”])?\s*>(.*?)</lettering\s*>', re.I | re.S)
TAG_SOLTA = re.compile(r'</?lettering[^>]*>', re.I)


def sem_tags(fala: str) -> str:
    return ' '.join(TAG_SOLTA.sub(' ', LETTERING.sub(lambda m: f' {m.group(2)} ', fala)).split())


def _tokens(blocos: list[dict]):
    """As palavras da fala dos blocos, normalizadas, com o bloco e o lettering (ou None) de cada uma, e os letterings."""
    tokens, dono, marca, letterings = [], [], [], []
    for b, bloco in enumerate(blocos):
        fala, pos, partes = bloco['fala'], 0, []
        for m in LETTERING.finditer(fala):
            letterings.append({'texto': ' '.join((m.group(1) or '').split()) or None, 'falado': sem_tags(m.group(2))})
            partes += [(fala[pos:m.start()], None), (m.group(2), len(letterings) - 1)]
            pos = m.end()
        partes.append((fala[pos:], None))
        for trecho, l in partes:
            for t in TAG_SOLTA.sub(' ', trecho).split():
                if norm(t):
                    tokens.append(norm(t))
                    dono.append(b)
                    marca.append(l)
    return tokens, dono, marca, letterings


def alinhar(blocos: list[dict], saida: list[dict], letterings: list[dict] | None = None) -> tuple[list[tuple[int, int]], int]:
    """Casa a fala de cada bloco com as palavras reais (difflib) e devolve o intervalo de índices de cada bloco ((-1, -1)
    nos que não casaram) e quantas palavras reais casaram. Do 18, igual (mais a contagem)."""
    tokens, dono, marca, tags = _tokens(blocos)
    reais = [norm(w['texto']) for w in saida]
    atribuido = [-1] * len(saida)
    casado: dict[int, int] = {}
    for a, r, n in difflib.SequenceMatcher(None, tokens, reais, autojunk=False).get_matching_blocks():
        for k in range(n):
            atribuido[r + k] = dono[a + k]
            casado[a + k] = r + k
    if letterings is not None:
        for j, l in enumerate(tags):
            ks = [casado[t] for t, m in enumerate(marca) if m == j and t in casado]
            if ks:
                letterings.append({**l, 'ini': min(ks), 'fim': max(ks)})
    atual = next((x for x in atribuido if x >= 0), 0)
    for k in range(len(atribuido)):  # sem par: fica com o bloco de antes; e um bloco nunca volta para trás
        if atribuido[k] > atual:
            atual = atribuido[k]
        atribuido[k] = atual
    faixas = [(-1, -1)] * len(blocos)
    for k, b in enumerate(atribuido):
        ini, fim = faixas[b]
        faixas[b] = (k if ini < 0 else ini, k)
    return faixas, len(casado)


# + palavra manychat «X» · + caixinha de perguntas «Y» · + print/imagem sobreposta «…» · + tarja «texto do post» (variações de caixa e escrita);
# + lettering «…» na marcação não vale (o lettering vai na fala, com a tag): sai da descrição com um aviso
ELEMENTO = re.compile(r'\+\s*(palavra\s+(?:do\s+)?many\s*chat|caixinha(?:\s+de\s+perguntas?)?|(?:print\s*/\s*imagem|print|imagem)\s+sobrepost[ao]'
                      r'|lettering|tarja)\s*(?:«([^»]*)»)?', re.I)
TEXTO = re.compile(r'«([^»]*)»')


def tipo_elemento(nome: str) -> str:
    nome = nome.lower()
    return ('palavra_manychat' if 'many' in nome else 'caixinha_perguntas' if 'caixinha' in nome
            else 'lettering' if nome == 'lettering' else 'tarja' if nome == 'tarja' else 'print_sobreposto')


def tipo_plano(nome: str) -> str | None:
    """O tipo pelo nome do plano; aceita variações ("Tela dividida (insert em cima)", "full-ator", sem acento…)."""
    k = chave_nome(nome)
    if k in NOMES:
        return NOMES[k]
    if 'comentario' in k:
        return 'comentario_insert_ator'
    if 'tela dividida' in k:
        return 'tela_dividida_motion' if 'motion' in k else 'tela_dividida_insert'
    if 'tela cheia' in k:
        return 'motion_tela_cheia' if 'motion' in k else 'insert_tela_cheia' if 'insert' in k else None
    if k.startswith('full ator'):
        return 'full_ator_lettering' if 'lettering' in k else 'full_ator'
    return None


def formatar(marcacao: str) -> dict:
    """A marcação `Plano: descrição «texto» + elementos` nos campos (o que a formatadora do 18 fazia com uma LLM):
    {tipo, texto, descricao, elementos}. Levanta ValueError se o plano não é conhecido."""
    nome, sep, resto = marcacao.partition(':')
    if not sep:  # "[Full ator]" ou "[Full ator com lettering «X»]": o nome vai até o 1º « ou +
        corte = min([i for i in (marcacao.find('«'), marcacao.find(' +')) if i >= 0], default=len(marcacao))
        nome, resto = marcacao[:corte], marcacao[corte:]
    no_nome = TEXTO.findall(nome)  # "[Full ator com lettering «X»: —]": o texto do plano veio antes dos dois-pontos
    nome = TEXTO.sub(' ', nome)
    tipo = tipo_plano(nome)
    if tipo is None:
        raise ValueError(f'plano desconhecido «{nome.strip()}» (use: {" · ".join(PLANOS.values())})')
    elementos = [{'tipo': tipo_elemento(m.group(1)), 'texto': (m.group(2) or '').strip() or None,
                  'descricao': m.group(0).lstrip('+ ').strip()} for m in ELEMENTO.finditer(resto)]
    descricao = ELEMENTO.sub(' ', resto)
    texto = None
    if tipo in PLANOS_COM_TEXTO:
        achados = no_nome or TEXTO.findall(descricao)
        texto = achados[-1].strip() if achados else None
        descricao = TEXTO.sub(' ', descricao)
    descricao = ' '.join(descricao.split())
    return {'tipo': tipo, 'texto': texto, 'descricao': '' if descricao in ('—', '-', '–') else descricao, 'elementos': elementos}


# ---------------------------------------------------------------- montagem (do 18, igual)

TROCA_MIN = 0.06  # s de pausa entre duas palavras para uma troca de plano não cair colada na fala


def _folga(saida: list[dict], k: int, antes: bool, maximo: float) -> float:
    """Metade da pausa antes (ou depois) da palavra k, limitada a `maximo`: para a troca cair no silêncio.
    Nunca atravessa uma emenda (a palavra vizinha em outro trecho): no começo de um trecho, a troca cai no próprio corte
    (o ar antes da 1ª palavra é do trecho novo: com folga zero, o ator pulava no corte um quadro antes do plano trocar)."""
    if 'clipe' in saida[k] and (k if antes else k + 1) in range(1, len(saida)) and saida[k]['clipe'] != saida[k - 1 if antes else k + 1]['clipe']:
        return round(max(saida[k]['saida_ini'] - saida[k].get('clipe_saida', saida[k]['saida_ini']), 0.0), 3) if antes else 0.0
    if antes:
        gap = saida[k]['saida_ini'] - saida[k - 1]['saida_fim'] if k else 0.0
    else:
        gap = saida[k + 1]['saida_ini'] - saida[k]['saida_fim'] if k + 1 < len(saida) else 0.0
    return round(min(maximo, max(gap, 0.0) / 2), 3)


def montar(resp: dict, saida: list[dict]) -> list[dict]:
    """Itens ancorados: planos contíguos cobrindo todas as palavras, elementos dentro do vídeo."""
    if not saida:
        return []
    idx = {w['id']: k for k, w in enumerate(saida)}
    inicios: dict[int, dict] = {}
    for p in resp['planos']:
        k = idx.get(p['palavra_ini'])
        if k is not None and k not in inicios:
            inicios[k] = p
    if not inicios:
        raise SystemExit('Nenhum plano casou com a fala do vídeo.')
    if 0 not in inicios:  # o primeiro plano sempre começa na primeira palavra
        inicios[0] = inicios.pop(min(inicios))
    ordem = sorted(inicios)
    itens = []
    for n, k in enumerate(ordem):
        p = inicios[k]
        fim_k = (ordem[n + 1] - 1) if n + 1 < len(ordem) else len(saida) - 1
        com_texto = p['tipo'] in PLANOS_COM_TEXTO
        item = {'id': f'p{n + 1}', 'camada': 'plano', 'tipo': p['tipo'], 'conteudo': None,
                'palavra_ini': saida[k]['id'], 'palavra_fim': saida[fim_k]['id'],
                'off_ini': -saida[0]['saida_ini'] if n == 0 else -_folga(saida, k, True, 0.08), 'off_fim': 0.0,
                'texto': (p.get('texto') or None) if com_texto else None, 'descricao': (p.get('descricao') or '').strip()}
        if p.get('porque'):
            item['porque'] = p['porque']
        if p.get('refs'):
            item['refs'] = list(dict.fromkeys(p['refs']))
        itens.append(item)
    for n, e in enumerate(resp['elementos']):
        a, b = idx.get(e['palavra_ini']), idx.get(e['palavra_fim'])
        if a is None or b is None:
            continue
        a, b = min(a, b), max(a, b)
        itens.append({'id': f'e{n + 1}', 'camada': 'elemento', 'tipo': e['tipo'], 'conteudo': None,
                      'palavra_ini': saida[a]['id'], 'palavra_fim': saida[b]['id'],
                      'off_ini': -_folga(saida, a, True, 0.05), 'off_fim': _folga(saida, b, False, 0.15),
                      'texto': e.get('texto') or None, 'descricao': (e.get('descricao') or '').strip()})
    return itens


def estruturar(roteiro: str, saida: list[dict]) -> tuple[list[dict], int, list[str]]:
    """Do roteiro em texto aos itens (do 18: direcao_projeto._estruturar). Devolve (itens, palavras casadas, avisos)."""
    blocos = ler_roteiro(roteiro)
    if not blocos:
        raise SystemExit('O roteiro não tem nenhum bloco no formato [plano: marcação] + fala.')
    letterings: list[dict] = []
    faixas, casadas = alinhar(blocos, saida, letterings)
    avisos, resp = [], {'planos': [], 'elementos': []}
    for n, (b, (ini, fim)) in enumerate(zip(blocos, faixas)):
        try:
            f = formatar(b['marcacao'])
        except ValueError as e:
            avisos.append(f'bloco {n + 1}: {e}; a fala dele fica com o plano anterior')
            continue
        if ini < 0:
            avisos.append(f'bloco {n + 1} [{b["marcacao"][:50]}…]: nenhuma palavra da fala casou com o vídeo; o bloco saiu'
                          + (f' (fala: “{b["fala"][:60]}”)' if b['fala'] else ' (sem fala)'))
            continue
        resp['planos'].append({'tipo': f['tipo'], 'palavra_ini': saida[ini]['id'], 'palavra_fim': saida[fim]['id'],
                               'texto': f['texto'], 'descricao': f['descricao'], 'porque': b['porque'], 'refs': b['refs']})
        if b['refs'] and (ruins := conferir_refs(b['refs'])):
            avisos.append(f'bloco {n + 1}: refs que não existem na Calibragem: {", ".join(ruins)} (confira com codigo.py)')
        for e in f['elementos']:
            if e['tipo'] == 'lettering':
                avisos.append(f'bloco {n + 1}: “+ {e["descricao"]}” na marcação foi ignorado; marque o lettering na fala com <lettering>')
            else:
                resp['elementos'].append({**e, 'palavra_ini': saida[ini]['id'], 'palavra_fim': saida[fim]['id']})
    resp['elementos'] += [{'tipo': 'lettering', 'palavra_ini': saida[l['ini']]['id'], 'palavra_fim': saida[l['fim']]['id'],
                           'texto': l['texto'] or l['falado'].rstrip(',;:.'), 'descricao': ''} for l in letterings]
    return montar(resp, saida), casadas, avisos


# ---------------------------------------------------------------- pedidos de insert (do 18: inserts.pedidos_da_direcao e sincronizar)

def pedidos_da_direcao(itens: list[dict], saida: list[dict]) -> list[dict]:
    """Os planos com insert, em ordem, com a fala do bloco e a duração (do começo do plano ao começo do seguinte)."""
    idx = {w['id']: k for k, w in enumerate(saida)}
    planos = sorted((i for i in itens if i['camada'] == 'plano' and i['palavra_ini'] in idx), key=lambda i: idx[i['palavra_ini']])
    fim_video = saida[-1]['saida_fim'] if saida else 0.0
    pedidos = []
    for n, pl in enumerate(planos):
        if pl['tipo'] not in COM_INSERT:
            continue
        k0 = idx[pl['palavra_ini']]
        k1 = (idx[planos[n + 1]['palavra_ini']] - 1) if n + 1 < len(planos) else len(saida) - 1
        t0 = 0.0 if n == 0 else saida[k0]['saida_ini']
        t1 = saida[idx[planos[n + 1]['palavra_ini']]]['saida_ini'] if n + 1 < len(planos) else fim_video
        pedidos.append({'id': pl['id'], 'plano': pl['id'], 'tipo': pl['tipo'], 'conteudo': pl.get('conteudo'),
                        'formato': 'vertical' if pl['tipo'] == 'insert_tela_cheia' else 'dividida',
                        'palavra_ini': pl['palavra_ini'], 'palavra_fim': saida[k1]['id'], 'descricao': pl.get('descricao') or '',
                        'texto': pl.get('texto'), 'fala': ' '.join(w['texto'] for w in saida[k0:k1 + 1]),
                        **({'refs': pl['refs']} if pl.get('refs') else {}),
                        'inicio': round(t0, 3), 'duracao': round(max(t1 - t0, 0.3), 3)})
    return pedidos


def sincronizar(edicao: dict, saida: list[dict]) -> list[dict]:
    """Os pedidos da direção atual; um que já existia para o mesmo plano (e que continua com insert) mantém as mídias, o
    enriquecimento e o card de comentário."""
    ins = edicao.setdefault('inserts', {})
    antigos = {x.get('plano') or x.get('id'): x for x in ins.get('pedidos') or []}
    # casa pela descrição antes do número: tirar um plano renumera os seguintes, e pelo número as mídias escorregavam
    # um plano (carrinho-c v4: o «50% OFF» saiu e cada insert ficou com a mídia do anterior)
    por_desc = {}
    for x in ins.get('pedidos') or []:
        if x.get('descricao'):
            por_desc.setdefault(x['descricao'], x)
    novos = pedidos_da_direcao(edicao['direcao']['itens'], saida)
    descs_novas = {n['descricao'] for n in novos}
    pedidos = []
    for n in novos:
        velho = por_desc.get(n['descricao']) if n['descricao'] else None
        if velho is None:
            v = antigos.get(n['plano']) or {}
            velho = {} if v.get('descricao') in descs_novas and v.get('descricao') != n['descricao'] else v
        pedidos.append({**n, 'midias': velho.get('midias') or [],
                        **{k: velho[k] for k in ('enriquecimento', 'comentario') if velho.get(k)}})
    ins['pedidos'] = pedidos
    return pedidos


# ---------------------------------------------------------------- comandos

def fala(slug: str) -> None:
    edicao = ler(slug)
    saida = saida_do(slug, edicao)
    total = sum(dur_saida(c) for c in v1_tocada(edicao))
    print(f'Vídeo cortado: {num(total, 1)} s · {len(saida)} palavras\n')
    print(transcricao_corrida(saida))


def tempos(itens: list[dict], saida: list[dict]) -> dict[str, tuple[float, float]]:
    """Início e fim de cada item no vídeo final (planos: até o começo do seguinte)."""
    idx = {w['id']: k for k, w in enumerate(saida)}
    fim_video = saida[-1]['saida_fim']
    planos = [i for i in itens if i['camada'] == 'plano']
    out = {}
    for n, p in enumerate(planos):
        t0 = saida[idx[p['palavra_ini']]]['saida_ini'] + p['off_ini']
        out[p['id']] = (max(t0, 0.0), None)
        if n:
            out[planos[n - 1]['id']] = (out[planos[n - 1]['id']][0], t0)
    if planos:
        out[planos[-1]['id']] = (out[planos[-1]['id']][0], fim_video)
    for e in itens:
        if e['camada'] == 'elemento':
            out[e['id']] = (saida[idx[e['palavra_ini']]]['saida_ini'] + e['off_ini'], saida[idx[e['palavra_fim']]]['saida_fim'] + e['off_fim'])
    return out


def aplicar(slug: str, arquivo: str) -> None:
    try:
        roteiro = Path(arquivo).read_text(encoding='utf-8')
    except OSError as e:
        raise SystemExit(f'Não consegui ler o roteiro {arquivo}: {e}')
    edicao = ler(slug)
    saida = saida_do(slug, edicao)
    itens, casadas, avisos = estruturar(roteiro, saida)
    # a mídia de um print sobreposto (`banco`) é posta depois da direção: um print com o mesmo texto a mantém
    midia_dos_prints = {(i.get('texto') or '').strip().lower(): i['banco'] for i in (edicao.get('direcao') or {}).get('itens', [])
                        if i.get('tipo') == 'print_sobreposto' and i.get('banco')}
    for i in itens:
        if i['tipo'] == 'print_sobreposto' and (b := midia_dos_prints.get((i.get('texto') or '').strip().lower())):
            i['banco'] = b
    # os motions e as transições são presos ao número do plano: leva-os pela descrição para o número novo
    desc_velha = {i['id']: i.get('descricao') for i in (edicao.get('direcao') or {}).get('itens', [])
                  if i.get('camada') == 'plano'}
    id_novo = {}
    for i in itens:
        if i['camada'] == 'plano' and i.get('descricao'):
            id_novo.setdefault(i['descricao'], i['id'])
    motions = edicao.get('motions') or {}
    if motions:
        levados = {id_novo[desc_velha[k]]: m for k, m in motions.items() if desc_velha.get(k) in id_novo}
        edicao['motions'] = levados | {k: m for k, m in motions.items()
                                       if desc_velha.get(k) not in id_novo and k not in levados}
    edicao['direcao'] = {'roteiro': roteiro, 'itens': itens}
    pedidos = sincronizar(edicao, saida)
    planos = {i['id'] for i in itens if i['camada'] == 'plano'}
    # o motion só fica num plano que ainda é de motion: com os planos renumerados, um motion antigo preso ao número
    # cobria o insert que passou a ter aquele número (o Ultron virou a caixa de prompt, iniciante-x-avancado v3)
    de_motion = {i['id'] for i in itens if i['camada'] == 'plano' and 'motion' in i['tipo']}
    removidos = []
    for campo, valem in (('motions', de_motion), ('transicoes', planos)):
        for pid in [k for k in (edicao.get(campo) or {}) if k not in valem]:
            del edicao[campo][pid]
            removidos.append(f'{campo}.{pid}')
    gravar(slug, edicao)

    t = tempos(itens, saida)
    print(f'{len(planos)} planos · {sum(i["camada"] == "elemento" for i in itens)} elementos · '
          f'{casadas}/{len(saida)} palavras casaram · {len(pedidos)} pedidos de insert')
    for i in itens:
        a, b = t[i['id']]
        texto = f' «{i["texto"]}»' if i.get('texto') else ''
        marc = (i['descricao'][:60] + '…') if len(i['descricao']) > 60 else i['descricao']
        print(f'{i["id"]:>4}  {i["tipo"]:<22} {seg(a)}–{seg(b)}  {i["palavra_ini"]}–{i["palavra_fim"]}{texto}  {marc}')
    com_midia = sum(1 for p in pedidos if p['midias'])
    if pedidos:
        print(f'\nPedidos de insert: {", ".join(p["id"] + ("*" if p["midias"] else "") for p in pedidos)}'
              + (f'  (* = {com_midia} já com mídia)' if com_midia else ''))
    if removidos:
        print(f'Removidos (o plano não existe mais): {", ".join(removidos)}')
    for a in avisos:
        print(f'Aviso: {a}')
    # regra do criador: a troca de plano cai num fim de frase ou numa pausa, nunca entre palavras coladas
    idx = {w['id']: k for k, w in enumerate(saida)}
    for i in itens:
        k = idx[i['palavra_ini']]
        if i['camada'] != 'plano' or not k or saida[k].get('clipe') != saida[k - 1].get('clipe'):
            continue
        if saida[k]['saida_ini'] - saida[k - 1]['saida_fim'] < TROCA_MIN and not saida[k - 1]['texto'].rstrip('"”»').endswith(('.', '!', '?', ';', ':')):
            print(f'Aviso: {i["id"]} começa colado na fala ("{saida[k - 1]["texto"]} | {saida[k]["texto"]}", '
                  f'{num(saida[k]["saida_ini"] - saida[k - 1]["saida_fim"], 2)} s de pausa): troque num fim de frase ou numa pausa')


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'fala':
        fala(sys.argv[2])
    elif len(sys.argv) >= 4 and sys.argv[1] == 'aplicar':
        aplicar(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)
