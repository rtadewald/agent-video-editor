"""O comum dos scripts: caminhos, o edicao.json de cada projeto, ffmpeg/ffprobe e as chaves do .env.

Importado pelos outros scripts de ferramentas/ (rodados com `uv run ferramentas/<script>.py`). Só biblioteca padrão.
"""
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
# fora do git: a biblioteca (o que serve a qualquer vídeo; copia-se entre máquinas, por cima) e os projetos de cada um
BIBLIOTECA = RAIZ / 'biblioteca'
PROJETOS = RAIZ / 'projetos'
# as animações (fora do git): animacoes/<slug>/animacao.json, as cenas na ordem (presets de biblioteca/motions/presets/)
ANIMACOES = RAIZ / 'animacoes'
# na biblioteca, o que o Claude lê para editar: os exemplos da direção (criador.md e uma pasta por categoria de vídeo,
# gerados pela Calibragem) e os aprendizados (um .md por área, as correções do criador)
EXEMPLOS = BIBLIOTECA / 'exemplos'
# a categoria (o quadro) de um vídeo ou referência sem categoria; as categorias moram em biblioteca/categorias-video.json
CATEGORIA_PADRAO = 'hacks'
APRENDIZADOS = BIBLIOTECA / 'aprendizados'
# no git: o que uma biblioteca nova recebe (os aprendizados técnicos e motions de exemplo)
INICIAL = Path(__file__).resolve().parent / 'inicial'
# a lixeira única (o que se apaga no app: projetos, mídias do banco, referências), de onde dá para restaurar ou apagar de vez
LIXEIRA = BIBLIOTECA / 'lixeira'


def preparar_biblioteca() -> None:
    """Cria `projetos/` e completa a biblioteca com o que falta dela em `ferramentas/inicial/` (cada pasta ou arquivo de
    primeiro nível que não existe; o que já existe, mesmo vazio, nunca é tocado). O servidor chama ao subir; o preparar,
    ao criar um projeto."""
    import shutil

    PROJETOS.mkdir(parents=True, exist_ok=True)
    BIBLIOTECA.mkdir(parents=True, exist_ok=True)
    for x in sorted(INICIAL.iterdir()) if INICIAL.is_dir() else ():
        alvo = BIBLIOTECA / x.name
        if x.name.startswith('.') or alvo.exists():
            continue
        if x.is_dir():
            shutil.copytree(x, alvo)
        else:
            shutil.copy2(x, alvo)


# ---------------------------------------------------------------- a lixeira

def para_lixeira(pastas: list[Path], tipo: str, id_: str, nome: str, miniatura: str | None = None, video: str | None = None,
                 de: list[str] | None = None, apagado_em: str | None = None) -> dict:
    """Manda pastas para a lixeira única: `biblioteca/lixeira/<AAAAMMDD-HHMMSS>-<tipo>-<id>/`, cada uma inteira (nada
    muda dentro), com um `lixeira.json` dizendo de onde veio cada uma (`de`, relativo à raiz: para restaurar), o nome, o
    tamanho e a miniatura (`miniatura`/`video`: o caminho dentro da 1ª pasta). `de`: as origens, quando as pastas já não
    estão nelas (as das lixeiras antigas). Devolve o `lixeira.json`."""
    import shutil
    from datetime import datetime

    agora = datetime.now()
    carimbo = (datetime.fromisoformat(apagado_em) if apagado_em else agora).strftime('%Y%m%d-%H%M%S')
    base = re.sub(r'[^\w.-]+', '-', f'{carimbo}-{tipo}-{id_}')[:120]
    entrada, n = LIXEIRA / base, 2
    while entrada.exists():
        entrada, n = LIXEIRA / f'{base}-{n}', n + 1
    entrada.mkdir(parents=True)
    itens = []
    for k, p in enumerate(pastas):
        if not p.exists():
            continue
        em = p.name if all(i['em'] != p.name for i in itens) else f'{p.name}-{k}'
        origem = de[k] if de else str(p.resolve().relative_to(RAIZ))
        shutil.move(str(p), str(entrada / em))
        itens.append({'de': origem, 'em': em})
    if not itens:
        entrada.rmdir()
        raise SystemExit(f'Nada para mandar para a lixeira ({tipo} {id_}).')
    primeira = itens[0]['em']
    meta = {'tipo': tipo, 'id': id_, 'nome': nome, 'apagado_em': apagado_em or agora.isoformat(timespec='seconds'),
            'itens': itens, 'bytes': sum(tamanho(entrada / i['em']) for i in itens),
            **({'miniatura': f'{primeira}/{miniatura}'} if miniatura and (entrada / primeira / miniatura).is_file() else {}),
            **({'video': f'{primeira}/{video}'} if video and (entrada / primeira / video).is_file() else {})}
    gravar_json(entrada / 'lixeira.json', meta)
    return {'entrada': entrada.name, **meta}


