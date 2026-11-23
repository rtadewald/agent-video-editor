# 05 · Enriquecimento

Como as mídias de cada insert aparecem (onde fica cada card, como entra, se mexe e sai, com os sons de apoio) e o
movimento de câmera nos planos de Full ator, quando o plano usa os inserts com **presets** (`biblioteca/presets/`):
receitas que se adaptam ao nº de mídias, à proporção e à divisão da tela. São uma opção, não o caminho obrigatório: no
palco contínuo (`06-…`) a composição é sua.

**Vídeo deitado (16:9)**: os mesmos presets. Lado a lado, a mídia que não tem a proporção da área (9:8) vai num card
centrado, inteira, sobre o fundo dos inserts (use `chuva`, o oficial); na tela cheia, a mídia horizontal (até 3:2) ocupa a
tela e a em pé vira card. O "ator embaixo" (`divisao: atras`) não existe deitado. Os motions tocam no palco da dividida
(1080×960): lado a lado, na área do insert; na tela cheia, centrados na altura toda, com o fundo do motion nas laterais.

> **O gosto está em `guias/padrao.md`** (leia antes de começar). Aqui fica só o como.

## Rodar

```bash
uv run ferramentas/presets.py listar              # os aprovados: nome, onde vale, nº de mídias, proporções, sons
uv run ferramentas/presets.py escolher <slug>     # cada insert com mídia e sem preset recebe o 1º favorito da situação
```

**A cada leva de inserts que fica pronta** (4–6 ligados): os presets e o zoom desses inserts e,
em segundo plano, o pré-render (fotografa a camada do que já está pronto para o cache; se um já está rodando, sai sem
fazer nada e o próximo pega o resto):
```bash
uv run ferramentas/render.py <slug> --camadas     # em segundo plano (run_in_background)
```

`escolher` usa as favoritas que o criador marcou por **situação** (modo de tela × nº de mídias × proporção, em
`biblioteca/presets/ordem.json`). Ele imprime a escolha de cada insert e o motivo.

**Depois, modele cada insert pelas refs do plano** (`refs` no pedido, vindas da linha `refs:` da direção). O
`escolher` só olha a situação (modo de tela × nº de mídias × proporção), não o que o momento pede: foi assim que entraram
presets sem sentido. Para cada insert com refs:
1. Abra cada ref: `uv run ferramentas/codigo.py REF-12·p4` dá o vídeo, o intervalo, a marcação e, se houver, o preset
   que **nasceu daquele trecho** (`virou preset: PRE-17 …`). Olhe o trecho de verdade (4 a 6 quadros com o ffmpeg), não
   só a descrição.
2. **Se uma ref virou preset, use esse preset.** Senão, use o preset aprovado cujo efeito **reproduz o que a ref mostra**
   (como a mídia entra, se fica parada ou tem zoom, como sai; `presets.py listar`), e afine com os `ajustes` (abaixo).
3. **Se nenhum reproduz, fique no simples** (a mídia na área, sem efeito: "Corte seco") — nunca um preset vistoso que a
   ref não pede. Anote no `porque` do plano a ref que modelou e o preset (ex.: `como REF-12·p4; PRE-17`), e diga na
   entrega os inserts que ficaram simples por falta de preset (são candidatos a preset novo, `13-presets-novos.md`).

Os inserts sem refs ficam com a escolha do `escolher` (o favorito da situação).

## O zoom

Só com motivo (o guia): sem alvo, sem zoom dirigido (tela dividida: `camera: Parado`; print parado em tela cheia:
`camera: Leve`); zoom dirigido (Mergulho, `zoom: Mais`, `zona`) só para o detalhe que a fala aponta, com a zona
escolhida olhando o quadro e o detalhe inteiro e legível no último quadro do plano.

## Quando trocar à mão

Edite `inserts.pedidos[i].enriquecimento` no `edicao.json`:
- `preset`: o id de outro preset que sirva (`presets.py listar`). Varie entre inserts vizinhos parecidos para o vídeo
  não ficar repetitivo; mantenha o favorito nos inserts mais importantes (abertura, a ferramenta principal).
