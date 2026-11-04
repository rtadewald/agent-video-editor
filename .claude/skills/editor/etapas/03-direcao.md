# 03 · Direção visual

Você escreve o **roteiro dirigido** do vídeo já cortado: o que aparece na tela em cada momento da fala, do jeito que o
criador dirige. Não mexe em mídia: só a "partitura visual". Inserts, motions, transições e legenda partem dela.

> **Antes de começar, leia `biblioteca/aprendizados/direcao.md` e `biblioteca/aprendizados/elementos.md` (+ os `exemplos/<categoria>/aprendizados/` dos dois, do quadro do vídeo)**: o que o criador já corrigiu em vídeos anteriores. Não repita esses erros. Os princípios (poucos) estão nas Regras do criador, `exemplos/<categoria>/regras.md`.

## Antes de escrever: aprenda o estilo

A direção vem **sempre e só da categoria do vídeo em edição** (o quadro: 📱 Storytelling Projects, 📱 Hacks & Tips, 💰 Pico, 💰 Ad VSL, 💰 CTA, 📺 VSL…): nunca misture exemplos de outra
categoria. Descubra qual é e onde estão os exemplos dela:

```bash
uv run ferramentas/calibragem.py exemplos <slug>    # a categoria do projeto, a pasta e quantos vídeos estão em uso
```
Os exemplos são os vídeos da categoria que o criador não ocultou na Calibragem: ele decide quais servem, então leia todos. Sem
nenhum vídeo da categoria em uso, dirija pelas regras dela e avise o criador na entrega.

1. Leia `biblioteca/exemplos/criador.md` (quem grava e do que o canal fala) e `biblioteca/exemplos/<categoria>/regras.md` inteiro. As **Regras do
   criador** são obrigatórias; as sugeridas são guia.
2. Leia `biblioteca/exemplos/<categoria>/favoritos.md`: os planos que o criador marcou com ★ na galeria de Referências do app. São os melhores
   exemplos dele: quando um momento do vídeo novo se parece com um deles, siga aquele padrão.
3. Leia **todos** os roteiros de `biblioteca/exemplos/<categoria>/roteiros/` como um editor novo lê os roteiros anotados
   do chefe: entenda, pela fala, por que cada coisa aparece onde aparece. O que está sendo dito manda. Os marcados
   "(revisado)" foram corrigidos pelo criador e valem mais que os outros.

Esses arquivos são gerados pela Calibragem do app (`calibragem.py roteiros`): quando o criador oculta ou mostra um vídeo,
revisa uma referência ou favorita um plano, eles mudam. Não os edite à mão (as regras, sim: `regras.md`).

## Rodar

```bash
uv run ferramentas/direcao.py fala <slug>               # a fala do vídeo cortado, texto corrido + duração
# você escreve projetos/<slug>/roteiro.md
uv run ferramentas/direcao.py aplicar <slug> projetos/<slug>/roteiro.md
```

O `aplicar` alinha a fala às palavras reais (código, sem IA), monta os planos presos às palavras, lê os letterings e
cria os pedidos de insert. Ele imprime a tabela dos planos: confira tempos, tipos e quantas palavras casaram (devem
casar todas; se não, você alterou a fala — corrija o roteiro).

## O formato (o mesmo dos exemplos)

```text
[Comentário + insert + ator «Qual a melhor IA do mundo pra design?»: o card do comentário sobre o print do site da Vesper]
> abre com a pergunta do seguidor: regra do criador para vídeo de dúvida
“Qual a melhor IA do mundo pra design?”

[Tela dividida · insert: o site do GPT Astra abrindo; zoom no título]
> a fala cita a ferramenta: mostrar a ferramenta
refs: REF-12·p4, REF-07·p31
“cara, a galera considera o <lettering>GPT Astra</lettering>,”

[Full ator: —]
“só que na minha opinião isso é uma bobagem,”
```

- Uma linha `[plano: marcação + elementos]`, opcionalmente uma linha `> porquê` (curto: por que esse plano aqui), a
  linha `refs:` (abaixo) e a fala entre aspas. Bloco após bloco, até o fim.
- **Na marcação de um insert**, conte o que acontece, em ordem: qual material aparece (o site, a página, a ferramenta,
  concretos), como entra, zooms (em quê), destaques, trocas de um material para outro. Não descreva o layout que o nome
  do plano já diz (tela dividida, apresentador embaixo). Fala que cita mais de uma coisa ("esses dois sites"): mostre
  cada uma e diga quando troca.
