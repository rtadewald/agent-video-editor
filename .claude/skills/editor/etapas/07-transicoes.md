# 07 · Transições

Em cada troca de plano, uma transição com som. O padrão vem das **favoritas que o criador marcou por par de grupos**
(de onde sai → para onde vai): Full ator · Tela dividida · Tela cheia (9 pares, 2 favoritas cada, em
`biblioteca/transicoes/ordem.json`).

> **O gosto está em `guias/padrao.md`** (leia antes de começar). Aqui fica só o como.

## Rodar

```bash
uv run ferramentas/transicoes.py listar            # a biblioteca e as favoritas de cada par
uv run ferramentas/transicoes.py variar <slug>     # cada corte recebe uma das 2 favoritas do seu par, meio a meio
```

Sem escolha, o corte usa a 1ª favorita do par. `variar` dá variedade sem sair do gosto do criador; rode sempre na v1.

## A biblioteca (7)

| id | efeito | som |
|---|---|---|
| `corte-seco` | nenhum | — |
| `corte-clique` | seco | clique |
| `corte-camera` | seco | câmera |
| `subida-ao-corte` | seco | riser que termina no corte |
| `luz-colorida` | luz colorida varre o quadro | clique |
| `zoom-desfoque` | aproxima e desfoca até o corte | whoosh |
| `brilho-branco` | véu branco sobe até o corte | riser |

## À mão

Em `edicao.transicoes["<plano que entra>"] = {"id": "<transição>", "par": "<tipo_de>><tipo_para>"}` (o par com os tipos
exatos dos dois planos; `transicoes.py variar` mostra). Use para dar peso a um momento (virada do vídeo → `brilho-branco`
ou `zoom-desfoque`) ou para limpar excesso (três efeitos seguidos cansam: troque o do meio por `corte-seco`). Para voltar
ao padrão, apague a chave.

## Som em toda entrada

Todo insert ou motion que entra tem som no corte. Se ele mesmo já soa no 1º instante (um preset com som de entrada, um
motion que abre com pop), o corte fica seco; se entra mudo (o Corte seco só soa nas trocas internas), o corte ganha som
sem efeito na imagem: `corte-camera`, ou `corte-clique` vindo da tela cheia e entre motions de uma mesma sequência.
Entre dois planos que continuam a mesma imagem (o fim de um motion é o começo do outro), corte seco, sem som. As voltas
ao Full ator ficam na 1ª favorita do par. Confira no `audio.json` da versão: nenhum corte para insert sem som e nenhum
som sem algo mudando na tela. _design-por-imagem v15–v17_

Tempo esperado: segundos.
