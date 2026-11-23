# Guia de estilo · padrão

O gosto do criador para os vídeos dele: Reels (FIA, FID, Hacks, Storytelling), VSL, anúncios, CTAs e Pico. São
diretrizes, não um roteiro: dentro delas, edite com liberdade e com o seu melhor. Quando nada aqui responde, pergunte-se
o que faz quem assiste no celular entender mais rápido e com mais vontade de continuar, e faça isso.

Qualidade vem antes da velocidade. Nenhuma versão sai sem você ter assistido a ela com olho crítico (`etapas/10-render.md`).

## O que cada momento precisa

- **Toda frase provada na tela, com algo real, escolhido para ela.** O insert mostra exatamente o que a frase diz, no
  instante em que a coisa acontece (a webcam ligando, o card surgindo, a resposta chegando). Se é preciso explicar por
  que o visual combina com a frase, ele está errado. Fala que descreve algo que dá para ver mostra a coisa; o ator fica
  com o que é dele (opinião, virada, chamada).
- **O detalhe citado aparece grande.** Um número, um nome, uma data, uma linha: legível no celular quando é dito.
- **Abra mostrando algo.** Nunca o ator em tela cheia no começo (salvo pedido). Os primeiros segundos pesam mais que o
  resto: demos fortes, reais, uma por frase, recortadas no que impressiona e já rodando no 1º quadro.
- **Ritmo.** Troca de tela em fim de frase ou numa pausa, nunca no meio de uma palavra. Uma ideia por tela, com tempo
  para absorver (trocar rápido demais "suja"); assunto novo, visual novo; nunca o mesmo material duas vezes seguidas.
  Ator em tela cheia no máximo 3–4 s seguidos. Fala que lista itens: um por vez, cada um na sua palavra.
- **Ferramenta ou marca citada: a própria marca** — o produto em uso, o vídeo oficial, o site, ou o card com o nome e o
  ícone na palavra. Lançamento: a página do anúncio (título e data legíveis) e depois o produto em uso, sem voltar ao
  ator só para preencher.
- **O real antes do motion.** Vídeo real (o app em uso, pessoas provando) > página > motion. O motion explica o que é
  abstrato (um conceito, números, comparações, hierarquias); app e IA trabalhando se mostram de verdade.

## A tela: o 9:16 inteiro

- **O insert ocupa a tela.** O padrão é a mídia em 9:16 ocupando a tela toda. Na tela dividida, o padrão é o modelo do
  Claude Code Apps 2 (aprovado em 2026-11-23): o insert em 9:16 por trás de tudo e o ator embaixo, numa janela larga com
  a cabeça saindo por cima (`ator: {modo: "janela", escala: 0.75, y: 1.0125, topo: 0.103}`, `legenda_y: 0.87`,
  preset `vitrine` com `forma: "tela"`). O que importa fica nos ~65% de cima; a janela dele cobre o resto.
- **Nada de espaço vazio que não precisava**: faixa 16:9 ou cartão 1:1 boiando no meio do preto é o erro clássico. Se a
  mídia é deitada, grave de novo em pé, ou recorte em 9:16 (em 2x, nítido) a área que importa. Horizontal nunca vira
  9:16 cortado no meio do conteúdo.
- **Legível no celular, antes de tudo.** Se não dá para ler em pé, no tamanho em que aparece, não serve.
- **Limpo.** Uma cor de fundo; nada de janela pequena sobre outra cor, marca d'água, cronômetro, legenda do original,
  barra do navegador, banner de cookies, papel de parede, link privado (borre).
- **Zoom só com motivo**: aproximar o que precisa ser lido ou o detalhe que a fala aponta, com calma (ease, ~1,1–1,6×),
  indo de um destaque ao outro (a referência do Caféra). Nunca o tempo todo, nunca num canto aleatório, nunca no rosto
  dele na tela dividida, nunca zoom dentro de um card. Uma gravação que já anda sozinha (cursor, clique, rolagem, o app
  respondendo) não precisa de zoom. Um print parado ganha um movimento leve até o corte.
- **Tudo vivo e suave**: curvas com ease, nunca lineares; nada congela.

## O material

- **Escolha o melhor para a frase, não o primeiro que serve.** Ordem natural: o que o criador mandou (apoio, banco
  `#projeto`, os brolls dele, que ele nota quando ficam de fora) → gravar de verdade → vídeos oficiais e da comunidade
  (X, Instagram, TikTok, YouTube; registre a URL) → captura de site.
- **Grave quando a frase pede a prova.** O app do criador operado de verdade (o Claude criando no Neo Stitch, o Claude do
  Neo-Obsidian respondendo, o editor com os comentários deste vídeo), gravado em pé ou no recorte 9:16, quadro a
  quadro (`ferramentas/gravar.py`). É o que mais vale e o que faz o vídeo parecer dele.
