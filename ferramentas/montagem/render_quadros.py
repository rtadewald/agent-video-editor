"""Trabalhador do render (do 18: backend/app/render_quadros.py, SPEC §13): um processo com um navegador escondido na
página de render, que fotografa pedaços da camada dos inserts e grava cada pedaço num clipe ProRes 4444 (com
transparência, pelo chip de vídeo do Mac). Vários rodam em paralelo. Módulo leve de propósito: não importa o resto, para
cada processo subir rápido."""
import base64
import re
import subprocess
from io import BytesIO

_pagina = None
_cdp = None


def abrir_render(browser, url: str, w: int = 540, h: int = 960):
    """Abre a página de render e espera ela ficar pronta (`window.__render`). O websocket fica mudo: na página do 18 (Vite),
    um aviso do servidor de desenvolvimento recarregava a página no meio (na do 19 não há websocket)."""
    page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
    page.route_web_socket(re.compile('.*'), lambda ws: None)
    page.goto(url, wait_until='load', timeout=60_000)
    esperar_render(page)
    return page


def esperar_render(page) -> None:
    # a página do 19, se o projeto não carrega, não cria o `__render` e põe o erro no título
    page.wait_for_function("() => !!window.__render || document.title.startsWith('erro:')", timeout=60_000)
    if page.title().startswith('erro:'):
        raise RuntimeError(f'A página de render falhou: {page.title()[5:].strip()}')


def _abrir(pw, url: str, w: int, h: int):
    global _pagina, _cdp
    browser = pw.chromium.launch(channel='chromium', args=[
        '--force-color-profile=srgb', '--hide-scrollbars', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
        f'--window-size={w},{h}'])  # a janela padrão é deitada (1280×720): a foto de um quadro em pé saía cortada
    # a janela tem o tamanho do vídeo; a página amplia o desenho da prévia (540 px de largura) com zoom
    _pagina = abrir_render(browser, url, w, h)
    _cdp = _pagina.context.new_cdp_session(_pagina)
    _cdp.send('Emulation.setDefaultBackgroundColorOverride', {'color': {'r': 0, 'g': 0, 'b': 0, 'a': 0}})
    return browser


def iniciar(url: str, w: int, h: int) -> None:
    """Abre o navegador deste processo (uma vez; fica aberto para todos os pedaços que ele pegar)."""
    from playwright.sync_api import sync_playwright

    _abrir(sync_playwright().start(), url, w, h)


def fixas(url: str, w: int, h: int, pedidos: list[tuple[float, str | int, str]]) -> list[tuple[int, int, int, int] | None]:
    """As fotos paradas dos inserts que o ffmpeg desenha (`exportacao.camada_do_insert`): cada pedido (t, so, png) leva a
    página ao insert do instante t só com o fundo da área (so = 'fundo') ou só com a sombra do card so, e grava a foto.
    Devolve a caixa de cada foto onde há algo (None: vazia)."""
    from PIL import Image
    from playwright.sync_api import sync_playwright

    caixas = []
    with sync_playwright() as pw:
        browser = _abrir(pw, url, w, h)
        for t, so, png in pedidos:
            _ir(t, so)
            img = Image.frombytes('RGBA', (w, h), _foto(t, w, h, so))
            img.save(png)
            caixas.append(img.getchannel('A').getbbox())
        browser.close()
    return caixas


def _ir(t: float, so: str | int | None = None) -> str | None:
    """Leva a página ao instante `t`; devolve a chave do quadro quando ele é igual aos seguintes (insert parado). `so`:
    só uma parte do insert (as fotos paradas de `fixas`)."""
    for tentativa in (1, 2):
        try:
            return _pagina.evaluate('([t, so]) => window.__render.ir(t, so ?? undefined)', [t, so])
        except Exception:  # a página recarregou: espera ela voltar
            if tentativa == 2:
                raise
            esperar_render(_pagina)


