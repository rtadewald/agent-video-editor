"""A montagem do vídeo (do 18: backend/app/exportacao.py, SPEC §13): o ator e o áudio saem do bruto original pelo ffmpeg
(cortes, recorte 9:16, fade curto em cada emenda) e a camada dos inserts é a própria página de render, fotografada quadro
a quadro por navegadores escondidos (`render_quadros.py`). Tudo se junta numa passada só do ffmpeg (`comando_final`),
montada por camadas, uma função por camada. A cola (ler a página, fotografar, rodar) fica em `ferramentas/render.py`."""
import json
import math
import subprocess
from pathlib import Path

from base import RAIZ, inspecionar

from . import audio as audio_mod
from . import legenda as legenda_mod
from . import look as look_mod
from . import sons
from . import transicoes as transicoes_mod

NAVEGADORES = 8  # navegadores fotografando em paralelo
FADE = 0.015  # s de fade do áudio em cada emenda, contra estalos


def dur_saida(c: dict) -> float:
    """Quanto um clipe da V1 dura no vídeo final (acelerado por `vel`). Do 18: backend/app/projeto.py."""
    return (c['fim'] - c['inicio']) / c.get('vel', 1)


JANELA = {'y0': 0.72, 'escala': 0.55, 'raio': 0.07}  # o ator no "insert atrás" (igual a presets/divisao.ts; raio em fração da largura do ator encolhido)


ZOOM_LENTO = {'por_segundo': 0.03, 'maximo': 0.15}  # os presets do Full ator (iguais a `ator/movimento.ts`)
ZOOM_SECO = 0.18


def _movimentos(movimentos: list[dict], w: int, h: int, entrada: str, saida: str) -> str:
    """O movimento de câmera no ator nos planos de Full ator (`__render.movimentos`: ini, fim, tipo, cx, cy): a escala no
    tempo (o lento sai e chega andando: metade linear, metade suavizada; o seco salta de uma vez) e o recorte que deixa o
    centro do rosto parado. A mesma conta de `escalaDoMovimento` na prévia."""
    z, cx, cy = [], [], []
    for m in movimentos:
        a, b = float(m['ini']), float(m['fim'])
        if b - a < 0.02:
            continue
        dentro = f'between(t,{a:.4f},{b:.4f})'
        if m['tipo'] == 'zoom_seco':
            z.append(f'{dentro}*{ZOOM_SECO}')
        else:
            amp = min(ZOOM_LENTO['por_segundo'] * (b - a), ZOOM_LENTO['maximo'])
            u = f'clip((t-{a:.4f})/{b - a:.4f},0,1)'
            z.append(f'{dentro}*{amp:.4f}*(0.5*{u}+0.5*{u}*{u}*(3-2*{u}))')
        cx.append(f'{dentro}*({float(m.get("cx", 0.5)):.4f}-0.5)')
        cy.append(f'{dentro}*({float(m.get("cy", 0.4)):.4f}-0.5)')
    if not z:
        return f'[{entrada}]null[{saida}]'
    zt, xt, yt = '+'.join(z), '+'.join(cx), '+'.join(cy)
    return (f"[{entrada}]scale=w='trunc(iw*(1+{zt})/2)*2':h='trunc(ih*(1+{zt})/2)*2':eval=frame:flags=bicubic,"
            f"crop={w}:{h}:x='(iw-ow)*(0.5+{xt})':y='(ih-oh)*(0.5+{yt})',setsar=1[{saida}]")


def acelerar(vel: float) -> tuple[str, str]:
    """Os filtros de um clipe acelerado: o `setpts` do vídeo e o `atempo` do áudio (com a vírgula; vazio a 1×)."""
    if abs(vel - 1) < 1e-6:
        return 'setpts=PTS-STARTPTS', ''
    return f'setpts=(PTS-STARTPTS)/{vel:.4f}', f'atempo={vel:.4f},'


