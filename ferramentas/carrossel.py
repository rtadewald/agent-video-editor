# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.63.0", "pillow"]
# ///
"""Os carrosséis (4:5, 1080×1350): carrosseis/<slug>/, um por pasta. O Claude escreve os slides; o criador escolhe o
preset no app e comenta por slide. Fluxo e contrato dos slides: .claude/skills/editor/etapas/15-carrossel.md.

    uv run ferramentas/carrossel.py novo --nome "…" [--tipo cru|derivado] [--origem <projeto>] [--pedido "…"]
        cria a pasta (o app também cria, pelo "+ Carrossel") e imprime o slug
    uv run ferramentas/carrossel.py ver <slug>
        o pedido, a origem, os arquivos de entrada, o preset e as versões (o começo de um carrossel novo)
    uv run ferramentas/carrossel.py midia <slug> <arquivo> [--de 12.3 --ate 18.4] [--nome x]
        põe uma imagem (copiada) ou um trecho de vídeo (recortado, até 1080 de largura, com o som) em midia/ e imprime o
        caminho para o campo `midia` do slide
    uv run ferramentas/carrossel.py versao <slug> <arquivo.json>
        valida os slides e a legenda e grava a próxima versão (versoes/vN.json): o app mostra na hora
    uv run ferramentas/carrossel.py ler <slug> [vN]
        a revisão em texto: cada comentário com o slide (o texto dele) e o ponto marcado
    uv run ferramentas/carrossel.py responder <slug> <vN> <id> --status aplicado|respondido|nao_aplicado --resposta "…"
    uv run ferramentas/carrossel.py exportar <slug>
        final/: 01.png, 02.mp4… (na ordem de postar, com o preset escolhido) e legenda.txt. O app exporta sozinho ao
        aprovar (e de novo se o preset mudar depois).

O servidor importa este arquivo (só a biblioteca padrão no topo); o Playwright e o Pillow só entram na exportação.
"""
import argparse
import re
import shutil
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import PROJETOS, RAIZ, ffmpeg, gravar_json, inspecionar, ler_json  # noqa: E402

CARROSSEIS = RAIZ / 'carrosseis'
W, H = 1080, 1350
TIPOS = ('capa', 'texto', 'texto-imagem', 'texto-video', 'midia', 'cta')
STATUS = ('aplicado', 'respondido', 'nao_aplicado')
IMAGENS = ('.png', '.jpg', '.jpeg', '.webp', '.gif')
VIDEOS = ('.mp4', '.mov', '.webm', '.m4v')
MAX_VIDEO = 60  # o Instagram corta o vídeo de um slide em 60 s
# os presets (o visual de cada um em render/carrossel.css): id, nome e o que ele é, para o seletor do app
PRESETS = [
    {'id': 'notas', 'nome': 'Notas', 'descricao': 'A nota do iPhone: data no alto, marca-texto amarelo.'},
    {'id': 'papel', 'nome': 'Papel', 'descricao': 'Creme, título em serifa, destaque em itálico terracota.'},
    {'id': 'post', 'nome': 'Post', 'descricao': 'O print de um post: foto, nome e @, destaque em azul.'},
    {'id': 'grafite', 'nome': 'Grafite', 'descricao': 'Escuro e calmo, destaque em coral.'},
    {'id': 'caderno', 'nome': 'Caderno', 'descricao': 'Quadriculado, letra arredondada, marca-texto verde.'},
    {'id': 'editorial', 'nome': 'Editorial', 'descricao': 'Revista: serifa enorme, réguas finas, destaque em itálico.'},
    {'id': 'codigo', 'nome': 'Código', 'descricao': 'Janela de editor claro, destaque como código.'},
    {'id': 'pastel', 'nome': 'Pastel', 'descricao': 'Degradê pêssego e lilás, cartão branco, destaque em degradê.'},
    {'id': 'etiqueta', 'nome': 'Etiqueta', 'descricao': 'Cinza claro, título pesado, destaque em etiqueta preta.'},
    {'id': 'aura', 'nome': 'Aura', 'descricao': 'A paisagem da Aura atrás de um vidro fosco, destaque que brilha.'},
]
PRESET_PADRAO = 'notas'


def agora() -> str:
    return datetime.now().isoformat(timespec='seconds')


def pasta(slug: str) -> Path:
    p = CARROSSEIS / slug
    if not re.fullmatch(r'[\w-]+', slug or '') or not (p / 'carrossel.json').is_file():
        raise SystemExit(f'Carrossel não encontrado: {slug} (em {CARROSSEIS})')
    return p


