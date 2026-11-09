# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.63.0", "pillow", "numpy"]
# ///
"""O render: o vídeo do projeto com tudo queimado (cortes, 9:16, look, inserts, motions, transições, legenda e áudio).

    uv run ferramentas/render.py <slug>            → projetos/<slug>/versoes/vN/ (proxy.mp4 720×1280 H.264 + os JSONs da revisão)
    uv run ferramentas/render.py <slug> --final    → projetos/<slug>/final/<nome>.mp4 (2160×3840 HEVC) e, ao lado, o .md
        com a transcrição (a fala que ficou no corte): o vídeo sem saídas (um CTA, um Reels sem outro final)
    uv run ferramentas/render.py <slug> --saida <id> | --saidas
        → o export de uma saída (ou de todas): final/<nome> - <destino>.mp4 + .md (a falada renderizada com o final; a de
        CTA, o final do corpo emendado no do CTA; a sem final, o corpo). As saídas: cortes.py saidas <slug>. O corpo em 4K
        que elas usam fica no cache (`.cache/final/`), feito uma vez e reaproveitado enquanto a edição dele não muda.
    Em final/ só ficam as entregas: cada export substitui o anterior do mesmo nome.
    (o proxy de um projeto com saídas traz a prévia de cada uma em versoes/vN/saidas/<id>/)
    uv run ferramentas/render.py <slug> --camadas  → só fotografa a camada dos inserts e motions para o cache (o pré-render:
        rode em segundo plano enquanto a edição segue; o render da entrega espera ele e acha tudo pronto)
    uv run ferramentas/render.py <slug> --camadas --final  → o mesmo no tamanho do 4K: o export final só monta
    uv run ferramentas/render.py amostra-look <slug> <t> <lut|-> <intensidade> <vinheta> [nitidez]
        → um trecho de 3 s do ator (do bruto, no instante t do vídeo final) com aquele look: o provador da revisão
    uv run ferramentas/render.py musica <slug> <v> [<saída>]   → o que o app precisa para tocar a música ao vivo na revisão (JSON):
        o áudio da versão sem a música (versoes/vN/sem-musica.m4a, feito na primeira vez), as falas, o nível e as faixas
    uv run ferramentas/render.py remixar <slug> <v>  → a música do edicao.json (a escolhida no app) no proxy da vN: só o
        áudio é misturado de novo e trocado no MP4 (o vídeo fica), com o áudio sem música e as prévias das saídas de CTA
    uv run ferramentas/render.py previas-motions [--refazer] [<id> …]
        → biblioteca/motions/previas/<id>.mp4: a prévia de cada motion (720×1280, 30 fps quadro a quadro, mudo), o que a aba
        Motions do app toca na grade (a animação ao vivo fica só no modal). Só refaz o que mudou desde a última prévia.

Como a exportação do 18 (SPEC §13; a cola de backend/app/exportacao.py `_gravar`/`_trechos`, reescrita aqui): a página
de render (`render/`, servida por `servidor.servir`) calcula no navegador o que a prévia calcula (`window.__render`) e é
fotografada quadro a quadro por navegadores escondidos (`montagem/render_quadros.py`); o ator e o áudio saem do bruto
pelo ffmpeg (`montagem/exportacao.py`), em trechos de ~20 s guardados no cache e emendados sem recodificar. Os inserts
parados (cards só no lugar, no máximo com o zoom lento: a `geometria` que a página manda) não são fotografados: o
ffmpeg desenha o clipe deles (`exportacao.camada_do_insert`), bem mais rápido, com o fundo e a sombra tirados da página
numa foto só.

O cache (`projetos/<slug>/.cache/`): a foto de cada trecho da camada (`camadas/<chave>.mov`, pela assinatura que a
página dá a ele) e o áudio pronto, com o −14 LUFS (`audio.json` + `audio.wav`). Numa revisão, só os trechos que mudaram
são fotografados de novo e o áudio só é refeito se algo nele mudou.
"""
import fcntl
import hashlib
import json
import math
import multiprocessing
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import servidor  # noqa: E402
from base import BIBLIOTECA, PROJETOS, RAIZ, ffmpeg, gravar_json, inspecionar, ler, ler_json, pasta  # noqa: E402
from montagem import audio, exportacao, legenda, look, render_quadros, sons  # noqa: E402
from montagem.exportacao import dur_saida  # noqa: E402

FPS = 24
PROXY = (720, 1280, 'h264')
FINAL = (2160, 3840, 'hevc')
VELOCIDADE = (1.0, 1.5)
# o código que desenha a camada: se muda, as fotos guardadas não valem mais
CODIGO_CAMADA = [RAIZ / 'render' / x for x in ('index.html', 'pagina.js', 'motion.html')] + [BIBLIOTECA / 'motions' / 'runtime.js']
GUARDA = 3  # o cache da camada guarda os clipes usados nos últimos N renders do projeto


def pagina(slug: str, porta: int) -> str:
    """A página de render. `RENDER_PAGINA` troca por outra, só para testar contra a do 18 (o mesmo `window.__render`):
    RENDER_PAGINA='http://localhost:5173/render/p/{slug}'."""
    return os.environ.get('RENDER_PAGINA', 'http://127.0.0.1:{porta}/render/?projeto={slug}').format(slug=slug, porta=porta)


# ---------------------------------------------------------------- o projeto no tempo do vídeo final

def v1_tocada(edicao: dict) -> list[dict]:
    """Os clipes da V1 em ordem, cada um com a aceleração do ator (`vel`). Do 18: projeto.v1_tocada."""
    try:
        v = round(min(max(float(edicao.get('velocidade') or 1), VELOCIDADE[0]), VELOCIDADE[1]), 3)
    except (TypeError, ValueError):
        v = 1.0
    return [{**c, 'vel': v} for c in sorted((edicao.get('timeline') or {}).get('V1') or [], key=lambda c: c.get('ordem', c['inicio']))]


def duracao_antes(slug: str, avisos: list[str]) -> float:
    """A duração da última versão do vídeo que vem antes deste na emenda (`audio.continua`): onde a trilha dele parou."""
    vs = sorted((int(d.name[1:]) for d in (pasta(slug) / 'versoes').glob('v*') if d.name[1:].isdigit()), reverse=True)
    for v in vs:
        dur = (ler_json(pasta(slug) / 'versoes' / f'v{v}' / 'info.json', {}) or {}).get('duracao')
        if dur:
            return float(dur)
    avisos.append(f'audio.continua: {slug} não tem versão renderizada; a trilha começou do zero.')
    return 0.0


def palavras_na_saida(palavras: list[dict], clipes: list[dict]) -> list[dict]:
    """As palavras que tocam no vídeo final, com início e fim no tempo da saída. Do 18: direcao_projeto.palavras_na_saida."""
    acc, posicoes = 0.0, []
    for c in clipes:
        posicoes.append((c, acc))
        acc += dur_saida(c)
    out = []
    for w in palavras:
        for c, base in posicoes:
            if w['inicio'] < c['fim'] and w['fim'] > c['inicio']:
                v = c.get('vel', 1)
                out.append({**w, 'saida_ini': round(base + (max(w['inicio'], c['inicio']) - c['inicio']) / v, 3),
                            'saida_fim': round(base + (min(w['fim'], c['fim']) - c['inicio']) / v, 3)})
                break
    return sorted(out, key=lambda w: w['saida_ini'])


# ---------------------------------------------------------------- o banco, a página e as fotos