def _ator(clipes: list[dict], horizontal: bool, enquadramento_x: float, w: int, h: int, fps: int,
          divisoes: list[tuple[float, float, dict]], duracao: float, mascara: bool, com_look: bool = False,
          movimentos: list[dict] | None = None) -> tuple[list[str], list[str]]:
    """Os filtros do ator e do áudio (entrada 0 = bruto; 1 = a máscara da pessoa, se houver): cada clipe da V1 vira um
    par vídeo + áudio (o áudio com fade curto nas pontas) e o concat mantém os dois juntos em cada emenda; depois, recorte
    9:16, escala, fps de saída (o ator repete quadros, sem interpolar) e o ator descendo para a parte de baixo nas telas
    divididas (metade de `f` da altura). Devolve os filtros de baixo (saídas [base] e [ac]) e os de cima, aplicados depois
    dos inserts sobre [topo_in] → [topo]: o ator na janela do "insert atrás" e a pessoa recortada saindo da área dele.
    `com_look`: o ator escalado sai em [ator_cru] e o look (`look.filtros`, ligado em `comando_final`) faz o [ator].
    `movimentos`: os presets do Full ator (zoom no ator, antes do look: a vinheta não aproxima junto)."""
    n = len(clipes)
    # a geometria do ator (P5, `ator/ator.ts`): quando a página de render a manda, o ator é posto por ela
    geometria = any(d.get('ator') for _, _, d in divisoes)
    if geometria:
        usa_mascara = mascara and any((d.get('ator') or {}).get('modo') in ('janela', 'recortado') for _, _, d in divisoes)
    else:
        usa_mascara = mascara and any(d['modo'] == 'atras' for _, _, d in divisoes)  # a cabeça sai por cima só no "ator embaixo"
    partes = [f'[0:v]split={n}' + ''.join(f'[v{k}]' for k in range(n)), f'[0:a]asplit={n}' + ''.join(f'[a{k}]' for k in range(n))]
    if usa_mascara:
        partes.append(f'[1:v]split={n}' + ''.join(f'[m{k}]' for k in range(n)))
    videos, audios, masc = '', '', ''
    acc = 0.0  # o começo do clipe no vídeo final
    for k, c in enumerate(clipes):
        ini, fim = c['inicio'], c['fim']
        dur, vel = dur_saida(c), c.get('vel', 1)
        # acelerado (`vel`, a aceleração do ator): o vídeo com os tempos divididos e o áudio no atempo (mantém o tom)
        setpts, atempo = acelerar(vel)
        # o vídeo do clipe ocupa exatamente os quadros do vídeo final que começam dentro dele (a ≤ t < b, a regra de
        # `quadros` e das camadas de cima), cada um com o quadro do bruto daquele instante. Antes, o clipe saía com os
        # quadros inteiros do bruto (23,976/s) e o concat cobria a sobra repetindo o último quadro do clipe anterior: um
        # quadro "perdido" do ator na pose de antes logo depois de cada corte (mvi-0717 v5 c1–c3)
        q0, q1 = math.ceil(acc * fps - 1e-9), math.ceil((acc + dur) * fps - 1e-9)
        ini_v = ini + (q0 / fps - acc) * vel
        # `desde_v` (o proxy por trechos, num trecho que começa no meio do clipe): o vídeo cortado de onde o clipe inteiro
        # começa, pulando os quadros de antes do trecho; o `fps` ancora a grade no 1º quadro do bruto depois do corte, e
        # cortado no começo do trecho ela saía até 1 quadro fora da do vídeo inteiro
        ini_v, pular = c.get('desde_v') or (ini_v, 0)
        no_grid = f'{setpts},fps={fps},tpad=stop_mode=clone:stop_duration=0.5,trim=start_frame={pular}:end_frame={pular + q1 - q0},setpts=PTS-STARTPTS'
        # o vídeo vai 1 quadro além do fim: o último quadro do clipe pega o quadro do bruto mais próximo do seu instante,
        # que às vezes cai logo depois do `fim` (bruto a 23,976/s); cortado no `fim`, ele virava uma cópia do anterior
        # (um quadro repetido antes de cada corte, mvi-0719 v1). O quadro a mais é a continuação da mesma tomada
        fim_v = fim + vel / fps
        partes.append(f'[v{k}]trim=start={ini_v:.4f}:end={fim_v:.4f},{no_grid}[cv{k}]')
        partes.append(f'[a{k}]atrim=start={ini:.4f}:end={fim:.4f},asetpts=PTS-STARTPTS,{atempo}'
                      f'afade=t=in:d={FADE},afade=t=out:st={max(dur - FADE, 0):.4f}:d={FADE}[ca{k}]')
        videos += f'[cv{k}]'
        audios += f'[ca{k}]'
        if usa_mascara:
            partes.append(f'[m{k}]trim=start={ini_v:.4f}:end={fim_v:.4f},{no_grid}[cm{k}]')
            masc += f'[cm{k}]'
        acc += dur
    # o vídeo e o áudio emendados cada um por si: o vídeo em quadros exatos do vídeo final, o áudio no tempo exato
    partes.append(f'{videos}concat=n={n}:v=1:a=0[vc]')
    partes.append(f'{audios}concat=n={n}:v=0:a=1[ac]')
    recorte = f"crop=w=trunc(ih*9/16/2)*2:h=ih:x=(iw-ow)*{enquadramento_x:.4f}," if horizontal else ''
    rotulo = 'ator_cru' if com_look else 'ator'
    partes.append(f'[vc]{recorte}scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},setsar=1,fps={fps}[{'ator_mv' if movimentos else rotulo}]')
    if movimentos:
        partes.append(_movimentos(movimentos, w, h, 'ator_mv', rotulo))
    if geometria:
        if usa_mascara:
            partes.append(f'{masc}concat=n={n}:v=1:a=0,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},format=gray,fps={fps}[masc]')
        topo = _ator_na_geometria(partes, divisoes, w, h, fps, duracao, usa_mascara)
        return partes, topo
    quando = lambda ts: '+'.join(f'between(t,{a:.4f},{b - 0.5 / fps:.4f})' for a, b in ts) or '0'  # noqa: E731
    metades = [(a, b, d['f']) for a, b, d in divisoes if d['modo'] == 'metade']
    atras = [(a, b) for a, b, d in divisoes if d['modo'] == 'atras']
    # o ator desce metade da fração do insert (o centro do quadro vai para o meio da parte de baixo)
    desce = '+'.join(f'between(t,{a:.4f},{b - 0.5 / fps:.4f})*{f / 2:.5f}*H' for a, b, f in metades) or '0'
    usos = 1 + (1 if atras else 0) + (1 if usa_mascara else 0)
    partes.append(f'[ator]split={usos}[ator0]' + ('[ator1]' if atras else '') + ('[ator2]' if usa_mascara else ''))
    partes.append(f'color=c=black:s={w}x{h}:r={fps}:d={duracao:.4f}[tela]')
    partes.append(f"[tela][ator0]overlay=x=0:y='{desce}':eval=frame:shortest=1[base]")
    topo: list[str] = []
    atual = 'topo_in'
    jw, jh = round(w * JANELA['escala'] / 2) * 2, round(h * JANELA['escala'] / 2) * 2
    jx, jy_ator = (w - jw) // 2, h - jh  # o ator encolhido, apoiado embaixo e centrado
    corte = round(h * JANELA['y0']) - jy_ator  # a janela começa aqui, dentro do ator encolhido
    if atras:
        r = round(jw * JANELA['raio'])
        janela_h = jh - corte
        topo.append(f'[ator1]scale={jw}:{jh},crop={jw}:{janela_h}:0:{corte},format=rgba[jan]')
        topo.append(f"color=c=white:s={jw}x{janela_h}:r={fps},format=gray,geq=lum='255*lte(hypot(max(0,max({r}-X,X-{jw - r})),"
                    f"max(0,max({r}-Y,Y-{janela_h - r}))),{r})'[cantos]")
        topo.append('[jan][cantos]alphamerge[janr]')
        topo.append(f"[{atual}][janr]overlay=x={jx}:y={jy_ator + corte}:enable='{quando([(a, b) for a, b in atras])}'[t1]")
        atual = 't1'
    if usa_mascara:
        partes.append(f'{masc}concat=n={n}:v=1:a=0,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},format=gray,fps={fps}[masc]')
        partes.append('[ator2][masc]alphamerge[pessoa]')
        fs: list[float] = []
        saidas = len(fs) + (1 if atras else 0)
        topo.append(f'[pessoa]split={saidas}' + ''.join(f'[p{i}]' for i in range(saidas)))
        for i, f in enumerate(fs):
            y = round(f / 2 * h)
            topo.append(f'[p{i}]crop={w}:{y}:0:0[pc{i}]')
            topo.append(f"[{atual}][pc{i}]overlay=x=0:y={y}:enable='{quando([(a, b) for a, b, g in metades if g == f])}'[tp{i}]")
            atual = f'tp{i}'
        if atras:
            topo.append(f'[p{len(fs)}]scale={jw}:{jh},crop={jw}:{corte}:0:0[pj]')
            topo.append(f"[{atual}][pj]overlay=x={jx}:y={jy_ator}:enable='{quando(atras)}'[tpj]")
            atual = 'tpj'
    topo.append(f'[{atual}]null[topo]')
    return partes, topo


