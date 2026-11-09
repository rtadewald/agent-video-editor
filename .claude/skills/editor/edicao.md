# O projeto em disco e o edicao.json

Cada vídeo é uma pasta em `projetos/<slug>/`. O `edicao.json` é a fonte de verdade da edição. Ele usa **os mesmos campos
e formatos do `projeto.json` do 18-harness-video-editor** (`../18-harness-video-editor/dados/projetos/*/projeto.json`),
só com o que a edição precisa: na dúvida sobre um formato, o código do 18 é a referência.

## A pasta

```text
projetos/<slug>/
├── edicao.json            o estado da edição (abaixo)
├── briefing.md            o briefing, se houver
├── apoio/                 materiais que o criador mandou
├── audio.wav              voz do bruto, mono 16 kHz (silêncios)
├── silencios.json         {"silencios": [{"inicio","fim","dur"}]}  (−35 dB, ≥ 0,3 s)
├── transcricao.json       {"motor": "elevenlabs", "palavras": [{"id": "w00000", "texto", "inicio", "fim"}]}  (s do bruto)
├── midia/
│   ├── bruto.<ext>        o vídeo como veio (nunca alterado)
│   ├── original/          num 16:9: o enviado; bruto_9x16.mp4 vira a fonte
│   ├── bruto_9x16.mp4     num 16:9: o 9:16 seguindo o rosto
│   ├── proxy/f1.mp4       720p, H.264, quadro-chave a cada 0,5 s
│   ├── rosto/f1.json      o rosto ao longo do vídeo (formato do 18, rosto.py)
│   └── voz/f1_<limpeza>.wav  a voz limpa (DeepFilterNet), 48 kHz mono
├── inserts/<plano>.json   o que cada subagente de insert achou (ver etapas/04-inserts.md)
├── versoes/vN/            cada versão entregue: proxy.mp4, edicao.json (cópia), palavras.json, planos.json, info.json
├── revisoes/vN.json       os comentários do criador sobre a vN (gravado pelo app), os `blocos`
│                          de ~30 s do corpo (nenhum abaixo de 15 s; `finais`: o Finalizar do bloco Final de cada saída) ({id, palavra em que começa, aprovado = finalizado e travado}); a versão
│                          seguinte herda os da anterior
└── final/                 o MP4 final aprovado
```

## O edicao.json

```jsonc
{
  "id": "melhor-ia-design", "nome": "Melhor IA design", "criado_em": "2026-10-10T09:00:00",
  "formato": "reels", "saida": {"largura": 1080, "altura": 1920},
  "fontes": [{"id": "f1", "papel": "bruto", "arquivo": "midia/bruto.mov", "nome_original": "…", "duracao": 122.0,
              "largura": 2160, "altura": 3840, "fps": "24/1", "tem_audio": true, "proxy": "midia/proxy/f1.mp4"}],
  "enquadramento": {"x": 0.5},                    // num 16:9, os campos do 18 (original, feito, versao…)
  "look": {"lut": "casa", "intensidade": 1, "vinheta": "normal"},
  "velocidade": 1.0,                              // 1 a 1,5
  "nivel_voz": {"fonte": "f1", "db": -23.3},      // a fala do bruto (sons.nivel_da_voz)
  "timeline": {"V1": [{"id": "c1", "fonte": "f1", "inicio": 7.235, "fim": 9.045,
                       "palavra_ini": "w00004", "palavra_fim": "w00011"}]},   // s do bruto; `ordem` (s do bruto em que toca) só num trecho movido
  "cortes": {"mantidas": [["w00004", "w00011"]], "duvidas": [{"ini": "w00090", "fim": "w00095", "motivo": "…"}],
             "parametros": {"pausa_max": 0.15, "folga_inicio": 0.06, "folga_fim": 0.04}},
  "direcao": {
    "roteiro": "o roteiro dirigido em texto ([plano: marcação] + fala)",
    "itens": [{"id": "p1", "camada": "plano", "tipo": "tela_dividida_insert", "conteudo": null,
               "palavra_ini": "w00004", "palavra_fim": "w00011", "off_ini": -0.025, "off_fim": 0,
               "texto": null, "descricao": "a marcação", "porque": "por que este plano aqui (curto)"},
              {"id": "e1", "camada": "elemento", "tipo": "lettering", "palavra_ini": "…", "palavra_fim": "…",
               "off_ini": -0.05, "off_fim": 0.15, "texto": "GPT Astra", "descricao": ""},
              {"id": "e2", "camada": "elemento", "tipo": "print_sobreposto", "…": "…", "texto": "36,5 mil estrelas",
               "banco": "96c66b43d8"}]   // print: com `banco`, a mídia num card; sem, uma etiqueta com o texto
  },
  "inserts": {
    "pedidos": [{"id": "p5", "plano": "p5", "tipo": "insert_tela_cheia", "conteudo": null, "formato": "vertical",
                 "palavra_ini": "…", "palavra_fim": "…", "descricao": "…", "texto": null, "fala": "…",
                 "inicio": 11.4, "duracao": 2.1,
                 "midias": [{"id": "m1", "banco": "07857902b4"}],
                 "enriquecimento": {"preset": "96bb3a949b", "ajustes": {}},
                 "comentario": null}],
    "fundo": "gradiente",                         // fundo atrás dos inserts com moldura (ids do 18)
    "ator_planos": {"p3": "zoom_lento"}           // presets do Full ator
  },
  "motions": {"p4": {"tipo": "preset", "preset": "prompt", "nome": "Caixa de prompt", "formato": "vertical",
                     "valores": {"prompt": "…"}, "fundo": "verde_claro"}},
  "transicoes": {"p5": {"id": "corte-camera", "par": "full_ator>tela_dividida_insert"}},
  "audio": {"voz": {"limpeza": "leve", "timbre": "natural"}, "fundo": "lofi-piano", "fundo_mudo": false,
            "niveis": {"ator": 0, "presets": 0, "transicoes": 0, "fundo": 0}, "voz_lufs": {"f1_leve": -27.3},
            "extras": [{"arquivo": "apoio/frase.wav", "palavra": "w00225", "depois": 0.19}]},  // fala gravada à parte, por cima da voz
  "legenda": {"ligada": true, "modo": "palavra", "ajustes": {}}
}
```