def copias_do_banco(edicao: dict) -> int:
    """A cópia de exportação de cada vídeo do banco usado (o original, ou o pai de um trecho): a resolução original com
    quadro-chave a cada 6 quadros, para a busca quadro a quadro ser rápida; refeita se o original mudou. Do 18:
    banco.arquivo_para_exportar. Devolve quantas fez."""
    feitas = 0
    usados = {m['banco'] for x in (edicao.get('inserts') or {}).get('pedidos', []) for m in x.get('midias', []) if m.get('banco')}
    for base in sorted({(ler_json(BIBLIOTECA / 'banco' / b / 'item.json') or {}).get('pai') or b for b in usados}):
        pasta_item = BIBLIOTECA / 'banco' / base
        item = ler_json(pasta_item / 'item.json')
        if not item or item.get('tipo') != 'video' or not (pasta_item / item['arquivo']).exists():
            continue  # imagem (vai a original) ou mídia apagada do banco: a página mostra o que houver
        original, pronto = pasta_item / item['arquivo'], pasta_item / 'exportacao.mp4'
        if pronto.exists() and pronto.stat().st_mtime >= original.stat().st_mtime:
            continue
        tmp = pasta_item / 'exportacao.tmp.mp4'
        ffmpeg('-i', str(original), '-map', '0:v:0', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast',
               '-crf', '14', '-g', '6', '-keyint_min', '6', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', str(tmp))
        tmp.replace(pronto)
        feitas += 1
    return feitas


def ler_pagina(url: str) -> dict:
    """O que a página de render calcula (`window.__render`, no tempo do vídeo final): os inserts e motions (`trechos`), os
    sons, as transições, os blocos da legenda, os movimentos do Full ator e, para a revisão, as palavras e os planos
    (null se a página não os tiver). Do 18: exportacao._trechos."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chromium')
        try:
            pg = render_quadros.abrir_render(browser, url)
            return pg.evaluate("""async () => {
                const r = window.__render
                const ler = async (f) => (typeof f === 'function' ? await f() : f ?? null)
                return { duracao: r.duracao, trechos: r.trechos, sons: r.sons ? await r.sons() : [], transicoes: await ler(r.transicoes),
                         legenda: await ler(r.legenda), movimentos: await ler(r.movimentos), palavras: await ler(r.palavras),
                         planos: await ler(r.planos) }
            }""")
        finally:
            browser.close()


def fotografar(url: str, trechos: list[dict], w: int, h: int, tmp: Path, navegadores: int) -> list[Path]:
    """A camada dos inserts: as fotos de cada trecho (`exportacao.fotos`, na grade do próprio trecho) em pedaços,
    fotografadas em paralelo (cada navegador grava os seus pedaços em clipes ProRes 4444 com transparência); depois, um
    clipe por trecho, os pedaços emendados sem recodificar. Devolve os clipes, na ordem dos trechos."""
    grupos = exportacao.pedacos(trechos, FPS, navegadores)
    total = sum(len(x) for g in grupos for x in g)
    if not total:
        return []
    tarefas = [(ts, FPS, w, h, str(tmp / f'{i:03d}_{j:03d}.mov')) for i, g in enumerate(grupos) for j, ts in enumerate(g)]
    print(f'      {total} quadros em {len(tarefas)} pedaços, {min(navegadores, len(tarefas))} navegadores', flush=True)
    pool = multiprocessing.get_context('spawn').Pool(min(navegadores, len(tarefas)), initializer=render_quadros.iniciar,
                                                      initargs=(url, w, h))
    try:
        feitos, marca = 0, 0.25
        for n in pool.imap_unordered(render_quadros.pedaco, tarefas):
            feitos += n
            if feitos / total >= marca:
                print(f'      {feitos}/{total} quadros', flush=True)
                marca = math.floor(feitos / total * 4 + 1) / 4
        pool.close()
        pool.join()
    finally:
        pool.terminate()
    camadas = []
    for i, g in enumerate(grupos):
        lista = tmp / f'{i:03d}.txt'
        lista.write_text(''.join(f"file '{i:03d}_{j:03d}.mov'\n" for j in range(len(g))))
        clipe = tmp / f'{i:03d}.mov'
        ffmpeg('-f', 'concat', '-safe', '0', '-i', str(lista), '-c', 'copy', str(clipe))
        camadas.append(clipe)
    return camadas


def _hash(*partes: str | bytes) -> str:
    h = hashlib.sha256()
    for x in partes:
        h.update(x if isinstance(x, bytes) else x.encode())
        h.update(b'\0')
    return h.hexdigest()[:32]


def _hash_arquivo(arq: Path) -> str:
    return _hash(arq.read_bytes()) if arq.is_file() else 'ausente'


def chave_do_trecho(t: dict, w: int, h: int, codigo: str) -> str:
    """A chave das fotos de um trecho: a assinatura da página (o que ele desenha, nos tempos relativos ao começo dele), o
    código da camada, o HTML dos presets de motion que ele usa, o tamanho, o fps e quantas fotos. Sem a fase do 1º quadro:
    as fotos são na grade do próprio trecho (`exportacao.fotos`), então com tudo igual servem em qualquer instante. Um
    trecho que o ffmpeg desenha (`geometria`) leva também ela e o código que desenha."""
    presets = sorted({m['preset'] for m in json.loads(t['assinatura']).get('motions') or [] if m.get('preset')})
    desenho = (json.dumps(t['geometria'], sort_keys=True), _hash_arquivo(Path(exportacao.__file__))) if t.get('geometria') else ()
    return _hash(t['assinatura'], codigo, *(_hash_arquivo(BIBLIOTECA / 'motions' / 'presets' / f'{x}.html') for x in presets),
                 f'{w}x{h}', str(FPS), str(len(exportacao.fotos(t, FPS))), *desenho)


def desenhar(url: str, trechos: dict[str, dict], w: int, h: int, cache: Path, tmp: Path) -> None:
    """Os trechos que o ffmpeg desenha no lugar da foto (os inserts parados, com `geometria`): a página tira antes as
    fotos paradas deles (o fundo da área, se não é a chuva, e a sombra de cada card; `render_quadros.fixas`) e cada
    trecho vira um clipe igual ao das fotos (`exportacao.camada_do_insert`), guardado em `cache/<chave>.mov`, `JUNTOS`
    por vez."""
    pedidos, de_quem = [], []
    for k, t in trechos.items():
        g = t['geometria']
        partes = (['fundo'] if g['fundo'] not in ('chuva', None) else []) + [c['k'] for c in g['cards'] if c['sombra']]
        for so in partes:
            pedidos.append((t['ini'], so, str(tmp / f'fixa_{k[:12]}_{so}.png')))
            de_quem.append(k)
    fixas = {k: {'fundo': None, 'sombras': {}} for k in trechos}
    if pedidos:
        for k, (_, so, png), caixa in zip(de_quem, pedidos, render_quadros.fixas(url, w, h, pedidos)):
            if so == 'fundo':
                fixas[k]['fundo'] = png
            elif caixa:
                fixas[k]['sombras'][so] = (png, caixa)

    def um(k: str) -> None:
        clipe = tmp / f'desenho_{k[:12]}.mov'
        res = subprocess.run(exportacao.camada_do_insert(trechos[k], w, h, FPS, clipe, fixas[k]), capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f'ffmpeg (insert desenhado) falhou: {res.stderr[-600:]}')
        clipe.replace(cache / f'{k}.mov')

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(JUNTOS) as pool:
        list(pool.map(um, trechos))


def camada(url: str, trechos: list[dict], w: int, h: int, cache: Path, tmp: Path) -> tuple[list[tuple[Path, float]], list[str] | None]:
    """A camada dos inserts com o cache: o clipe de cada trecho fica em `cache/<chave>.mov` e só os que faltam são
    fotografados (ou desenhados pelo ffmpeg, os inserts parados: `desenhar`, depois das fotos — ao mesmo tempo, os dois
    disputavam a máquina e o mvi-0719 levava o dobro). O `_inserts` põe o clipe no 1º quadro do trecho (`q0 / FPS`,
    contado agora): serve onde o trecho cair. O clipe tem fotos para qualquer fase; se o trecho agora pega um quadro a
    menos, vai uma cópia sem a última (sem recodificar), senão ela cobriria o 1º quadro do que vem depois. Uma página
    sem `assinatura` (a do 18, por `RENDER_PAGINA`) fotografa tudo, sem guardar. Devolve os clipes com o instante de cada um e as chaves usadas (None sem
    o cache)."""
    itens = [(t, qs) for t in trechos if (qs := exportacao.quadros(t, FPS))]
    com_cache = all(t.get('assinatura') for t in trechos)
    if com_cache:
        codigo = _hash(*(_hash_arquivo(a) for a in CODIGO_CAMADA))
        chaves = [chave_do_trecho(t, w, h, codigo) for t, _ in itens]
    else:
        cache, chaves = tmp / 'camadas', [f'{k:03d}' for k in range(len(itens))]
    cache.mkdir(parents=True, exist_ok=True)
    faltam = {k: t for (t, _), k in zip(itens, chaves) if not (cache / f'{k}.mov').exists()}
    desenhados = {k: t for k, t in faltam.items() if t.get('geometria') and com_cache}
    fotografados = {k: t for k, t in faltam.items() if k not in desenhados}
    print(f'      {len(itens) - len(faltam)} trechos do cache, {len(fotografados)} para fotografar, {len(desenhados)} para desenhar no ffmpeg', flush=True)
    for k, clipe in zip(fotografados, fotografar(url, list(fotografados.values()), w, h, tmp, exportacao.NAVEGADORES)):
        clipe.replace(cache / f'{k}.mov')
    if desenhados:
        desenhar(url, desenhados, w, h, cache, tmp)
    camadas = []
    for i, ((t, qs), k) in enumerate(zip(itens, chaves)):
        clipe = cache / f'{k}.mov'
        if len(qs) < len(exportacao.fotos(t, FPS)):
            clipe, curto = tmp / f'curto_{i:03d}.mov', clipe
            ffmpeg('-i', str(curto), '-map', '0:v', '-c', 'copy', '-frames:v', str(len(qs)), str(clipe))
        camadas.append((clipe, qs.start / FPS))
    return camadas, chaves if com_cache else None


def limpar_camadas(cache: Path, chaves: list[str], extensao: str = '.mov', guarda: int = GUARDA) -> None:
    """Depois de um render: guarda as chaves dele e apaga do cache os clipes que nenhum dos últimos `guarda` usou."""
    registro = cache / 'usos.json'
    usos = ([*(ler_json(registro) or []), chaves])[-guarda:]
    gravar_json(registro, usos)
    vivos = {k for u in usos for k in u}
    for clipe in cache.glob(f'*{extensao}'):
        if clipe.stem not in vivos:
            clipe.unlink(missing_ok=True)


# ---------------------------------------------------------------- o áudio

def som(p: Path, edicao: dict, fonte: dict, clipes: list[dict], transcricao: list[dict], avisos: list[str]) -> dict:
    """O que o áudio precisa (`audio.filtros`): a voz da escolha (`midia/voz/<fonte>_<limpeza>.wav`, feita pelo preparar;
    se faltar, a do bruto com um aviso, como no 18), a sonoridade dela, o fundo e o laço, e as falas para o ducking.
    Do 18: audio.da_exportacao."""
    a = audio.do_projeto(edicao)
    limpeza = a['voz']['limpeza']
    voz = p / 'midia' / 'voz' / f"{fonte['id']}_{limpeza}.wav"
    if limpeza != 'sem' and not voz.exists():
        avisos.append(f'Falta a voz limpa ({voz.relative_to(p)}): o vídeo saiu com a voz do bruto.')
        limpeza = 'sem'
    if limpeza == 'sem':
        voz = p / fonte['arquivo']
    voz_lufs = ((edicao.get('audio') or {}).get('voz_lufs') or {}).get(f"{fonte['id']}_{limpeza}")
    if voz_lufs is None:
        voz_lufs = round(audio.lufs(voz, como_voz=True), 1)
    fundo = audio.arquivo_trilha(a['fundo'])
    if a['fundo'] and not fundo:
        avisos.append(f"A faixa de fundo {a['fundo']} não está em biblioteca/trilhas/: o vídeo saiu sem fundo.")
    laco = audio.laco(fundo) if fundo else None
    # a trilha entra já no trecho cheio do laço, sem a introdução baixa (o criador sentiu falta da música no começo)
    return {'voz': voz, 'voz_lufs': voz_lufs, 'timbre': a['voz']['timbre'], 'niveis': a['niveis'], 'fundo': fundo,
            'laco': laco, 'fundo_mudo': a['fundo_mudo'], 'fade_fim': a['fade_fim'],
            'desde': (laco[0] if laco else 0.0) + (duracao_antes(a['continua'], avisos) if a['continua'] else 0.0),
            'falas': audio.falas(palavras_na_saida(transcricao, clipes)), 'ducking_db': audio.DUCKING_DB, 'limpeza': limpeza}


def falas_extras(p: Path, edicao: dict, transicao: list[dict], clipes: list[dict], id_saida: str | None = None) -> list[dict]:
    """As falas gravadas à parte (`audio.extras`: `arquivo` do projeto, presa ao fim de uma `palavra` + `depois` s, `ganho`):
    entram por cima da voz no fader do ator, já tratadas (ex.: o fim alternativo de uma versão sem ManyChat). Uma com
    `saida` é só do render daquela saída (a direção do final de uma saída)."""
    saida = {w['id']: w for w in palavras_na_saida(transicao, clipes)}
    out = []
    for x in (edicao.get('audio') or {}).get('extras') or []:
        if x.get('saida') and x['saida'] != id_saida:
            continue
        w, arq = saida.get(x.get('palavra')), p / x.get('arquivo', '')
        if not w or not arq.is_file():
            continue
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(arq)],
                                   capture_output=True, text=True).stdout or 0)
        out.append({'arquivo': str(arq), 't': w['saida_fim'] + float(x.get('depois', 0)), 'desde': 0.0, 'dur': dur,
                    'ganho': float(x.get('ganho', 1.0)), 'grupo': 'voz'})
    return out


def sons_das_midias(edicao: dict, planos: list[dict]) -> list[dict]:
    """O áudio próprio dos inserts com `som: true` (ex.: a demo do produto falando): a 1ª mídia toca do começo do plano
    até o fim dele, no ganho `som_ganho` (padrão 1, o nível do arquivo). Um trecho toca o original a partir do início dele."""
    tempo = {p.get('id'): p for p in planos}
    out = []
    for q in (edicao.get('inserts') or {}).get('pedidos') or []:
        pl = tempo.get(q.get('plano'))
        if not q.get('som') or not pl or not q.get('midias'):
            continue
        item = ler_json(BIBLIOTECA / 'banco' / q['midias'][0]['banco'] / 'item.json', {}) or {}
        dono = ler_json(BIBLIOTECA / 'banco' / item['pai'] / 'item.json', {}) if item.get('pai') else item
        if not dono or not dono.get('arquivo'):
            continue
        arq = BIBLIOTECA / 'banco' / (item.get('pai') or item['id']) / dono['arquivo']
        out.append({'arquivo': str(arq), 't': float(pl['ini']), 'desde': float(item.get('inicio') or 0),
                    'dur': float(pl['fim']) - float(pl['ini']), 'ganho': float(q.get('som_ganho', 1.0)), 'grupo': 'midia'})
    return out


def mistura(p: Path, a: dict, clipes: list[dict], eventos: list[dict], duracao: float) -> tuple[dict, Path]:
    """O áudio pronto: a mistura numa passada só, o ganho do −14 LUFS medido sobre ela (`audio.medir`) e aplicado, num WAV
    em float (as mesmas amostras que a passada final faria: ela só codifica). Guardados em `.cache/audio.json` e
    `.cache/audio.wav` com a chave do que entra no áudio: o próprio grafo dele (a V1, a voz, os sons, o fundo, os níveis e
    o ducking) e o tamanho e a data de cada arquivo de entrada. Sem nada mudado no áudio, nem mede nem mistura de novo."""
    entradas, f = audio.filtros(a, clipes, eventos, 0, 'pfim', duracao, {'ganho': 0})
    arquivos = [Path(x) for x in entradas if x != '-i']
    chave = _hash(*entradas, *f, f'{duracao:.4f}', *(f'{x.stat().st_size}@{x.stat().st_mtime_ns}' for x in arquivos))
    guardada, wav = ler_json(p / '.cache' / 'audio.json') or {}, p / '.cache' / 'audio.wav'
    if guardada.get('chave') == chave and wav.exists():
        return guardada['medida'], wav
    (p / '.cache' / 'audio.json').unlink(missing_ok=True)  # a chave velha nunca fica apontando para um WAV novo
    # uma passada do grafo inteiro (sem o ganho final); a medida e o ganho só leem esse WAV (as mesmas amostras em float)
    # os sons somados numa faixa à parte (`sons.faixa`): um filtro por som no grafo era o grosso do tempo do áudio
    cru, parte, faixa = wav.with_suffix('.cru.wav'), wav.with_suffix('.parte.wav'), wav.with_suffix('.sons.wav')
    try:
        sons.faixa(audio.com_faders(a, eventos), duracao, faixa)
        entradas, f = audio.filtros(a, clipes, eventos, 0, 'pfim', duracao, {'cru': True}, faixa)
        ffmpeg(*entradas, '-filter_complex', ';'.join(f), '-map', '[pfim]', '-t', f'{duracao:.4f}', '-c:a', 'pcm_f32le', str(cru))
        m = audio.medir(a, clipes, eventos, duracao, cru)
        ffmpeg('-i', str(cru), '-af', f"{audio.final(m['ganho'])},aresample=48000,aformat=channel_layouts=stereo", '-c:a', 'pcm_f32le', str(parte))
    finally:
        cru.unlink(missing_ok=True)
        faixa.unlink(missing_ok=True)
    parte.replace(wav)
    gravar_json(p / '.cache' / 'audio.json', {'chave': chave, 'medida': m})
    return m, wav


# ---------------------------------------------------------------- a montagem por trechos

TRECHO = 20.0  # s: o tamanho mínimo de cada trecho da montagem
JUNTOS = 4  # trechos montados ao mesmo tempo


def fronteiras(clipes: list[dict], trechos: list[dict], transicoes: list[dict] | None, legenda: dict | None, n: int) -> list[int]:
    """Onde a montagem do proxy se divide (quadros do vídeo final, de 0 a `n`): a cada `TRECHO` s, nunca no meio de um
    insert ou motion nem de uma transição (com 2 quadros de folga); de preferência num corte e fora de um bloco de
    legenda. Cada fronteira é o 1º quadro do trecho seguinte."""
    proibido = set()
    for t in trechos:
        qs = exportacao.quadros(t, FPS)
        proibido.update(range(qs.start + 1, qs.stop))
    for x in transicoes or []:
        q0 = math.floor((x['t'] - x['antes']) * FPS)
        proibido.update(range(q0 - 2, math.ceil((x['t'] + x['depois']) * FPS) + 3))
    na_legenda = set()
    for b in (legenda or {}).get('blocos') or []:
        na_legenda.update(range(math.ceil(b['ini'] * FPS) + 1, math.ceil(b['fim'] * FPS)))
    acc, cortes = 0.0, set()
    for c in clipes:
        cortes.add(math.ceil(acc * FPS - 1e-9))
        acc += dur_saida(c)
    passo = round(TRECHO * FPS)
    out, q = [0], 0
    while n - q > passo * 1.5:
        janela = range(q + passo, min(q + 2 * passo, n - passo // 2))
        livres = [x for x in janela if x not in proibido]
        escolha = (next((x for x in livres if x in cortes and x not in na_legenda), None)
                   or next((x for x in livres if x not in na_legenda), None) or next(iter(livres), None))
        if escolha is None:  # nada livre: o trecho cresce até achar
            escolha = next((x for x in range(q + 2 * passo, n) if x not in proibido), None)
            if escolha is None:
                break
        out.append(escolha)
        q = escolha
    return [*out, n]


def fatia(clipes: list[dict], a: float, b: float) -> list[dict]:
    """Os clipes da V1 que tocam em [a, b) do vídeo final, recortados nesse intervalo (os tempos do bruto)."""
    acc, out = 0.0, []
    for c in clipes:
        d, v = dur_saida(c), c.get('vel', 1)
        x0, x1 = max(acc, a), min(acc + d, b)
        if x1 - x0 > 1e-6:
            pedaco = {**c, 'inicio': c['inicio'] + (x0 - acc) * v, 'fim': c['inicio'] + (x1 - acc) * v}
            if acc < a:  # começa no meio do clipe: o vídeo na grade do clipe inteiro (`desde_v` em `exportacao._ator`)
                q0 = math.ceil(acc * FPS - 1e-9)
                pedaco['desde_v'] = (c['inicio'] + (q0 / FPS - acc) * v, round(a * FPS) - q0)
            out.append(pedaco)
        acc += d
    # um último pedaço menor que um quadro (sem quadro nenhum do trecho) não entra: o concat do ator não aceita vazio
    while out and math.ceil((b - a - dur_saida(out[-1])) * FPS - 1e-9) >= math.ceil((b - a) * FPS - 1e-9):
        out.pop()
    return out


def _impressao(cmd: list[str], tmp: Path, nomes: dict[str, str]) -> str:
    """A chave de um trecho montado: o comando do ffmpeg com cada arquivo de entrada trocado pelo que ele é (os do tmp
    pelo conteúdo; os outros pelo tamanho e a data) e os caminhos de `nomes` (a saída, a legenda, o silêncio: os nomes
    mudam com o índice do trecho) pelo apelido dado."""
    partes = []
    for i, x in enumerate(cmd):
        if i and cmd[i - 1] == '-i' and x not in nomes:
            arq = Path(x)
            x = _hash_arquivo(arq) if arq.is_relative_to(tmp) else f'{x}@{arq.stat().st_size}@{arq.stat().st_mtime_ns}'
        for de, para in nomes.items():
            x = x.replace(de, para)
        partes.append(x)
    return _hash(*partes)


def montar_por_trechos(video: Path, clipes: list[dict], horizontal: bool, enq_x: float, w: int, h: int, codec: str, duracao: float,
                       trechos: list[dict], camadas: list[tuple[Path, float]], divisoes: list, r: dict, lk: dict, vinheta: Path | None,
                       mascara: Path | None, a: dict, destino: Path, hwaccel: bool, cache: Path, tmp: Path) -> list[str]:
    """A montagem (proxy ou final) em trechos de ~`TRECHO` s (`fronteiras`), cada um com o mesmo `comando_final` do vídeo
    inteiro, só com o que cai nele (no tempo dele), guardado em `cache/<chave>.mp4`: numa revisão, só os trechos em que
    algo mudou são montados de novo (e `JUNTOS` por vez). Depois, emendados sem recodificar, com o áudio pronto por
    cima. O bruto é lido a partir de pouco antes do 1º clipe do trecho (`-ss`), não do começo. Devolve as chaves."""
    n = math.ceil(duracao * FPS - 1e-9)
    com_quadros = [t for t in trechos if exportacao.quadros(t, FPS)]  # na ordem de `camadas`
    qs = fronteiras(clipes, trechos, r.get('transicoes'), r.get('legenda'), n)
    mudo = tmp / 'mudo.wav'  # o áudio de cada trecho é descartado (vai o pronto, inteiro): um silêncio curto no lugar
    ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.1', str(mudo))
    tarefas = []
    for i, (qa, qb) in enumerate(zip(qs, qs[1:])):
        ta, tb = qa / FPS, min(qb / FPS, duracao)
        seg = fatia(clipes, ta, tb)
        ss = max(min(min(c['inicio'], (c.get('desde_v') or (c['inicio'],))[0]) for c in seg) - 2, 0.0)
        seg = [{**c, 'inicio': c['inicio'] - ss, 'fim': c['fim'] - ss,
                **({'desde_v': (c['desde_v'][0] - ss, c['desde_v'][1])} if c.get('desde_v') else {})} for c in seg]
        cam = [(clipe, ini - ta) for (clipe, ini), t in zip(camadas, com_quadros)
               if qa <= exportacao.quadros(t, FPS).start and exportacao.quadros(t, FPS).stop <= qb]
        div = [(max(x0 - ta, 0.0), min(x1, tb) - ta, d) for x0, x1, d in divisoes if x0 < tb and x1 > ta]
        trans = [{**x, 't': x['t'] - ta} for x in r.get('transicoes') or [] if x['t'] + x['depois'] > ta and x['t'] - x['antes'] < tb]
        mov = [{**m, 'ini': m['ini'] - ta, 'fim': m['fim'] - ta} for m in r.get('movimentos') or [] if m['ini'] < tb and m['fim'] > ta]
        blocos = [{**b, 'ini': max(b['ini'] - ta, 0.0), 'fim': min(b['fim'], tb) - ta}
                  for b in (r.get('legenda') or {}).get('blocos') or [] if b['ini'] < tb and b['fim'] > ta]
        arq_leg = legenda.escrever({'blocos': blocos}, w, h, tmp / f'legenda_{i:03d}.ass')
        saida = tmp / f'trecho_{i:03d}.mp4'
        cmd = exportacao.comando_final(video, seg, horizontal, enq_x, w, h, FPS, div, cam, codec, tb - ta, saida, mascara, None, trans,
                                       {'arquivo': arq_leg} if arq_leg else None, lk, vinheta, {'pronta': mudo}, mov, hwaccel=hwaccel)
        # o trecho sai sem áudio: o AAC abre com 1024 amostras de atraso e o concat empurraria o vídeo junto (21 ms)
        k = cmd.index('-filter_complex')
        cmd[k + 1] += ';[am]anullsink'
        cmd = [x for i, x in enumerate(cmd) if x not in ('-progress', 'pipe:1') and x != '[am]' and not (x == '-map' and cmd[i + 1] == '[am]')]
        for arq in (video, mascara):  # o bruto e a máscara lidos a partir de `ss`
            if arq is not None and str(arq) in cmd:
                k = cmd.index(str(arq))
                cmd[k - 1:k - 1] = ['-ss', f'{ss:.3f}']
        nomes = {str(saida): '<saida>', str(mudo): '<mudo>', **({str(arq_leg): '<legenda>'} if arq_leg else {})}
        chave = _hash(_impressao(cmd, tmp, nomes), _hash_arquivo(arq_leg) if arq_leg else '')
        tarefas.append((chave, cmd, saida))
    cache.mkdir(parents=True, exist_ok=True)
    faltam = [(k, cmd, s) for k, cmd, s in tarefas if not (cache / f'{k}.mp4').exists()]
    print(f'      {len(tarefas)} trechos: {len(tarefas) - len(faltam)} do cache, {len(faltam)} para montar', flush=True)

    def montar(t: tuple[str, list[str], Path]) -> None:
        k, cmd, s = t
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f'ffmpeg falhou num trecho: {res.stderr[-600:]}')
        s.replace(cache / f'{k}.mp4')

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(JUNTOS) as pool:
        for j, _ in enumerate(pool.map(montar, faltam), 1):
            if j == len(faltam) or j % max(1, len(faltam) // 4) == 0:
                print(f'      {j}/{len(faltam)} montados', flush=True)
    lista = tmp / 'trechos.txt'
    lista.write_text(''.join(f"file '{cache / f'{k}.mp4'}'\n" for k, _, _ in tarefas))
    # a cor declarada por inteiro (BT.709 na matriz, nas primárias e na curva): o encoder do chip de vídeo só grava a
    # matriz, e um conversor que não acha as outras duas chuta outro padrão (no vturb, a pele saiu laranja)
    cor = f"{'hevc' if codec == 'hevc' else 'h264'}_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0"
    ffmpeg('-f', 'concat', '-safe', '0', '-i', str(lista), '-i', str(a['pronta']), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-bsf:v', cor,
           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
           *(['-tag:v', 'hvc1'] if codec == 'hevc' else []), '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', f'{duracao:.4f}',
           '-movflags', '+faststart', str(destino))
    return [k for k, _, _ in tarefas]


# ---------------------------------------------------------------- o render

def nome_de_arquivo(edicao: dict, slug: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[/\\:*?"<>|\n\r\t]+', ' ', edicao.get('nome') or slug)).strip().strip('.')[:120]


def saida_do_projeto(edicao: dict, sid: str) -> dict:
    x = next((x for x in edicao.get('saidas') or [] if isinstance(x, dict) and x.get('id') == sid and x.get('final')), None)
    if x is None:
        raise SystemExit(f'Não há a saída {sid} (cortes.py saidas <slug>).')
    return x


def render(slug: str, final: bool = False, saida: str | None = None, pasta_saida: Path | None = None,
           arquivo: Path | None = None) -> Path:
    """O render do projeto (o corpo) ou, com `saida`, de uma saída falada (o corpo + o final dela). No proxy, a versão
    nova traz também a prévia de cada saída (`versoes/vN/saidas/<id>/`); com `pasta_saida`, é o render de uma delas.
    `arquivo`: o destino do final (o corpo das saídas, no cache)."""
    t_ini = time.time()
    p = pasta(slug)
    edicao = ler(slug)
    # o cache guarda o que as últimas versões usaram: cada versão é o corpo e mais um render por saída falada
    guarda = GUARDA * (1 + sum(1 for x in edicao.get('saidas') or [] if isinstance(x, dict) and (x.get('final') or {}).get('tipo') == 'falado'))
    sx = None
    corpo_dur = 0.0
    if saida:
        sx = saida_do_projeto(edicao, saida)
        if sx['final']['tipo'] != 'falado' or not sx.get('V1'):
            raise SystemExit(f'A saída {saida} não é falada: as de CTA e as sem final saem do corpo (render.py {slug} --final --saida {saida}).')
        corpo_dur = sum(dur_saida(c) for c in v1_tocada(edicao))
        edicao = {**edicao, 'timeline': {**(edicao.get('timeline') or {}), 'V1': sx['V1']}}
    clipes = v1_tocada(edicao)
    if not clipes:
        raise SystemExit(f'O projeto {slug} ainda não tem cortes (timeline.V1 vazia).')
    fonte = next(f for f in edicao['fontes'] if f['papel'] == 'bruto')
    duracao = sum(dur_saida(c) for c in clipes)
    w, h, codec = FINAL if final else PROXY
    horizontal = (fonte.get('largura') or 0) > (fonte.get('altura') or 0)
    transcricao = (ler_json(p / 'transcricao.json') or {}).get('palavras', [])
    fases: dict[str, float] = {}
    avisos: list[str] = []
    # o ator embaixo (divisão `atras`) só existe na tela dividida: num insert de tela cheia ele some sem erro
    avisos += [f"{x['plano']}: o ator embaixo (divisão atras) só vale em Tela dividida · insert; neste {x.get('tipo')} o ator não aparece."
               for x in (edicao.get('inserts') or {}).get('pedidos') or []
               if (x.get('enriquecimento') or {}).get('divisao') == 'atras' and x.get('tipo') != 'tela_dividida_insert']
    marca = [time.time()]

    def fase(nome: str) -> None:
        fases[nome] = round(time.time() - marca[0], 1)
        print(f'      {fases[nome]:.1f} s', flush=True)
        marca[0] = time.time()

    if final:
        # em final/ só as entregas, com o mesmo nome a cada export (o novo substitui o antigo)
        nome = nome_de_arquivo(edicao, slug)
        destino = arquivo or p / 'final' / (f'{nome} - {sx["destino"]}.mp4' if sx else f'{nome}.mp4')
        pasta_versao = None
        versao = None
    elif pasta_saida:  # a prévia de uma saída, dentro da versão que o corpo está montando
        pasta_versao = None
        versao = None
        pasta_saida.mkdir(parents=True, exist_ok=True)
        destino = pasta_saida / 'proxy.mp4'
    else:
        versao = 1 + max([int(m.group(1)) for x in (p / 'versoes').glob('v*') if (m := re.fullmatch(r'v(\d+)', x.name))], default=0)
        pasta_versao = p / 'versoes' / f'.v{versao}.parte'  # vira vN no fim: o app nunca vê uma versão pela metade
        shutil.rmtree(pasta_versao, ignore_errors=True)
        pasta_versao.mkdir(parents=True)
        destino = pasta_versao / 'proxy.mp4'
        # o aviso do app ("Claude trabalhando"): agora é o render da versão nova (sem aviso antes, sem os blocos)
        aviso_app = p / 'revisoes' / 'trabalhando.json'
        if (p / 'revisoes').is_dir():
            gravar_json(aviso_app, {'blocos': [], 'desde': datetime.now().isoformat(timespec='seconds'), **(ler_json(aviso_app, {}) or {}),
                                    'fase': 'renderizando', 'para': versao})
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='.render-', dir=p))
    srv = servidor.servir(0)
    print(f'Render de {slug}: {"final 2160×3840 HEVC" if final else f"prévia da saída {saida}" if pasta_saida else f"proxy v{versao} 720×1280 H.264"}, {duracao:.1f} s de vídeo', flush=True)
    try:
        print('[1/5] Banco: cópias de exportação dos vídeos', flush=True)
        n = copias_do_banco(edicao)
        if n:
            print(f'      {n} feita(s)', flush=True)
        fase('banco')

        url = pagina(slug, srv.server_address[1]) + (f'&saida={saida}' if saida else '')
        print(f'[2/5] Página de render: {url}', flush=True)
        r = ler_pagina(url)
        if r.get('duracao') is not None and abs(float(r['duracao']) - duracao) > 0.05:
            avisos.append(f"A página diz {float(r['duracao']):.2f} s de vídeo e a V1 dá {duracao:.2f} s.")
        trechos = r['trechos'] or []
        print(f"      {len(trechos)} trechos de insert/motion, {len(r['sons'] or [])} sons, {len(r['transicoes'] or [])} transições, "
              f"{len((r['legenda'] or {}).get('blocos') or [])} blocos de legenda", flush=True)
        fase('pagina')

        print('[3/5] Fotos da camada dos inserts', flush=True)
        cache = p / '.cache' / 'camadas'
        with _cadeado_camadas(p, esperar=True):  # um pré-render rodando: espera ele e usa o que ele fotografou
            camadas, chaves = camada(url, trechos, w, h, cache, tmp)
        fase('fotos')

        print('[4/5] Áudio: a voz, o fundo e o −14 LUFS', flush=True)
        a, eventos, receita = receita_do_audio(p, edicao, fonte, clipes, transcricao, r, saida, duracao, avisos)
        a['medida'], a['pronta'] = mistura(p, a, clipes, eventos, duracao)
        print(f"      voz {a['limpeza']}, fundo {(edicao.get('audio') or {}).get('fundo') or '—'}, ganho {a['medida']['ganho']:+.1f} dB → "
              f"{a['medida']['i']:.1f} LUFS, pico {a['medida']['pico']} dBFS", flush=True)
        fase('audio')

        print(f'[5/5] Montagem (ffmpeg, por trechos de ~{TRECHO:.0f} s)', flush=True)
        divisoes = [(t['ini'], t['fim'], t.get('divisao') or {'modo': 'metade', 'f': 0.5}) for t in trechos if t['dividida']]
        mascara = p / 'midia' / 'recorte' / f"{fonte['id']}_mascara.mp4"
        lk = look.do_projeto(edicao)
        vinheta = look.mascara_vinheta(w, h, look.VINHETAS[lk['vinheta']], tmp / 'vinheta.png') if look.ativo(lk) else None
        parte = destino.with_name(destino.stem + '.parte.mp4')
        # no proxy, o ator sai do proxy 720p (a mesma linha do tempo do bruto): decodificar e escalar o 4K pesava mais que tudo
        video = p / fonte['arquivo']
        if not final and not horizontal and fonte.get('proxy') and (p / fonte['proxy']).exists():
            video = p / fonte['proxy']  # leve: decodificado no processador (`hwaccel` abaixo)
        # por trechos guardados, no proxy e no final: numa revisão, só o que mudou é montado de novo (e 4 por vez)
        montados = p / '.cache' / 'trechos'
        usados = montar_por_trechos(video, clipes, horizontal, (edicao.get('enquadramento') or {}).get('x', 0.5), w, h, codec, duracao,
                                    trechos, camadas, divisoes, r, lk, vinheta, mascara if mascara.exists() else None, a, parte,
                                    video == p / fonte['arquivo'], montados, tmp)
        parte.replace(destino)
        fase('montagem')
        limpar_camadas(montados, usados, '.mp4', guarda)
        if chaves is not None:
            limpar_camadas(cache, chaves, guarda=guarda)
    except BaseException:
        if pasta_versao:
            shutil.rmtree(pasta_versao, ignore_errors=True)
        else:
            destino.with_name(destino.stem + '.parte.mp4').unlink(missing_ok=True)
        raise
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)

    fases['total'] = round(time.time() - t_ini, 1)
    duracao_real = inspecionar(destino)['duracao']
    if final:  # ao lado do vídeo, a transcrição dele (a fala que ficou no corte), como as saídas do encaixar
        import encaixar
        md = destino.with_suffix('.md')
        md.write_text(f"# {edicao.get('nome') or slug}\n\n`{destino.name}` · {int(duracao_real // 60)}:{int(duracao_real % 60):02d}\n\n"
                      f"{encaixar.paragrafos([w['texto'] for w in palavras_na_saida(transcricao, clipes)])}\n", encoding='utf-8')
        print(f'Transcrição: {md}')
    if pasta_saida:  # a prévia de uma saída: os dados dela ao lado do vídeo (o app troca para eles); a versão é do corpo
        receita['a']['medida'] = a['medida']
        gravar_json(pasta_saida / 'audio.json', receita)  # a música ao vivo e a remistura dela (`sem_musica`, `remixar`)
        for campo in ('palavras', 'planos'):
            if r.get(campo) is not None:
                gravar_json(pasta_saida / f'{campo}.json', r[campo])
        gravar_json(pasta_saida / 'info.json', {'saida': saida, 'destino': sx['destino'], 'final': 'falado', 'duracao': duracao_real,
                                                'corpo': round(corpo_dur, 3), 'criado_em': datetime.now().isoformat(timespec='seconds')})
        print(f'Saída {saida}: {destino}')
        return destino
    if final and sx:
        marcar_exportada(slug, saida, destino)
    if not final:
        gravar_json(pasta_versao / 'edicao.json', edicao)
        receita['a']['medida'] = a['medida']  # o ganho do −14 LUFS: o áudio sem música (`sem_musica`) leva o mesmo
        gravar_json(pasta_versao / 'audio.json', receita)
        for campo in ('palavras', 'planos'):
            if r.get(campo) is None:
                avisos.append(f'A página não entregou __render.{campo}: {campo}.json ficou de fora.')
            else:
                gravar_json(pasta_versao / f'{campo}.json', r[campo])
        gravar_json(pasta_versao / 'info.json', {'versao': versao, 'duracao': duracao_real, 'criado_em': datetime.now().isoformat(timespec='seconds'),
                                                 'fases': fases, 'avisos': avisos})
        previas_das_saidas(slug, edicao, pasta_versao, duracao_real)
        final_dir = p / 'versoes' / f'v{versao}'
        pasta_versao.replace(final_dir)
        (p / 'revisoes' / 'trabalhando.json').unlink(missing_ok=True)  # a versão chegou: o app tira o aviso
        destino = final_dir / 'proxy.mp4'
    for x in avisos:
        print(f'Aviso: {x}')
    print(f'Pronto: {destino}')
    print(f'Duração {duracao_real:.2f} s · ' + ' · '.join(f'{k} {v:.1f} s' for k, v in fases.items()))
    return destino


# ---------------------------------------------------------------- as saídas (corpo + final)

def previas_das_saidas(slug: str, edicao: dict, pasta_versao: Path, corpo_dur: float) -> None:
    """A prévia de cada saída na versão nova: a falada é renderizada (o corpo vem todo do cache); a de CTA é o corpo
    emendado no proxy mais novo do CTA (com as palavras e os planos dele depois dos do corpo); a sem final é o próprio
    corpo (nada a fazer)."""
    for x in [x for x in edicao.get('saidas') or [] if isinstance(x, dict) and x.get('final')]:
        alvo = pasta_versao / 'saidas' / x['id']
        tipo = x['final']['tipo']
        print(f'\n— Saída {x["destino"]} ({tipo})', flush=True)
        if tipo == 'falado' and x.get('V1'):
            render(slug, saida=x['id'], pasta_saida=alvo)
        elif tipo == 'cta':
            previa_cta(x, pasta_versao, alvo, corpo_dur)


def previa_da_saida(slug: str, sid: str) -> None:
    """A prévia de uma saída de CTA criada depois do render (o + Saída do app), na versão mais nova do projeto: o app
    mostra a saída assim que ela fica pronta, sem esperar a próxima versão."""
    x = saida_do_projeto(ler(slug), sid)
    v = versao_mais_nova(slug)
    if x['final']['tipo'] != 'cta' or v is None:
        return
    pv = pasta(slug) / 'versoes' / f'v{v}'
    previa_cta(x, pv, pv / 'saidas' / sid, float((ler_json(pv / 'info.json', {}) or {}).get('duracao') or 0))


def versao_mais_nova(slug: str) -> int | None:
    vs = [int(m.group(1)) for x in (pasta(slug) / 'versoes').glob('v*') if (m := re.fullmatch(r'v(\d+)', x.name)) and (x / 'proxy.mp4').exists()]
    return max(vs, default=None)


def previa_cta(x: dict, pasta_versao: Path, alvo: Path, corpo_dur: float) -> None:
    """A prévia de uma saída de CTA à parte: o proxy do corpo seguido do proxy mais novo do CTA (a emenda de verdade, com a
    transição, é a do export). As palavras e os planos do CTA entram depois dos do corpo, com os ids marcados (cta:…)."""
    cta = x['final']['cta']
    vc = versao_mais_nova(cta)
    if vc is None:
        print(f'      o CTA {cta} ainda não tem versão: a prévia desta saída fica de fora', flush=True)
        return
    dc = pasta(cta) / 'versoes' / f'v{vc}'
    alvo.mkdir(parents=True, exist_ok=True)
    corpo = pasta_versao / 'proxy.mp4'
    wav = alvo / '.audio.wav'
    try:
        mix = mix_da_saida(pasta_versao / 'audio.json', dc / 'audio.json', inspecionar(corpo)['duracao'], inspecionar(dc / 'proxy.mp4')['duracao'],
                           x['final'].get('transicao') or 'luz-colorida', wav, alvo / 'sem-musica.m4a')
        ffmpeg('-i', str(corpo), '-i', str(dc / 'proxy.mp4'), '-i', str(wav), '-filter_complex',
               '[0:v]scale=720:1280,setsar=1,fps=24[a];[1:v]scale=720:1280,setsar=1,fps=24[b];[a][b]concat=n=2:v=1:a=0[v]',
               '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(alvo / 'proxy.mp4'))
    finally:
        wav.unlink(missing_ok=True)

    def lista(arq: Path, chave: str) -> list:
        d = ler_json(arq, []) or []
        return d if isinstance(d, list) else d.get(chave, [])

    for campo in ('palavras', 'planos'):
        do_corpo = lista(pasta_versao / f'{campo}.json', campo)
        do_cta = [{**w, 'id': f'cta:{w["id"]}', **{k: round(w[k] + corpo_dur, 3) for k in ('ini', 'fim') if k in w}}
                  for w in lista(dc / f'{campo}.json', campo)]
        gravar_json(alvo / f'{campo}.json', do_corpo + do_cta)
    gravar_json(alvo / 'info.json', {'saida': x['id'], 'destino': x['destino'], 'final': 'cta', 'cta': cta, 'cta_versao': vc,
                                     'duracao': inspecionar(alvo / 'proxy.mp4')['duracao'], 'corpo': round(corpo_dur, 3),
                                     'musica': {'ganho': mix['ganho'], 'falas': mix['falas']},  # a prévia ao vivo (`dados_musica`)
                                     'criado_em': datetime.now().isoformat(timespec='seconds')})
    print(f'      corpo + {cta} v{vc}', flush=True)


def receita_do_audio(p: Path, edicao: dict, fonte: dict, clipes: list[dict], transcricao: list[dict], r: dict, saida: str | None,
                     duracao: float, avisos: list[str]) -> tuple[dict, list[dict], dict]:
    """O que entra no áudio: a voz e o fundo (`som`), os sons da página (no nível desta voz), os das mídias e as falas
    gravadas à parte. Devolve (a, eventos, receita): a receita (sem o fundo misturado ainda) fica na versão
    (`audio.json`) para a saída de CTA misturar de novo o corpo e o CTA juntos (`mix_da_saida`)."""
    nivel = edicao.get('nivel_voz') or {}
    db_voz = nivel.get('db') if nivel.get('fonte') == fonte['id'] else sons.nivel_da_voz(p / fonte['arquivo'])
    fator = sons.fator_da_voz(db_voz)  # os sons na mesma relação com a voz deste vídeo que nas referências
    eventos = [{**ev, 'ganho': float(ev.get('ganho', sons.INTENSIDADES['baixo'])) * fator} for ev in r['sons'] or []]
    eventos += sons_das_midias(edicao, r.get('planos') or [])
    extras = falas_extras(p, edicao, transcricao, clipes, saida)
    eventos += extras
    a = som(p, edicao, fonte, clipes, transcricao, avisos)
    a['falas'] = sorted([*a['falas'], *((e['t'], e['t'] + e['dur']) for e in extras)])  # o fundo abaixa também nelas
    receita = json.loads(json.dumps({'a': a, 'clipes': clipes, 'eventos': eventos, 'duracao': duracao, 'fator': fator}, default=str))
    return a, eventos, receita


def receita(arq: Path) -> dict:
    """A receita do áudio de uma versão (`versoes/vN/audio.json`, gravada pelo render). Numa versão de antes dela, é
    feita agora a partir da edição do projeto (só a página e o áudio: nada é fotografado nem montado) e fica guardada."""
    r = ler_json(arq)
    if r:
        return r
    slug = arq.parents[2].name
    p, edicao = pasta(slug), ler(slug)
    clipes = v1_tocada(edicao)
    fonte = next(f for f in edicao['fontes'] if f['papel'] == 'bruto')
    transcricao = (ler_json(p / 'transcricao.json') or {}).get('palavras', [])
    print(f'      {slug}: a receita do áudio (a versão é de antes dela)', flush=True)
    srv = servidor.servir(0)
    try:
        pg = ler_pagina(pagina(slug, srv.server_address[1]))
    finally:
        srv.shutdown()
    _, _, rec = receita_do_audio(p, edicao, fonte, clipes, transcricao, pg, None, sum(dur_saida(c) for c in clipes), [])
    gravar_json(arq, rec)
    return rec


def mix_da_saida(rec_corpo: Path, rec_cta: Path, dur_corpo: float, dur_cta: float, transicao: str, destino: Path,
                 sem_musica: Path | None = None) -> dict:
    """O áudio de uma saída de CTA à parte, numa mistura só, para não dar para perceber onde o corpo acaba e o CTA começa:
    - a voz do CTA **casada** com a do corpo: o mesmo equilíbrio por faixa de frequência (um equalizador medido nas duas
      vozes já tratadas, `audio.casar_voz`) e a mesma sonoridade (o CTA inteiro, voz e sons, sobe ou desce junto);
    - **uma trilha só** (a do corpo), do começo ao fim da saída: sem corte nem volta na emenda, o ducking pelas falas dos
      dois e o fade só no fim;
    - o som da transição na emenda e o −14 LUFS medido na saída inteira.
    As vozes e os sons de cada lado saem da receita do render (`versoes/vN/audio.json`). Devolve o que foi casado.
    `sem_musica`: também a mistura sem a trilha, com o mesmo ganho (a prévia ao vivo da música na revisão)."""
    rc, rk = receita(rec_corpo), receita(rec_cta)
    tmp = Path(tempfile.mkdtemp(prefix='.mix-', dir=destino.parent))
    try:
        # o corpo já veio editado (timbre `pronto`, a música dele dentro da mistura): o CTA leva a trilha dele e só o
        # volume se iguala (a voz do corpo não dá para medir sozinha, misturada com a música)
        pronto = rc['a'].get('timbre') == 'pronto'

        def lado(r: dict, nome: str, dur: float, eventos: bool = True, casar: str = '', com_fundo: bool = False) -> Path:
            a = {**r['a'], 'fundo_mudo': not com_fundo, 'casar': casar}
            ev = r['eventos'] if eventos else []
            faixa = tmp / f'{nome}.sons.wav'
            sons.faixa(audio.com_faders(a, ev), r['duracao'], faixa)
            entradas, f = audio.filtros(a, r['clipes'], ev, 0, 'pfim', r['duracao'], {'cru': True}, faixa)
            out = tmp / f'{nome}.wav'
            # na duração do vídeo de cada lado (o mp4 pode ter uns quadros a mais ou a menos que a V1)
            ffmpeg(*entradas, '-filter_complex', ';'.join(f) + f';[pfim]apad,atrim=end={dur:.4f}[pcorte]', '-map', '[pcorte]',
                   '-c:a', 'pcm_f32le', str(out))
            return out

        if pronto:
            corpo, cta = lado(rc, 'corpo', dur_corpo), lado(rk, 'cta', dur_cta, com_fundo=True)
            eq, dif, resto, nivel = '', [], [], round(audio.lufs(corpo) - audio.lufs(cta), 2)
        # 1. as vozes sozinhas, já tratadas: o equilíbrio e a sonoridade de cada uma
        if not pronto:
            vc, vk = lado(rc, 'voz-corpo', dur_corpo, False), lado(rk, 'voz-cta', dur_cta, False)
            ref = audio.espectro_voz(vc)
            eq, dif = audio.casar_voz(ref, audio.espectro_voz(vk))
            if eq:  # uma segunda medida, já com o equalizador: os picos vizinhos se somam, então corrige o que sobrou
                vk = lado(rk, 'voz-cta', dur_cta, False, eq)
                eq2, _ = audio.casar_voz(ref, audio.espectro_voz(vk))
                if eq2:
                    eq = f'{eq},{eq2}'
                    vk = lado(rk, 'voz-cta', dur_cta, False, eq)
            resto = [round(x, 1) for x in audio.casar_voz(ref, audio.espectro_voz(vk))[1]]
            nivel = round(audio.lufs(vc) - audio.lufs(vk), 2)
            # 2. cada lado com os sons; o CTA com o equalizador e no nível do corpo
            corpo, cta = lado(rc, 'corpo', dur_corpo), lado(rk, 'cta', dur_cta, True, eq)
        total = dur_corpo + dur_cta
        a = {**rc['a'], 'fade_fim': True,
             'falas': [*rc['a']['falas'], *([i + dur_corpo, f + dur_corpo] for i, f in rk['a']['falas'])]}
        entradas = ['-i', str(corpo), '-i', str(cta)]
        f = [f'[1:a]volume={nivel:.2f}dB[pk]', '[0:a][pk]concat=n=2:v=0:a=1[pcat]']
        atual = 'pcat'
        tr = ler_json(BIBLIOTECA / 'transicoes' / f'{transicao}.json', {}) or {}
        som_tr = tr.get('som') or {}
        if som_tr.get('som'):  # o som da transição na emenda, como os das transições do vídeo
            ganho = sons.INTENSIDADES.get(som_tr.get('intensidade', 'medio'), 0.5) * float(rc.get('fator') or 1) * audio.db(a['niveis']['transicoes'])
            atraso = int(max(dur_corpo + float(som_tr.get('atraso') or 0), 0) * 1000)
            entradas += ['-i', str(sons.arquivo(som_tr['som']))]
            f.append(f'[2:a]aresample=48000,aformat=channel_layouts=stereo,volume={ganho:.4f},adelay={atraso}|{atraso}[ptr]')
            f.append(f'[{atual}][ptr]amix=inputs=2:duration=first:normalize=0[pcomtr]')
            atual = 'pcomtr'
        sem_f = (list(entradas), list(f), atual)
        if a.get('fundo') and not a.get('fundo_mudo'):
            ent_f, f_f = audio.filtros_fundo(a, total, entradas.count('-i'), 'pfd')
            entradas += ent_f
            f += f_f
            f.append(f'[{atual}][pfd]amix=inputs=2:duration=first:normalize=0[pcomf]')
            atual = 'pcomf'
        cru = tmp / 'cru.wav'
        ffmpeg(*entradas, '-filter_complex', ';'.join(f) + f';[{atual}]aresample=48000,aformat=channel_layouts=stereo[pfim]',
               '-map', '[pfim]', '-t', f'{total:.4f}', '-c:a', 'pcm_f32le', str(cru))
        m = audio.medir(a, [], [], total, cru)
        ffmpeg('-i', str(cru), '-af', f"{audio.final(m['ganho'])},aresample=48000,aformat=channel_layouts=stereo", '-c:a', 'pcm_f32le', str(destino))
        if sem_musica:
            ent_s, f_s, at_s = sem_f
            ffmpeg(*ent_s, '-filter_complex', ';'.join(f_s) + f";[{at_s}]{audio.final(m['ganho'])},aresample=48000,aformat=channel_layouts=stereo[pfim]",
                   '-map', '[pfim]', '-t', f'{total:.4f}', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(sem_musica))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    casado = {'nivel_db': nivel, 'eq': eq, 'diferenca_db': dif, 'sobra_db': resto, 'lufs': m['i'], 'ganho': m['ganho'], 'falas': a['falas']}
    if pronto:
        print(f"      áudio da saída: corpo já editado; CTA {nivel:+.1f} dB, com a trilha dele; {m['i']:.1f} LUFS", flush=True)
    else:
        print(f"      áudio da saída: voz do CTA {nivel:+.1f} dB, timbre {' '.join(f'{d:+.1f}' for d in dif)} dB por oitava → "
              f"sobra {' '.join(f'{d:+.1f}' for d in resto)}; uma trilha só; {m['i']:.1f} LUFS", flush=True)
    return casado


def marcar_exportada(slug: str, sid: str, arquivo: Path, cta_versao: int | None = None) -> None:
    edicao = ler(slug)
    x = saida_do_projeto(edicao, sid)
    x['exportado'] = {'arquivo': str(arquivo.relative_to(pasta(slug))), 'em': datetime.now().isoformat(timespec='seconds')} | (
        {'cta_versao': cta_versao} if cta_versao else {})
    gravar_json(pasta(slug) / 'edicao.json', edicao)


def final_mais_novo(slug: str) -> Path | None:
    finais = sorted((pasta(slug) / 'final').glob('*.mp4'), key=lambda a: a.stat().st_mtime)
    return finais[-1] if finais else None


def estado_do_corpo(edicao: dict) -> str:
    """A assinatura do que o corpo mostra: a edição sem o que não entra no vídeo (o nome, as saídas, a lixeira, as notas)."""
    resto = {k: v for k, v in edicao.items() if k not in ('nome', 'criado_em', 'saidas', 'oculto', 'notas', 'tags')}
    return hashlib.sha1(json.dumps(resto, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def corpo_final(slug: str) -> Path:
    """O corpo em 4K que as saídas usam (`.cache/final/corpo.mp4`), feito de novo só se o que ele mostra mudou (exportar
    uma saída, renomear ou mexer nas saídas não refaz o corpo)."""
    f = pasta(slug) / '.cache' / 'final' / 'corpo.mp4'
    marca = f.with_suffix('.json')
    estado = estado_do_corpo(ler(slug))
    if not f.exists() or (ler_json(marca, {}) or {}).get('estado') != estado:
        f.parent.mkdir(parents=True, exist_ok=True)
        render(slug, final=True, arquivo=f)
        gravar_json(marca, {'estado': estado, 'em': datetime.now().isoformat(timespec='seconds')})
    return f


def exportar_saida(slug: str, sid: str) -> Path:
    """O arquivo de uma saída em final/<nome> - <destino>.mp4 (+ .md): a falada é renderizada em 4K com o final; a
    de CTA é o final do corpo emendado no final do CTA (encaixar.py, com a transição destacada); a sem final é o corpo."""
    import encaixar
    edicao = ler(slug)
    x = saida_do_projeto(edicao, sid)
    tipo = x['final']['tipo']
    if tipo == 'falado':
        return render(slug, final=True, saida=sid)
    destino = pasta(slug) / 'final' / f'{nome_de_arquivo(edicao, slug)} - {x["destino"]}.mp4'
    destino.parent.mkdir(parents=True, exist_ok=True)
    corpo = corpo_final(slug)
    if tipo == 'cta':
        cta = x['final']['cta']
        if final_mais_novo(cta) is None:
            raise SystemExit(f'O CTA {cta} ainda não tem final em 4K: exporte ele antes (render.py {cta} --final).')
        for velho in (destino, destino.with_suffix('.md')):
            velho.unlink(missing_ok=True)  # o export novo substitui o anterior desta saída
        transicao = x['final'].get('transicao') or 'luz-colorida'
        vc, vb = versao_mais_nova(cta), versao_mais_nova(slug)
        wav = destino.with_suffix('.audio.wav')
        try:  # o áudio da saída inteira numa mistura só: a voz do CTA casada com a do corpo e uma trilha só, sem emenda
            mix_da_saida(pasta(slug) / 'versoes' / f'v{vb}' / 'audio.json', pasta(cta) / 'versoes' / f'v{vc}' / 'audio.json',
                         inspecionar(corpo)['duracao'], inspecionar(final_mais_novo(cta))['duracao'], transicao, wav)
            encaixar.encaixar(slug, cta, destino, transicao, x['destino'], audio=wav, corpo=corpo)
        finally:
            wav.unlink(missing_ok=True)
        marcar_exportada(slug, sid, destino, versao_mais_nova(cta))
    else:  # sem final: o corpo, com o nome da saída
        shutil.copy2(corpo, destino)
        if corpo.with_suffix('.md').exists():
            destino.with_suffix('.md').write_text(corpo.with_suffix('.md').read_text(encoding='utf-8').replace(
                f'`{corpo.name}`', f'`{destino.name}`', 1), encoding='utf-8')
        marcar_exportada(slug, sid, destino)
    print(f'Saída {x["destino"]}: {destino}')
    return destino


@contextmanager
def _cadeado_camadas(p: Path, esperar: bool):
    """Um só fotografando a camada de um projeto por vez (o pré-render e o render da entrega dividem o cache). Sem
    `esperar`, sai com False se já há outro."""
    arq = p / '.cache' / 'camadas.trava'
    arq.parent.mkdir(parents=True, exist_ok=True)
    with open(arq, 'w') as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | (0 if esperar else fcntl.LOCK_NB))
        except BlockingIOError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def pre_render(slug: str, final: bool = False) -> None:
    """O pré-render: fotografa para o cache (`.cache/camadas/`) os trechos de insert e motion do estado de agora, sem
    áudio, montagem nem versão. Rodado em segundo plano a cada leva de inserts que fica pronta, o render da entrega acha
    a camada quase toda feita (só o que mudou depois é fotografado de novo). Já há um rodando: sai sem fazer nada.
    `final`: no tamanho do 4K (o cache guarda cada tamanho à parte): rodado enquanto o criador revisa a última versão,
    o `--final` acha a camada pronta e só monta (a foto do 4K é a maior parte do tempo do export)."""
    t0 = time.time()
    p = pasta(slug)
    edicao = ler(slug)
    if not v1_tocada(edicao):
        raise SystemExit(f'O projeto {slug} ainda não tem cortes.')
    w, h, _ = FINAL if final else PROXY
    with _cadeado_camadas(p, esperar=False) as livre:
        if not livre:
            print('Já há um pré-render deste projeto rodando: nada a fazer (o próximo pega o que mudou).')
            return
        tmp = Path(tempfile.mkdtemp(prefix='.prerender-', dir=p))
        srv = servidor.servir(0)
        try:
            copias_do_banco(edicao)
            url = pagina(slug, srv.server_address[1])
            trechos = ler_pagina(url)['trechos'] or []
            camada(url, trechos, w, h, p / '.cache' / 'camadas', tmp)
        finally:
            srv.shutdown()
            shutil.rmtree(tmp, ignore_errors=True)
    print(f'Pré-render de {slug}: {len(trechos)} trechos no cache em {time.time() - t0:.0f} s')


AMOSTRA = 3.0  # s do provador de look


def amostra_look(slug: str, t: float, lk: dict) -> Path:
    """O provador de look da revisão: um trecho de 3 s do ator, tirado do bruto no instante `t` do vídeo final (sem
    inserts nem legenda: o look só vale no ator), recortado em 9:16 como no render e com o LUT, a intensidade e a
    vinheta dados. Guardado em `.cache/look/` pelo look e pelo instante (pedir de novo é instantâneo). Devolve o arquivo."""
    p = pasta(slug)
    edicao = ler(slug)
    clipes = v1_tocada(edicao)
    if not clipes:
        raise SystemExit('O projeto ainda não tem cortes.')
    lk = {**look.PADRAO, **lk}
    if lk.get('lut') and lk['lut'] not in look.NOMES:
        raise SystemExit(f'LUT desconhecido: {lk["lut"]}')
    if lk['vinheta'] not in look.VINHETAS:
        raise SystemExit(f'Vinheta desconhecida: {lk["vinheta"]}')
    if lk.get('nitidez', 'sem') not in look.NITIDEZ:
        raise SystemExit(f'Nitidez desconhecida: {lk["nitidez"]}')
    acc, src = 0.0, clipes[0]['inicio']
    for c in clipes:  # o instante do bruto que toca em t (a amostra segue o bruto dali: para ver a cor, basta)
        d = dur_saida(c)
        if t < acc + d:
            src = c['inicio'] + max(t - acc, 0) * c.get('vel', 1)
            break
        acc += d
    else:
        src = clipes[-1]['inicio']
    chave = hashlib.sha1(json.dumps([round(src, 2), lk], sort_keys=True).encode()).hexdigest()[:16]
    destino = p / '.cache' / 'look' / f'{chave}.mp4'
    if destino.exists():
        return destino
    fonte = next(f for f in edicao['fontes'] if f['papel'] == 'bruto')
    w, h = PROXY[:2]
    horizontal = (fonte.get('largura') or 0) > (fonte.get('altura') or 0)
    x = (edicao.get('enquadramento') or {}).get('x', 0.5)
    recorte = f'crop=w=trunc(ih*9/16/2)*2:h=ih:x=(iw-ow)*{x:.4f},' if horizontal else ''
    destino.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        entradas = ['-ss', f'{src:.3f}', '-t', f'{AMOSTRA}', '-i', str(p / fonte['arquivo'])]
        mascara = None
        if look.VINHETAS[lk['vinheta']] > 0:
            entradas += ['-i', str(look.mascara_vinheta(w, h, look.VINHETAS[lk['vinheta']], Path(tmp) / 'vinheta.png'))]
            mascara = 1
        grafo = [f'[0:v]{recorte}scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={FPS}[ator_cru]']
        grafo += look.filtros(lk, 'ator_cru', 'lk', mascara, h) if look.ativo(lk) else ['[ator_cru]null[lk]']
        grafo.append('[lk]format=yuv420p[saida]')
        parcial = destino.with_suffix(f'.{os.getpid()}.tmp.mp4')  # duas amostras iguais pedidas juntas não se atropelam
        ffmpeg(*entradas, '-filter_complex', ';'.join(grafo), '-map', '[saida]', '-an', '-c:v', 'libx264', '-preset', 'veryfast',
               '-crf', '20', '-movflags', '+faststart', str(parcial))
        parcial.replace(destino)
    return destino


def _previa_motion(args: tuple[str, float, str, int]) -> str:
    """Uma prévia (num processo à parte): a página do motion com o tempo nas mãos daqui, fotografada quadro a quadro."""
    from playwright.sync_api import sync_playwright
    mid, dur, destino, porta = args
    mp4 = Path(destino)
    FPS = 30
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chromium')
        try:
            pg = browser.new_page(viewport={'width': 360, 'height': 640}, device_scale_factor=2)
            pg.goto(f'http://127.0.0.1:{porta}/render/motion.html?preset={mid}&formato=vertical&tocar=1', wait_until='load', timeout=60_000)
            pg.wait_for_function('() => !!window.__ir', timeout=30_000)
            # o tempo passa a ser daqui: o loop da galeria fica sem efeito e o vídeo do fundo para
            pg.evaluate("""() => { window.__irDeVerdade = window.__ir; window.__ir = () => Promise.resolve()
                                   for (const v of document.querySelectorAll('#fundo video')) v.pause() }""")
            pg.wait_for_timeout(300)  # as fontes
            tmp = mp4.with_suffix('.parte.mp4')
            proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                                     '-an', '-c:v', 'libx264', '-crf', '24', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
                                     '-movflags', '+faststart', str(tmp)], stdin=subprocess.PIPE)
            try:
                for k in range(int(round((dur + 0.6) * FPS))):
                    pg.evaluate("""async (t) => {
                        await window.__irDeVerdade(t)
                        for (const v of document.querySelectorAll('#fundo video'))
                            if (v.duration) { v.currentTime = t % v.duration; await new Promise((r) => v.addEventListener('seeked', r, { once: true })) }
                        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
                    }""", min(k / FPS, dur))
                    proc.stdin.write(pg.screenshot(type='jpeg', quality=90))
            finally:
                proc.stdin.close()
                proc.wait()
            if proc.returncode:
                tmp.unlink(missing_ok=True)
                return f'{mid}: o ffmpeg falhou'
            tmp.replace(mp4)
            return f'{mid}: {dur:.1f} s'
        finally:
            browser.close()


def previas_motions(refazer: bool = False, ids: list[str] | None = None) -> None:
    """Grava a prévia de cada motion, quadro a quadro (30 fps, liso por mais pesado que o motion seja): a página dele com
    o fundo (render/motion.html?tocar=1), com o tempo nas mãos daqui (window.__ir(t) e o vídeo do fundo no mesmo instante),
    fotografada em 720×1280. A duração do motion e mais 0,6 s parado no fim (o loop da galeria). Só refaz um motion se o
    .html dele é mais novo que a prévia."""
    origem = BIBLIOTECA / 'motions' / 'presets'
    destino = BIBLIOTECA / 'motions' / 'previas'
    destino.mkdir(parents=True, exist_ok=True)
    fila = []
    for arq in sorted(origem.glob('*.html')):
        mp4 = destino / f'{arq.stem}.mp4'
        if ids and arq.stem not in ids:
            continue
        if not refazer and mp4.exists() and mp4.stat().st_mtime >= arq.stat().st_mtime:
            continue
        m = re.search(r'<script[^>]*id=["\']preset["\'][^>]*>(.*?)</script>', arq.read_text(encoding='utf-8'), re.S)
        try:
            dur = float(json.loads(m.group(1)).get('duracao') or 4) if m else 4.0
        except (ValueError, TypeError):
            dur = 4.0
        fila.append((arq.stem, min(max(dur, 1.0), 15.0), mp4))
    if not fila:
        print('As prévias estão em dia (use --refazer para refazer).')
        return
    srv = servidor.servir(0)
    porta = srv.server_address[1]
    try:
        # 4 navegadores ao mesmo tempo, um motion em cada (fotografar quadro a quadro é lento: uns 4,5 quadros por segundo)
        with multiprocessing.get_context('spawn').Pool(min(4, len(fila))) as pool:
            for linha in pool.imap_unordered(_previa_motion, [(mid, dur, str(mp4), porta) for mid, dur, mp4 in fila]):
                print(linha, flush=True)
    finally:
        srv.shutdown()
    print(f'{len(fila)} prévia(s) em biblioteca/motions/previas/.')


# ---------------------------------------------------------------- a música escolhida pelo criador na revisão

def _rec_partes(rec: dict) -> tuple[dict, list[dict], list[dict], float]:
    return rec['a'], rec['clipes'], rec['eventos'], float(rec['duracao'])


def sem_musica(slug: str, pv: Path) -> Path:
    """O áudio de uma prévia (a vN ou uma saída falada dela) sem a música: a voz e os sons, com o ganho do −14 LUFS da
    mistura inteira. O app toca a música por cima, ao vivo, para o criador escolher a faixa e o volume. Feito na primeira
    vez e guardado ao lado do proxy."""
    arq, rec_arq = pv / 'sem-musica.m4a', pv / 'audio.json'
    rec = receita(rec_arq)
    if arq.exists() and arq.stat().st_mtime >= rec_arq.stat().st_mtime:
        return arq
    a, clipes, eventos, dur = _rec_partes(rec)
    if not a.get('medida'):  # uma versão de antes: mede a mistura inteira (com a música) uma vez
        a['medida'], _ = mistura(pasta(slug), a, clipes, eventos, dur)
        gravar_json(rec_arq, rec)
    with tempfile.TemporaryDirectory() as t:
        faixa = Path(t) / 'sons.wav'
        sons.faixa(audio.com_faders(a, eventos), dur, faixa)
        entradas, f = audio.filtros({**a, 'fundo_mudo': True}, clipes, eventos, 0, 'pfim', dur, {'ganho': a['medida']['ganho']}, faixa)
        parte = Path(t) / 'sem-musica.m4a'
        ffmpeg(*entradas, '-filter_complex', ';'.join(f), '-map', '[pfim]', '-t', f'{dur:.4f}', '-c:a', 'aac', '-b:a', '192k',
               '-movflags', '+faststart', str(parte))
        shutil.move(str(parte), arq)
    return arq


def _lacos() -> dict[str, list[float]]:
    """O laço de cada faixa da biblioteca (`audio.laco`), guardado em biblioteca/trilhas/.lacos.json pelo tamanho e data."""
    cache_arq = BIBLIOTECA / 'trilhas' / '.lacos.json'
    cache, out = ler_json(cache_arq, {}) or {}, {}
    for f in (ler_json(BIBLIOTECA / 'trilhas' / 'catalogo.json', {}) or {}).get('faixas') or []:
        arq = audio.arquivo_trilha(f['id'])
        if not arq:
            continue
        chave = f'{arq.stat().st_size}@{arq.stat().st_mtime_ns}'
        if (cache.get(f['id']) or {}).get('chave') != chave:
            cache[f['id']] = {'chave': chave, 'laco': list(audio.laco(arq))}
        out[f['id']] = cache[f['id']]['laco']
    gravar_json(cache_arq, cache)
    return out


def dados_musica(slug: str, v: int, sid: str | None = None) -> dict:
    """O que o app precisa para tocar a música ao vivo sobre o áudio sem ela, igual à mistura do render
    (`audio.filtros_fundo`): o nível base (dB) da faixa, as falas (o ducking), o fade e as voltas do laço de cada faixa (a
    música entra no começo do laço, mais `continua`). Numa saída, a mistura dela: a falada tem a receita própria; a de CTA
    é o corpo, o CTA e uma trilha só, a do corpo (`mix_da_saida`). `sem_musica: None`: sem prévia ao vivo (uma saída
    falada de antes desta função; a próxima versão já traz)."""
    pv = pasta(slug) / 'versoes' / f'v{v}'
    rec = receita(pv / 'audio.json')
    a = rec['a']
    continua = float(a.get('desde') or 0) - (a['laco'][0] if a.get('laco') else 0.0)
    arq = None
    ps = pv / 'saidas' / sid if sid else None
    info = (ler_json(ps / 'info.json', {}) or {}) if ps else {}
    if not ps:
        arq = sem_musica(slug, pv)
        a = receita(pv / 'audio.json')['a']
        duracao, ganho, falas, fade = float(rec['duracao']), a['medida']['ganho'], a.get('falas') or [], a.get('fade_fim', True)
    elif info.get('final') == 'cta':
        if not (ps / 'sem-musica.m4a').exists() or not info.get('musica'):  # uma prévia de antes: refeita uma vez
            previa_cta(saida_do_projeto(ler(slug), sid), pv, ps, float((ler_json(pv / 'info.json', {}) or {}).get('duracao') or rec['duracao']))
            info = ler_json(ps / 'info.json', {}) or {}
        arq, duracao, ganho, falas, fade = ps / 'sem-musica.m4a', float(info['duracao']), info['musica']['ganho'], info['musica']['falas'], True
    elif (ps / 'audio.json').exists():
        arq = sem_musica(slug, ps)
        rs = receita(ps / 'audio.json')
        duracao, ganho, falas, fade = float(rs['duracao']), rs['a']['medida']['ganho'], rs['a'].get('falas') or [], rs['a'].get('fade_fim', True)
    else:
        duracao, ganho, falas, fade = float(info.get('duracao') or rec['duracao']), 0.0, [], True
    au = ler(slug).get('audio') or {}
    lacos = _lacos()
    faixas = [{'id': f['id'], 'nome': f.get('nome') or f['id'], 'clima': f.get('clima') or '', 'laco': lacos[f['id']],
               'url': f"/biblioteca/trilhas/{f['id']}.m4a"}
              for f in (ler_json(BIBLIOTECA / 'trilhas' / 'catalogo.json', {}) or {}).get('faixas') or [] if f['id'] in lacos]
    return {'sem_musica': f'/{arq.relative_to(RAIZ)}?{int(arq.stat().st_mtime)}' if arq else None, 'duracao': duracao,
            'base_db': round(a['voz_lufs'] + audio.FUNDO_DB - audio.TRILHA_LUFS + ganho, 2), 'fade_fim': fade, 'falas': falas,
            'ducking_db': a.get('ducking_db', audio.DUCKING_DB), 'continua': round(continua, 3), 'fundo_mudo': bool(a.get('fundo_mudo')),
            'subida': audio.SUBIDA, 'descida': audio.DESCIDA, 'cruza': audio.CRUZA_FUNDO, 'fade': audio.FADE_FUNDO,
            'fundo': au.get('fundo'), 'nivel': float((au.get('niveis') or {}).get('fundo') or 0), 'travada': bool(au.get('fundo_do_criador')),
            'na_versao': Path(a['fundo']).stem if a.get('fundo') else None, 'faixas': faixas}


def _remixar_pasta(slug: str, pv: Path, au: dict) -> None:
    """A música de `au` (o `audio` do edicao.json) no proxy de `pv` (a vN ou uma saída falada dela): a mistura refeita da
    receita e trocada no MP4 sem mexer no vídeo; depois o áudio sem música (o ganho mudou)."""
    rec_arq = pv / 'audio.json'
    rec = receita(rec_arq)
    a, clipes, eventos, dur = _rec_partes(rec)
    faixa = audio.arquivo_trilha(au.get('fundo'))
    laco = list(audio.laco(faixa)) if faixa else None
    # a faixa entra no começo do laço dela (`som`), mais o que um vídeo emendado antes já tocou (`audio.continua`)
    continua = float(a.get('desde') or 0) - (a['laco'][0] if a.get('laco') else 0.0)
    a.update(fundo=str(faixa) if faixa else None, laco=laco, desde=(laco[0] if laco else 0.0) + continua,
             niveis={**a['niveis'], 'fundo': float((au.get('niveis') or {}).get('fundo') or 0)})
    a['medida'], wav = mistura(pasta(slug), a, clipes, eventos, dur)
    proxy, parte = pv / 'proxy.mp4', pv / 'proxy.parte.mp4'
    ffmpeg('-i', str(proxy), '-i', str(wav), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
           '-t', f'{dur:.4f}', '-movflags', '+faststart', str(parte))
    parte.replace(proxy)
    gravar_json(rec_arq, rec)
    sem_musica(slug, pv)


def remixar(slug: str, v: int) -> None:
    """Põe a música do edicao.json (a que o criador escolheu no app) na vN: no proxy do corpo e no das saídas (a falada
    pela receita dela; a de CTA, a prévia refeita: a trilha do corpo segue até o fim dela), só o áudio. A edição
    guardada na versão passa a dizer essa música."""
    edicao = ler(slug)
    pv = pasta(slug) / 'versoes' / f'v{v}'
    au = edicao.get('audio') or {}
    print(f"Música v{v}: {au.get('fundo') or 'sem música'}, {float((au.get('niveis') or {}).get('fundo') or 0):+.1f} dB", flush=True)
    _remixar_pasta(slug, pv, au)
    ed_v = ler_json(pv / 'edicao.json', {}) or {}
    if ed_v:
        av = ed_v.setdefault('audio', {})
        av['fundo'] = au.get('fundo')
        av.setdefault('niveis', {})['fundo'] = float((au.get('niveis') or {}).get('fundo') or 0)
        gravar_json(pv / 'edicao.json', ed_v)
    corpo_dur = float((ler_json(pv / 'info.json', {}) or {}).get('duracao') or 0)
    for x in [x for x in edicao.get('saidas') or [] if isinstance(x, dict) and x.get('final')]:
        ps = pv / 'saidas' / x['id']
        if not (ps / 'proxy.mp4').exists():
            continue
        if x['final'].get('tipo') == 'cta':
            print(f"Saída {x['destino']}: a prévia com a música nova", flush=True)
            previa_cta(x, pv, ps, corpo_dur)
        elif (ps / 'audio.json').exists():
            print(f"Saída {x['destino']}: a música nova", flush=True)
            _remixar_pasta(slug, ps, au)
        else:
            print(f"Saída {x['destino']}: é de antes da receita do áudio; pega a música na próxima versão", flush=True)
    print('Pronto', flush=True)


if __name__ == '__main__':
    if sys.argv[1:2] == ['musica']:
        print(json.dumps(dados_musica(sys.argv[2], int(sys.argv[3]), (sys.argv[4:5] or [None])[0]), ensure_ascii=False))
        sys.exit(0)
    if sys.argv[1:2] == ['remixar']:
        remixar(sys.argv[2], int(sys.argv[3]))
        sys.exit(0)
    if sys.argv[1:2] == ['previas-motions']:
        previas_motions('--refazer' in sys.argv, [a for a in sys.argv[2:] if not a.startswith('--')])
        sys.exit(0)
    if sys.argv[1:2] == ['amostra-look']:
        _, _, slug, t, lut, intensidade, vinheta, *nit = sys.argv
        print(amostra_look(slug, float(t), {'lut': None if lut == '-' else lut, 'intensidade': float(intensidade), 'vinheta': vinheta,
                                            'nitidez': nit[0] if nit else 'sem'}).relative_to(RAIZ))
        sys.exit(0)
    if '--previa-saida' in sys.argv:  # a prévia de uma saída de CTA nova, na versão mais nova (o + Saída do app)
        previa_da_saida(sys.argv[1], sys.argv[sys.argv.index('--previa-saida') + 1])
        sys.exit(0)
    if {'--final', '--saida', '--saidas'} & set(sys.argv):
        # um export em 4K por vez na máquina (a fila): vários juntos (4 CTAs aprovados de uma vez, cada um com os seus
        # navegadores) travaram todos por falta de memória e de rede (2026-10-20)
        fila = open(PROJETOS / '.export-4k.trava', 'w')
        try:
            fcntl.flock(fila, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Há outro export em 4K rodando: este espera a vez na fila.', flush=True)
            fcntl.flock(fila, fcntl.LOCK_EX)
    if '--saida' in sys.argv or '--saidas' in sys.argv:  # o export das saídas: uma (--saida <id>) ou todas (--saidas)
        slug = sys.argv[1]
        ids = [sys.argv[sys.argv.index('--saida') + 1]] if '--saida' in sys.argv else [
            x['id'] for x in ler(slug).get('saidas') or [] if isinstance(x, dict) and x.get('final')]
        for sid in ids:
            exportar_saida(slug, sid)
        sys.exit(0)
    args = [a for a in sys.argv[1:] if a not in ('--final', '--camadas')]
    if len(args) != 1:
        raise SystemExit(__doc__)
    if '--camadas' in sys.argv[1:]:
        pre_render(args[0], final='--final' in sys.argv[1:])
    else:
        render(args[0], final='--final' in sys.argv[1:])