def _rgba(png: bytes, w: int, h: int) -> bytes | None:
    """O PNG em RGBA cru (o Chrome tira o alfa dos quadros todo opacos; o ffmpeg precisa do mesmo formato sempre). None
    se a foto não veio do tamanho do quadro: com muitos navegadores, o Chrome às vezes devolve a janela menor (~720×790), e
    esticá-la deixava a camada 1,6× mais alta (vsl-isca-fid v2: o ator coberto, os cards esticados)."""
    from PIL import Image
    img = Image.open(BytesIO(png))
    img = img if img.mode == 'RGBA' else img.convert('RGBA')
    return img.tobytes() if img.size == (w, h) else None


def _janela(w: int, h: int) -> tuple[bool, bool]:
    """(a janela tem o tamanho do quadro, o zoom da página foi medido nesse tamanho)."""
    iw, ih, zoom = _pagina.evaluate('() => [innerWidth, innerHeight, document.documentElement.style.zoom]')
    # o navegador devolve o zoom arredondado em 5 casas (720 px: '1.33333'), daí a folga
    # a página desenha como uma prévia de 540 px de largura (deitada, 960: `pagina.ts`)
    return (iw, ih) == (w, h), not zoom or abs(float(zoom) - w / (960 if w > h else 540)) < 1e-4


def _foto(t: float, w: int, h: int, so: str | int | None = None) -> bytes:
    """Uma foto do quadro em `t` (a página já foi levada a ele) com a janela no tamanho do quadro. Sob carga, o Chrome às
    vezes encolhe a janela (~720×790): a foto vinha menor, ou do tamanho certo (o `captureBeyondViewport` estica) com
    tudo pequeno no canto de cima, porque o `ir(t)` montou o quadro na janela encolhida (a escala do motion é medida ali:
    no caveman 4K, o card a 1/3 no canto, guardado no cache). Por isso a janela é conferida antes e depois da foto; se
    não está no tamanho, ela volta a ele (a página recarrega se o zoom foi medido encolhida), o quadro é montado de
    novo (`so`: o mesmo pedaço de `fixas`) e fotografado de novo."""
    for _ in range(4):
        certa, zoom = _janela(w, h)
        if certa and zoom:
            png = base64.b64decode(_cdp.send('Page.captureScreenshot', {
                'format': 'png', 'optimizeForSpeed': True, 'captureBeyondViewport': True,
                'clip': {'x': 0, 'y': 0, 'width': w, 'height': h, 'scale': 1}})['data'])
            cru = _rgba(png, w, h)
            certa, zoom = _janela(w, h)
            if cru is not None and certa and zoom:
                return cru
        print('      janela da camada fora do tamanho, de novo', flush=True)
        _pagina.set_viewport_size({'width': w, 'height': h})
        _pagina.wait_for_timeout(200)
        if not zoom:
            _pagina.reload(wait_until='load', timeout=60_000)
            esperar_render(_pagina)
        _ir(t, so)
    raise RuntimeError(f'A foto da camada não saiu em {w}×{h} (o navegador encolheu a janela).')


def pedaco(args: tuple[list[float], int, int, int, str]) -> int:
    """Fotografa a página nos instantes `tempos` (s do vídeo final) e grava o clipe em `saida`, um quadro por foto.
    Devolve quantos fez."""
    tempos, fps, w, h, saida = args
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}',
                           '-framerate', str(fps), '-i', '-', '-c:v', 'prores_videotoolbox', '-profile:v', '4444', saida],
                          stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    anterior: tuple[str | None, bytes] = (None, b'')
    for t in tempos:
        chave = _ir(t)
        if chave and chave == anterior[0]:
            cru = anterior[1]  # insert parado: o mesmo quadro de antes, sem fotografar
        else:
            cru = _foto(t, w, h)
        ff.stdin.write(cru)
        anterior = (chave, cru)
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError(f'ffmpeg (camada) falhou: {ff.stderr.read().decode(errors="replace")[-300:]}')
    return len(tempos)
