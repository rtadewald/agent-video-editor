# 09 · Legenda

Gerada sozinha da fala cortada, no estilo medido nas referências: SF Pro Display Bold, branca, sombra escura difusa,
minúsculas como na fala, centralizada, **uma palavra por vez**, na altura de cada tipo de plano (desviando da costura da
tela dividida e do card do comentário). Entra 0,17 s antes da palavra.

> **O gosto está em `guias/padrao.md`** (leia antes de começar). Aqui fica só o como.

## O que você faz

Confira a **grafia** das palavras que o transcritor pode ter errado: nomes de ferramentas, marcas, siglas, números
("cloud" → "Claude", "gpt" → "GPT", "dez por cento" falado continua por extenso). Corrija só a grafia, nunca a fala.

Em `edicao.legenda.ajustes`, presos às palavras:
```json
{"w00031": {"texto": "Claude", "fim": "w00031"},
 "w00040": {"texto": "GPT-5", "fim": "w00041"},
 "w00077": {"texto": "", "fim": "w00077"}}
```
- A chave é o id da 1ª palavra do bloco; `fim`, a última (junta palavras num bloco); `texto` corrigido; `""` esconde.
- `modo`: `palavra` (padrão) ou `frase` (até 3 palavras / 18 letras) — só se o criador pedir.
- `ligada: false` desliga.
- A altura: um insert ou um motion podem dizer onde a legenda fica enquanto estão na tela (`legenda_y`, fração do quadro, no
  pedido do insert ou em `edicao.motions`). Na tela dividida ela fica na divisa; se ficar ilegível ali, ponha logo abaixo
  (a costura + ~0,035). _lembrete-hoje v2 c1 · 2026-10-21_

Para achar os ids: `uv run ferramentas/cortes.py texto <slug>` (ou o `transcricao.json`).

Tempo esperado: ~1 min.
