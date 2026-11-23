# 12 · Vídeo final

O criador aprovou uma versão no app ("Aprovado · <slug> · vN"), **uma saída** ("Aprovado · <slug> · saída <Destino>") ou
por mensagem. Se foi por mensagem, marque a versão como
aprovada no app, igual ao botão: `aprovado: true` em `projetos/<slug>/revisoes/vN.json` (crie o arquivo com
`{"projeto", "versao", "aprovado": true, "enviado_em": null, "comentarios": []}` se não existir). Os selos "Usado em
vídeo" do banco e dos motions saem da versão aprovada.

**Aprovar não é pedir o export** — num corpo (Reels, VSL, ad): só exporte o que o criador pedir, no destino que ele
disser; um "aprovado" sem pedido de export: marque, conclua (`14-concluir.md`) e pergunte o que exportar e para onde.

**O CTA aprovado é pré-exportado** (a exceção): o projeto da página CTAs é uma peça que entra pronta nos corpos, pelas
saídas. Aprovou um CTA (ou uma versão nova dele) → o app já dispara o export do final em segundo plano (`servidor.exportar_cta`, log
em `.cache/export-final.log`); aprovado pelo chat, exporte você, logo, sem perguntar (`render.py <cta> --final`; para não esperar a foto do 4K, rode `--camadas --final` assim que entregar a versão que pode
ser a aprovada). Quem pluga o CTA não renderiza nem abre o projeto dele: usa esse final (ver as saídas, abaixo e em
`02-cortes.md`). Para conferir o que falta: um CTA aprovado cujo final em `final/` é mais velho que a versão aprovada
precisa ser exportado de novo. (2026-10-19/20: o criador parou o export de 16 CTAs quando eu comecei sem combinar, e
depois combinou este processo, porque esperar o CTA a cada encaixe "demorou demais".)

```bash
uv run ferramentas/render.py <slug> --final
```

- Usa o `edicao.json` atual. Se ele mudou depois da vN aprovada (confira com `versoes/vN/edicao.json`), avise e pergunte
  antes: o aprovado é a vN.
- Sai em `projetos/<slug>/final/<nome>.mp4`: 2160×3840 (4K), HEVC, 24 fps, AAC 320 kbps, −14 LUFS. **Sempre
  junto, na mesma pasta, `<nome>.md`: a transcrição do vídeo** (a fala que ficou no corte, em parágrafos, com
  a grafia corrigida), que o criador usa para a legenda do post e o Obsidian. O render grava os dois; confira que o
  `.md` saiu e entregue os dois caminhos. As saídas com CTA (`encaixar.py`) também saem com o `.md` ao lado.
- Entregue com o caminho e `open -R "<arquivo>"` (abre o Finder no arquivo).
- **Projeto com saídas** (`cortes.py saidas <slug>`): o Aprovar do projeto aprova todas — exporte todas com
  `uv run ferramentas/render.py <slug> --saidas`; "Aprovado · <slug> · saída <Destino>" é só uma: `--saida <id>`. Cada
  uma sai em `final/<nome> - <destino>.mp4` + `.md`: a falada renderizada em 4K com o final; a de CTA, o final do
  corpo emendado no final **pré-exportado** do CTA (`encaixar.py`, com a transição destacada: só a emenda e o áudio, o CTA não é renderizado; sem o final do CTA, exporte-o antes); a sem
  final, o corpo com o nome da saída. Exportar de novo substitui o arquivo da saída. É essa pasta que a `publicar` usa.
  **Exportar as saídas inclui o corpo sozinho**: se o projeto ainda não tem uma saída sem final, crie
  (`cortes.py saida <slug> "Corpo" --nenhum`) e exporte junto (`render.py <slug> --final --saida corpo`); sai em segundos
  do corpo em 4K do cache. _design-por-imagem · 2026-10-28_
- **Corpo aprovado no app** (card ou revisão): o app já fotografa a camada em 4K em segundo plano
  (`servidor.pre_render_final`, `render.py <slug> --camadas --final`, log em `.cache/export-final.log`); o export das
  saídas que o criador pedir só monta. Aprovado pelo chat, rode você o mesmo em segundo plano.
- **Em `final/` só ficam as entregas**, cada vídeo com o seu `.md`, sem subpasta e sem data no nome (exportar de novo
  substitui). O corpo em 4K que as saídas usam fica no cache (`.cache/final/corpo.mp4`): feito uma vez e reaproveitado
  enquanto o que ele mostra não muda (exportar, renomear ou mexer nas saídas não o refaz). (2026-10-20: o criador achou
  "uma bagunça" a pasta `saidas/` dentro de `final/` e uma cópia datada do corpo a cada saída exportada.)
- Depois, a vN aprovada vira referência da Calibragem (sem Gemini; refazer substitui):

  ```bash
  uv run ferramentas/calibragem.py de-projeto <slug> vN
  ```

  Diga ao criador que o vídeo está na Calibragem do app como "a revisar" (com os comentários das revisões guardados):
  ele confere a direção e marca como revisado. Só aí ela entra nos roteiros de exemplo e ensina a direção.

Tempo esperado: ~1 min por minuto de vídeo com a camada do 4K já no cache; sem ela, a foto da camada em 4K leva ~4 min
a mais por vídeo de 45 s. Por isso, **quando entregar uma versão que pode ser a aprovada** (sem comentários pendentes,
ou o criador falou em exportar), rode em segundo plano `uv run ferramentas/render.py <slug> --camadas --final`: o
`--final` acha a camada pronta e só monta.

O cache da camada (ProRes 4444 em 4K: ~1 GB por 10 s) não fica para sempre: o servidor apaga o `.cache/camadas` e o
`.cache/trechos` de um projeto **aprovado e parado há 3 dias** (`servidor.limpar_caches_parados`; à mão:
`uv run ferramentas/servidor.py --limpar-caches [dias]`). O `.cache/final/corpo.mp4` fica. Um export depois disso
fotografa a camada de novo: rode o `--camadas --final` em segundo plano antes, se o criador avisar que vai exportar.

Depois, **conclua o vídeo**: `14-concluir.md` (aprendizados com o criador, tags e faxina do banco).