def _par(v: float) -> int:
    return max(2, int(round(v / 2)) * 2)


def _cantos(w: int, h: int, r: int, fps: int, dur: float, rotulo: str) -> str:
    """Uma máscara de cantos redondos (raio `r` px) do tamanho do ator, para o `alphamerge`."""
    return (f"color=c=white:s={w}x{h}:r={fps}:d={dur:.4f},format=gray,"
            f"geq=lum='255*lte(hypot(max(0,max({r}-X,X-{w - r})),max(0,max({r}-Y,Y-{h - r}))),{r})'[{rotulo}]")


def _desde(a: float, fps: int) -> str:
    """Leva um pedaço recortado do ator (começando em 0) de volta ao instante `a` com quadros transparentes antes dele, no
    lugar de só empurrar o tempo (`setpts=PTS+a/TB`): sem quadros até `a`, o overlay esperava o primeiro e guardava na
    fila todos os quadros do ator de 0 até `a` (a memória crescia com o instante do insert, gigabytes num insert tardio).
    `n`: os quadros do ator (um a cada 1/fps desde 0) antes de `a`, então o primeiro do pedaço cai no instante dele."""
    n = math.ceil(a * fps - 1e-6)
    return f'tpad=start={n}:color=black@0' if n > 0 else 'null'