- **`refs:` as refs para modelar o plano** (todo plano com insert ou motion; no Full ator, só se o exemplo tiver algo
  que valha copiar). Cada corte dos roteiros de exemplo e dos favoritos traz a `ref:` dele (`REF-12·p4`: o plano da
  Calibragem, que o criador aprovou). Para cada plano seu, escolha **1 a 3 refs** dos exemplos cuja **fala** e **tipo**
  mais se parecem com os dele: os favoritos primeiro, depois os vídeos "(revisado)". É por essas refs que a execução
  (inserts, enriquecimento, motions) vai modelar o plano, em vez de escolher um preset ao acaso: escolha as que mostram
  o que este momento pede, não só o mesmo tipo de plano. Sem nenhuma parecida, deixe sem a linha (a execução escolhe
  livre). O `aplicar` confere se cada ref existe e avisa as que não.
- **Planos** (use estes nomes): Full ator · Full ator com lettering «texto» · Insert tela cheia · Motion tela cheia ·
  Tela dividida · insert · Tela dividida · motion · Comentário + insert + ator «comentário».
- **Elementos** (na marcação, com "+"): + palavra manychat «PALAVRA» · + caixinha de perguntas «pergunta» ·
  + print/imagem sobreposta «o que é» · + tarja «texto do post» (a caixa branca no alto, nos primeiros segundos).
- **Lettering** (destaque de palavras) vai **na fala**, não na marcação: `<lettering>GPT 3.7</lettering>`, ou
  `<lettering texto="R$ 97">noventa e sete reais</lettering>` quando o texto na tela é diferente do falado. Uma tag por
  trecho, sem aninhar. Sobre o ator em tela cheia, o certo é o plano Full ator com lettering.

| Plano | O que é |
|---|---|
| Full ator | O apresentador ocupa a tela. Zoom no ator continua sendo Full ator (o zoom é do Enriquecimento). |
| Full ator com lettering | O ator em tela cheia com um texto grande de destaque; dura só enquanto o texto está na tela. |
| Insert tela cheia | Material **real** na tela toda, sem o ator: gravação de tela, site, app, print, foto, vídeo de apoio. |
| Motion tela cheia | Peça gráfica **animada**, feita para o vídeo, na tela toda. |
| Tela dividida · insert | Material real em cima, o ator embaixo. |
| Tela dividida · motion | Um motion em cima, o ator embaixo. |
| Comentário + insert + ator | O card do comentário de um seguidor sobre um insert/motion em cima, o ator embaixo respondendo. |

## Regras do formato

- Copie a fala **exatamente** como está, na ordem, sem pular, resumir ou corrigir nada. Você só divide em blocos,
  escreve a marcação e marca os letterings.
- Dirija no ritmo dos exemplos: blocos **curtos** (de meia frase a uma frase, poucos segundos). Um bloco novo a cada
  mudança do que aparece (uma nova tela, ação, ideia, ferramenta citada). Na dúvida, divida. As linhas da fala não são
  blocos.
- A marcação diz o que mostrar e o que acontece, ligado à fala, concreta e acionável, em 1 a 3 frases. Nunca descreva o
  layout que o nome do plano já diz. Num Full ator sem nada especial: "—".
- **Inserts**: a marcação conta o que acontece no insert, em ordem: qual material (o site, a página, a ferramenta,
  concretos — é o que o subagente vai buscar), como entra, zooms (em quê), destaques, trocas. Se a fala cita duas coisas
  ("esses dois sites"), mostre as duas e diga quando troca.
- Não invente fatos que a fala não sustenta; se a fala cita uma ferramenta, mostre a ferramenta.
- **Lettering** (aprendizado do editor, não regra do criador): sobre o ator (Full ator com lettering) ou sobre um insert
  real, nunca sobre um **motion** que já tem texto (os dois textos se atropelam). Uma palavra ou expressão curta — o nome
  da ferramenta, o número —, não a frase. Enquanto o lettering está na tela, a legenda daquelas palavras some.
- Pense já no que é **achável**: um site, um produto, um repositório, um print de anúncio oficial. Ideias abstratas
  ("o conceito de produtividade") pedem motion ou Full ator, não insert.

## Depois de aplicar

- Dúvidas suas sobre a direção (ex.: "não sei se é pergunta retórica ou leitura de comentário"): anote para dizer
  no chat, na entrega.
- Confira as Regras do criador contra o resultado (abertura, máximo de 3–4 s de Full ator seguido etc.). Se violou,
  reescreva o trecho e aplique de novo.
- As três que mais escaparam (claude-mods: voltaram em três revisões), confira uma a uma no roteiro:
  - **lista na fala → um plano por item**, cada um na sua palavra ("Skills, MCPs e mods"; "painéis, botões, alertas");
  - **lançamento de produto → a página do anúncio em tela cheia primeiro**, depois os vídeos do produto em uso;
  - **nome de ferramenta ou mod → `card-nome`** em tela dividida, nunca a página do repositório.

Tempo esperado: ~2 min.
