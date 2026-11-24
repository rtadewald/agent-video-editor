# Guia de estilo · carrossel

O gosto do criador para os carrosséis do feed (4:5, de 1 a 20 slides). São diretrizes, não um molde: dentro delas,
escreva e monte com liberdade e com o seu melhor. Quando nada aqui responde, pergunte-se o que faz quem desliza no
celular ler o slide inteiro e querer o próximo, e faça isso. O como (os tipos de slide, o `carrossel.py`, o app) está
em `etapas/15-carrossel.md`.

## O texto: uma conversa

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

## A mídia: só quando prova

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

## O visual é do criador

O preset, o destaque, as cores, as margens, o botão de ação e as quebras de linha são escolhas dele no app. Não mexa;
numa versão nova, mantenha o que ele editou.

## Referências aprovadas

- **Grill me** (Etiqueta) e **WordPress em 2026** (Notas): a conversa só de texto, com a mídia quando prova; o card de
  comentário e o card de matéria.
- **Img 2 HTML** (Etiqueta) e **5 plugins do Claude Code** (Notas): o carrossel de skill vindo de um Reels, mídia em todo
  slide.
- Os slides deles estão em `carrosseis/<slug>/final/` e a copy na skill `carrossel-builder` do vault.

## Recusado (não volte)

Título por slide · frase solta com imagem · narrador em 3ª pessoa · imagem de enfeite · sessão de IA simulada ou terminal
preto · print com nota ruim · print cru de matéria · caixa ou borda em volta de recorte · caixinha de pergunta dos
Stories · trecho do vídeo editado com a legenda queimada.
