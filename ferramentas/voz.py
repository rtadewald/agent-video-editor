"""A voz do ator: a limpeza, a sonoridade e o nível da fala (do 18: backend/app/audio.py e backend/app/sons.py;
docs/audio.md do 18). Importado pelos scripts de ferramentas/ (o `nivel_da_voz` pede o numpy).

- `limpar`: o DeepFilterNet 3, local, num ambiente Python à parte (o 0.5.6 pede o torchaudio antigo), chamado por
  subprocesso com `_voz_deepfilter.py`. Leve · Média · Forte = quanto ele pode abaixar o ruído: 6, 12 ou 24 dB. Sai
  `midia/voz/<fonte>_<limpeza>.wav`, 48 kHz mono, com o tempo do bruto (os cortes valem igual).
- `lufs`: a sonoridade integrada (EBU R128); `como_voz`: como a voz entra na mistura (o mono igual nos dois canais: um
  mono medido sozinho daria 3 LU a menos do que soa). Fica no edicao.json em `audio.voz_lufs.<fonte>_<limpeza>`.
- `nivel_da_voz`: o nível da fala (dBFS) nos primeiros 180 s, que regula os sons de apoio (`nivel_voz`).
"""
import os
import re
import subprocess
from pathlib import Path

from base import ffmpeg

LIMPEZAS = {'leve': 6, 'media': 12, 'forte': 24}
DEEPFILTER = ['uv', 'run', '--no-project', '--python', '3.11', '--with', 'deepfilternet==0.5.6', '--with', 'torch==2.3.1',
              '--with', 'torchaudio==2.3.1', '--with', 'numpy<2', '--with', 'soundfile', 'python']
AUXILIAR = Path(__file__).with_name('_voz_deepfilter.py')
# a voz entra na mistura como o navegador toca: o mono vai igual aos dois canais (ganho 1; o `aformat` daria −3 dB)
VOZ_ESTEREO = 'pan=stereo|c0=c0|c1=c0'
VOZ_REF = -14.0  # dBFS: o nível da fala nas referências (o padrão quando não há fala para medir)


def canais(arq: Path) -> int:
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', str(arq)],
                       capture_output=True, text=True)
    try:
        return max(int(r.stdout.strip().split(',')[0]), 1)
    except ValueError:
        return 1


def para_mono(arq: Path) -> str:
    """O filtro que deixa a voz mono pela média dos canais (no bruto dual-mono, o mesmo nível de cada canal). Explícito:
    o `aformat`/`-ac 1` do ffmpeg só faz a média em formatos inteiros; em float, soma a +3 dB."""
    n = canais(arq)
    return 'anull' if n == 1 else 'pan=mono|c0=' + '+'.join(f'{1 / n:.6f}*c{k}' for k in range(n))


def lufs(arq: Path, como_voz: bool = False) -> float:
    """A sonoridade integrada (LUFS, EBU R128) de um arquivo de áudio; `como_voz`: como a voz entra na mistura."""
    af = f'{para_mono(arq)},{VOZ_ESTEREO},ebur128' if como_voz else 'ebur128'
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(arq), '-vn', '-af', af, '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    if not m:
        raise RuntimeError('Não deu para medir a sonoridade')
    return float(m[-1])


