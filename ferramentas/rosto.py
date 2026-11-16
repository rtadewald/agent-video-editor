"""O rosto do ator ao longo do vídeo (do 18: backend/app/rosto.py; a medida em docs/rosto.md do 18).

O detector de rosto do MediaPipe (BlazeFace de curta distância, local) roda a 6 quadros por segundo e dá, para cada
instante, a caixa do rosto (centro, largura e altura, em fração do quadro) e a confiança; com mais de um rosto, vale o
mais confiável (o maior pegava objetos do cenário num plano aberto); os buracos (rosto não achado, virado) recebem a medida vizinha com confiança 0. O arquivo:
`{por_segundo, largura, altura, amostras: [{t, cx, cy, w, h, conf}]}`. Serve ao enquadramento 16:9 → 9:16 (medido no
original reduzido, `midia/rosto/original.json`) e ao ator nas áreas que sobram da tela (medido no proxy,
`midia/rosto/f1.json`, que a página de render lê). Importado por preparar.py (o mediapipe vem das dependências dele).
"""
import os
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

from base import BIBLIOTECA, inspecionar

MODELO = BIBLIOTECA / 'modelos' / 'blaze_face_short_range.tflite'
URL_MODELO = ('https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/'
              'blaze_face_short_range.tflite')
POR_SEGUNDO = 6  # amostras por segundo
CONFIANCA_MIN = 0.5


def _baixar_modelo() -> None:
    """O modelo (~230 KB, do MediaPipe) fica na biblioteca (fora do git): baixa se faltar."""
    if MODELO.exists():
        return
    import urllib.request
    MODELO.parent.mkdir(parents=True, exist_ok=True)
    tmp = MODELO.with_suffix('.parte')
    urllib.request.urlretrieve(URL_MODELO, tmp)
    tmp.replace(MODELO)


@contextmanager
def _calado():
    """O MediaPipe (LiteRT) escreve logs de INFO direto no stderr, sem chave que os cale: o stderr vai para /dev/null
    enquanto o detector existe (os ffmpeg daqui têm o stderr deles; as mensagens do preparar vão para o stdout)."""
    sys.stderr.flush()
    guardado = os.dup(2)
    nulo = os.open(os.devnull, os.O_WRONLY)
    os.dup2(nulo, 2)
    try:
        yield
    finally:
        os.dup2(guardado, 2)
        os.close(nulo)
        os.close(guardado)


@contextmanager
def detector():
    """O detector de rosto do MediaPipe no modo de vídeo: recebe um quadro RGB (numpy) e o instante em ms; devolve os
    rostos achados como (x, y, largura, altura, confiança), em pixels."""
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    _baixar_modelo()
    opcoes = vision.FaceDetectorOptions(base_options=BaseOptions(model_asset_path=str(MODELO)), running_mode=vision.RunningMode.VIDEO,
                                        min_detection_confidence=CONFIANCA_MIN)
    with _calado(), vision.FaceDetector.create_from_options(opcoes) as det:
        def detectar(rgb, ms: int):
            r = det.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ms)
            return [(d.bounding_box.origin_x, d.bounding_box.origin_y, d.bounding_box.width, d.bounding_box.height,
                     d.categories[0].score if d.categories else 0.0) for d in r.detections]
        yield detectar


