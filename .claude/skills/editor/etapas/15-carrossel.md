# 15 · Carrossel

Um carrossel é uma sequência de slides 4:5 (1080×1350, de 1 a 20) para o feed. Você escreve tudo: o texto, a ordem,
o tipo de cada slide e a mídia. O criador só escolhe o **preset** e o **destaque** no app (o visual; troca ao vivo, sem
versão nova) e comenta por slide. Mora em `carrosseis/<slug>/`: `carrossel.json` (nome, tipo, origem, pedido, preset, destaque), `entrada/` (os
arquivos que ele subiu), `midia/`, `versoes/vN.json` (os slides), `revisoes/vN.json` e `final/` (o export).

Duas partes: **o gosto** (leia inteiro antes de começar) e **o como**. Nada de outra etapa é preciso.

## O gosto

As diretrizes do criador, não um molde: dentro delas, escreva e monte com liberdade e com o seu melhor. Quando
nada aqui responde, pergunte-se o que faz quem desliza no celular ler o slide inteiro e querer o próximo, e faça
isso. É esta parte que se reescreve a cada carrossel aprovado ("Aprovado", abaixo).

### O texto: uma conversa

- **Uma conversa, não uma apresentação.** O criador contando a história ou explicando o conceito inteiro, como se
  falasse com uma pessoa. Nada de título, frase solta e imagem por slide (o carrossel padrão da internet).
- **Em 1ª pessoa, na voz dele** ("testei", "eu uso", "o meu processo"; `biblioteca/exemplos/criador.md`), nunca o
  narrador de fora ("ele testou").
- **Explique de verdade**: o porquê, o como, o exemplo, o que deu errado. É mais texto que no Reels: de 3 a 6 frases por
  slide, em um ou dois parágrafos corridos. Se o texto encolhe muito para caber, são dois slides. Argumento técnico tem
  mecanismo ("é pesado" pede o porquê, em linguagem simples).
- **Destaque com estratégia**: uma ou duas expressões por slide em `**destaque**` (a palavra, o número, a virada), nunca
  frases inteiras.
- **Loops abertos.** O 1º slide é o gancho (uma promessa, uma pergunta, um resultado estranho) e não entrega tudo; cada
  slide fecha abrindo o próximo ("só que…", "mas o que mudou mesmo foi…"). O loop do gancho só fecha perto do fim; o
  último fecha a conversa (a conclusão e o CTA, quando houver).
- **Derivado de um vídeo é o mesmo conteúdo reescrito para ler**, não a transcrição da fala. A legenda do post adapta a
  do vídeo.
- **A copy de carrossel do vault manda** quando o pedido vier dela (`~/Obsidian Notes/3 Skills/carrossel-builder/`: os
  aprovados, slide a slide, e as correções de copy).

### A mídia: só quando prova

- **Mídia prova o que o texto acabou de dizer** (o print, o antes e depois, a tela em uso). Um slide só de texto é o
  normal; nunca imagem para enfeitar.
- **Carrossel de skill, ferramenta ou hack que vem de um Reels** (a demo é o conteúdo): todo slide tem mídia, a prova do
  que ele diz, e o texto é curto (2 ou 3 frases) para ela ficar grande. A capa leva a melhor, a que mostra o benefício.
  A mídia é a mais bonita que houver (os projetos top do criador, não um exemplo qualquer).
- **Real e atual.** Nada inventado: o print, a gravação, o site capturado agora. Números do vídeo (estrelas, preços)
  conferidos de novo; se mudaram, diga.
- **O Claude é print real do app desktop claro**, de uma conversa de verdade; nunca uma sessão montada nem o terminal
  preto. Sem print à mão, rode a sessão e capture (ou peça ao criador).
- **Prova de resultado no verde.** Um número de prova (PageSpeed, métrica, benchmark) só entra se for bom; se as páginas
  do criador não passam, uma referência pública, dizendo na copy de onde vem.
- **Recortes limpos.** Matéria ou notícia citada: o título num card branco, cantos arredondados e sombra. Card, selo ou
  elemento recortado: PNG com fundo transparente, inteiro, sem caixa ou borda em volta.
- **Pergunta de seguidor** que abre o carrossel: o comentário do Instagram como aparece na lista (card branco, foto e
  usuário borrados, o usuário na linha do texto, o coração à direita, "5 d · 1 curtida · Responder · •••" embaixo),
  com o bloco centralizado no slide. Nunca a caixinha de pergunta dos Stories.
- **Vídeo sem legenda queimada** (o bruto, o banco, o apoio; não o `final/` do vídeo). Gravação de tela vai muda; o som
  só quando a fala do trecho importa.

### O visual é do criador

O preset, o destaque, as cores, as margens, o botão de ação e as quebras de linha são escolhas dele no app. Não mexa;
numa versão nova, mantenha o que ele editou.

### Referências aprovadas

