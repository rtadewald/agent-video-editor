# 08 · Áudio

Quatro trilhas, iguais na prévia e no MP4: a **voz** (limpeza → passa-altas 80 Hz → timbre, `encorpada` por padrão → compressor leve), os
**sons dos presets**, os **sons das transições** e o **fundo** (música 11 dB abaixo da voz, abaixando 3 dB enquanto o ator
fala, em laço com crossfade e fade no fim). No final, −14 LUFS (o padrão do Instagram), pico abaixo de −1,5 dBTP.

> **O gosto está em `guias/padrao.md`** (leia antes de começar). Aqui fica só o como.

## O que você decide (em `edicao.audio`)

- **`fundo`**: o id de uma trilha de `biblioteca/trilhas/catalogo.json`, pelo clima do vídeo (ou `null` = sem fundo):

| id | clima · BPM |
|---|---|
| `lofi-piano` | calmo, focado · 86 · **tem voz** (0:15–0:19): evite |
| `arpejo-suave` | leve, inspirador · 103 |
| `pads-ambiente` | flutuante, reflexivo · 108 |
| `chillhop` | descontraído · 92 · **tem voz** (0:05 e 1:49): evite |
| `cinematico` | pensativo, com tensão leve · 86 |
| `grave-tech` | focado, escuro · 103 |
| `piano-pulsante` | energia · 152 |
| `sneaky-snitch` | engraçadinho, malandro (pizzicato) · 2:16 · Kevin MacLeod, CC BY 4.0: **crédito na descrição** |
| `fluffing-a-duck` | engraçadinho, bobo (sopros) · 1:07 · Kevin MacLeod, CC BY 4.0: **crédito na descrição** |

  Tutorial/ferramenta → `arpejo-suave`; notícia/novidade de IA → `arpejo-suave`, `piano-pulsante` ou
  `grave-tech` (o criador achou a `pads-ambiente` tosca); opinião forte/polêmica → `cinematico`. Isso é ponto de partida, não regra fixa: **varie entre vídeos seguidos**.
  Antes de escolher, veja a trilha dos últimos projetos (`grep -h '"fundo"' projetos/*/edicao.json` pelos mais
  recentes) e não repita nenhuma das 3 últimas; o criador perguntou por que era sempre a mesma. _impeccable v9 c1 · 2026-11-23_
- **A música do criador é travada.** Na revisão, ele escolhe a faixa e o volume no botão Música (ouve ao vivo; ao salvar,
  o app grava `audio.fundo`, `audio.niveis.fundo` e `audio.fundo_do_criador: true` no edicao.json e põe a música no
  proxy da versão: `render.py remixar`). Com `fundo_do_criador`, não mexa na faixa nem no `niveis.fundo` em nenhuma
  versão, a não ser que ele peça.
- **`voz.limpeza`**: `leve` (padrão, já feita no preparar). `media`/`forte` só se o ruído de fundo incomodar (pede
  rodar a limpeza de novo; veja o preparar). `voz.timbre`: `encorpada` (padrão: a voz do criador
  com o equilíbrio das VSLs de referência — mais grave, menos médio, mais ar; o microfone dele não pega o brilho) ·
  `natural` (sem equalização) · `quente` · `clara` · `pronto` (um vídeo que já veio editado: a mistura passa sem
  passa-altas, timbre nem compressor; `01-preparar.md`). Se o criador gravar com outro microfone ou outra pessoa falar,
  compare o espectro da voz com o de uma referência aprovada antes de manter o padrão.
- **`niveis`** (dB em volta do nível das referências, −12 a +6): `ator`, `presets`, `transicoes`, `fundo`. Padrão 0.
  Mexa só com motivo (ex.: o criador achou os sons altos → `presets: -3`).

Nada para rodar: o render aplica tudo. Tempo esperado: segundos.

## A emenda de uma saída com CTA gravado à parte

Numa saída de CTA (`edicao.md` → `saidas`), não pode dar para perceber onde o corpo acaba e o CTA começa. O render faz
o áudio da saída inteira numa mistura só (`render.mix_da_saida`, no export e na prévia), a partir da receita do áudio de
cada versão (`versoes/vN/audio.json`):

- **a voz do CTA casada com a do corpo:** o equilíbrio por oitava (125 Hz a 8 kHz) medido nas duas vozes já tratadas e
  corrigido com um equalizador no CTA (`audio.casar_voz`, duas passadas), e a mesma sonoridade (o CTA, voz e sons, no
  nível do corpo);
- **uma trilha só**, a do corpo, do começo ao fim da saída: sem corte nem volta na emenda, o ducking pelas falas dos
  dois e o fade só no fim (a trilha do CTA, a dele sozinho, não entra; `audio.continua` não precisa mais);
- o som da transição na emenda e o −14 LUFS medido na saída inteira.

O log mostra o que foi casado (`voz do CTA +x dB, timbre … → sobra …`). Sobra acima de ~2 dB numa faixa, ou um CTA
gravado em outro lugar (outra sala, outro microfone): avise o criador na entrega — o equalizador iguala o timbre, não o
ambiente.

## Os níveis e o timbre

- Música e sons de apoio baixos, a voz na frente: `audio.niveis` com `fundo: -5`, `presets: -3`, `transicoes: -3` (dB em
  volta do padrão) quando o vídeo pede mais espaço para a voz.
- **Outro microfone ou outra pessoa**: compare o espectro da voz, por faixa (60–120 Hz, 120–250, 250–500, 500–1k,
  1–2k, 2–4k, 4–8k, 8–12k, só nas janelas com fala), com o de um vídeo aprovado, e ajuste o timbre até ficar a ~2 dB
  dele; mande ao criador duas amostras de 30 s do mesmo trecho, no mesmo volume, antes de exportar. O padrão
  (DeepFilterNet leve + `encorpada`) foi escolhido por ele entre 5 tratamentos: não teste outros sem pedido.