def _ator_na_geometria(partes: list[str], divisoes: list[tuple[float, float, dict]], w: int, h: int, fps: int, duracao: float,
                       usa_mascara: bool) -> list[str]:
    """O ator posto pela geometria de cada trecho dividido (P5; `ator/ator.ts`): `{modo, s, tx, ty, topo?, raio?}` —
    o quadro do ator com o canto de cima à esquerda em (tx, ty) e a escala s, em frações do quadro.
    - `metade` (tela dividida): o ator inteiro, ampliado e deslocado pelo rosto, embaixo dos inserts ([base]);
    - `janela`, `canto`: o ator encolhido por cima dos inserts — a janela (só de `topo` para baixo) ou o quadro inteiro,
      com os cantos redondos; `recortado`: só a pessoa (a máscara). Na janela, a pessoa recortada sai por cima dela.
    Cada trecho por cima é um pedaço recortado do ator (só aqueles quadros são escalados). Acrescenta os filtros de baixo
    em `partes` (saída [base]) e devolve os de cima, de [topo_in] a [topo]."""
    quando = lambda a, b: f'gte(t,{a - 1e-4:.5f})*lt(t,{b - 1e-4:.5f})'  # noqa: E731  (a ≤ t < b, como `quadros`)
    # o ator embaixo (metade): o quadro n (t = n/fps) é do trecho em que ele cai, a ≤ t < b — a mesma regra das camadas de
    # cima (o 1º quadro de um trecho é o ceil(a·fps)). Com o `quando`, um quadro a menos de meio quadro do fim ficava fora
    # dos dois trechos e o ator saía sem o enquadramento (mvi-0717 v2 c6, v3 c1: o rosto some e aparece o notebook)
    na_faixa = lambda a, b: f'gte(t,{a - 1e-4:.5f})*lt(t,{b - 1e-4:.5f})'  # noqa: E731
    metades = [(a, b, d['ator']) for a, b, d in divisoes if (d.get('ator') or {}).get('modo') == 'metade']
    sobre = [(a, b, d['ator']) for a, b, d in divisoes if (d.get('ator') or {}).get('modo') in ('janela', 'canto', 'recortado', 'caixa')]
    # sem a máscara (o recorte do ator não ficou pronto), o recortado vira o ator inteiro num canto
    if not usa_mascara:
        sobre = [(a, b, {**g, 'modo': 'canto', 'raio': g.get('raio') or 0.07} if g['modo'] == 'recortado' else g) for a, b, g in sobre]
    quadros = [(a, b, g) for a, b, g in sobre if g['modo'] in ('janela', 'canto', 'caixa')]
    pessoas = [(a, b, g) for a, b, g in sobre if g['modo'] in ('janela', 'recortado')] if usa_mascara else []
    usos = 1 + len(quadros) + (1 if pessoas else 0)
    partes.append(f'[ator]split={usos}[ator0]' + ''.join(f'[aq{i}]' for i in range(len(quadros))) + ('[ator2]' if pessoas else ''))
    partes.append(f'color=c=black:s={w}x{h}:r={fps}:d={duracao:.4f}[tela]')
    # a tela dividida: escala e posição por trecho (fora dos trechos, o ator como foi gravado)
    escala = '+'.join(f"{na_faixa(a, b)}*{g['s'] - 1:.5f}" for a, b, g in metades if abs(g['s'] - 1) > 1e-4)
    x = '+'.join(f"{na_faixa(a, b)}*{g['tx']:.5f}*W" for a, b, g in metades if abs(g['tx']) > 1e-5) or '0'
    y = '+'.join(f"{na_faixa(a, b)}*{g['ty']:.5f}*H" for a, b, g in metades if abs(g['ty']) > 1e-5) or '0'
    ator0 = 'ator0'
    if escala:
        partes.append(f"[ator0]scale=w='trunc(iw*(1+{escala})/2)*2':h='trunc(ih*(1+{escala})/2)*2':eval=frame[ator0s]")
        ator0 = 'ator0s'
    partes.append(f"[tela][{ator0}]overlay=x='{x}':y='{y}':eval=frame:shortest=1[base]")
    topo: list[str] = []
    atual = 'topo_in'
    for i, (a, b, g) in enumerate(quadros):
        sw, sh = _par(g['s'] * w), _par(g['s'] * h)
        x0, y0 = round(g['tx'] * w), round(g['ty'] * h)
        if g['modo'] == 'caixa':  # um recorte do ator ampliado, na caixa (REF-15·p42)
            c = g['caixa']
            cw, ch = _par(c['w'] * w), _par(c['h'] * h)
            cx, cy = max(0, round((c['x'] - g['tx']) * w)), max(0, round((c['y'] - g['ty']) * h))
            r = max(1, round((g.get('raio') or 0) * cw))
            topo.append(f'[aq{i}]trim=start={a:.4f}:end={b:.4f},setpts=PTS-STARTPTS,scale={sw}:{sh},crop={cw}:{ch}:{min(cx, sw - cw)}:{min(cy, sh - ch)},format=rgba[q{i}]')
            topo.append(_cantos(cw, ch, r, fps, b - a, f'qc{i}'))
            topo.append(f'[q{i}][qc{i}]alphamerge,{_desde(a, fps)}[qr{i}]')
            topo.append(f"[{atual}][qr{i}]overlay=x={round(c['x'] * w)}:y={round(c['y'] * h)}:eof_action=pass:enable='{quando(a, b)}'[tq{i}]")
            atual = f'tq{i}'
            continue
        corte = _par((g.get('topo') or 0) * sh) if g['modo'] == 'janela' else 0
        qh = sh - corte
        r = max(1, round((g.get('raio') or 0) * sw))
        topo.append(f'[aq{i}]trim=start={a:.4f}:end={b:.4f},setpts=PTS-STARTPTS,scale={sw}:{sh},crop={sw}:{qh}:0:{corte},format=rgba[q{i}]')
        topo.append(_cantos(sw, qh, r, fps, b - a, f'qc{i}'))
        topo.append(f'[q{i}][qc{i}]alphamerge,{_desde(a, fps)}[qr{i}]')
        topo.append(f"[{atual}][qr{i}]overlay=x={x0}:y={y0 + corte}:eof_action=pass:enable='{quando(a, b)}'[tq{i}]")
        atual = f'tq{i}'
    if pessoas:
        # o ator e a máscara são cortados no trecho antes de se juntarem: o alphamerge (que espera as duas entradas) só
        # recebe os quadros do trecho, e nada do ator antes dele fica guardado esperando a máscara
        n = len(pessoas)
        partes.append('[ator2]split=' + str(n) + ''.join(f'[pa{i}]' for i in range(n)))
        partes.append('[masc]split=' + str(n) + ''.join(f'[pm{i}]' for i in range(n)))
        for i, (a, b, g) in enumerate(pessoas):
            sw, sh = _par(g['s'] * w), _par(g['s'] * h)
            x0, y0 = round(g['tx'] * w), round(g['ty'] * h)
            # na janela, só a parte de cima (a cabeça e os ombros saindo dela); no recortado, a pessoa inteira
            alto = _par((g.get('topo') or 0) * sh) if g['modo'] == 'janela' else sh
            corte = f'trim=start={a:.4f}:end={b:.4f},setpts=PTS-STARTPTS'
            topo.append(f'[pa{i}]{corte}[pat{i}]')
            topo.append(f'[pm{i}]{corte}[pmt{i}]')
            topo.append(f'[pat{i}][pmt{i}]alphamerge,scale={sw}:{sh},crop={sw}:{alto}:0:0,{_desde(a, fps)}[pq{i}]')
            topo.append(f"[{atual}][pq{i}]overlay=x={x0}:y={y0}:eof_action=pass:enable='{quando(a, b)}'[tp{i}]")
            atual = f'tp{i}'
    topo.append(f'[{atual}]null[topo]')
    return topo


def _inserts(camadas: list[tuple[Path, float]], primeira_entrada: int, rotulo_in: str, saida: str) -> tuple[list[str], list[str]]:
    """Camada 2 (SPEC §13): cada clipe da camada dos inserts e motions (ProRes 4444 com transparência, fotografado pelos
    navegadores) sobreposto no seu instante. Devolve (entradas, filtros), de [`rotulo_in`] a [`saida`]."""
    entradas: list[str] = []
    filtros: list[str] = []
    atual = rotulo_in
    for k, (clipe, inicio) in enumerate(camadas):
        entradas += ['-i', str(clipe)]
        filtros.append(f'[{k + primeira_entrada}:v]setpts=PTS-STARTPTS+{inicio:.6f}/TB[c{k}]')
        filtros.append(f'[{atual}][c{k}]overlay=format=auto:eof_action=pass[o{k}]')
        atual = f'o{k}'
    filtros.append(f'[{atual}]null[{saida}]')
    return entradas, filtros


