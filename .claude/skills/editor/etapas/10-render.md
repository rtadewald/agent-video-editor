# 10 · Render e autorrevisão

> **Antes de começar, leia `biblioteca/aprendizados/render.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/render.md`) e, na autorrevisão, confira o vídeo contra os aprendizados de todas as áreas**: o que o criador já corrigiu em vídeos anteriores. Não repita esses erros.

## Render do proxy

```bash
uv run ferramentas/render.py <slug>
```

Gera `projetos/<slug>/versoes/vN/` (N = a próxima): `proxy.mp4` (720p, 24 fps, tudo queimado; 720×1280, ou 1280×720 num
vídeo deitado), uma cópia do
`edicao.json`, `palavras.json` e `planos.json` (no tempo do vídeo final, para o app) e `info.json` (tempos e avisos). Leia os avisos impressos (ex.: voz limpa ausente).

Como funciona: a página `render/?projeto=<slug>` desenha a camada dos inserts, motions e elementos; Chromes escondidos a
fotografam quadro a quadro (os inserts parados — cards só no lugar, no máximo com o zoom lento, sem elemento nem
comentário por cima — não são fotografados: o ffmpeg desenha o clipe deles direto, com o fundo e a sombra tirados da
página numa foto só); o ffmpeg junta o ator (cortes, 9:16, look, zoom do Full ator, posição na tela dividida), a
camada, as transições e a legenda (ASS). A montagem (proxy e final em 4K) sai em trechos de ~20 s guardados em
`.cache/trechos/` (nunca no meio de um insert, motion ou transição): numa revisão, só os trechos em que algo mudou são
montados de novo, 4 por vez, e emendados sem recodificar. Um corte que muda a duração refaz os trechos dali para a frente. O áudio (voz limpa, sons, trilha com ducking, −14 LUFS) é misturado uma vez e entra inteiro por cima.

## Revisão detalhada (antes de entregar)

A folha de 1 quadro por segundo não pega o que passa em 1 a 5 quadros nem o detalhe de um insert. Por isso:

1. **Frame solto, quadro a quadro:** `uv run ferramentas/folha.py projetos/<slug>/versoes/vN/proxy.mp4 --soltos`. Varre os
   24 quadros de cada segundo atrás de 1 a 5 quadros que destoam do antes e do depois (o frame vazio, o quadro de outra
   mídia, o fundo antes do card, o frame do ator perdido no corte) e grava uma tira de 8 quadros por alerta
   (`soltos_folha.jpg`). **Olhe cada tira**: cerca de metade é a entrada de um motion ou um movimento (deixa); o resto é
   defeito grave, sempre. O criador cobrou isso em quase todo vídeo ("CLÁSSICO erro do frame vazio"). Causa comum: um
   trecho (`banco.py trecho`) que começa 1 quadro antes da mídia trocar; o preset que entra com o card vazio; o motion
   cuja 1ª coisa não está na tela no 1º quadro. Medido no SkillSpector: os 3 frames soltos reais da v6 (um que o criador
   marcou e dois que passaram) e o da v9 aprovada, aos 51,3 s. _2026-11-18_
2. **Plano a plano, em quadros grandes:** `folha.py … --planos` (uma imagem a cada 6 planos: os 3 primeiros quadros, o
   meio e os 2 últimos de cada insert e motion). Leia cada linha contra a fala do plano e a checagem de
   `04-inserts.md`: o 1º quadro já tem conteúdo; a mídia prova a fala; legível no celular; o zoom termina no detalhe
   citado, inteiro (`05-enriquecimento.md` → O zoom); nada de borda, fundo duplo, texto cortado.
3. `uv run ferramentas/gemini.py projetos/<slug>/versoes/vN/proxy.mp4 "<pergunta>"`, para fala e áudio:
   ```text
   Você revisa um Reels editado antes de ir para o criador. Aponte só problemas concretos, com o tempo (m:ss):
   corte brusco ou palavra cortada no meio; insert que não combina com o que está sendo dito; tela preta ou vazia;
   legenda sobre texto importante ou ilegível; som alto demais, estalo ou música cobrindo a voz; repetição de fala.
   Se estiver tudo bem num item, não comente. Máximo 10 itens.
   ```
3. Separe o que é **grave** do que é **ajuste**:
   - **grave** (o criador não deveria ver): frame solto ou vazio, fala cortada no meio de uma palavra, tela preta ou
     vazia, mídia errada ou quebrada, zoom que corta o detalhe citado, um texto na tela errado (nome de ferramenta,
     número). Corrija, renderize de novo e repita os passos 1 e 2 nos pontos mexidos: a correção vira a
     versão seguinte (a v2) e é ela que você entrega. **Nunca apague uma versão** (`versoes/vN`): o app, os comentários e o
     histórico dos blocos dependem delas (`11-revisao.md`);
   - **ajuste** (gosto, ou uma limitação conhecida, como a legenda sobre o conteúdo de um insert em tela cheia): não
     renderize de novo; diga na entrega, no chat ("0:21 · vi isso, posso trocar por…").
   Sem nada grave, entregue a v1 como saiu do primeiro render.

## Entregar

```bash
uv run ferramentas/servidor.py      # se não estiver no ar (em segundo plano) → http://localhost:8719/app/
```
Diga ao criador, em poucas linhas: o link do app, a duração final, quanto tempo levou, as dúvidas (cada uma com o tempo
no vídeo final e a fala) e o que não conseguiu (ex.: "o insert do p7 ficou com um print estático: o site exige login").

Tempo esperado: com o pré-render feito (`render.py <slug> --camadas`, em segundo plano a cada leva de inserts), ~25 s
para 80 s de vídeo (medido: a montagem; a camada vem toda do cache, `.cache/camadas/` do projeto, e o áudio também, se
não mudou). Sem pré-render, a fotografia da camada leva de ~1 min (vídeo com poucos inserts) a ~5 min (80 s quase todo
em insert e motion, medido no mvi-0718): por isso o pré-render. Numa revisão, só o que mudou é fotografado. O
render imprime "N trechos do cache, M para fotografar, K para desenhar no ffmpeg" e, na montagem, quantos trechos vieram do cache. Revisão: `--soltos` ~5 s e `--planos` ~6 s
para 73 s de vídeo (medido no SkillSpector); o tempo é o de você olhar as folhas.
