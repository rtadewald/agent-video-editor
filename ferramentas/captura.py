# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.63.0"]
# ///
"""Captura de site para um insert: grava a página real em tempo real, com as animações de entrada, e cada dobra vira um
item do banco (fonte = a URL). Do 18: backend/app/captura_site.py (o mesmo método: Chromium headless novo com GPU,
screencast pelo CDP, densidade forçada, reamostrado a 30 quadros/s, H.264 CRF 16, aquecimento + cookies).

    uv run ferramentas/captura.py <url> [--proporcao 16:9|4:3|1:1|9:16] [--duracao 5] [--dobras 0,0.48] [--projeto slug]

Sem --dobras: só a 1ª dobra, gravada desde o 1º segundo depois da página pintar (pega as animações de entrada, sem o
layout ainda assentando). Com --dobras: o topo de cada dobra
(até 3), em fração da altura da página (0 a 1) ou em px de CSS (> 1); a do topo grava o carregamento, as outras pulam
direto até a dobra com a página já carregada e gravam parada. Imprime o id de cada item criado no banco.
"""
import argparse
import asyncio
import base64
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent))
import banco  # noqa: E402

# proporção → janela de computador (px de CSS) e densidade. A 9:16 é um computador em pé (nunca a versão de celular):
# 1200 px de largura pega o layout desktop; 1,8× → 2160×3840
JANELAS = {'16:9': (1440, 810), '4:3': (1200, 900), '1:1': (1080, 1080), '9:16': (1200, 2133)}
DENSIDADE = {'9:16': 1.8}  # as outras: 2×
FPS = 30
ASSENTAR = 1.0  # s do começo da dobra do topo que ficam de fora: o layout ainda muda
MAX_DOBRAS = 3
COOKIES = ('Accept all', 'Accept All', 'Accept', 'Allow all', 'I agree', 'Got it', 'OK', 'Aceitar', 'Aceitar todos', 'Aceitar todos os cookies', 'Accept all cookies', 'Concordo', 'Entendi', 'Ok, entendi.')
# pula até a dobra: fração da altura da página (≤ 1) ou px de CSS; devolve onde parou
PULAR = """(y) => {
    document.documentElement.style.scrollBehavior = 'auto';
    if (y <= 1) y = y * document.documentElement.scrollHeight;
    if (window.lenis?.scrollTo) window.lenis.scrollTo(y, {immediate: true, force: true});
    window.scrollTo({top: y, left: 0, behavior: 'instant'});
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(window.scrollY)))));
}"""


def normalizar_url(url: str) -> str:
    url = (url or '').strip()
    if url and '://' not in url:
        url = 'https://' + url
    p = urlparse(url)
    if p.scheme not in ('http', 'https') or not p.netloc:
        raise SystemExit(f'Endereço inválido: {url}')
    return url


async def _fechar_cookies(page) -> None:
    for texto in COOKIES:
        try:
            botao = page.get_by_role('button', name=texto, exact=True)
            if await botao.count() and await botao.first.is_visible():
                await botao.first.click(timeout=1000)
                await page.wait_for_timeout(300)
                return
        except Exception:
            continue