def _transicoes(transicoes: list[dict] | None, rotulo_in: str, w: int, h: int, primeira_entrada: int,
                fps: int = 30) -> tuple[list[str], list[str], str]:
    """Camada 4 (SPEC §13, §8.8): as transições entre planos, sobre o quadro já montado (`transicoes.filtros`: zoom com
    desfoque, brilho e a luz colorida, só nas janelas delas). Recebe `__render.transicoes`. Devolve (entradas, filtros,
    rótulo de saída); sem transições com efeito, nada."""
    if not any(x.get('tipo') in ('luz', 'brilho', 'zoom') for x in transicoes or []):
        return [], [], rotulo_in
    entradas, f = transicoes_mod.filtros(transicoes, rotulo_in, 'tr', w, h, primeira_entrada, fps)
    return entradas, f, 'tr'


def _legenda(legenda: dict | None, rotulo_in: str) -> tuple[list[str], str]:
    """Camada 5 (SPEC §13, §8.10; a P4): a legenda por cima de tudo, um ASS (`legenda.escrever`, dos blocos de
    `__render.legenda`) desenhado pelo libass. `legenda`: `{arquivo: Path}`; sem arquivo, nada. Devolve (filtros,
    rótulo de saída)."""
    if not legenda or not legenda.get('arquivo'):
        return [], rotulo_in
    return [f'[{rotulo_in}]{legenda_mod.filtro(legenda["arquivo"])}[leg]'], 'leg'


def _pos_montagem(transicoes: list[dict] | None, legenda: dict | None, rotulo_in: str, saida: str, w: int, h: int,
                  primeira_entrada: int, fps: int = 30) -> tuple[list[str], list[str]]:
    """O que age sobre o quadro inteiro já montado: as transições e, por cima de tudo, a legenda; no fim, o formato de
    saída. Devolve (entradas, filtros)."""
    entradas, filtros, atual = _transicoes(transicoes, rotulo_in, w, h, primeira_entrada, fps)
    f_leg, atual = _legenda(legenda, atual)
    return entradas, [*filtros, *f_leg, f'[{atual}]format=yuv420p[{saida}]']


def _audio(eventos_som: list[dict] | None, primeira_entrada: int, rotulo_voz: str, saida: str, clipes: list[dict],
           duracao: float, audio: dict | None = None) -> tuple[list[str], list[str]]:
    """Camada A (SPEC §13, §8.6, §8.8, §8.9): sem `audio`, a voz do bruto (já cortada, [`rotulo_voz`]) com os sons
    somados — os de apoio dos presets e os das transições (os dois vêm em `__render.sons`). Com `audio` (a P3,
    `audio.da_exportacao`), a voz vem de uma entrada própria (a limpa, cortada igual) com o timbre, o compressor e os
    faders, o fundo com ducking e o −14 LUFS (`audio.filtros`); a voz do bruto é descartada. Devolve (entradas,
    filtros), com a mistura em [`saida`]. `audio['pronta']`: a mistura já feita (um WAV, do cache do render), só lida."""
    if audio is None:
        return sons.filtro_mistura(eventos_som or [], primeira_entrada, rotulo_voz, saida)
    if audio.get('pronta'):
        return ['-i', str(audio['pronta'])], [f'[{rotulo_voz}]anullsink', f'[{primeira_entrada}:a]anull[{saida}]']
    entradas, filtros = audio_mod.filtros(audio, clipes, eventos_som or [], primeira_entrada, saida, duracao, audio.get('medida'))
    return entradas, [f'[{rotulo_voz}]anullsink', *filtros]


