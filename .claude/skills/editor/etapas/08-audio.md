# 08 · Áudio

Quatro trilhas, iguais na prévia e no MP4: a **voz** (limpeza → passa-altas 80 Hz → timbre, `encorpada` por padrão → compressor leve), os
**sons dos presets**, os **sons das transições** e o **fundo** (música 11 dB abaixo da voz, abaixando 3 dB enquanto o ator
fala, em laço com crossfade e fade no fim). No final, −14 LUFS (o padrão do Instagram), pico abaixo de −1,5 dBTP.

> **Antes de começar, leia `biblioteca/aprendizados/audio.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/audio.md`)**: o que o criador já corrigiu em vídeos anteriores. Não repita esses erros.

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

  Tutorial/ferramenta → `arpejo-suave`; notícia/novidade de IA → `arpejo-suave`, `piano-pulsante` ou
  `grave-tech` (o criador achou a `pads-ambiente` tosca); opinião forte/polêmica → `cinematico`. Varie entre vídeos seguidos.
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
