# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.63.0"]
# ///
"""Gravações próprias de uma página ou app, para os inserts (o como: `etapas/04-inserts.md`).

    uv run ferramentas/gravar.py quadro <spec.json>    quadro a quadro, 24 fps, as ações postas entre os quadros
    uv run ferramentas/gravar.py ao-vivo <spec.json>   fotos em laço com o tempo real, enquanto um comando roda

O spec (JSON):
  url · w, h (a janela, px CSS) · dsf (a escala: 900×1600 com 1.2 sai 1080×1920; uma janela larga com 2 ou mais para
  recortar nítido) · clip [x, y, w, h] (px CSS; a área gravada, ex. a coluna de uma nota em 9:16) · tema light|dark ·
  cursor true|false (um cursor desenhado) · espera (ms depois de carregar) · out (o .mp4) · escala (o `scale` do ffmpeg,
  padrão 1080:-2) · prep [ações, antes de gravar]
  quadro: dur (s) · acoes [[t0, t1, ação…]] (t em s do vídeo; as que têm intervalo se espalham de t0 a t1)
  ao-vivo: comando (o shell que roda enquanto grava, ex. um `claude -p …`) · dur (o máximo, s) · parado (s sem mudar
    na tela para parar depois que o comando acabou, padrão 5)

Ações:
  ["espera", ms] · ["clique", x, y] · ["move", x, y] · ["tecla", "Enter"] · ["js", código] · ["texto", t] (clica no texto)
  com intervalo: ["anda", x1, y1, x2, y2] (o cursor) · ["arrasta", x1, y1, x2, y2] · ["rola", x, y, dy] (a roda, no ponto)
    · ["digita", seletor, texto] · ["video", seletor, t_inicio] (o <video> da página segue o relógio da gravação)
    · ["tempo", funcao] (chama funcao(t) a cada quadro: para páginas que se desenham no tempo, como render/claude-desktop.html)

Esconder um banner de cookies: ["js", "(() => { for (const e of document.querySelectorAll('body *')) { const s =
getComputedStyle(e); if ((s.position === 'fixed' || s.position === 'sticky') && /cookie|privacy|privacidade/i.test(
e.textContent || '') && e.getBoundingClientRect().height < 700) e.style.display = 'none' } })()"].
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

FPS = 24
CURSOR = """addEventListener('DOMContentLoaded',()=>{const c=document.createElement('div');
  c.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;margin:-3px 0 0 -3px;left:-50px;top:-50px;'+
  'background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27><path d=%27M3 2l7 19 2.6-7.6L20 11z%27 fill=%27white%27 stroke=%27black%27 stroke-width=%271.4%27/></svg>") no-repeat;background-size:contain';
  document.body.appendChild(c);addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'},true)})"""


def ease(k: float) -> float:
    return k * k * (3 - 2 * k)


def simples(pg, a: list) -> None:
    n = a[0]
    if n == 'espera': pg.wait_for_timeout(a[1])
    elif n == 'clique': pg.mouse.move(a[1], a[2]); pg.mouse.click(a[1], a[2])
    elif n == 'move': pg.mouse.move(a[1], a[2])
    elif n == 'tecla': pg.keyboard.press(a[1])
    elif n == 'js': pg.evaluate(a[1])
    elif n == 'texto': pg.locator('text=' + a[1]).first.click()
    else: raise SystemExit(f'ação desconhecida: {n}')


def abrir(pw, spec: dict):
    b = pw.chromium.launch(channel='chromium')
    pg = b.new_page(viewport={'width': spec['w'], 'height': spec['h']}, device_scale_factor=spec.get('dsf', 1),
                    color_scheme=spec.get('tema', 'light'))
    if spec.get('cursor', True):
        pg.add_init_script(CURSOR)
    pg.goto(spec['url'], wait_until='load')
    pg.wait_for_timeout(spec.get('espera', 5000))
    for a in spec.get('prep', []):
        simples(pg, a)
    return b, pg


def foto(pg, spec: dict, arq: Path, jpg: bool = False) -> None:
    kw: dict = {'path': str(arq)}
    if jpg: kw.update(type='jpeg', quality=92)
    if c := spec.get('clip'): kw['clip'] = {'x': c[0], 'y': c[1], 'width': c[2], 'height': c[3]}
    pg.screenshot(**kw)


def quadro(spec: dict) -> None:
    with tempfile.TemporaryDirectory() as t, sync_playwright() as pw:
        b, pg = abrir(pw, spec)
        acoes, feitos, prog = spec.get('acoes', []), set(), {}
        for i in range(int(spec['dur'] * FPS)):
            tt = i / FPS
            for j, (t0, t1, *a) in enumerate(acoes):
                if tt < t0 or j in feitos and a[0] not in ('tempo', 'video'):
                    continue
                nome, k = a[0], (1.0 if t1 <= t0 else min(1.0, (tt - t0) / (t1 - t0)))
                if nome == 'anda':
                    x1, y1, x2, y2 = a[1:5]; e = ease(k); pg.mouse.move(x1 + (x2 - x1) * e, y1 + (y2 - y1) * e)
                elif nome == 'arrasta':
                    x1, y1, x2, y2 = a[1:5]
                    if j not in prog: pg.mouse.move(x1, y1); pg.mouse.down(); prog[j] = 0
                    e = ease(k); pg.mouse.move(x1 + (x2 - x1) * e, y1 + (y2 - y1) * e)
                    if k >= 1: pg.mouse.up()
                elif nome == 'rola':
                    if j not in prog: pg.mouse.move(a[1], a[2]); prog[j] = 0
                    alvo = round(a[3] * ease(k))
                    if alvo != prog[j]: pg.mouse.wheel(0, alvo - prog[j]); prog[j] = alvo
                elif nome == 'digita':
                    if j not in prog: pg.click(a[1]); prog[j] = 0
                    alvo = round(len(a[2]) * k)
                    if alvo > prog[j]: pg.keyboard.type(a[2][prog[j]:alvo]); prog[j] = alvo
                elif nome == 'video':
                    if tt <= t1 or t1 <= t0:
                        pg.evaluate(f"(() => {{ const v = document.querySelector({json.dumps(a[1])}); "
                                    f"if (v) {{ v.pause(); v.currentTime = {a[2] + (tt - t0)} }} }})()")
                    continue
                elif nome == 'tempo':
                    if tt <= t1: pg.evaluate(f'{a[1]}({tt - t0})')
                    continue
                else:
                    simples(pg, a); k = 1.0
                if k >= 1: feitos.add(j)
            pg.wait_for_timeout(spec.get('passo', 30))
            foto(pg, spec, Path(t) / f'{i:05d}.png')
        b.close()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', f'{t}/%05d.png', '-vf',
                        f"scale={spec.get('escala', '1080:-2')}:flags=lanczos", '-c:v', 'libx264', '-crf', '15',
                        '-pix_fmt', 'yuv420p', spec['out']], check=True)
    print(spec['out'])


