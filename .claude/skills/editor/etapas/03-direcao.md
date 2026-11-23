# 03 · Direção visual

Você escreve o **roteiro dirigido** do vídeo já cortado: o que aparece na tela em cada momento da fala, do jeito que o
criador dirige. Não mexe em mídia: só a "partitura visual". Inserts, motions, transições e legenda partem dela.

> **O gosto está em `guias/padrao.md`** (leia antes de começar). Aqui fica só o como.

## Antes de escrever

Leia o guia (`guias/padrao.md`) e pense o vídeo inteiro antes de dividir em planos: o que prova cada frase, onde o
material é real e onde é conceito (motion), onde ele fala direto com a câmera, qual o ritmo. Os vídeos aprovados da
categoria ficam na Calibragem (`calibragem.py exemplos <slug>` dá a pasta: `regras.md`, `favoritos.md`, `roteiros/`):
consulte quando quiser ver como um momento parecido foi resolvido, sem obrigação de copiar.

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
  cada uma e diga quando troca. **Seja concreto:** quando já sabe, diga o material exato (a URL, o id do banco, o
  arquivo do apoio, o instante do vídeo, a região que importa: "o recorte do nome do repositório", "a linha 10 do
  SKILL.md"). Marcação vaga ("uma notícia sobre…") vira busca no escuro e insert fraco.
- **`refs:` (opcional) as refs para modelar o plano**, quando um plano aprovado da Calibragem mostra bem o que você quer. Cada corte dos roteiros de exemplo e dos favoritos traz a `ref:` dele (`REF-12·p4`: o plano da
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
- Um bloco novo a cada mudança do que aparece (uma nova tela, ação, ideia, ferramenta citada); as linhas da fala não são
  blocos. A marcação diz o que mostrar e o que acontece, concreta (o material exato quando você já sabe); num Full ator
  sem nada especial: "—".
- Os tipos de plano são ferramentas, não um molde: um plano de motion pode ser qualquer composição (o palco contínuo, a
  tela dividida padrão do guia, um 3D com vídeo real dentro). Escolha o que serve à frase.

## Depois de aplicar

- Dúvidas suas sobre a direção (ex.: "não sei se é pergunta retórica ou leitura de comentário"): anote para dizer
  no chat, na entrega.
- Releia o roteiro contra o guia (a abertura, o ritmo, o que cada frase prova) e reescreva o que não passar.