def slug_de(nome: str) -> str:
    s = unicodedata.normalize('NFD', nome).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:48] or 'carrossel'
    base, n = s, 2
    while (CARROSSEIS / s).exists():
        s, n = f'{base}-{n}', n + 1
    return s


def novo(nome: str, tipo: str = 'cru', origem: str | None = None, pedido: str = '', preset: str | None = None) -> str:
    if tipo not in ('cru', 'derivado'):
        raise ValueError('O tipo é cru ou derivado.')
    if tipo == 'derivado' and not (origem and (PROJETOS / origem / 'edicao.json').is_file()):
        raise ValueError(f'O derivado precisa de um projeto de origem que exista (veio: {origem or "nenhum"}).')
    slug = slug_de(nome or origem or 'carrossel')
    meta = {'nome': (nome or '').strip() or slug, 'tipo': tipo, **({'origem': origem} if tipo == 'derivado' else {}),
            'pedido': (pedido or '').strip(), 'preset': preset if preset in ids_presets() else PRESET_PADRAO, 'criado_em': agora()}
    gravar_json(CARROSSEIS / slug / 'carrossel.json', meta)
    return slug


def ids_presets() -> list[str]:
    return [p['id'] for p in PRESETS]


def versoes(p: Path) -> list[int]:
    return sorted(int(v.stem[1:]) for v in p.glob('versoes/v*.json') if v.stem[1:].isdigit())


def revisao(p: Path, v: int) -> dict:
    return ler_json(p / 'revisoes' / f'v{v}.json', {}) or {}


def validar(p: Path, dados: dict) -> dict:
    """Os slides e a legenda de uma versão, limpos; um erro de contrato vira ValueError (a mensagem diz o slide)."""
    slides = dados.get('slides')
    if not isinstance(slides, list) or not 1 <= len(slides) <= 20:
        raise ValueError('Uma versão tem de 1 a 20 slides (o limite do Instagram).')
    limpos = []
    for i, s in enumerate(slides, 1):
        tipo = s.get('tipo')
        if tipo not in TIPOS:
            raise ValueError(f'Slide {i}: tipo "{tipo}" não existe ({", ".join(TIPOS)}).')
        x = {k: s[k] for k in ('tipo', 'titulo', 'texto', 'midia', 'ajuste', 'som', 'acao', 'porque') if s.get(k) not in (None, '')}
        m = x.get('midia')
        if tipo in ('texto-imagem', 'texto-video', 'midia') and not m:
            raise ValueError(f'Slide {i} ({tipo}): falta a mídia.')
        if m:
            arq = RAIZ / m.lstrip('/') if m.startswith('/') else p / m
            if not arq.is_file():
                raise ValueError(f'Slide {i}: a mídia {m} não existe (use carrossel.py midia).')
            if tipo == 'texto-video' and arq.suffix.lower() not in VIDEOS:
                raise ValueError(f'Slide {i}: texto-video pede um vídeo ({m}).')
            if tipo == 'texto-imagem' and arq.suffix.lower() not in IMAGENS:
                raise ValueError(f'Slide {i}: texto-imagem pede uma imagem ({m}).')
            if arq.suffix.lower() in VIDEOS and inspecionar(arq)['duracao'] > MAX_VIDEO + 0.5:
                raise ValueError(f'Slide {i}: o vídeo passa de {MAX_VIDEO} s (recorte com --de/--ate).')
        if tipo in ('capa', 'texto', 'cta') and not (x.get('titulo') or x.get('texto')):
            raise ValueError(f'Slide {i} ({tipo}): sem título nem texto.')
        if x.get('ajuste') not in (None, 'cobrir', 'conter'):
            raise ValueError(f'Slide {i}: ajuste é cobrir ou conter.')
        limpos.append(x)
    return {'slides': limpos, 'legenda': str(dados.get('legenda') or '').strip()}


def nova_versao(slug: str, dados: dict) -> int:
    p = pasta(slug)
    v = (versoes(p) or [0])[-1] + 1
    gravar_json(p / 'versoes' / f'v{v}.json', {**validar(p, dados), 'criado_em': agora()})
    return v