- `ajustes` (só este insert; escolher a opção que o preset já é = não mexer):

| id | opções | efeito |
|---|---|---|
| entrada · saida | Lenta · Normal · Rápida | duração da entrada/saída ×1,4 ou ×0,7 |
| zoom | Menos · Normal · Mais | quanto o zoom aproxima |
| zona | Topo à esquerda … Base à direita (3×3) | ponto da imagem que fica parado no zoom de saída |
| forma | Card · Tela toda | card centrado com cantos e sombra, ou a área inteira (só se a mídia não for cortada) |
| camera | Parado · Leve · Mais | zoom lento contínuo: 0, 1,5 %/s, 3 %/s |
| desfoque | Sem · Normal · Mais | desfoque na entrada |
| tamanho | Menor · Normal · Maior | tamanho do card ×0,86 / ×1,12 |
| proximo | Antes · Normal · Depois | quando a mídia seguinte entra |
| deslize | Pouco · Como na referência · Até a borda | só em card que transborda e desliza |
| som | Sem · Baixo · Médio | os sons de apoio do preset neste insert |
| y · largura | "−25…25" · "70…130" (texto) | sobe/desce os cards (% da área) · largura (%) |

Ex.: um print com texto pequeno pede `"zoom": "Mais"` e `"zona"` no ponto do texto; uma sequência rápida de 3 mídias
num insert curto pede `"entrada": "Rápida"`.

**A tela dividida padrão é o "ator embaixo" na janela** (o layout do Claude Code Apps: o insert ou o motion em cima,
ele numa janela larga embaixo, com a cabeça saindo por cima, "meio recortado"). Todo insert de tela dividida leva
`enriquecimento.divisao: "atras"` e `enriquecimento.ator: {"modo": "janela", "escala": 0.75, "y": 1.0125, "topo": 0.103}`
(o `presets.py escolher` já põe); todo motion de tela dividida vai em `formato: "vertical"` com o mesmo `ator` e
`legenda_y: 0.87`, e a cena dele fica no espaço de cima (13–68% da altura). A metade de cima com ele cortado embaixo
(o `metade` antigo) só se o criador pedir. Precisa do recorte da silhueta: rode uma vez por projeto, em segundo plano,
`uv run ferramentas/recorte.py <slug>`. _impeccable v4 c1 · 2026-11-23 (o criador: "esse deve ser o padrão a partir de agora")_

## Full ator

Em `inserts.ator_planos[<plano>]`: `zoom_lento` (+3 %/s, até +15 %, nunca para) ou `zoom_seco` (+18 % de uma vez, até o
fim do plano). O centro é o rosto. Proposta inicial (ajuste com as revisões do criador):
- Full ator de 3 s ou mais → `zoom_lento`;
- frase curta de impacto (conclusão, virada, "e o mais curioso é…") → `zoom_seco`;
- dois Full ator seguidos (separados por um corte) não usam o mesmo movimento.

## Fundo e card do comentário

- `inserts.fundo`: o fundo atrás dos inserts com moldura, para o vídeo todo: `gradiente` (padrão, escuro), `chuva`
  (vídeo escuro), `verde_claro`, `papel`, `nevoa`. Mídias escuras pedem fundo claro e vice-versa.
- Comentário + insert + ator: o card usa o texto do plano; `pedido.comentario` aceita `{"avatar": 0-4, "escala": 0.6-1.3,
  "x": %, "y": %}` só se a posição automática cobrir algo importante; `"ate": "<id da palavra>"` tira o card depois dessa
  palavra e o plano segue com o mesmo insert e a mesma divisão (no sim sim sim, o card some no "Sim"; e a foto, `avatar`,
  muda a cada pergunta). _simsim-aplicativos v4 c2/c3 · 2026-10-21_

Tempo esperado: < 1 min.
