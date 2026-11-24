# 01 · Preparar

Do bruto à matéria-prima: o projeto criado, o vídeo em 9:16, a transcrição palavra a palavra com IDs, os silêncios, o
proxy, o rosto do ator e a voz limpa.

## Rodar

```bash
uv run ferramentas/preparar.py "<caminho do bruto>" --nome "<nome curto do vídeo>" [--briefing "<texto ou arquivo>"]
```

- O nome vira o slug (`projetos/<slug>/`). Use um nome curto do assunto ("Melhor IA design"), não o nome do arquivo.
- **[gosto] Nome curto, só o assunto:** 2–3 palavras, sem subtítulo nem dois-pontos ("Claude Advisor", não "Claude
  advisor: Opus conselheiro, Haiku nos subagentes"). O nome abre o nome de cada arquivo em `final/` (`<nome> - <destino>.mp4`):
  o título longo do Reels deixa os arquivos ilegíveis. O criador renomeou dois projetos assim (mvi-0717 → "Claude
  Advisor", mvi-0718 → "OpenAI Realtime TTS"). _2026-10-21_
- **Áudio gravado à parte** (um .m4a/.wav ao lado do vídeo, ex.: o memo de voz do iPad): é a mesma fala, de melhor
  qualidade, e é ela que vai no vídeo. Prepare com `--audio "<arquivo>"`: ela é sincronizada com o áudio da câmera
  (GCC-PHAT em janelas de 10 s, com a deriva dos relógios; `voz.alinhar`) e a transcrição, os silêncios, a voz limpa e o
  nível vêm dela, nos tempos do bruto. O resumo mostra o atraso e a `sobra` (acima de 10 ms, recusa: confira se é a
  mesma gravação). Num projeto já preparado: `preparar.py --trocar-audio <slug> "<arquivo>"` (refaz a voz limpa e o
  nível; a transcrição e os cortes ficam). Não confunda com briefing em áudio: o briefing fala *sobre* o vídeo, o áudio à
  parte repete a fala dele. _ads Últimos dias (Black) · 2026-11-11_
- **Vídeo deitado (16:9)**: quando o criador pede o vídeo na horizontal (as VSLs horizontais), prepare com `--deitado`:
  o ator é o próprio bruto 16:9 (sem o 9:16 pelo rosto), `saida` 1920×1080 e a legenda desligada. Um projeto já
  preparado em pé vira deitado com `preparar.py --deitar <slug>` (refaz o proxy e o rosto do original; os cortes e a
  direção ficam). Deitado, a tela dividida é **lado a lado**: o insert à esquerda (63% da largura, área 9:8), o ator à
  direita, enquadrado pelo rosto. _vsl-black · 2026-11-16_
- **Dois ou mais vídeos no mesmo bruto** (ex.: "são dois anúncios"): prepare uma vez, leia a transcrição, renomeie a
  pasta para o assunto do 1º (`mv`, e `id`/`nome` no `edicao.json`) e clone-a para cada outro com `cp -cR` (clone do
  APFS: não ocupa espaço nem transcreve de novo), com `id` = a pasta e o `nome` dele. Cada projeto escolhe nos cortes
  só as palavras do seu vídeo. _bf26-ad2/ad3 · obrigado-black · 2026-11-17_
- Materiais de apoio que o criador citou: copie para `projetos/<slug>/apoio/` logo depois (com `cp -c`).
- Briefing em áudio: transcreva com o próprio preparar num projeto à parte ou com `gemini.py` e use o texto.

## O que ele faz (em paralelo)

- Bruto **horizontal** (16:9): a câmera virtual segue o rosto e gera `midia/bruto_9x16.mp4`, que vira a fonte (suavidade
  Normal). Vertical: passa direto.
- Proxy 720p, `audio.wav`, `silencios.json` (−35 dB, ≥ 0,3 s).
- Transcrição **ElevenLabs Scribe v2** → `transcricao.json` (IDs `w00000…`, tempos no bruto; nada é limpo: repetições e
  tentativas ficam, porque é delas que os cortes decidem). Sem plano B: se falhar, pare e diga o motivo ao criador.
- Rosto do ator (MediaPipe) → `midia/rosto/f1.json` (enquadra o ator na tela dividida e centra o zoom do Full ator).
- Voz limpa Leve (DeepFilterNet) → `midia/voz/f1_leve.wav`; nível da voz (`nivel_voz`, regula os sons).
- `edicao.json` inicial com os padrões: look sem LUT, vinheta Leve, nitidez Leve, velocidade 1×, legenda palavra a palavra,
  limpeza Leve, timbre `encorpada`, sem trilha (você escolhe no Áudio).

## Vídeo já editado (só para plugar CTAs)

O criador às vezes traz um vídeo pronto (o final de outro editor, do Drive) só para servir de corpo das saídas. Prepare
igual e, sem editar nada, deixe-o passar como veio: `cortes.parametros` com `pausa_max` 99 e folgas 0, `manter` da 1ª à
última palavra e o clipe da V1 de 0 até a duração da fonte (o `auto` guarda o de antes); `legenda.ligada: false`;
`audio.voz` `{"limpeza": "sem", "timbre": "pronto"}` (a mistura passa sem filtro) e `fundo: null`; `look` com vinheta e
nitidez `sem`; um plano só (`[Full ator: —]` com a fala inteira), sem `ator_planos` nem transições. O render sai igual
ao original, só no −14 LUFS. Numa saída com CTA, o corpo `pronto` faz o CTA levar a trilha dele (a música do corpo está
dentro da mistura) e só o volume se iguala. Depois, as saídas: `cortes.py saida <slug> "<Destino>" --cta <slug>` ou o
**+ Saída** do app. _strix-2 · 2026-10-20_

## Conferir

- O resumo impresso: duração, medidas, nº de palavras. Uma fala de 2 min tem ~300–400 palavras; muito menos indica
  áudio ruim ou idioma errado.
- Erro: leia a mensagem; não tente contornar trocando de motor sem falar com o criador.

Tempo esperado: < 1 min para 2 min de bruto vertical (mais ~30 s num 16:9).
