# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""Folha de contato de um vídeo: um quadro a cada N s, com o tempo escrito em cada um, numa imagem só (para o Claude
conferir um vídeo olhando).

    uv run ferramentas/folha.py <video> [--cada 2] [--colunas 8]
    uv run ferramentas/folha.py projetos/<slug>/versoes/vN/proxy.mp4 --planos
    uv run ferramentas/folha.py projetos/<slug>/versoes/vN/proxy.mp4 --soltos

`--planos`: cada plano com insert ou motion (pelo `planos.json` da versão) numa linha, em quadros grandes: os 3 primeiros
(o quadro vazio na entrada), o meio, e os 2 últimos (onde o zoom termina e a saída). Uma imagem a cada 6 planos.
`--soltos`: varre os 24 quadros de cada segundo atrás do frame solto ou vazio (1 a 5 quadros que destoam do antes e do
depois, com imagem estável dos dois lados) e grava uma tira de 8 quadros em volta de cada alerta. Cerca de metade dos
alertas é a entrada de um motion ou um movimento: olhe cada tira e decida.

Grava `<nome>_folha.jpg` ao lado do vídeo (no banco e na mídia dos projetos, em /tmp, para não sujar) e imprime o caminho.
"""
import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import BIBLIOTECA, PROJETOS, ffmpeg, inspecionar  # noqa: E402

FONTE = '/System/Library/Fonts/Supplemental/Arial.ttf'
LADO = 320  # o lado maior de cada quadro


def destino(video: Path) -> Path:
    v = video.resolve()
    protegido = v.is_relative_to(BIBLIOTECA) or (v.is_relative_to(PROJETOS) and 'midia' in v.relative_to(PROJETOS).parts)
    pasta = Path('/tmp') if protegido else v.parent
    nome = f'{v.parent.name}_{v.stem}_folha.jpg' if protegido else f'{v.stem}_folha.jpg'
    return pasta / nome


def folha(video: Path, cada: float = 2.0, colunas: int = 8) -> Path:
    if not video.is_file():
        raise SystemExit(f'Vídeo não encontrado: {video}')
    info = inspecionar(video)
    if 'largura' not in info:
        raise SystemExit(f'{video} não tem vídeo.')
    n = max(1, math.floor(info['duracao'] / cada + 1e-6) + (1 if info['duracao'] % cada > 0.05 or info['duracao'] < cada else 0))
    colunas = max(1, min(colunas, n))
    linhas = math.ceil(n / colunas)
    texto = r"%{eif\:trunc(t/60)\:d}\:%{eif\:mod(trunc(t)\,60)\:d\:2}\,%{eif\:trunc(mod(t\,1)*10)\:d}"
    filtros = [f"select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,{cada - 0.02})'",
               f"scale='if(gt(iw,ih),{LADO},-2)':'if(gt(iw,ih),-2,{LADO})'",
               f"drawtext=fontfile={FONTE}:text='{texto}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=5",
               f'tile={colunas}x{linhas}:margin=4:padding=4:color=0x202020']
    saida = destino(video)
    ffmpeg('-i', str(video), '-vf', ','.join(filtros), '-fps_mode', 'vfr', '-frames:v', '1', '-q:v', '3', str(saida))
    return saida


def _quadros(video: Path, pasta: str, largura: int) -> int:
    """Todos os quadros do vídeo a 24 fps em <pasta>/00001.jpg… (o quadro k, de 0, é o arquivo k+1). Devolve quantos."""
    ffmpeg('-i', str(video), '-vf', f'fps=24,scale={largura}:-2', '-q:v', '3', f'{pasta}/%05d.jpg')
    return len(list(Path(pasta).glob('*.jpg')))


def _tira(pasta: str, quadros: list[int], rotulos: list[str], destino: str) -> None:
    """Copia os quadros escolhidos para <destino>_NN.jpg, cada um com o seu rótulo."""
    for n, (k, r) in enumerate(zip(quadros, rotulos)):
        ffmpeg('-i', f'{pasta}/{k + 1:05d}.jpg', '-vf',
               f"drawtext=fontfile={FONTE}:text='{r}':x=4:y=4:fontsize=15:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=3",
               '-q:v', '3', f'{destino}_{n:02d}.jpg')


def _montar(pasta: str, glob: str, colunas: int, linhas: int, saida: Path) -> None:
    ffmpeg('-pattern_type', 'glob', '-i', f'{pasta}/{glob}', '-vf', f'tile={colunas}x{linhas}:margin=4:padding=4:color=0x202020',
           '-frames:v', '1', '-q:v', '3', str(saida))


def _tempo(t: float) -> str:
    return f"{int(t) // 60}\\:{t % 60:04.1f}"


def planos(video: Path) -> list[Path]:
    """Por plano que não é Full ator: quadros 0, 1, 2, o do meio e os 2 últimos; 6 planos por imagem."""
    import json
    import tempfile
    lista = json.loads((video.parent / 'planos.json').read_text())
    alvos = [p for p in lista if not p['tipo'].startswith('full_ator')]
    saidas = []
    with tempfile.TemporaryDirectory() as q, tempfile.TemporaryDirectory() as tmp:
        total = _quadros(video, q, 240)
        for i, p in enumerate(alvos):
            a = math.ceil(p['ini'] * 24 - 1e-6)  # o 1º quadro do plano (o quadro k mostra o instante k/24)
            b = max(a + 3, math.ceil(p['fim'] * 24 - 1e-6) - 1)
            ks = [min(total - 1, k) for k in (a, a + 1, a + 2, (a + b) // 2, b - 1, b)]
            _tira(q, ks, [f"{p['id']} {_tempo(a / 24)}", 'q1', 'q2', 'meio', 'fim-1', 'fim'], f'{tmp}/{i // 6:03d}_{i % 6:02d}')
        for g in range(math.ceil(len(alvos) / 6)):
            n = min(6, len(alvos) - g * 6)
            saida = video.parent / f'planos_folha_{g + 1}.jpg'
            _montar(tmp, f'{g:03d}_*.jpg', 6, n, saida)
            saidas.append(saida)
    return saidas


def soltos(video: Path, limiar: float = 4.0) -> Path | None:
    """Saltos de imagem a até 6 quadros um do outro (pelo menos 2 fortes, no máximo 3), com imagem estável antes e
    depois: uma passagem curta que não é transição nem movimento. Imprime cada alerta e grava as tiras."""
    import json
    import subprocess
    import tempfile
    import numpy as np
    L, A = 90, 160
    bruto = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), '-vf', f'fps=24,scale={L}:{A},format=gray', '-f', 'rawvideo', '-'],
                           capture_output=True, check=True).stdout
    f = np.frombuffer(bruto, np.uint8).reshape(-1, A, L).astype(np.int16)
    n = len(f)
    d = np.array([0.0] + [float(np.abs(f[i] - f[i - 1]).mean()) for i in range(1, n)])
    salto = d > limiar
    arq_planos = video.parent / 'planos.json'
    lista = json.loads(arq_planos.read_text()) if arq_planos.is_file() else []
    plano = lambda t: next((p['id'] for p in lista if p['ini'] - 0.05 <= t < p['fim']), '?')
    alertas, i = [], 1
    while i < n:
        if not salto[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and salto[j + 1:j + 7].any():
            j = j + 1 + int(np.argmax(salto[j + 1:j + 7]))
        if 0 < j - i <= 6 and (d[max(1, i - 3):i] < limiar).all() and (d[j + 1:j + 4] < limiar).all() \
                and int((d[i:j + 1] > 1.5 * limiar).sum()) >= 2 and int(salto[i:j + 1].sum()) <= 3:
            alertas.append((i, j))
        i = j + 1
    if not alertas:
        print('Nenhum frame solto.')
        return None
    for i, j in alertas:
        print(f'{_tempo(i / 24).replace(chr(92), "")}  {plano(i / 24)}  quadros {i}–{j - 1}')
    with tempfile.TemporaryDirectory() as q, tempfile.TemporaryDirectory() as tmp:
        total = _quadros(video, q, 180)
        for a, (i, j) in enumerate(alertas):
            ks = [min(total - 1, max(0, k)) for k in range(i - 2, i + 6)]
            _tira(q, ks, [_tempo(k / 24) for k in ks], f'{tmp}/{a:03d}')
        saida = video.parent / 'soltos_folha.jpg'
        _montar(tmp, '*.jpg', 8, len(alertas), saida)
    return saida


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Folha de contato de um vídeo.')
    ap.add_argument('video')
    ap.add_argument('--cada', type=float, default=2.0, help='segundos entre os quadros (padrão 2)')
    ap.add_argument('--colunas', type=int, default=8)
    ap.add_argument('--planos', action='store_true', help='por insert/motion: entrada, meio e fim em quadros grandes (planos.json da versão)')
    ap.add_argument('--soltos', action='store_true', help='o frame solto ou vazio, quadro a quadro')
    a = ap.parse_args()
    if a.planos:
        print('\n'.join(str(x) for x in planos(Path(a.video))))
    elif a.soltos:
        r = soltos(Path(a.video))
        if r:
            print(r)
    else:
        print(folha(Path(a.video), a.cada, a.colunas))