async def _gravar(url: str, proporcao: str, y: float, duracao: float, saida: Path, do_carregamento: bool) -> tuple[str, int]:
    """Grava uma dobra (do 18: captura_site._gravar). Devolve (título da página, onde a dobra começou em px)."""
    from playwright.async_api import async_playwright

    w, h = JANELAS[proporcao]
    dpr = DENSIDADE.get(proporcao, 2)
    quadros: list[tuple[float, bytes]] = []
    topo = 0
    async with async_playwright() as pw:
        # channel 'chromium' = headless novo, com GPU (Metal); a densidade precisa ser real, senão o screencast sai em 1×
        browser = await pw.chromium.launch(channel='chromium', args=[
            '--force-color-profile=srgb', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', f'--force-device-scale-factor={dpr}'])
        try:
            ctx = await browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, locale='pt-BR')
            # aquecimento: cookies aceitos, rede e cache quentes; o estado da página (intro já vista etc.) é limpo
            aquece = await ctx.new_page()
            try:
                await aquece.goto(url, wait_until='load', timeout=45_000)
                await aquece.wait_for_timeout(1500)
                await _fechar_cookies(aquece)
                await aquece.evaluate("""() => { for (const s of [localStorage, sessionStorage]) for (const k of Object.keys(s))
                    if (!/consent|cookie|gdpr/i.test(k)) s.removeItem(k) }""")
            except Exception:
                pass
            await aquece.close()

            page = await ctx.new_page()
            cdp = await ctx.new_cdp_session(page)
            await cdp.send('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr, 'mobile': False})

            async def confirmar(sid):
                try:
                    await cdp.send('Page.screencastFrameAck', {'sessionId': sid})
                except Exception:  # o navegador fechou com uma confirmação ainda a caminho
                    pass

            def quadro(ev):
                quadros.append((ev['metadata']['timestamp'], base64.b64decode(ev['data'])))
                asyncio.ensure_future(confirmar(ev['sessionId']))
            cdp.on('Page.screencastFrame', quadro)

            async def ligar():
                await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 100, 'maxWidth': round(w * dpr), 'maxHeight': round(h * dpr), 'everyNthFrame': 1})

            if do_carregamento:
                await ligar()
                await asyncio.sleep(0.3)
                antes = len(quadros)  # os quadros do about:blank ficam de fora
                t_nav = time.time()
                await page.goto(url, wait_until='commit', timeout=60_000)
                limite = time.time() + 15
                while len(quadros) == antes and time.time() < limite:  # espera o 1º quadro pintado do site
                    await asyncio.sleep(0.02)
                if len(quadros) == antes:
                    raise SystemExit('O site não pintou nada em 15 s')
                # o 1º segundo fica de fora: a página ainda assenta (o layout muda) e o insert parecia ter um corte no meio
                # (claude-mods v8 c5)
                t0 = max(quadros[antes][0], t_nav) + ASSENTAR
                await asyncio.sleep(max(0.0, duracao - (time.time() - t0)) + 0.3)
            else:
                await page.goto(url, wait_until='load', timeout=60_000)
                await asyncio.sleep(2.5)
                await _fechar_cookies(page)
                await ligar()
                await asyncio.sleep(0.3)
                topo = await page.evaluate(PULAR, y)
                depois = time.time()  # os quadros daqui em diante já mostram a dobra
                await asyncio.sleep(duracao + 0.5)
                t0 = min((t for t, _ in quadros if t >= depois), default=depois)
            await cdp.send('Page.stopScreencast')
            titulo = (await page.title()).strip()
        finally:
            await browser.close()

    # 30 quadros/s constantes: em cada tique, o último quadro chegado até ali
    seq = sorted(quadros, key=lambda q: q[0])
    if not seq:
        raise SystemExit('O navegador não mandou nenhum quadro.')
    n = round(duracao * FPS)
    escolhidos, j = [], 0
    while j + 1 < len(seq) and seq[j + 1][0] <= t0:
        j += 1
    for k in range(n):
        tique = t0 + k / FPS
        while j + 1 < len(seq) and seq[j + 1][0] <= tique:
            j += 1
        escolhidos.append(seq[j][1])
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-i', '-',
                           '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709',
                           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', str(saida)],
                          stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    for q in escolhidos:
        ff.stdin.write(q)
    ff.stdin.close()
    if ff.wait() != 0:
        raise SystemExit(f'ffmpeg falhou: {ff.stderr.read().decode()[-300:]}')
    return titulo, topo


def capturar(url: str, proporcao: str = '16:9', duracao: float = 5.0, dobras: list[float] | None = None,
             projeto: str | None = None) -> list[dict]:
    """Grava cada dobra e põe no banco; devolve os itens."""
    url = normalizar_url(url)
    if proporcao not in JANELAS:
        raise SystemExit(f'Proporção inválida: {proporcao} (use {", ".join(JANELAS)})')
    ys = sorted({max(0.0, float(y)) for y in (dobras or [0])})[:MAX_DOBRAS]
    duracao = round(max(1.0, min(float(duracao), 30.0)), 2)
    tmp = Path(tempfile.mkdtemp())
    itens = []
    try:
        titulo = None
        for k, y in enumerate(ys):
            saida = tmp / f'dobra{k + 1}.mp4'
            visto, topo = asyncio.run(_gravar(url, proporcao, y, duracao, saida, do_carregamento=(k == 0 and y == 0)))
            titulo = titulo or visto or urlparse(url).netloc
            nome = f'{titulo} · dobra {k + 1}' if len(ys) > 1 else titulo
            itens.append(banco.adicionar(saida, nome=nome, fonte=url, projeto=projeto, mover=True,
                                         origem={'tipo': 'captura de site', 'url': url, 'proporcao': proporcao, 'dobra': topo}))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return itens


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Grava um site (cada dobra vira um item do banco).')
    ap.add_argument('url')
    ap.add_argument('--proporcao', default='16:9', choices=list(JANELAS))
    ap.add_argument('--duracao', type=float, default=5.0, help='segundos por dobra (1 a 30; padrão 5)')
    ap.add_argument('--dobras', help='topo de cada dobra: fração da página (0 a 1) ou px; ex.: 0,0.48')
    ap.add_argument('--projeto')
    a = ap.parse_args()
    try:
        dobras = [float(x) for x in a.dobras.split(',')] if a.dobras else None
    except ValueError:
        raise SystemExit('--dobras: números separados por vírgula (ex.: 0,0.48)')
    for item in capturar(a.url, a.proporcao, a.duracao, dobras, a.projeto):
        print(f'{item["id"]}  {item["formato"]} {item["largura"]}×{item["altura"]} {item["duracao"]} s  {item["nome"]}  (dobra em {item["origem"]["dobra"]} px)')
