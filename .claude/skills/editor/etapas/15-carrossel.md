# 15 · Carrossel

Um carrossel é uma sequência de slides 4:5 (1080×1350, de 1 a 20) para o feed. Você escreve tudo: o texto, a ordem,
o tipo de cada slide e a mídia. O criador só escolhe o **preset** e o **destaque** no app (o visual; troca ao vivo, sem
versão nova) e comenta por slide. Mora em `carrosseis/<slug>/`: `carrossel.json` (nome, tipo, origem, pedido, preset, destaque), `entrada/` (os
arquivos que ele subiu), `midia/`, `versoes/vN.json` (os slides), `revisoes/vN.json` e `final/` (o export).

> **Antes de começar, leia `biblioteca/aprendizados/carrossel.md`** (se existir): as correções do criador em carrosséis
> anteriores.

## Começo ("Carrossel novo · <slug>")

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
  copy de carrossel, siga a copy dela. A mídia que faltar, busque como num insert (`etapas/04-inserts.md`: banco,
  captura do site, fontes oficiais), nunca inventada.
- **De uma referência da Calibragem** (um Reels antigo, sem projeto): é um cru com o pedido apontando a referência
  (`biblioteca/referencias/<id>/`). O roteiro está em `palavras.json`; o que cada plano mostra está em `analise.json`
  e `quadros/`. Dela só existe o vídeo editado (720p, legenda queimada): capture de novo o site, o GitHub e o print
  (`etapas/04-inserts.md`), e recorte o `proxy.mp4` acima da legenda só quando não houver outro jeito. Números do vídeo
  (estrelas, preços) podem ter mudado: confira e diga quando mudou.

## Escrever

O carrossel é uma **conversa**, não um slide de apresentação: eu contando a história ou explicando o conceito inteiro,
como se estivesse falando com uma pessoa. Nada de título, frase solta e imagem por slide (o carrossel padrão): só
**texto**, com **destaque**.

- **Sem título.** Cada slide é um ou dois parágrafos corridos, na mesma letra; o que precisa saltar vai em
  `**destaque**` (uma ou duas expressões por slide: a palavra, o número, a virada). São 4 presets (Notas, Grafite,
  Código, Etiqueta), cada um com 5 destaques que o criador escolhe.
- **Em 1ª pessoa**: é o criador falando ("testei", "eu uso", "o meu processo"), na voz dele (`biblioteca/exemplos/
  criador.md`), como no vídeo; nunca o narrador de fora ("ele testou", "o criador mostra").
- **Explique de verdade**: o porquê, o como, o exemplo, o que deu errado. É mais texto que no Reels, não menos: de 3 a 6
  frases por slide (o texto encolhe até 60% para caber; encolheu muito, divida em dois slides).
- **Loops abertos**: o slide 1 é o gancho (uma promessa, uma pergunta, um resultado estranho) e não entrega tudo.
  Cada slide fecha abrindo o próximo: uma pergunta que fica, um "só que…", um "mas o que mudou mesmo foi…", a resposta
  que vem depois. Ninguém deve conseguir parar no meio. Feche o loop do gancho só perto do fim.
- **Mídia só quando prova** o que o texto acabou de dizer (o print, o antes e depois, a tela em uso), como nos inserts;
  um slide sem mídia é o normal, não a exceção. Nunca imagem para enfeitar.
- O último fecha a conversa (a conclusão e o CTA, quando houver, com `acao`).
- A **legenda** do post vai junto (no derivado, adapte a do vídeo).

## Os slides (`versoes/vN.json`)

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
  linha em branco a mais (`\n\n\n\n`) é um parágrafo vazio: espaço no slide (é o Enter do criador no app; mantenha).

- `ajuste`: `cobrir` (padrão; corta para preencher) ou `conter` (inteira, com faixas; prints e gráficos).
- `som`: o vídeo leva o áudio dele. Ligue quando a fala do trecho importa; gravação de tela e demonstração vão mudas.
- `porque`: o porquê do slide (para você; o app não mostra).
- `margens`: `{topo, lados, base}` em px do slide, as que o criador ajustou no app; sem elas, vale o padrão do carrossel
  (`margens` no `carrossel.json`, o "Usar como padrão" do app) e, sem padrão, o preset. Mantenha as dele.
- `arrasta`: `true`/`false`, o botão "Arrasta" que o criador ligou ou desligou no slide; sem ele, só o 1º slide tem.
- `midia`: o caminho dentro do carrossel (`midia/…`), sempre posto pelo `carrossel.py midia`.
- `falta`: a mídia que ainda não chegou ("gifs de 2 apps meus"): o slide mostra uma caixa vazia com isso, no lugar dela.
  Use enquanto se acerta a copy; não se aprova nem exporta com `falta` (a `midia` posta tira).

```bash
uv run ferramentas/carrossel.py midia <slug> <arquivo> [--de 12.3 --ate 18.4] [--nome x]   # imagem ou trecho (até 60 s)
uv run ferramentas/carrossel.py versao <slug> <arquivo.json>                                # valida e grava a vN
```

Escreva o JSON num arquivo seu (fora de `carrosseis/`) e grave com `versao`: ele confere tipos, mídias e o limite de
60 s por vídeo. Confira a versão no app (`http://localhost:8719/app/#/c/<slug>`) em dois ou três presets antes de
entregar. Na entrega: o link, quantos slides e as dúvidas.

## Revisão ("Revisão carrossel · <slug> · vN")

```bash
uv run ferramentas/carrossel.py ler <slug> [vN]       # cada comentário com o slide (o texto dele) e o ponto marcado
uv run ferramentas/carrossel.py responder <slug> <vN> <id> --status aplicado|respondido|nao_aplicado --resposta "…"
```

Aplique os comentários numa versão nova (`versao`) e responda cada um numa frase curta (o que mudou). O ponto marcado
(x, y em % do slide) diz onde ele olhou. O criador também edita o texto, o destaque e as margens direto no app, na própria vN (o
`ler` diz em quais slides): a versão nova parte de `versoes/vN.json`, não do seu JSON antigo, e mantém o que ele
escreveu.

## Aprovado

O app exporta sozinho ao aprovar (e de novo se o preset ou o destaque mudar depois): `final/01.png`, `02.mp4`… na ordem de postar,
e `legenda.txt`. Depois, como no vídeo (`etapas/14-concluir.md`): junte as correções que valem para outros carrosséis,
mostre ao criador e grave só o que ele confirmar, em `biblioteca/aprendizados/carrossel.md`.