def entrada_da_lixeira(nome: str) -> Path:
    e = LIXEIRA / nome
    if not re.fullmatch(r'[\w.-]+', nome) or not (e / 'lixeira.json').is_file():
        raise SystemExit(f'Não está na lixeira: {nome}')
    return e


def listar_lixeira() -> list[dict]:
    """O que está na lixeira, do apagado mais recente ao mais antigo."""
    out = []
    for e in LIXEIRA.glob('*/lixeira.json') if LIXEIRA.is_dir() else ():
        try:
            out.append({'entrada': e.parent.name, **json.loads(e.read_text(encoding='utf-8'))})
        except ValueError:
            continue
    return sorted(out, key=lambda x: x.get('apagado_em') or '', reverse=True)


def restaurar_da_lixeira(nome: str) -> dict:
    """Devolve cada pasta para onde estava. Recusa se já existe outra no lugar (nada é sobrescrito)."""
    import shutil

    e = entrada_da_lixeira(nome)
    meta = json.loads((e / 'lixeira.json').read_text(encoding='utf-8'))
    for i in meta['itens']:
        if (RAIZ / i['de']).exists():
            raise SystemExit(f'Já existe {i["de"]}: renomeie ou apague essa antes de restaurar.')
    for i in meta['itens']:
        (RAIZ / i['de']).parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(e / i['em']), str(RAIZ / i['de']))
    shutil.rmtree(e)
    return meta


def apagar_de_vez(nome: str | None = None, tipo: str | None = None) -> int:
    """Apaga de vez uma entrada da lixeira (`nome`) ou todas (de um `tipo`, ou tudo). Devolve quantas saíram."""
    import shutil

    alvos = [entrada_da_lixeira(nome)] if nome else [LIXEIRA / x['entrada'] for x in listar_lixeira() if not tipo or x['tipo'] == tipo]
    for e in alvos:
        shutil.rmtree(e, ignore_errors=True)
    return len(alvos)


def migrar_lixeiras_antigas() -> int:
    """Leva as lixeiras de antes (`projetos/_lixeira/`, `biblioteca/banco/_lixeira/`, `biblioteca/referencias/_lixeira/`,
    cada pasta `<id>-<AAAAMMDD-HHMMSS>`) para a lixeira única. Roda ao subir o servidor; sem nada antigo, não faz nada."""
    from datetime import datetime

    n = 0
    fontes = [(PROJETOS / '_lixeira', 'projeto', 'projetos', 'edicao.json', None, None),
              (BIBLIOTECA / 'banco' / '_lixeira', 'banco', 'biblioteca/banco', 'item.json', 'miniatura.jpg', 'proxy.mp4'),
              (BIBLIOTECA / 'referencias' / '_lixeira', 'referencia', 'biblioteca/referencias', 'referencia.json', 'miniatura.jpg', 'proxy.mp4')]
    for velha, tipo, onde, arq_nome, mini, video in fontes:
        if not velha.is_dir():
            continue
        for p in sorted(velha.iterdir()):
            if not p.is_dir():
                continue
            m = re.fullmatch(r'(.+?)-(\d{8}-\d{6})', p.name)
            id_ = m.group(1) if m else p.name
            quando = datetime.strptime(m.group(2), '%Y%m%d-%H%M%S').isoformat() if m else None
            dados = ler_json(p / arq_nome, {}) or {}
            if tipo == 'projeto':
                vs = sorted((int(v.name[1:]) for v in (p / 'versoes').glob('v*') if v.name[1:].isdigit()), reverse=True)
                video = f'versoes/v{vs[0]}/proxy.mp4' if vs else None
            para_lixeira([p], tipo, id_, dados.get('nome') or id_, mini, video, de=[f'{onde}/{id_}'], apagado_em=quando)
            n += 1
        (velha / '.DS_Store').unlink(missing_ok=True)
        if not any(velha.iterdir()):
            velha.rmdir()
    return n