## Regras

- **`formato`**: o tipo do conteúdo, `reels` (o único por enquanto), `ad`, `youtube`, `vsl` ou `aula`. O app mostra no
  card do projeto (📱 💰 🎥 📺 📚).
- **`tags`** (opcional): as tags do projeto, como no Banco (`fia/ad-vsl`, sem o #). Só o criador mexe, pelo app.
- **`oculto`** (opcional): `true` tira o projeto da lista do app (fica na vista Ocultos). Só o criador mexe, pelo app.
- **`saidas`** (opcional): as saídas do vídeo, cada uma o **corpo** (`cortes.mantidas`, o comum a todas) + um **final**:
  `{"id": "manychat", "destino": "ManyChat", "final": {"tipo": "falado", "manter": [["w00215","w00225"]]} |
  {"tipo": "cta", "cta": "<slug do CTA>", "transicao": "luz-colorida"} | {"tipo": "nenhum"}, "V1": [clipes do corpo + final,
  só na falada: cortes.py], "aprovado": false, "exportado": {"arquivo", "em", "cta_versao"}}`. `cortes.py` cria e mantém
  (`aplicar` com `finais`, ou `saida`/`tirar-saida`); o app aprova cada uma (e o Aprovar do projeto, todas). Linhas antigas
  sem `final` (do `encaixar.py` antigo) são só registro.
- **`saida`** num item de `direcao.itens`, em `audio.extras` ou num ajuste de `legenda.ajustes`: a direção do **final de
  uma saída** (o plano, o motion, a fala gravada à parte, a palavra escondida da legenda que só aquela saída tem). Sem
  `saida`, vale para todas; com, só entra no render dela (no corpo e nas outras, fica de fora).
- **Tudo depois dos cortes fica preso às palavras** (`palavra_ini`/`palavra_fim` + `off_ini`/`off_fim` em s). Os tempos no
  vídeo final nunca são a fonte de verdade: são calculados (cortes + velocidade). `inicio`/`duracao` dos pedidos são cache.
- **Ids dos planos** `p1, p2…` na ordem; elementos `e1, e2…`. Pedidos de insert usam o id do plano. Transições usam o id
  do plano que entra.
- **Categorias fixas** (as do 18): planos `full_ator`, `full_ator_lettering`, `insert_tela_cheia`, `motion_tela_cheia`,
  `tela_dividida_insert`, `tela_dividida_motion`, `comentario_insert_ator`; elementos `lettering`, `palavra_manychat`,
  `caixinha_perguntas`, `print_sobreposto`. Têm insert: `insert_tela_cheia` (formato `vertical`), `tela_dividida_insert` e
  `comentario_insert_ator` (formato `dividida`).
- **Caminhos** dentro do projeto são relativos à pasta do projeto. Mídia de insert mora no banco
  (`biblioteca/banco/<id>/`), referenciada pelo id.
- Os originais (`midia/bruto.*`, `midia/original/`) nunca são alterados.