- **O Claude que aparece é o app desktop, de tela branca**, numa janela grande e limpa; nunca o terminal preto nem uma
  caixa de prompt genérica (parece falsa).
- **Produto em ação vale mais que página**; página só quando a fala cita a própria página. Sites: gravados em pé,
  carregando e rolando devagar para a frente, poucos e demorados. Quando a fala é sobre apps, um app bonito de verdade.
- **O banco e os motions prontos se reaproveitam quando são perfeitos para a frase**, nunca por obrigação. Há muita coisa
  boa lá; reusar o que foi aprovado é bom, encaixar o que "serve mais ou menos" não.
- **Atual, nítido e fluido.** A interface de hoje; resolução que aguenta o 4K (julgue em tamanho real); 0 quadro
  repetido (meça, `mpdecimate`); nunca esticar em câmera lenta — mídia curta pede outra mídia.
- **Asimov**: hub e cursos gravados logado; aulas com o professor ao lado.
- **Verdadeiro.** Nada de imagem gerada fingindo ser app nem número inventado. Animar uma imagem com modelo de vídeo
  (Veo, Kling…) só quando o criador pede ou quando é um conceito, nunca para fingir um produto.

## Motions

- **Estilo 3D** (Three.js, na linha do `entrada-saida-3d`): vidro de arestas acesas, metal, chão que reflete, bloom,
  rótulos curtos em caixa alta, a câmera sempre andando. Poucos elementos, quase nenhum texto: mostrar, não escrever.
- **No palco do vídeo.** Entre telas com o ator na janela, o motion usa o mesmo ator e o mesmo fundo, sem emenda. Vídeo
  real pode tocar dentro da cena (como textura) para provar o conceito.
- **Imitar um app usa o app de verdade** (fontes, cores, janela inteira); a ferramenta que a fala diz que usou aparece de
  verdade, com o texto real.
- **Ideias que se acumulam ficam num motion só**; motions seguidos da mesma história continuam um do outro.
- **Pedido por referência copia a referência**: olhe os quadros dela (ritmo, troca, tamanho, curva, material).
- Algo já na tela no 1º quadro; cada elemento entra na palavra que o nomeia.

## Som

- **Som preso ao que acontece**: o clique quando há clique, a digitação enquanto as letras aparecem, um pop quando algo
  surge. Nenhum som sem movimento visível; nada que entra muda sem som. Nunca whoosh nem riser.
- Trilha só instrumental, baixa; a voz na frente, com o timbre `encorpada`.

## Fala, cortes e texto na tela

- A fala nunca é reescrita. Cortes colados na voz, sem pausa (exceção: ênfase na frase final); a última tentativa
  válida de cada trecho; repetição só se for ênfase.
- Card, lettering, preço, nome: entram na palavra falada. Lettering grande só para a palavra do ManyChat; sobre o ator
  ou um insert real, nunca sobre um motion com texto.
- A legenda nunca cobre o conteúdo; some sob um lettering ou um motion com texto no meio. "Claude", não "Cloud".

## Por formato (só o que muda)

- **CTA**: continua o que o corpo acabou de mostrar; cada insert é um projeto forte do criador ou uma aula com o
  professor; fecha no ator em tela cheia ("é só clicar no link"); a trilha continua a do corpo.
- **VSL**: mais longa, o mesmo gosto; cursos citados entram na `trilha-formacao`.
- **Pico, "sim sim sim"**: a pergunta com material forte em cima; o "Sim" num zoom seco no ator, rápido; música baixa.
- **Vídeo de dúvida** (ele lê uma pergunta): abre com o comentário sobre um insert, ele embaixo respondendo.

## Referências aprovadas

- **Claude Code Apps 2 · v25** (`projetos/claude-code-apps-2`, na Calibragem): o palco contínuo, a tela dividida padrão,
  o material gravado em pé, os sons presos à ação.
- O Reel de referência da janela do ator (instagram.com/reel/DVhNGTAjPwu) e o do Caféra, para os zooms calmos
  (instagram.com/reel/Df4ZSccBubu).
- Os vídeos aprovados na Calibragem do app, por categoria (`biblioteca/exemplos/<categoria>/`): ritmo e escolhas de
  direção, para consultar quando quiser um exemplo.

## Recusado (não volte)

Janelas do Mac com zoom nas caixas · tela dividida 70/30 · estúdio branco em 3D · vários cards na tela ao mesmo tempo ·
"passeio de câmera" 3D num app · zoom no rosto na tela dividida · zoom sem detalhe a mostrar · entradas deslizando ·
whoosh e riser · trilha com voz · o terminal preto como "Claude Code" · caixa de prompt genérica · imagem gerada fingindo
produto · câmera lenta esticada · página poluída ou rolando rápido · sites demais trocando rápido.
