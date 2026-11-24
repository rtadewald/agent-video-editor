# 04 · Inserts: buscar, gravar, capturar

> **O gosto está em `guias/padrao.md`** (leia antes de começar). Aqui fica só o como.

Cada plano com material real precisa da melhor prova que existe para aquela frase, no formato do vídeo (em pé, ocupando
a tela). Você faz cada um até o "é isso", não o primeiro que serve.

```bash
uv run ferramentas/inserts.py listar <slug>              # os pedidos: id, tempo, fala, marcação, mídias
uv run ferramentas/inserts.py ligar <slug> <plano> <ids…> # liga as mídias escolhidas
```
(No palco contínuo, as mídias vão nas cenas do motion, não nos pedidos: `06-motions-e-elementos.md`.)

## De onde vem o material

1. **Do criador**: `projetos/<slug>/apoio/` e o banco (`banco.py buscar "<termos>"`, as tags `projeto/…`, os ★ usados
   em vídeo aprovado; os ✗ recusados, não).
2. **Gravar de verdade** (`ferramentas/gravar.py`): o app do criador operado (Neo Stitch, Neo-Obsidian, o editor, o
   Claude desktop), a página navegada, a ferramenta rodando. É a prova mais forte.
   - `gravar.py quadro <spec.json>`: quadro a quadro, a 24 fps, as ações postas entre os quadros (andar com o cursor,
     clicar, arrastar, rolar, digitar, tocar o vídeo da página no relógio da gravação, JS). Liso e nítido em qualquer
     escala. App que cabe em pé: janela 900×1600 com escala 1,2 (sai 1080×1920). App que quebra em pé: janela larga em 2x
     e `clip` na área que importa, em 9:16. O spec está no `--help`.
   - `gravar.py ao-vivo <spec.json>`: o que acontece sozinho e não dá para pôr entre quadros (o Claude criando, uma
     resposta chegando): fotos em laço com o tempo real, enquanto um `comando` roda; depois, corte os momentos que
     importam (o ffmpeg com `trim`) e acelere o que for espera.
   - O Claude desktop (tela branca), quando a conversa precisa aparecer e não dá para filmar o app: `render/claude-desktop.html`,
     com a conversa **real** (as mensagens e os comandos de uma sessão de verdade), tocada por `gravar.py quadro` com a
     ação `tempo`. Diga ao criador que é a sessão real redesenhada.
   - Esconda banners de cookies e borre link privado (a ação `js` antes de gravar).
   - O app do Claude desktop de verdade: uma sessão de demo no projeto de teste, aberta na janela principal (larga,
     ≥ 1200 px, sem o painel de tarefas), achada com o Quartz (`CGWindowListCopyWindowInfo`) e gravada com
     `screencapture -x -V <s> -R x,y,w,h` (nunca interrompa no meio: o arquivo se perde).
   - O hub e as aulas da Asimov: no navegador do criador (Claude in Chrome), logado; as aulas pelo player Bunny com
     `uvx yt-dlp --referer https://hub.asimov.academy/ <url>`, em 1080p, com o professor ao lado.
3. **Vídeos oficiais e da comunidade**: o produto, o X, Instagram, TikTok, YouTube
   (`uvx --from "yt-dlp[default]@latest" yt-dlp -f "bv*[height<=2160]" <url>`; recorte com `banco.py recortar`).
   Registre a URL na descrição.
4. **Captura de site** (`captura.py <url> --proporcao 9:16 --duracao <s> --projeto <slug>`), ou `gravar.py` quando a
   página precisa de ação. Sites que bloqueiam (Cloudflare): a doc ou o blog oficial. Site 3D/WebGL pesado sai no loader ou
   preto: espere carregar (ou corte o começo) e confira o 1º quadro. Print ou gravação de qualquer página (a captura, um
   teste local, o Playwright): espere as animações de entrada terminarem (`document.getAnimations().forEach(a =>
   a.finish())` e ~3 s) antes de fotografar; no meio da entrada a página sai apagada, meio transparente. Página deitada
   que vai ocupar a tela: grave numa janela alta (ex.: 1280×1600, em 1,5x), que enche mais o 9:16 sem cortar nada.
   _impeccable v9 c1 · 2026-11-23_
5. **Animar uma imagem** com um modelo de vídeo (OpenRouter, `/api/v1/videos`: Veo, Kling, Seedance…), só para um
   conceito ou quando o criador pede.

Todo arquivo novo entra no banco (`banco.py adicionar … --projeto <slug>`) com uma descrição do que mostra e de onde veio.

## Antes de ligar

Olhe os quadros do instante da fala, grandes (não a descrição do banco): passa no guia? Meça o que o olho não pega:
- **fluidez**: `ffmpeg -v debug -i <arq> -vf "mpdecimate=hi=64*4:lo=64*2:frac=0.1" -f null - 2>&1 | grep -c " drop pts"`
  (o certo é 0); fonte de 30 fps: `-vf "setpts=N/24/TB" -r 24` num item novo; nunca câmera lenta esticada;
- **1º quadro**: com conteúdo (nada de branco ou loader; corte com `banco.py trecho`);
- **proporção real**: vídeo em pé dentro de um quadro deitado → recorte o miolo (`banco.py recortar`).

Depois: apague do banco o que baixou e não usou (`banco.py apagar`); anote no `porque` do plano o que a mídia prova.