def limpar(bruto: Path, destino: Path, limpeza: str = 'leve') -> Path:
    """A voz limpa (do 18: audio._gerar_wav e audio._deepfilter): o áudio do bruto em 48 kHz mono → DeepFilterNet →
    `destino` (gravado à parte e trocado no fim)."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    entrada = destino.with_name(f'{destino.stem}_original.wav')
    parcial = destino.with_suffix('.parte.wav')
    try:
        ffmpeg('-i', str(bruto), '-vn', '-af', para_mono(bruto), '-ar', '48000', str(entrada))
        # sem o VIRTUAL_ENV de quem chamou: o uv monta o ambiente do DeepFilterNet sozinho
        env = {k: v for k, v in os.environ.items() if k != 'VIRTUAL_ENV'}
        r = subprocess.run([*DEEPFILTER, str(AUXILIAR), str(entrada), str(parcial), str(LIMPEZAS[limpeza])],
                           capture_output=True, text=True, env=env)
        if r.returncode != 0 or not parcial.exists():
            raise RuntimeError(f'DeepFilterNet falhou: {r.stderr.strip()[-300:]}')
        os.replace(parcial, destino)
    finally:
        entrada.unlink(missing_ok=True)
        parcial.unlink(missing_ok=True)
    return destino


def _amostras(arq: Path, taxa: int):
    import numpy as np
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(arq), '-vn', '-af', para_mono(arq), '-ar', str(taxa), '-f', 'f32le', '-'],
                       capture_output=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64)


def _atraso(a, b, taxa: int, perto: float, janela: float = 0.5) -> tuple[float, float]:
    """Quantos segundos `b` está à frente de `a` (a(t) ≈ b(t + atraso)), procurando a até `janela` s de `perto`, pela
    GCC-PHAT (a correlação com o espectro branqueado: com dois microfones diferentes, a correlação simples acerta picos
    vizinhos e erra até 40 ms). Devolve o atraso e a nitidez do pico (o pico sobre a mediana; < 8 = não confiável)."""
    import numpy as np
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    r = np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n))
    c = np.fft.irfft(r / (np.abs(r) + 1e-12), n)
    lags = np.concatenate([np.arange(0, len(b)), np.arange(-len(a) + 1, 0)])
    c = np.concatenate([c[:len(b)], c[n - len(a) + 1:]])
    ok = np.abs(lags / taxa - perto) <= janela
    c, lags = c[ok], lags[ok]
    k = int(np.argmax(c))
    return float(lags[k] / taxa), float(c[k] / (np.median(np.abs(c)) + 1e-12))


def alinhar(camera: Path, externo: Path, destino: Path) -> dict:
    """O áudio gravado à parte (um gravador, o celular, o iPad) na linha do tempo da câmera. O atraso é medido pela
    GCC-PHAT contra o áudio da câmera em janelas de 10 s ao longo do vídeo; uma reta nos atrasos dá a deriva dos relógios
    dos dois aparelhos, corrigida na velocidade só se passar de 20 ms no vídeo todo. Sai `destino`, 48 kHz mono, do
    tamanho do áudio da câmera (silêncio onde o externo não cobre): a voz limpa, a transcrição e os cortes passam a vir
    dele, com os mesmos tempos do bruto. `sobra_ms`: o pior atraso que restou no alinhado (deve ficar abaixo de ~5 ms)."""
    import numpy as np
    taxa = 16000
    a, b = _amostras(camera, taxa), _amostras(externo, taxa)
    if not len(a) or not len(b):
        raise RuntimeError('Não deu para ler um dos áudios')
    dur = len(a) / taxa
    w = int(min(10, dur / 3) * taxa)
    # o atraso aproximado: a janela do meio contra o externo inteiro
    meio = len(a) // 2 - w // 2
    perto = _atraso(a[meio:meio + w], b, taxa, 0, len(b) / taxa + dur)[0] - meio / taxa
    pontos = []
    for i in range(0, len(a) - w + 1, w):
        d, q = _atraso(a[i:i + w], b, taxa, perto + i / taxa)
        if q >= 8:
            pontos.append((i / taxa + w / taxa / 2, d - i / taxa))
    if len(pontos) < 2:
        raise RuntimeError('Não achei a mesma fala nos dois áudios: confira se o externo é da mesma gravação')
    t, d = np.array(pontos).T
    k, d0 = np.polyfit(t, d, 1)  # atraso(t) = d0 + k·t
    if abs(k) * dur < 0.02:
        k, d0 = 0.0, float(np.median(d))
    ritmo = 1 + k  # alinhado(t) = externo(d0 + t·ritmo)
    filtros = [para_mono(externo), f'atrim=start={d0:.5f}' if d0 >= 0 else f'adelay={-d0 * 1000:.1f}:all=1', 'asetpts=PTS-STARTPTS']
    if k:
        filtros.append(f'atempo={ritmo:.6f}')
    filtros += [f'apad=whole_dur={dur:.4f}', f'atrim=end={dur:.4f}']
    destino.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg('-i', str(externo), '-vn', '-af', ','.join(filtros), '-ar', '48000', str(destino))
    c = _amostras(destino, taxa)
    sobra = [abs(_atraso(a[i:i + w], c, taxa, i / taxa, 0.2)[0] - i / taxa) * 1000 for i in range(0, len(a) - w + 1, w)]
    return {'atraso': round(float(d0), 4), 'deriva_ms': round(float(k * dur * 1000), 1), 'janelas': len(pontos),
            'sobra_ms': round(max(sobra), 1)}


def nivel_da_voz(arq: Path, ate: float = 180) -> float:
    """O nível da fala de um vídeo (dBFS): o percentil 90 da energia em janelas de 50 ms, nos primeiros `ate` s
    (do 18: sons.nivel_da_voz)."""
    import numpy as np
    r = subprocess.run(['ffmpeg', '-v', 'error', '-t', str(ate), '-i', str(arq), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                       capture_output=True)
    x = np.frombuffer(r.stdout, np.float32).astype(np.float64)
    n = len(x) // 800
    if not n:
        return VOZ_REF
    e = np.sqrt((x[: n * 800].reshape(n, 800) ** 2).mean(axis=1))
    return round(float(20 * np.log10(np.percentile(e, 90) + 1e-9)), 2)