- **Grill me** (Etiqueta) e **WordPress em 2026** (Notas): a conversa só de texto, com a mídia quando prova; o card de
  comentário e o card de matéria.
- **Img 2 HTML** (Etiqueta) e **5 plugins do Claude Code** (Notas): o carrossel de skill vindo de um Reels, mídia em todo
  slide.
- Os slides deles estão em `carrosseis/<slug>/final/` e a copy na skill `carrossel-builder` do vault.

### Recusado (não volte)

Título por slide · frase solta com imagem · narrador em 3ª pessoa · imagem de enfeite · sessão de IA simulada ou terminal
preto · print com nota ruim · print cru de matéria · caixa ou borda em volta de recorte · caixinha de pergunta dos
Stories · trecho do vídeo editado com a legenda queimada.

## O como

### Começo ("Carrossel novo · <slug>")

```bash
uv run ferramentas/carrossel.py ver <slug>     # o pedido, a origem, os arquivos de entrada, o preset
```

- **Derivado** (veio de um vídeo, `origem`): é **o mesmo conteúdo, reescrito para ler** — não a transcrição da fala.
  Leia o projeto de origem: o `briefing.md` (o roteiro), a direção e os inserts do `edicao.json` e o `apoio/`. A mídia
  sai de lá: os materiais do `apoio/`, as mídias do banco que o vídeo usou (`banco.py`), trechos do bruto. Evite trecho
  do vídeo editado (`final/`): ele tem a legenda queimada. Os motions do vídeo não têm arquivo próprio: fotografe a
  página deles (`/render/motion.html?preset=<id>&formato=…&valores=…`, com os valores do `edicao.json`) num instante,
  como o render faz, e ponha a foto com `midia`. Um vídeo que chegou já editado (bruto com legenda): recorte acima dela.
- **Cru**: o pedido (briefing, copy, nota do Obsidian) e os arquivos de `entrada/`. Quando o pedido vier de uma skill de
  copy de carrossel, siga a copy dela. A mídia que faltar, busque (abaixo, "Buscar mídia"), nunca inventada.
- **De uma referência da Calibragem** (um Reels antigo, sem projeto): é um cru com o pedido apontando a referência
  (`biblioteca/referencias/<id>/`). O roteiro está em `palavras.json`; o que cada plano mostra está em `analise.json`
  e `quadros/`. Dela só existe o vídeo editado (720p, legenda queimada): capture de novo o site, o GitHub e o print ("Buscar mídia"), e recorte o `proxy.mp4` acima da legenda só quando não houver outro jeito. Números do vídeo
  (estrelas, preços) podem ter mudado: confira e diga quando mudou.

### Buscar mídia

No tamanho da área da mídia no slide (não o 9:16 dos vídeos), nítida em 2x:
- o banco: `uv run ferramentas/banco.py buscar "<termos>"` (os ★ usados em vídeo aprovado; os ✗, não);
- gravar um app ou página operados: `uv run ferramentas/gravar.py quadro <spec.json>` (quadro a quadro; o spec no
  `--help`: janela, escala, `clip` na área que importa, as ações; esconda banners de cookies com a ação `js`);
- capturar um site: `uv run ferramentas/captura.py <url> --proporcao 1:1|4:3|16:9 --duracao <s>` (espere as animações
  de entrada terminarem antes do print; site que bloqueia: a doc ou o blog oficial);
- vídeo oficial ou da comunidade: `uvx --from "yt-dlp[default]@latest" yt-dlp <url>` e o trecho com `--de/--ate` no
  `midia`;
- o print do Claude: uma conversa real no app desktop, tema claro.

O que entrar e puder servir de novo vai para o banco (`banco.py adicionar … --descricao`), com de onde veio.

### Escrever

Escreva a conversa e a legenda do post seguindo o gosto (acima). No Notas o criador também escolhe a cor
do destaque (`cores` no `carrossel.json`; a padrão de todos em `biblioteca/carrosseis.json`): não mexa.

### Os slides (`versoes/vN.json`)

```json
{"slides": [
  {"tipo": "capa", "texto": "Tem uma skill que promete cortar **65%** dos tokens do Claude. Eu testei.\n\nO número bateu. Só que não do jeito que eu esperava."},
  {"tipo": "texto", "texto": "…"},
  {"tipo": "texto-imagem", "texto": "…", "midia": "midia/grafico.png", "ajuste": "conter", "porque": "o print prova o número"},
  {"tipo": "texto-video", "texto": "…", "midia": "midia/demo.mp4", "som": false},
  {"tipo": "cta", "texto": "…", "acao": "Comente IA"}
 ],
 "legenda": "…"}
```

| tipo | o que é | campos |
|---|---|---|
| `capa` | o gancho (mídia opcional abaixo) | `texto` |
| `texto` | só texto: o normal | `texto` |
| `texto-imagem` | texto em cima, imagem embaixo | `texto`, `midia` (imagem) |
| `texto-video` | texto fixo em cima, vídeo embaixo | `texto`, `midia` (vídeo), `som` |
| `midia` | imagem ou vídeo ocupando o slide, texto opcional por cima | `midia`, `texto` |
| `cta` | o fechamento | `texto`, `acao` (o botão) |