def comando_final(bruto: Path, clipes: list[dict], horizontal: bool, enquadramento_x: float, w: int, h: int, fps: int,
                  divisoes: list[tuple[float, float, dict]], camadas: list[tuple[Path, float]], codec: str, duracao: float,
                  saida: Path, mascara: Path | None = None, eventos_som: list[dict] | None = None,
                  transicoes: list[dict] | None = None, legenda: dict | None = None, look: dict | None = None,
                  mascara_vinheta: Path | None = None, audio: dict | None = None, movimentos: list[dict] | None = None,
                  hwaccel: bool = True) -> list[str]:
    """Uma passada só, montada por camadas na ordem do contrato (SPEC §13; cada área mexe só na sua função): o ator e o
    áudio do bruto, decodificado pelo chip de vídeo (`_ator`); por cima, a camada dos inserts (`_inserts`); por cima
    dela, o ator na janela do "insert atrás" e a pessoa recortada (a parte de cima de `_ator`); depois, sobre o quadro
    montado, as transições e a legenda (`_pos_montagem`); o áudio (`_audio`). Codifica no chip de vídeo (HEVC ou H.264).
    Entradas do ffmpeg, nesta ordem: o bruto, a máscara (se usada), os clipes dos inserts, os sons e a máscara da
    vinheta do look (se houver; lida uma vez e repetida pelo filtro `loop`). O look (LUT + vinheta, `look.py`) vale só
    para o ator, logo depois da escala. `hwaccel`: decodificar o bruto no chip de vídeo (no 4K compensa; num vídeo leve,
    como o proxy 720p, trazer cada quadro do chip de volta custa mais que decodificar no processador)."""
    com_look = look_mod.ativo(look)
    partes, topo = _ator(clipes, horizontal, enquadramento_x, w, h, fps, divisoes, duracao, mascara is not None, com_look, movimentos)
    usa_mascara = any('[1:v]' in x for x in partes)
    base_idx = 2 if usa_mascara else 1
    entradas: list[str] = ['-i', str(mascara)] if usa_mascara else []
    ent_ins, f_ins = _inserts(camadas, base_idx, 'base', 'topo_in')
    ent_som, f_som = _audio(eventos_som, base_idx + len(camadas), 'ac', 'am', clipes, duracao, audio)
    entradas += ent_ins + ent_som
    if com_look:
        idx_vinheta = None
        if mascara_vinheta is not None and look_mod.VINHETAS.get(look.get('vinheta'), 0) > 0:
            idx_vinheta = base_idx + len(camadas) + ent_som.count('-i')
            entradas += ['-i', str(mascara_vinheta)]
        partes += look_mod.filtros(look, 'ator_cru', 'ator', idx_vinheta, h)
    ent_pos, f_pos = _pos_montagem(transicoes, legenda, 'topo', 'v', w, h, 1 + entradas.count('-i'), fps)
    entradas += ent_pos
    partes += f_ins + f_som + topo + f_pos
    cv = ['-c:v', 'hevc_videotoolbox', '-q:v', '65', '-tag:v', 'hvc1'] if codec == 'hevc' else ['-c:v', 'h264_videotoolbox', '-q:v', '65']
    return ['ffmpeg', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', *(['-hwaccel', 'videotoolbox'] if hwaccel else []), '-i', str(bruto),
            *entradas, '-filter_complex', ';'.join(partes), '-map', '[v]', '-map', '[am]', *cv, '-pix_fmt', 'yuv420p',
            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
            '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', f'{duracao:.4f}', '-movflags', '+faststart', str(saida)]


def quadros(t: dict, fps: int) -> range:
    """Os quadros do vídeo final (índices) em que o trecho aparece: os que começam em [ini, fim)."""
    return range(math.ceil(t['ini'] * fps - 1e-9), math.ceil(t['fim'] * fps - 1e-9))


def fotos(t: dict, fps: int) -> list[float]:
    """Os instantes fotografados de um trecho: a grade dele mesmo (ini + j/fps), com fotos para qualquer fase (ceil da
    duração em quadros). O quadro q0 + j do vídeo mostra a foto j: no máximo 1 quadro atrás do instante exato, e a mesma
    foto serve em qualquer instante do vídeo (os cortes movem o trecho; o cache do render reaproveita)."""
    return [t['ini'] + j / fps for j in range(math.ceil(round((t['fim'] - t['ini']) * fps, 6)))]


def pedacos(trechos: list[dict], fps: int, navegadores: int) -> list[list[list[float]]]:
    """Os instantes fotografados de cada trecho (`fotos`), cortados em pedaços para dividir entre os navegadores: pedaços
    pequenos o bastante para todos trabalharem até o fim, grandes o bastante para não perder tempo trocando."""
    por_trecho = [fotos(t, fps) for t in trechos]
    total = sum(map(len, por_trecho))
    tamanho = max(12, min(48, math.ceil(total / (navegadores * 3)) if total else 12))
    return [[ts[i:i + tamanho] for i in range(0, len(ts), tamanho)] for ts in por_trecho if ts]


# ---------------------------------------------------------------- um insert parado, desenhado pelo ffmpeg

CHUVA = RAIZ / 'render' / 'fundos' / 'aura' / 'chuva.mp4'
# a cor de um vídeo sem a matriz marcada: o navegador lê como BT.709 (o swscale, sem isso, leria como BT.601)
SEM_MARCA = 'bt709'
FILTRO = 'bilinear'  # a escala da mídia no card (a que mais se aproxima do navegador, medida contra as fotos)
# um vídeo dentro do card sai mais claro na foto do navegador (o Chrome do Mac trata o vídeo com a curva da Apple,
# gama ~1,96, e entrega em sRGB): a mesma curva, medida contra as fotos (a chuva, sem card, e as imagens não mudam)
CURVA_VIDEO = 0.9


def _midia(arq: Path) -> tuple[dict, str]:
    """As medidas de uma mídia como o navegador vê (a largura de exibição, num vídeo de pixel não quadrado) e a
    conversão dela para RGBA como ele faz (a matriz marcada no arquivo, ou BT.709 sem marca). `px`: pixels gravados
    por pixel de exibição."""
    info = inspecionar(arq)
    gravada = info['largura']
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_space,sample_aspect_ratio',
                        '-of', 'json', str(arq)], capture_output=True, text=True).stdout
    st = (json.loads(r or '{}').get('streams') or [{}])[0]
    num, _, den = (st.get('sample_aspect_ratio') or '1:1').partition(':')
    if num.isdigit() and den.isdigit() and int(num) and int(den):
        info['largura'] = info['largura'] * int(num) / int(den)
    info['px'] = gravada / info['largura']
    cor = st.get('color_space')
    return info, f"in_color_matrix={'auto' if cor and cor != 'unknown' else SEM_MARCA}"


def _parado(i: int, fps: int, n: int, filtros: str = '') -> str:
    """Uma imagem (lida uma vez) repetida em `n` quadros: os filtros dela rodam uma vez só."""
    return f'[{i}:v]{filtros}{"," if filtros else ""}loop=loop=-1:size=1,setpts=N/{fps}/TB,trim=end_frame={n}'


