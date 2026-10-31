# 15 · Carrossel

Um carrossel é uma sequência de slides 4:5 (1080×1350, de 1 a 20) para o feed. Você escreve tudo: o texto, a ordem,
o tipo de cada slide e a mídia. O criador só escolhe o **preset** no app (o visual; troca ao vivo, sem versão nova) e
comenta por slide. Mora em `carrosseis/<slug>/`: `carrossel.json` (nome, tipo, origem, pedido, preset), `entrada/` (os
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
  do vídeo editado (`final/`): ele tem a legenda queimada.
- **Cru**: o pedido (briefing, copy, nota do Obsidian) e os arquivos de `entrada/`. Quando o pedido vier de uma skill de
  copy de carrossel, siga a copy dela. A mídia que faltar, busque como num insert (`etapas/04-inserts.md`: banco,
  captura do site, fontes oficiais), nunca inventada.

## Escrever

- O slide 1 é o gancho (a promessa do carrossel); um ponto por slide; o último fecha (o CTA, quando houver).
- Pouco texto por slide: o título em uma ideia, o texto em duas ou três frases. O texto encolhe para caber (até 60%),
  mas texto encolhido é sinal de que o slide está cheio: divida.
- **Destaque**: `**palavra**` no título ou no texto. Cada preset tem o seu jeito (marca-texto, cor, itálico, etiqueta).
  Use para a palavra ou o número que carrega o slide, uma ou duas por slide.
- Mídia que prova o que o texto diz (o print, o gráfico, a tela), como nos inserts.
- A **legenda** do post vai junto (no derivado, adapte a do vídeo).

## Os slides (`versoes/vN.json`)

```json
{"slides": [
  {"tipo": "capa", "titulo": "Testei a skill que promete cortar **65%** dos tokens", "texto": "Será que funciona?"},
  {"tipo": "texto-imagem", "texto": "…", "midia": "midia/grafico.png", "ajuste": "conter", "porque": "o print prova o número"},
  {"tipo": "texto-video", "texto": "…", "midia": "midia/demo.mp4", "som": false},
  {"tipo": "cta", "titulo": "…", "texto": "…", "acao": "Comente IA"}
 ],
 "legenda": "…"}
```

| tipo | o que é | campos |
|---|---|---|
| `capa` | o gancho, grande (mídia opcional abaixo) | `titulo` (e `texto`) |
| `texto` | só texto | `titulo` e/ou `texto` |
| `texto-imagem` | texto em cima, imagem embaixo | `texto`/`titulo`, `midia` (imagem) |
| `texto-video` | texto fixo em cima, vídeo embaixo | `texto`/`titulo`, `midia` (vídeo), `som` |
| `midia` | imagem ou vídeo ocupando o slide, texto opcional por cima | `midia`, `texto`/`titulo` |
| `cta` | o fechamento | `titulo`/`texto`, `acao` (o botão) |

- `ajuste`: `cobrir` (padrão; corta para preencher) ou `conter` (inteira, com faixas; prints e gráficos).
- `som`: o vídeo leva o áudio dele. Ligue quando a fala do trecho importa; gravação de tela e demonstração vão mudas.
- `porque`: o porquê do slide (o app mostra; o criador pergunta).
- `midia`: o caminho dentro do carrossel (`midia/…`), sempre posto pelo `carrossel.py midia`.

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
(x, y em % do slide) diz onde ele olhou.

## Aprovado

O app exporta sozinho ao aprovar (e de novo se o preset mudar depois): `final/01.png`, `02.mp4`… na ordem de postar,
e `legenda.txt`. Depois, como no vídeo (`etapas/14-concluir.md`): junte as correções que valem para outros carrosséis,
mostre ao criador e grave só o que ele confirmar, em `biblioteca/aprendizados/carrossel.md`.
