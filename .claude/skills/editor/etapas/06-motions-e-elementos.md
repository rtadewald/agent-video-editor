# 06 · Motions e elementos

> **Antes de começar, leia `biblioteca/aprendizados/motions.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/motions.md`) e `biblioteca/aprendizados/elementos.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/elementos.md`)**: o que o criador já corrigiu em vídeos anteriores. Não repita esses erros.

## Motions

Um plano de **Motion tela cheia** ou **Tela dividida · motion** recebe uma animação em HTML + GSAP (palco 1080×1920 na
tela cheia, 1080×960 na dividida, fundo transparente; o fundo escolhido é desenhado atrás). Regra do criador: motions
**simples**, de poucos elementos e poucos segundos; a cena **nunca para** (depois da entrada, algo segue andando devagar
até o corte); curvas suaves, nunca lineares.

### Os presets (`biblioteca/motions/presets/<id>.html`)

A grade da página Motions toca uma prévia em vídeo de cada um (`biblioteca/motions/previas/<id>.mp4`); a animação ao
vivo fica só no modal. Mexeu num preset (ou criou um)? `uv run ferramentas/render.py previas-motions` refaz só o que
mudou (sem a prévia, o card cai na animação ao vivo, mais pesada).

Na página Banco › Motions do app, os que entraram em vídeos aprovados têm o selo **Usado em vídeo** e o chip do projeto e
do plano (`curl -s localhost:8719/api/estados` → `motions`): prefira-os, e use-os como modelo de estilo para os novos.

| id | nome | campos | fundo sugerido |
|---|---|---|---|
| `claude-code` | Janela do Claude Code | `prompt` (o que é digitado) | `verde_claro` |
| `lettering` | Lettering com destaque | `texto`, `destaque` (a última palavra, em destaque) | `chuva` |
| `prompt` | Caixa de prompt | `prompt` | `verde_claro` |
| `site` | Barra de busca | `url` | `nevoa` |

```bash
uv run ferramentas/inserts.py motion <slug> <plano> <preset> --valores '{"prompt": "…"}' [--fundo verde_claro]
uv run ferramentas/inserts.py motion <slug> <plano> --video <banco_id>     # um vídeo do banco no lugar do motion
```
Preencha os campos com o que a fala diz (o texto digitado é o da fala quando ela cita o prompt/o link: a digitação
acompanha as palavras faladas).
**Nunca o fundo vazio**: o motion já mostra algo no 1º quadro do plano. Num campo de palavra (`palavra1`…), a 1ª
entra na 1ª palavra do plano, nunca no meio da frase com a tela parada no fundo até lá. _design-por-imagem v9 c4_
No motion em tela cheia, a composição fica no meio da tela, nunca só na metade de cima com a de baixo vazia; a
legenda desce para baixo dela (`motions[p].legenda_y`). _design-por-imagem v11 c2_

### Motion novo

Se nenhum preset serve e a ideia é simples (um número que cresce, dois logos lado a lado, uma lista que se monta, um
gráfico de barras), um **subagente em segundo plano** (`model: opus`) escreve um preset novo:

```bash
uv run ferramentas/inserts.py motion-brief <slug> <plano> --preset <id-novo> [--duracao <s>] [--pedido "<o que mais mostrar>"]
```
Um plano com `refs` (da direção) já leva as refs no brief: o subagente abre cada uma e recria na linha dela.
**Pedido por uma referência** (o criador citou um `REF-…·pN` ou "como este"): o `--pedido` manda extrair e olhar os
quadros dela (o vídeo e o trecho vêm do `codigo.py`) e copiar ritmo, tipo de troca, tamanho, vinheta, curva e o material
real; não descreva a referência de cabeça (`aprendizados/motions.md`).
Dispare o subagente com o prompt **só**: `Leia <caminho> e siga.` (o modelo é `06-brief-motion.md`; mude lá; ele já
manda ler os recusados e os aprendizados). Ele leva ~7 min: **nunca espere por ele na v1**. Ligue já ao plano o preset
mais próximo (`inserts.py motion`); se o novo ficar pronto antes do render da entrega, troque; senão, ele entra na v2 e
você diz isso na entrega.
Depois ligue com `inserts.py motion`. Animação mais elaborada que isso: troque o plano (insert real ou Full ator) e
diga a ideia ao criador na entrega.

## Elementos

Ficam por cima do plano, presos às palavras (a direção os cria; ver `03-direcao.md`). O estilo de cada um, medido nas
referências do criador, está em `render/src/elementos.ts`:

| Elemento | Como aparece |
|---|---|
| Full ator com lettering · lettering sobre o ator | texto branco grande (SF Pro Display Bold, sombra), logo abaixo do queixo |
| lettering sobre insert | branco Bold no meio da área do insert, com o insert desfocado e escurecido atrás |
| palavra ManyChat | barra branca de comentário, a palavra digitada e o botão de enviar (com som de digitação) |
| caixinha de perguntas | sticker de pergunta do Instagram (cabeçalho em degradê), acima dos olhos sobre o ator; na tela dividida, na costura (como o card do comentário), e pode atravessar várias telas: estenda o `palavra_fim` dela até o fim da pergunta |
| print sobreposto | com `banco` (id de uma mídia): a mídia num card no peito/costura; sem: uma etiqueta mono com o `texto` |
| tarja | o texto do post em cima do vídeo, como o sticker de texto do Instagram: caixa branca no alto à esquerda, texto preto em negrito, emojis coloridos (🤯). Vai no 1º plano, nos primeiros 5–10 s; o criador quer emoji de espanto ou cérebro explodindo |

Todos entram com um "pop" de 0,18 s e saem secos. A legenda desvia deles.

O que você faz: o **print sobreposto** precisa de mídia para ficar bom (o logo da ferramenta, o recorte das estrelas do
GitHub): peça ao subagente do insert vizinho, ou busque você (`banco.py buscar`, `captura.py`, imagem oficial), e ponha
o id em `direcao.itens[i].banco` do elemento (direto no `edicao.json`; reaplicar a direção mantém a mídia de um print
com o mesmo texto). Confira no proxy se os textos estão certos e legíveis; para mudar, edite `direcao.itens[i].texto`.
