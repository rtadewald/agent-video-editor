# 06 · Motions e elementos

> **Antes de começar, leia `biblioteca/aprendizados/motions.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/motions.md`) e `biblioteca/aprendizados/elementos.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/elementos.md`)**: o que o criador já corrigiu em vídeos anteriores. Não repita esses erros.

## Motions

Um plano de **Motion tela cheia** ou **Tela dividida · motion** recebe uma animação em HTML + GSAP (palco 1080×1920 na
tela cheia, 1080×960 na dividida, fundo transparente; o fundo escolhido é desenhado atrás). Regra do criador: motions
**simples**, de poucos elementos e poucos segundos; a cena **nunca para** (depois da entrada, algo segue andando devagar
até o corte); curvas suaves, nunca lineares.

### Os presets (`biblioteca/motions/presets/<id>.html`)

A grade da página Motions toca uma prévia em vídeo de cada um (`biblioteca/motions/previas/<id>.mp4`), e o modal também
(um motion em 3D ao vivo travava ali): só sem a prévia os dois caem na animação ao vivo. Mexeu num preset (ou criou um)? `uv run ferramentas/render.py previas-motions` refaz só o que
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

### O motion contínuo (um palco o vídeo inteiro, ele pequeno embaixo)

Quando o criador pede **uma tela fixa com um motion só o vídeo inteiro e ele pequeno embaixo**, o modelo é o Reel de
referência que ele mandou (instagram.com/reel/DVhNGTAjPwu): o preset `vitrine`, fundo quase preto com uma grade leve,
ele embaixo numa **janela larga com a cabeça saindo por cima** (o criador aprovou: "eu apareci bem") e, no canvas de
cima, **um insert por vez**, o melhor para a frase: deitado vai de ponta a ponta da tela (`forma: "faixa"`), quadrado ou
em pé vai num cartão de cantos redondos (`"cartao"`). Dois andares de cards ao mesmo tempo ficaram "muito sujo, muita
informação". O **título de apoio (curto, com emoji) só no começo**. Troca em **corte seco** a cada frase; os vídeos
seguem tocando, com um zoom lento por dentro.
Um plano `tela_dividida_motion` do começo ao fim, com `formato: "vertical"`, `ator: {modo: "janela", escala: 0.75, y:
1.0125, topo: 0.103}` (no bruto de mesa: a janela começa a ~71% e só a cabeça sai por cima) e `legenda_y: 0.87`.
`valores.cenas` (JSON): `[{em: "as palavras onde começa", m: id, forma, asp, foco: [x,y], zoom, revela: 0.36, titulo}]`;
`valores.midias`: todos os ids. A mesma mídia em cenas seguidas continua tocando.
**Cada fala provada com material real e escolhido para ela**, nunca os inserts da versão anterior por inércia: os apps
do criador gravados de verdade, os vídeos de outras pessoas e a prova com número (ex.: o gráfico do star-history.com
para "começou nos últimos meses"); nada de imagem gerada fingindo ser app. Trecho de gravação com o player piscando
preto no começo: corte o trecho depois disso (`folha.py --soltos` acha); um vídeo com um pulo ou zoom brusco no meio
vira dois trechos, um antes e um depois, trocando na palavra mais próxima. **Um motion em 3D no meio do contínuo** (o
criador pede para explicar um conceito) é um plano `tela_dividida_motion` só dele entre dois planos da vitrine, com o
mesmo `ator` e `legenda_y` e, no `--pedido` do brief, o fundo da vitrine (#0b0b0c com a grade) e a cena só no canvas de
cima (13,5–69%): sai sem emenda. **Zooms calmos** (o criador, na referência do Caféra): numa gravação de tela, a câmera vai
com calma de um destaque ao outro, `pontos: [[x, y, zoom, t]…]` (t em s desde o começo da cena), em vez de mostrar a
tela inteira parada. Uma sequência de resultados troca com `clique: true` (o som do clique). As gravações de app que
rolam saem quadro a quadro em 2x (a rolagem posta a cada quadro e a foto do recorte), nunca do screencast em 1x com a
roda do mouse, que trava ("parece fps errado"). Recusados antes dele: janelas do Mac com zoom
nas caixas, a tela dividida 70/30 e o estúdio branco em 3D (o `estudio-branco` fica na biblioteca, sem uso).
_claude-code-apps-2 · 2026-11-23_

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
**Motion novo é em 3D** (o estilo do criador desde 2026-11-17: objetos de vidro e metal, chão que reflete, bloom,
câmera andando; em 2D só a janela de um app real). Vídeo como textura: desenhe em `motion.depois(f)` (os vídeos já no
quadro) e dê ao `<video>` os atributos `width`/`height` (sem eles a textura sai preta). O Three.js está em
`render/motion/three/` (com os addons de bloom, espelho e caixa arredondada); o modelo aprovado é o
`entrada-saida-3d`. O preset traz o `<script type="importmap">` e um `<script type="module">`, desenha a cena inteira
dentro do `motion.aCada` (câmera, objetos e `composer.render()` a partir de `t`, sem estado entre quadros) e cria o
renderer com `preserveDrawingBuffer: true`. O `EffectComposer` recebe um alvo com MSAA
(`new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples: 4 })`): sem ele, o bloom ignora
o `antialias` do renderer e as arestas finas saem serrilhadas (o criador reclamou na onda 1 dos motions em 3D,
2026-11-17). O pixel ratio é `MOTION.pr || Math.min(2, devicePixelRatio)`: na galeria do app o `motion.html` passa
o `pr` do tamanho em que o palco aparece (sem ele, o modal desenhava 2160×3840 a cada quadro e travava); no render vale o
do navegador. Texto em HTML por cima, projetado da cena depois de
`cam.updateMatrixWorld()`. O enquadramento é calculado pela largura do grupo e pelo fov, e a névoa acompanha a
distância da câmera.
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