def renders_rodando() -> set[str]:
    """Os projetos com um render.py rodando agora (de qualquer sessão)."""
    r = subprocess.run(['ps', '-axo', 'command'], capture_output=True, text=True).stdout
    return set(re.findall(r'render\.py\s+([\w-]+)', r))


def tamanho(p: Path) -> int:
    """Bytes de um arquivo ou de uma pasta inteira."""
    if p.is_file():
        return p.stat().st_size
    return sum(f.stat().st_size for f in p.rglob('*') if f.is_file() and not f.is_symlink()) if p.is_dir() else 0


def pasta(slug: str) -> Path:
    """A pasta de um projeto (`projetos/<slug>/`)."""
    p = PROJETOS / slug
    if not p.is_dir():
        raise SystemExit(f'Projeto não encontrado: {slug} (em {PROJETOS})')
    return p


def ler_json(caminho: Path, padrao=None):
    caminho = Path(caminho)
    if not caminho.exists():
        return padrao
    return json.loads(caminho.read_text(encoding='utf-8'))


def tag_limpa(t) -> str:
    """Uma tag como no Obsidian: sem o #, sem espaços (viram -), níveis com / ("fia/ad-vsl")."""
    return re.sub(r'/+', '/', re.sub(r'\s+', '-', str(t or '').strip().lstrip('#').strip())).strip('/')


def tags_limpas(lista) -> list[str]:
    return list(dict.fromkeys(t for t in (tag_limpa(x) for x in lista or []) if t))[:30]


def renomear_tags(tags: list[str], de: str, para: str) -> list[str]:
    """Troca a tag `de` e as de dentro dela ("fia" leva "fia/reels") por `para`; `para` vazio tira."""
    out = []
    for t in tags or []:
        if t == de or t.startswith(f'{de}/'):
            t = f'{para}{t[len(de):]}' if para else ''
        if t and t not in out:
            out.append(t)
    return out


def gravar_json(caminho: Path, dados) -> None:
    """Grava de uma vez (arquivo temporário + rename): quem lê nunca vê um JSON pela metade."""
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=caminho.parent, suffix='.tmp', delete=False) as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    os.replace(f.name, caminho)


def ler(slug: str) -> dict:
    """O edicao.json do projeto (o estado da edição; contrato em .claude/skills/editor/edicao.md)."""
    edicao = ler_json(pasta(slug) / 'edicao.json')
    if edicao is None:
        raise SystemExit(f'O projeto {slug} ainda não tem edicao.json (rode preparar.py).')
    return edicao


def gravar(slug: str, edicao: dict) -> None:
    gravar_json(pasta(slug) / 'edicao.json', edicao)


def ffmpeg(*args: str) -> None:
    """Roda o ffmpeg sem perguntar; se falhar, o erro traz o fim da mensagem dele."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'ffmpeg (código {r.returncode}): {r.stderr.strip()[-600:] or "sem mensagem"}')


def inspecionar(arquivo: Path) -> dict:
    """Duração e medidas como o espectador vê (aplica a rotação do metadado: celular em pé diz 3840×2160 cru)."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(arquivo)],
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'Não consegui ler {arquivo} (formato não suportado ou arquivo corrompido).')
    dados = json.loads(r.stdout)
    video = next((s for s in dados['streams'] if s['codec_type'] == 'video'), None)
    info = {'duracao': round(float(dados['format'].get('duration', 0)), 3),
            'tem_audio': any(s['codec_type'] == 'audio' for s in dados['streams'])}
    if video:
        w, h = video['width'], video['height']
        rotacao = next((int(d.get('rotation', 0)) for d in video.get('side_data_list', []) if 'rotation' in d), 0)
        if abs(rotacao) % 180 == 90:
            w, h = h, w
        info |= {'largura': w, 'altura': h, 'fps': video.get('avg_frame_rate')}
    return info


def env(nome: str) -> str:
    """Uma chave do .env da raiz (nunca imprima o valor)."""
    if nome not in os.environ and (RAIZ / '.env').exists():
        for linha in (RAIZ / '.env').read_text().splitlines():
            if '=' in linha and not linha.lstrip().startswith('#'):
                k, v = linha.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"\''))
    if not os.environ.get(nome):
        raise SystemExit(f'Falta {nome} no .env da raiz do projeto.')
    return os.environ[nome]