def midia(slug: str, arquivo: Path, de: float | None = None, ate: float | None = None, nome: str | None = None) -> str:
    """Uma imagem (copiada) ou um trecho de vídeo (H.264 até 1080 de largura, 30 fps, com o som) em midia/."""
    p = pasta(slug)
    if not arquivo.is_file():
        raise SystemExit(f'Não achei {arquivo}')
    ext = arquivo.suffix.lower()
    base = re.sub(r'[^\w-]+', '-', nome or arquivo.stem).strip('-')[:40] or 'midia'
    (p / 'midia').mkdir(exist_ok=True)
    if ext in IMAGENS:
        destino = p / 'midia' / f'{base}{ext}'
        n = 2
        while destino.exists():
            destino, n = p / 'midia' / f'{base}-{n}{ext}', n + 1
        shutil.copy2(arquivo, destino)
        return str(destino.relative_to(p))
    if ext not in VIDEOS:
        raise SystemExit(f'Formato não suportado: {ext}')
    destino = p / 'midia' / f'{base}.mp4'
    n = 2
    while destino.exists():
        destino, n = p / 'midia' / f'{base}-{n}.mp4', n + 1
    corte = (['-ss', str(de)] if de is not None else []) + (['-to', str(ate)] if ate is not None else [])
    ffmpeg(*corte, '-i', str(arquivo), '-t', str(MAX_VIDEO), '-vf', "scale='min(1080,iw)':-2,fps=30", '-c:v', 'libx264', '-crf', '18',
           '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(destino))
    return str(destino.relative_to(p))


def ultima_mexida(p: Path, vs: list[int]) -> float:
    marcas = [(p / 'carrossel.json').stat().st_mtime]
    if vs:
        marcas.append((p / 'versoes' / f'v{vs[-1]}.json').stat().st_mtime)
    for r in (p / 'revisoes').glob('v*.json'):
        mx = (ler_json(r, {}) or {}).get('mexido_em')
        if mx:
            marcas.append(datetime.fromisoformat(mx).timestamp())
    return max(marcas)


def resumo(p: Path) -> dict:
    meta = ler_json(p / 'carrossel.json', {}) or {}
    vs = versoes(p)
    rev = revisao(p, vs[-1]) if vs else {}
    origem = meta.get('origem')
    return {'slug': p.name, 'nome': meta.get('nome') or p.name, 'tipo': meta.get('tipo', 'cru'), 'origem': origem,
            'origem_nome': (ler_json(PROJETOS / origem / 'edicao.json', {}) or {}).get('nome') or origem if origem else None,
            'preset': meta.get('preset') or PRESET_PADRAO, 'versoes': vs, 'ultima': vs[-1] if vs else None,
            'slides': len((ler_json(p / 'versoes' / f'v{vs[-1]}.json', {}) or {}).get('slides') or []) if vs else 0,
            'estado': 'aprovado' if rev.get('aprovado') else 'em_revisao' if vs else 'novo',
            'comentarios': sum(1 for c in rev.get('comentarios') or [] if (c.get('texto') or '').strip()),
            'tem_final': any((p / 'final').glob('*.png')) or any((p / 'final').glob('*.mp4')),
            'exportado': meta.get('exportado'), 'atualizado': ultima_mexida(p, vs)}


def listar() -> list[dict]:
    if not CARROSSEIS.is_dir():
        return []
    return sorted((resumo(p) for p in CARROSSEIS.iterdir() if (p / 'carrossel.json').is_file()), key=lambda x: -x['atualizado'])


def de_projetos() -> dict[str, list[dict]]:
    """Os carrosséis de cada projeto de origem: {projeto: [{slug, nome}]} (o chip no card do projeto)."""
    out: dict[str, list[dict]] = {}
    for p in CARROSSEIS.glob('*/carrossel.json') if CARROSSEIS.is_dir() else []:
        m = ler_json(p, {}) or {}
        if m.get('origem'):
            out.setdefault(m['origem'], []).append({'slug': p.parent.name, 'nome': m.get('nome') or p.parent.name})
    return out


# ---------------------------------------------------------------- a revisão

def uma_linha(s: str) -> str:
    return ' / '.join(x.strip() for x in str(s or '').splitlines() if x.strip())


def texto_revisao(slug: str, v: int | None = None) -> str:
    p = pasta(slug)
    vs = versoes(p)
    if not vs:
        raise SystemExit('O carrossel ainda não tem versão.')
    v = v or vs[-1]
    slides = (ler_json(p / 'versoes' / f'v{v}.json', {}) or {}).get('slides') or []
    rev = revisao(p, v)
    meta = ler_json(p / 'carrossel.json', {}) or {}
    linhas = [f'Revisão carrossel · {slug} · v{v} · preset {meta.get("preset", PRESET_PADRAO)}']
    cs = [c for c in rev.get('comentarios') or [] if (c.get('texto') or '').strip()]
    for c in sorted(cs, key=lambda c: (c.get('slide') is None, c.get('slide') or 0)):
        n = c.get('slide')
        if n is None:
            onde = 'Geral'
        else:
            s = slides[n] if n < len(slides) else {}
            ponto = f' · ponto ({round(c["x"] * 100)}%, {round(c["y"] * 100)}%)' if c.get('x') is not None else ''
            onde = f'Slide {n + 1} ({s.get("tipo", "?")}: "{uma_linha(s.get("titulo") or s.get("texto") or s.get("midia") or "")[:70]}"){ponto}'
        estado = '' if (c.get('status') or 'pendente') == 'pendente' else f'  [{c["status"]}: {uma_linha(c.get("resposta") or "")}]'
        linhas.append(f'- [{c["id"]}] {onde}: {uma_linha(c["texto"])}{estado}')
    if not cs:
        linhas.append('(sem comentários)')
    if rev.get('aprovado'):
        linhas.append('Aprovado.')
    return '\n'.join(linhas)


def responder(slug: str, v: int, cid: str, status: str, resposta: str) -> None:
    p = pasta(slug)
    arq = p / 'revisoes' / f'v{v}.json'
    rev = ler_json(arq, {}) or {}
    c = next((c for c in rev.get('comentarios') or [] if c.get('id') == cid), None)
    if not c:
        raise SystemExit(f'Não há o comentário {cid} na v{v}.')
    c['status'], c['resposta'] = status, resposta.strip()
    gravar_json(arq, rev)


# ---------------------------------------------------------------- a exportação

def exportar(slug: str) -> Path:
    """final/: cada slide fotografado com o preset escolhido (PNG); os de vídeo, o clipe posto no lugar dele pelo
    ffmpeg (MP4 H.264 30 fps, com o som se o slide pede `som`); e a legenda.txt."""
    import tempfile

    from PIL import Image, ImageDraw
    from playwright.sync_api import sync_playwright

    import servidor

    p = pasta(slug)
    meta = ler_json(p / 'carrossel.json', {}) or {}
    vs = versoes(p)
    if not vs:
        raise SystemExit('Nada para exportar: o carrossel ainda não tem versão.')
    v, preset = vs[-1], meta.get('preset') or PRESET_PADRAO
    versao = ler_json(p / 'versoes' / f'v{v}.json', {})
    srv = servidor.servir(0)
    porta = srv.server_address[1]
    final = p / 'final'
    with tempfile.TemporaryDirectory(dir=p) as t:
        tmp = Path(t)
        feitos = []
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='chromium')
            pg = browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
            for i, s in enumerate(versao['slides']):
                pg.goto(f'http://127.0.0.1:{porta}/render/carrossel.html?c={slug}&v={v}&s={i}&preset={preset}&exportar=1')
                pg.wait_for_function('window.__carrossel && window.__carrossel.pronto', timeout=30000)
                info = pg.evaluate('window.__carrossel')
                nome = f'{i + 1:02d}'
                fundo = tmp / f'{nome}.png'
                pg.screenshot(path=str(fundo))
                if not info.get('video'):
                    feitos.append((fundo, f'{nome}.png'))
                    continue
                frente = None
                if info.get('frente'):  # o texto por cima do vídeo (mídia cheia): uma foto só dele, com transparência
                    pg.evaluate("document.documentElement.classList.add('so-frente')")
                    frente = tmp / f'{nome}-frente.png'
                    pg.screenshot(path=str(frente), omit_background=True)
                vd = info['video']
                mascara = tmp / f'{nome}-mascara.png'
                m = Image.new('L', (vd['w'], vd['h']), 0)
                ImageDraw.Draw(m).rounded_rectangle((0, 0, vd['w'] - 1, vd['h'] - 1), radius=int(vd['raio']), fill=255)
                m.save(mascara)
                clipe = p / s['midia'] if not s['midia'].startswith('/') else RAIZ / s['midia'].lstrip('/')
                dados = inspecionar(clipe)
                dur = min(dados['duracao'], MAX_VIDEO)
                ajuste = (f"scale={vd['w']}:{vd['h']}:force_original_aspect_ratio=decrease,format=rgba,"
                          f"pad={vd['w']}:{vd['h']}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" if vd.get('conter')
                          else f"scale={vd['w']}:{vd['h']}:force_original_aspect_ratio=increase,crop={vd['w']}:{vd['h']},format=rgba")
                # os cantos redondos (a máscara) sem perder a transparência das faixas do "conter"
                grafo = (f"[1:v]fps=30,{ajuste},setsar=1,split[v][va];[va]alphaextract[a];[2:v]format=gray[m];"
                         f"[a][m]blend=all_mode=multiply[am];[v][am]alphamerge[vm];"
                         f"[0:v][vm]overlay={vd['x']}:{vd['y']}:shortest=1[b]")
                entradas = ['-loop', '1', '-i', str(fundo), '-i', str(clipe), '-loop', '1', '-i', str(mascara)]
                if frente:
                    entradas += ['-loop', '1', '-i', str(frente)]
                    grafo += ';[b][3:v]overlay=0:0[b2]'
                saida = '[b2]' if frente else '[b]'
                grafo += f';{saida}format=yuv420p[out]'
                audio = ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k'] if s.get('som') and dados.get('tem_audio') else ['-an']
                mp4 = tmp / f'{nome}.mp4'
                ffmpeg(*entradas, '-filter_complex', grafo, '-map', '[out]', *audio, '-t', f'{dur:.3f}', '-r', '30',
                       '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(mp4))
                feitos.append((mp4, f'{nome}.mp4'))
            browser.close()
        srv.shutdown()
        if final.is_dir():  # só a entrega de agora (as de antes, de outro preset ou versão, saem)
            for velho in final.iterdir():
                if re.fullmatch(r'\d{2}\.(png|mp4)|legenda\.txt', velho.name):
                    velho.unlink()
        final.mkdir(exist_ok=True)
        for arq, nome in feitos:
            shutil.move(str(arq), final / nome)
    (final / 'legenda.txt').write_text((versao.get('legenda') or '') + '\n', encoding='utf-8')
    meta['exportado'] = {'versao': v, 'preset': preset, 'em': agora()}
    gravar_json(p / 'carrossel.json', meta)
    return final


# ---------------------------------------------------------------- a linha de comando

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('novo')
    a.add_argument('--nome', required=True)
    a.add_argument('--tipo', default='cru', choices=('cru', 'derivado'))
    a.add_argument('--origem')
    a.add_argument('--pedido', default='')
    sub.add_parser('ver').add_argument('slug')
    a = sub.add_parser('midia')
    a.add_argument('slug')
    a.add_argument('arquivo', type=Path)
    a.add_argument('--de', type=float)
    a.add_argument('--ate', type=float)
    a.add_argument('--nome')
    a = sub.add_parser('versao')
    a.add_argument('slug')
    a.add_argument('arquivo', type=Path)
    a = sub.add_parser('ler')
    a.add_argument('slug')
    a.add_argument('versao', nargs='?')
    a = sub.add_parser('responder')
    a.add_argument('slug')
    a.add_argument('versao')
    a.add_argument('id')
    a.add_argument('--status', required=True, choices=STATUS)
    a.add_argument('--resposta', required=True)
    sub.add_parser('exportar').add_argument('slug')
    x = ap.parse_args()
    try:
        if x.cmd == 'novo':
            print(novo(x.nome, x.tipo, x.origem, x.pedido))
        elif x.cmd == 'ver':
            p = pasta(x.slug)
            meta = ler_json(p / 'carrossel.json', {})
            entrada = sorted(str(a.relative_to(p)) for a in (p / 'entrada').glob('*')) if (p / 'entrada').is_dir() else []
            print(f'{meta["nome"]} · {meta["tipo"]}{" · de " + meta["origem"] if meta.get("origem") else ""} · preset {meta.get("preset")}')
            print(f'Pedido: {meta.get("pedido") or "(nenhum)"}')
            print(f'Entrada: {", ".join(entrada) or "(nenhum arquivo)"}')
            print(f'Versões: {", ".join(f"v{v}" for v in versoes(p)) or "nenhuma"}')
        elif x.cmd == 'midia':
            print(midia(x.slug, x.arquivo, x.de, x.ate, x.nome))
        elif x.cmd == 'versao':
            import json
            v = nova_versao(x.slug, json.loads(x.arquivo.read_text(encoding='utf-8')))
            print(f'v{v} gravada: http://localhost:8719/app/#/c/{x.slug}/v{v}')
        elif x.cmd == 'ler':
            print(texto_revisao(x.slug, int(x.versao.lstrip('v')) if x.versao else None))
        elif x.cmd == 'responder':
            responder(x.slug, int(x.versao.lstrip('v')), x.id, x.status, x.resposta)
            print('ok')
        elif x.cmd == 'exportar':
            print(exportar(x.slug))
    except ValueError as e:
        raise SystemExit(str(e)) from e


if __name__ == '__main__':
    main()