def _quadros(video: Path, por_segundo: int, junto: list[str]):
    """Os quadros do vídeo a `por_segundo` por segundo, em RGB, como o espectador vê (o ffmpeg aplica a rotação do
    metadado), reduzidos ao lado maior de 1280 px: (índice, quadro, largura, altura). `junto`: uma outra saída do ffmpeg
    feita na mesma passada (o proxy: o vídeo é lido uma vez só). Se o ffmpeg falha ou entrega bem menos quadros do que a
    duração pede, levanta RuntimeError — para não passar por "vídeo sem rosto"."""
    import numpy as np
    info = inspecionar(video)
    w, h, duracao = info['largura'], info['altura'], info['duracao']
    # o detector não precisa de mais que ~1280 px (as medidas saem em fração do quadro): um 4K reduzido não passa ~25 MB
    # por quadro pelo cano
    k_esc = min(1.0, 1280 / max(w, h, 1))
    w, h = max(int(w * k_esc) // 2 * 2, 2), max(int(h * k_esc) // 2 * 2, 2)
    with tempfile.TemporaryFile() as erros:  # num arquivo, para o stderr nunca encher o cano e travar o ffmpeg
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-hwaccel', 'videotoolbox', '-i', str(video), *junto,
                               '-vf', f'fps={por_segundo},scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                              stdout=subprocess.PIPE, stderr=erros)
        tamanho = w * h * 3
        k = 0
        leu_tudo = False
        try:
            while True:
                buf = ff.stdout.read(tamanho)
                if len(buf) < tamanho:
                    leu_tudo = True
                    break
                yield k, np.frombuffer(buf, np.uint8).reshape(h, w, 3), w, h
                k += 1
        finally:
            ff.stdout.close()
            codigo = ff.wait()
        if leu_tudo:  # quem parou de ler no meio (de propósito) não confere nada
            erros.seek(0)
            msg = erros.read().decode('utf-8', 'replace').strip().splitlines()
            if codigo != 0:
                raise RuntimeError(f'O ffmpeg falhou ao ler o vídeo ({codigo}): {msg[-1] if msg else "sem mensagem"}')
            if duracao and k < duracao * por_segundo / 2:
                raise RuntimeError(f'O vídeo parece incompleto: {k} quadros em {duracao:.1f} s')


def medir(video: Path, por_segundo: int = POR_SEGUNDO, junto: list[str] = ()) -> dict:
    """Mede o rosto em `video`: `{por_segundo, largura, altura, amostras: [{t, cx, cy, w, h, conf}]}` (posição e tamanho em
    fração do quadro; com mais de um rosto, vale o mais confiável). Sem rosto nenhum, `amostras` fica vazia. `junto`: os
    argumentos de uma outra saída do ffmpeg, gerada na mesma leitura do vídeo (ver `_quadros`)."""
    amostras: list[dict] = []
    largura = altura = 0
    with detector() as detectar:
        for k, rgb, w, h in _quadros(video, por_segundo, list(junto)):
            largura, altura = w, h
            t = k / por_segundo
            rostos = detectar(rgb, round(t * 1000))
            if rostos:
                # o mais confiável: no plano aberto (16:9), a luminária e a planta do cenário viravam um "rosto" maior que o
                # do ator (confiança ~0,55 contra ~0,8 do ator), e o maior ganhava em 3 de cada 4 amostras (vsl-black)
                x, y, rw, rh, conf = max(rostos, key=lambda r: r[4])
                amostras.append({'t': round(t, 3), 'cx': round((x + rw / 2) / w, 4), 'cy': round((y + rh / 2) / h, 4),
                                 'w': round(rw / w, 4), 'h': round(rh / h, 4), 'conf': round(float(conf), 3)})
            else:
                amostras.append({'t': round(t, 3), 'conf': None})
    return {'por_segundo': por_segundo, 'largura': largura, 'altura': altura, 'amostras': preencher(amostras)}


def preencher(amostras: list[dict]) -> list[dict]:
    """Os buracos (sem rosto) recebem a caixa da medida mais próxima no tempo (empate: a anterior), com confiança 0.
    Sem nenhum rosto no vídeo, não sobra amostra."""
    achadas = [i for i, a in enumerate(amostras) if a.get('conf') is not None]
    if not achadas:
        return []
    out = []
    j = 0  # índice em `achadas` da primeira achada em i ou depois
    for i, a in enumerate(amostras):
        while j < len(achadas) and achadas[j] < i:
            j += 1
        if a.get('conf') is not None:
            out.append(a)
            continue
        antes = achadas[j - 1] if j > 0 else None
        depois = achadas[j] if j < len(achadas) else None
        viz = antes if depois is None or (antes is not None and i - antes <= depois - i) else depois
        out.append({**{k: amostras[viz][k] for k in ('cx', 'cy', 'w', 'h')}, 't': a['t'], 'conf': 0})
    return out