def camada_do_insert(t: dict, w: int, h: int, fps: int, saida: Path, fixas: dict) -> list[str]:
    """O clipe da camada de um insert parado (`t['geometria']`, de `desenho.geometriaDoInsert` na página): o mesmo que a
    foto do trecho daria — ProRes 4444 com transparência, um quadro por foto (`fotos`) —, desenhado pelo ffmpeg. Na área
    do insert: o fundo (a chuva tocando no relógio do vídeo final, ou a foto parada que a página tirou dele, ou preto) e,
    na ordem de pintura, cada card na janela de tempo dele: a sombra (a foto da página, parada no 1º instante do card) e
    a mídia em cover (no topo, se `topo`) com os cantos redondos. O zoom lento (`continuo`) amplia o card inteiro, sombra
    junto, como o transform da prévia. A mídia mostra os quadros que a página mostraria (`desenho.videoNoTempo`: a grade
    de 24/s da mídia, parada no fim dela). `fixas`: as fotos paradas, `{'fundo': png | None, 'sombras': {k: (png,
    (x0, y0, x1, y1))}}` (a sombra com a caixa onde ela tem algo, no quadro). Devolve o comando do ffmpeg."""
    g = t['geometria']
    n = len(fotos(t, fps))
    rel = [(t['ini'] + j / fps) - t['ini'] for j in range(n)]  # a mesma conta da página (`ir(t)` − início do insert)
    # a área do insert no quadro (deitado, lado a lado: à esquerda, na altura toda)
    ax, ay = round((g['area'].get('x') or 0) * w), round(g['area']['y'] * h)
    aw, ah = round((g['area'].get('w') or 1) * w), round(g['area']['h'] * h)
    entradas: list[str] = []
    f: list[str] = []

    def entrada(*args: str) -> int:
        entradas.extend(args)
        return entradas.count('-i') - 1

    # o fundo da área
    if g['fundo'] == 'chuva':
        dur = inspecionar(CHUVA)
        s0 = t['ini'] % dur['duracao']  # o relógio do vídeo final, dando a volta no laço (`desenho.chuvaNoRelogio`)
        ss = max(0.0, s0 - 1)
        i = entrada('-hwaccel', 'videotoolbox', '-stream_loop', '-1', '-ss', f'{ss:.6f}', '-i', str(CHUVA))
        k = max(aw / dur['largura'], ah / dur['altura'])
        sw, sh = max(round(dur['largura'] * k), aw), max(round(dur['altura'] * k), ah)
        # quadro j: o último da chuva até s0 + j/fps (o vídeo parado num instante mostra o quadro daquele instante)
        f.append(f'[{i}:v]setpts=PTS-{s0 - ss:.6f}/TB,fps={fps}:round=up:start_time=0,trim=end_frame={n},'
                 f'scale={sw}:{sh}:{_midia(CHUVA)[1]},crop={aw}:{ah}:{(sw - aw) // 2}:{(sh - ah) // 2},format=rgba[f0]')
    elif fixas.get('fundo'):
        f.append(_parado(entrada('-i', str(fixas['fundo'])), fps, n, f'crop={aw}:{ah}:{ax}:{ay},format=rgba') + '[f0]')
    else:  # a receita sem fundo: a área em preto
        f.append(f'color=c=black:s={aw}x{ah}:r={fps},format=rgba,trim=end_frame={n}[f0]')
    atual = 'f0'

    for c in g['cards']:
        js = [j for j in range(n) if c['ini'] <= rel[j] <= c['fim']]  # `estadoCard`: na tela de ini a fim, inclusive
        if not js:
            continue
        j0, j1 = js[0], js[-1]
        q, k, cont = j1 - j0 + 1, c['k'], c['continuo']
        cw, ch = c['w'] / 100 * aw, c['h'] / 100 * ah
        x0, y0 = c['cx'] / 100 * aw, c['cy'] / 100 * ah
        # o card parado: as bordas em pixels inteiros, cada uma arredondada (como a página desenha o card em repouso)
        bx, by = round(x0 - cw / 2), round(y0 - ch / 2)
        base = (round(x0 + cw / 2) - bx, round(y0 + ch / 2) - by)
        visivel = f'between(n,{j0},{j1})'

        def colocar(rotulo: str, caixa: tuple[int, int, int, int], saida_: str) -> None:
            """Põe na área uma camada do card no tamanho do card parado (a mídia ou a sombra; `caixa`: x, y, largura e
            altura dela no card parado). Com o zoom lento, ela vai junto com o card como o transform da prévia —
            translate(dx·u cqw, dy·u cqh) scale((1 + escala)^u), u em s desde que o card apareceu, a partir do centro
            dele —, em fração de pixel (o `perspective` leva a camada para os cantos exatos de cada instante, num
            quadro parado no lugar: o card anda liso, como no navegador)."""
            nonlocal atual
            cx_, cy_, cw_, ch_ = caixa
            if not cont:
                f.append(f'[{rotulo}]tpad=start={j0}:start_mode=clone[{rotulo}p]')
                f.append(f"[{atual}][{rotulo}p]overlay=x={cx_}:y={cy_}:format=rgb:enable='{visivel}'[{saida_}]")
                atual = saida_
                return
            e, vx, vy = 1 + cont['escala'], cont['dx'] / 100 * aw, cont['dy'] / 100 * ah
            # os cantos de cima à esquerda e de baixo à direita em cada quadro em que o card aparece
            us = [j / fps - c['ini'] for j in js]
            esq = [x0 + vx * u + (cx_ - x0) * e ** u for u in us]
            topo = [y0 + vy * u + (cy_ - y0) * e ** u for u in us]
            ox, oy = math.floor(min(esq)) - 2, math.floor(min(topo)) - 2
            qw = max(math.ceil(max(x + cw_ * e ** u for x, u in zip(esq, us))) - ox + 2, cw_ + 4)
            qh = max(math.ceil(max(y + ch_ * e ** u for y, u in zip(topo, us))) - oy + 2, ch_ + 4)
            u = f"(in/{fps}+{j0 / fps - c['ini']:.6f})"  # o u de cada quadro no fluxo da camada (que começa em j0)
            s = f'pow({e:.6f},{u})'
            # a camada vai com uma margem transparente em volta: fora da imagem, o `perspective` repete a borda dela
            lx = f'({x0 - ox:.4f}+{vx:.5f}*{u}+{cx_ - x0 - 2:.4f}*{s})'
            ly = f'({y0 - oy:.4f}+{vy:.5f}*{u}+{cy_ - y0 - 2:.4f}*{s})'
            f.append(f"[{rotulo}]format=gbrap,pad={qw}:{qh}:2:2:color=black@0,"
                     f"perspective=x0='{lx}':y0='{ly}':x1='{lx}+W*{s}':y1='{ly}':x2='{lx}':y2='{ly}+H*{s}':"
                     f"x3='{lx}+W*{s}':y3='{ly}+H*{s}':sense=destination:interpolation=linear:eval=frame,"
                     f"format=rgba,tpad=start={j0}:start_mode=clone[{rotulo}p]")
            f.append(f"[{atual}][{rotulo}p]overlay=x={ox}:y={oy}:format=rgb:enable='{visivel}'[{saida_}]")
            atual = saida_

        # a sombra: a foto da página com o card parado, na caixa onde ela tem algo (dentro da área)
        sombra = (fixas.get('sombras') or {}).get(k) if c['sombra'] else None
        if sombra:
            png, (sx0, sy0, sx1, sy1) = sombra
            sx1, sy1 = min(sx1, ax + aw), min(sy1, ay + ah)
            if sx1 > sx0 and sy1 > sy0:
                f.append(_parado(entrada('-i', str(png)), fps, q, f'crop={sx1 - sx0}:{sy1 - sy0}:{sx0}:{sy0},format=rgba') + f'[sb{k}]')
                caixa = (sx0, sy0, sx1 - sx0, sy1 - sy0)
                colocar(f'sb{k}', caixa, f'so{k}')

        # a mídia em cover no card parado (presa no topo, se `topo`): o pedaço do original que aparece, no tamanho do
        # card, com os cantos redondos
        m = c['midia']
        arq = RAIZ / m['url'].lstrip('/')
        info, cor = _midia(arq)
        kc = max(cw / info['largura'], ch / info['altura'])
        ws, hs = cw / kc, ch / kc  # o pedaço que aparece, em pixels de exibição do original
        pedaco = (f"crop={round(ws * info['px'])}:{round(hs)}:{round((info['largura'] - ws) / 2 * info['px'])}:"
                  f"{0 if c['topo'] else round((info['altura'] - hs) / 2)}")
        escala = f'scale={base[0]}:{base[1]}:flags={FILTRO}:{cor},setsar=1,format=rgba'
        # a máscara dos cantos (com a borda suavizada, como o navegador), feita uma vez no tamanho do card parado
        r = c['raio'] / 100 * aw
        dx = f'max(0,max({r:.3f}-(X+0.5),X+0.5-{base[0] - r:.3f}))'
        dy = f'max(0,max({r:.3f}-(Y+0.5),Y+0.5-{base[1] - r:.3f}))'
        f.append(f"color=c=white:s={base[0]}x{base[1]}:r={fps}:d={1 / fps:.6f},format=gray,"
                 f"geq=lum='255*if(gt({dx},0)*gt({dy},0),clip({r:.3f}+0.5-hypot({dx},{dy}),0,1),1)',"
                 f"loop=loop=-1:size=1,setpts=N/{fps}/TB,trim=end_frame={q}[mm{k}]")
        if m['tipo'] == 'imagem':  # parada: escalada uma vez
            f.append(_parado(entrada('-i', str(arq)), fps, q, f'{pedaco},{escala}') + f'[mv{k}]')
        else:
            # o quadro j mostra o último quadro da mídia até `destino` (a grade de 24/s dela, no meio do quadro), que anda
            # um quadro por quadro desde o 1º visível até a mídia acabar (aí fica parado no último)
            fim = min(m['fim'] if m['fim'] is not None else math.inf, info['duracao'])
            destino = [min((math.floor(min(m['inicio'] + rel[j] - c['ini'], fim) * 24 + 1e-6) + 0.5) / 24, fim - 0.001) for j in js]
            andando = next((i for i in range(1, len(destino)) if abs(destino[i] - destino[0] - i / 24) > 1e-6), len(destino))
            ss = max(0.0, math.floor(destino[0] - 1))
            i = entrada('-ss', f'{ss:.3f}', '-i', str(arq))
            curva = f'255*pow(val/255,{CURVA_VIDEO})'
            f.append(f'[{i}:v]setpts=PTS-{destino[0] - ss:.6f}/TB,fps={fps}:round=up:start_time=0,trim=end_frame={andando},'
                     f"tpad=stop={q - andando}:stop_mode=clone,{pedaco},{escala},lutrgb=r='{curva}':g='{curva}':b='{curva}'[mv{k}]")
        f.append(f'[mv{k}][mm{k}]alphamerge[mc{k}]')
        colocar(f'mc{k}', (bx, by, base[0], base[1]), f'co{k}')

    # fora da área, transparente; a cor sem marca, como nas fotos (o mesmo caminho até o ProRes)
    f.append(f'[{atual}]pad={w}:{h}:{ax}:{ay}:color=black@0,format=rgba,'
             f'setparams=color_primaries=unknown:color_trc=unknown:colorspace=unknown:range=unknown[v]')
    return ['ffmpeg', '-y', '-loglevel', 'error', *entradas, '-filter_complex', ';'.join(f), '-map', '[v]', '-frames:v', str(n),
            '-r', str(fps), '-c:v', 'prores_videotoolbox', '-profile:v', '4444', str(saida)]