- `texto`: parágrafos separados por linha em branco; `**destaque**` dentro. Não há `titulo` (o `versao` recusa). Uma
  quebra simples (`\n`) é só quebra de linha (o Enter do app, mesmo espaço da quebra natural); a linha em branco abre
  parágrafo; cada linha em branco a mais é um espaço extra no slide. Mantenha as quebras do criador.

- `ajuste`: `cobrir` (padrão; corta para preencher) ou `conter` (inteira, sem moldura, do tamanho da mídia e com o bloco mídia + texto centralizado no slide: prints, gráficos e recortes).
  Imagem recortada (card, selo, elemento) é PNG com fundo transparente e `conter`: nunca uma caixa ou borda quadrada em
  volta dela.
- `som`: o vídeo leva o áudio dele. Ligue quando a fala do trecho importa; gravação de tela e demonstração vão mudas.
- `porque`: o porquê do slide (para você; o app não mostra).
- `margens`: `{topo, lados, base}` em px do slide, as que o criador ajustou no app; sem elas, vale o padrão do carrossel
  (`margens` no `carrossel.json`, o "Usar como padrão" do app) e, sem padrão, o preset. Mantenha as dele.
- `acao`: o botão de ação ("Comente SKILL"); o criador liga, desliga e reescreve no app. Mantenha o dele.
- `arrasta`: `true`/`false`, o botão "Arrasta" que o criador ligou ou desligou no slide; sem ele, só o 1º slide tem.
- `midia`: o caminho dentro do carrossel (`midia/…`), sempre posto pelo `carrossel.py midia`.
- A mídia vem depois do texto; para pô-la no meio, uma linha só com `[mídia]` no `texto` marca onde (o criador também
  move essa linha no app).
- `falta`: a mídia que ainda não chegou ("gifs de 2 apps meus"): o slide mostra uma caixa vazia com isso, no lugar dela.
  Use enquanto se acerta a copy; não se aprova nem exporta com `falta` (a `midia` posta tira).

```bash
uv run ferramentas/carrossel.py midia <slug> <arquivo> [--de 12.3 --ate 18.4] [--nome x]   # imagem ou trecho (até 60 s)
uv run ferramentas/carrossel.py versao <slug> <arquivo.json>                                # valida e grava a vN
```

Escreva o JSON num arquivo seu (fora de `carrosseis/`) e grave com `versao`: ele confere tipos, mídias e o limite de
60 s por vídeo. Confira a versão no app (`http://localhost:8719/app/#/c/<slug>`) em dois ou três presets antes de
entregar. Na entrega: o link, quantos slides e as dúvidas.

### Revisão ("Revisão carrossel · <slug> · vN")

```bash
uv run ferramentas/carrossel.py ler <slug> [vN]       # cada comentário com o slide (o texto dele) e o ponto marcado
uv run ferramentas/carrossel.py responder <slug> <vN> <id> --status aplicado|respondido|nao_aplicado --resposta "…"
```

Leia todos os comentários antes de mexer e faça um plano que leve todos em conta (um comentário sobre um slide
costuma valer para outros); o que ele disser que vale para sempre vai já para o gosto (acima), com o texto confirmado. Aplique numa versão nova (`versao`) e responda cada um numa frase curta (o que mudou). Um `@BAN-111` / `@MOT-07` no comentário é a mídia ou o motion que ele marcou no banco: `codigo.py <código>`. O ponto marcado
(x, y em % do slide) diz onde ele olhou. O criador também edita o texto, o destaque e as margens direto no app, na própria vN (o
`ler` diz em quais slides): a versão nova parte de `versoes/vN.json`, não do seu JSON antigo, e mantém o que ele
escreveu.

### Aprovado

O app exporta sozinho ao aprovar (e de novo se o preset ou o destaque mudar depois): `final/01.png`, `02.mp4`… na ordem
de postar, a `legenda.txt` e a `copy.md` (o texto de cada slide, **c1**, **c2**…, com `[mídia]` onde ela entra).

Depois, **reescreva o gosto com o que o carrossel ensinou**: leia os
comentários de todas as versões (`carrossel.py ler`) e o que ele disse no chat, ache a causa de cada correção e proponha
a mudança no princípio, não o caso; tire o que não serve mais. Mostre ao criador o antes e o depois e grave só o que ele
aprovar, separando:
- **Copy** (o que o texto diz, argumento, tom, ordem): na skill do vault, `~/Obsidian Notes/3 Skills/carrossel-builder/SKILL.md`,
  onde também entra o carrossel aprovado como exemplo;
- **o resto** (escrita como conversa, mídia, prova visual, recortes): no gosto (acima); um aprovado que serve de modelo
  entra nas Referências aprovadas.