def ao_vivo(spec: dict) -> None:
    with tempfile.TemporaryDirectory() as t, sync_playwright() as pw:
        b, pg = abrir(pw, spec)
        q: list[tuple[float, Path]] = []
        p = subprocess.Popen(spec['comando'], shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) if spec.get('comando') else None
        t0, ultimo, desde = time.time(), None, time.time()
        while time.time() - t0 < spec.get('dur', 120):
            arq = Path(t) / f'{len(q):05d}.jpg'; foto(pg, spec, arq, jpg=True); q.append((time.time(), arq))
            h = hashlib.md5(arq.read_bytes()).hexdigest()
            if h != ultimo: ultimo, desde = h, time.time()
            elif (p is None or p.poll() is not None) and time.time() - desde > spec.get('parado', 5):
                break
        if p and p.poll() is None: p.terminate()
        b.close()
        lista = []
        for i, (ts, arq) in enumerate(q):
            lista += [f"file '{arq}'", f'duration {max((q[i + 1][0] - ts) if i + 1 < len(q) else 0.5, 0.001):.4f}']
        lista.append(f"file '{q[-1][1]}'")
        (Path(t) / 'l.txt').write_text('\n'.join(lista))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(Path(t) / 'l.txt'), '-vf',
                        f"fps={FPS},scale={spec.get('escala', '1080:-2')}:flags=lanczos", '-c:v', 'libx264', '-crf', '15',
                        '-pix_fmt', 'yuv420p', spec['out']], check=True)
    print(spec['out'], f'{q[-1][0] - q[0][0]:.1f} s')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('quadro', 'ao-vivo'):
        print(__doc__); sys.exit(1)
    s = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    (quadro if sys.argv[1] == 'quadro' else ao_vivo)(s)
