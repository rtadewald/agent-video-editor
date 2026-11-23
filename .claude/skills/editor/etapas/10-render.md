# 10 · Render e revisão

> **O gosto está em `guias/padrao.md`** (leia antes de começar). Aqui fica só o como.

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

## Revisar com olho crítico (antes de entregar)

A revisão é a parte da edição que decide a qualidade: assista ao vídeo como o criador vai assistir, no celular, e
corrija o que não estiver bom antes de entregar. Nenhum script substitui isso.

1. **Assista em quadros grandes.** Tire quadros do vídeo inteiro (do proxy ou, melhor, da camada em tamanho real): um a
   cada ~0,5–1 s, em pelo menos 360 px de largura, e os 2–3 quadros de cada troca. Em miniatura de 150 px um cartão
   pequeno no meio do vazio "parece ok": não é.
2. **Cada cena contra o guia** (`guias/padrao.md`), perguntando o que quem assiste vê: ocupa a tela? lê no celular? prova
   a frase, no instante certo? o zoom tem motivo? o som bate com o que acontece? é o melhor material possível, ou dá
   para explicar melhor com outro insert, outra gravação, um motion? Anote também as melhorias, não só os erros.
3. **Um revisor que não fez o vídeo.** Um subagente (`inserts.py brief <slug> revisao --tarefa <arq> --areas todas`,
   prompt `Leia <arquivo> e siga.`) recebe só os quadros, a fala e o guia — nunca a sua justificativa — e aponta, com
   o tempo, o que fugiu do guia e o que poderia ser melhor. Leve a sério o que ele achar.
4. **O que a máquina mede melhor que o olho:** quadros soltos (`folha.py <proxy> --soltos`: olhe cada tira; metade é a
   entrada de um motion, o resto é defeito), quadros repetidos num vídeo (`mpdecimate`, em `04-inserts.md`), e fala e
   áudio (`gemini.py <proxy> "<pergunta>"`: corte no meio de palavra, música cobrindo a voz, estalo).
5. **Corrija e renderize de novo** o que não passou — é a versão seguinte (nunca apague `versoes/vN`) — e revise de novo
   o que mudou. Só entregue quando você mesmo aprovaria. O que é gosto em aberto vai na entrega, como pergunta.

## Entregar

```bash
uv run ferramentas/servidor.py      # se não estiver no ar (em segundo plano) → http://localhost:8719/app/
```
Diga ao criador, em poucas linhas: o link do app, a duração final, o que você escolheu e por quê (curto), as dúvidas
(cada uma com o tempo no vídeo final e a fala) e o que não conseguiu (ex.: "o p7 ficou com um print: o site exige login").

Tempo esperado: com o pré-render feito (`render.py <slug> --camadas`, em segundo plano a cada leva de inserts), ~25 s
para 80 s de vídeo (medido: a montagem; a camada vem toda do cache, `.cache/camadas/` do projeto, e o áudio também, se
não mudou). Sem pré-render, a fotografia da camada leva de ~1 min (vídeo com poucos inserts) a ~5 min (80 s quase todo
em insert e motion, medido no mvi-0718): por isso o pré-render. Numa revisão, só o que mudou é fotografado. O
render imprime "N trechos do cache, M para fotografar, K para desenhar no ffmpeg" e, na montagem, quantos trechos vieram do cache. Revisão: `--soltos` ~5 s e `--planos` ~6 s
para 73 s de vídeo (medido no SkillSpector); o tempo é o de você olhar as folhas.
