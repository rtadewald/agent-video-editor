# 14 · Concluir um vídeo: aprendizados, tags e faxina do banco, e encerramento

Depois do vídeo aprovado e exportado (`12-final.md`), feche o ciclo: aprendizados, tags e faxina do banco e, quando o criador
disser que acabou, o encerramento (o passo 4). É aqui que a skill aprende: o que o
criador corrigiu num vídeo não pode se repetir no próximo.

## 1. Aprendizados (com o criador)

1. **Junte o que aconteceu no vídeo:** `uv run ferramentas/revisao.py historico <slug>` (todas as revisões, versão a
   versão: cada comentário com o bloco e a sua resposta, e os blocos que voltaram a ser comentados; os anexos de cada
   um com `revisao.py ler <slug> vN`); o que ele respondeu no chat às suas dúvidas; e o que você mesmo teve de corrigir
   na autorrevisão.
2. **Analise por que errou.** Cada comentário é um erro seu que o criador teve de apontar; os do mesmo assunto que
   voltaram no mesmo bloco numa versão seguinte (a primeira solução não resolveu) ou ficaram `nao_aplicado` pesam mais. Para cada um, a causa:
   - **pedido mal entendido** (você fez outra coisa): o que na fala dele devia ter guiado, e como perguntar ou ler melhor;
   - **faltava regra** (a skill não dizia): a regra nova, na área certa;
   - **a regra existia e não foi seguida** (está no `aprendizados/` ou na etapa e você não leu ou não aplicou): reescreva
     mais curta e mais visível, ou leve-a para o passo da etapa em que o erro acontece;
   - **defeito de ferramenta**: corrija o script;
   - **gosto novo** do criador: um aprendizado `[gosto]`.
   Junte os erros de mesma causa: três correções de legenda pelo mesmo motivo são um aprendizado, não três.
3. **Extraia os aprendizados.** Para cada comentário, pergunte: isso vale para os próximos vídeos ou só para este?
   - Correção pontual ("aqui prefiro o outro site") **não** é aprendizado.
   - Um gosto que pode se repetir ("lettering demais", "esse tipo de motion fica poluído", "música alta") é.
   - Um **defeito** técnico (palavra cortada no meio, captura com tela branca, som estourado) é aprendizado **e** pede
     correção na ferramenta, se der: corrija o script e anote "corrigido em <script>".
   - **Escreva o princípio, não o caso.** A regra fala do tipo de situação ("quando a fala cita uma ferramenta…",
     "quando a fala enumera itens…"), nunca deste vídeo ("quando ele fala do WordPress…", "na abertura com Claude e
     Elementor…"). Teste: a regra serviria a um vídeo sobre outro assunto? Se não, suba um nível. O caso concreto
     (ferramenta, site, preset usado) cabe só em *O que aconteceu* ou como exemplo de *Como*.
   - Antes, leia o `biblioteca/aprendizados/<área>.md`: se o aprendizado já existe, reforce (some a origem nova) em vez de repetir.
4. **Mostre ao criador antes de gravar**, numa lista curta por área, com o porquê de cada erro:
   ```text
   Aprendizados do PRJ-03 (v3 aprovada):
   inserts · [gosto] prefira gravação de tela rolando a print parado quando a fala cita um site  (v1·c2, v2·c5)
     por que errei: a regra não existia; escolhi o print por ser mais rápido de achar
   elementos · [gosto] no máximo 1 lettering a cada ~10 s; nunca dois seguidos  (v1·c4, de novo no mesmo bloco na v2)
     por que errei: a regra estava em elementos.md e não li antes da direção → movida para o passo 3 de 03-direcao.md
   cortes · [defeito] o "m" de "mas" vazou na emenda do ✂3 → borda ajustada; regra: …  (autorrevisão)
   Confirma? Pode cortar, mudar o texto ou acrescentar.
   ```
   Grave só o que ele confirmar, com o texto que ele aprovar.
5. **Grave** cada aprendizado no arquivo certo (a tabela abaixo):
   - **Geral ou da categoria?** Técnicas e defeitos de ferramenta (fps, captura, corte, render) e os gostos de
     identidade e qualidade (fundo da marca, fontes, legibilidade) valem para qualquer vídeo: vão para o geral,
     `biblioteca/aprendizados/<área>.md`. Os gostos que mudam com o formato (ritmo, pausas, zoom, quantos sites, como
     emendar) vão para a categoria do vídeo, `biblioteca/exemplos/<categoria>/aprendizados/<área>.md` (a categoria:
     `calibragem.py exemplos <slug>`; crie o arquivo copiando o cabeçalho de um que já existe). Na dúvida, pergunte ao
     criador ao mostrar a lista. Se um gosto da categoria aparecer igual em outra, suba-o para o geral.
   - **Escreva para um agente que não viu este vídeo.** Cada aprendizado diz: *Quando* vale (em que momento da edição),
     a *Regra* (o que fazer, com os nomes reais: preset, campo, comando), *O que aconteceu* (o erro e as palavras do
     criador: é o porquê, que deixa o agente julgar casos parecidos), *Como* fazer ou medir (os comandos, quando houver)
     e a origem. Um gosto simples cabe em 2–3 linhas; um técnico pede os comandos. Exemplo:
     ```markdown
     - **[gosto] Tudo entra na palavra falada.**
       - *Quando:* ao pôr qualquer card, lettering, preço ou nome de ferramenta na tela.
       - *Regra:* o elemento é preso à palavra (o ID da transcrição) e aparece no instante em que ela é dita, não no
         começo do plano.
       - *O que aconteceu:* em 11 comentários o criador apontou elementos fora da fala ("parece 1 s desencaixado").
       - _vsl-isca-fid · v2 c5, v4 c31 · 2026-10-18_ · ![exemplo](imagens/vsl-isca-fid-v2c5.png)
     ```
   - Um print ajuda quando o texto sozinho é ambíguo ("poluído", "card grande demais"): copie o anexo do comentário
     (`projetos/<slug>/revisoes/anexos/…`) ou um quadro do vídeo (ffmpeg) para `biblioteca/aprendizados/imagens/<prj>-<cN>.png`
     e mostre-o no bullet (um "certo" e um "errado" lado a lado é o melhor exemplo).
   - Aprendizados de **direção** (que plano, quando, abertura, ritmo, lettering como decisão de roteiro) vão para a
     área Direção: `biblioteca/aprendizados/direcao.md` (qualquer vídeo) ou `exemplos/<categoria>/aprendizados/direcao.md`
     (o quadro), como as outras áreas. As **Regras do criador** (`exemplos/<categoria>/regras.md`, a Heurística do app)
     são poucos princípios: só mexa nelas quando o criador disser que algo é um princípio ("regra geral", "sempre"), e
     mantenha-as curtas (um princípio por linha, sem a origem). Muito texto ali faz a direção se perder.
   - Preset, transição, motion ou trilha que o criador não quer mais: tire das favoritas/recomendados (`ordem.json`) ou
     recuse (página Presets/Motions do app) — e anote o porquê no arquivo da área.

Cada área tem o arquivo geral (abaixo) e, por categoria, `biblioteca/exemplos/<categoria>/aprendizados/<área>.md` (os
gostos daquele formato). As etapas leem os dois.

| Área | Arquivo geral | Lido em |
|---|---|---|
| Cortes | `biblioteca/aprendizados/cortes.md` | `02-cortes.md` |
| Direção | `biblioteca/aprendizados/direcao.md` (os princípios: `exemplos/<categoria>/regras.md`) | `03-direcao.md` |
| Inserts (busca, captura de tela, escolha da mídia) | `biblioteca/aprendizados/inserts.md` | `04-inserts.md` e o prompt dos subagentes |
| Enriquecimento (presets, Full ator, fundo) | `biblioteca/aprendizados/enriquecimento.md` | `05-enriquecimento.md` |
| Motions | `biblioteca/aprendizados/motions.md` | `06-…` e o prompt do subagente de motion |
| Elementos (lettering, ManyChat, caixinha, print) | `biblioteca/aprendizados/elementos.md` | `06-…` e `03-direcao.md` |
| Transições | `biblioteca/aprendizados/transicoes.md` | `07-transicoes.md` |
| Áudio | `biblioteca/aprendizados/audio.md` | `08-audio.md` |
| Legenda | `biblioteca/aprendizados/legenda.md` | `09-legenda.md` |
| Render e autorrevisão | `biblioteca/aprendizados/render.md` | `10-render.md` |

## 2. Tags e faxina do banco

1. Liste o que entrou no banco por causa deste vídeo: `uv run ferramentas/banco.py listar` (cada item mostra o projeto
   de origem e onde é usado).
2. **Não apague.** Com o vídeo aprovado, os selos do banco se resolvem sozinhos (`banco.estados`, a partir da versão
   aprovada): o que entrou no vídeo vira **Usado em vídeo** (com o chip do projeto e do plano), e o que você trouxe para
   este projeto e ficou de fora vira **Recusado**. As recusadas só saem quando o criador clica em "Limpar recusados" no
   Banco do app (vão para a Lixeira, de onde ele restaura ou apaga de vez); antes disso ele pode promover qualquer uma a
   **Aprovado** (boa, mesmo sem uso). Os motions usados no vídeo ganham o mesmo selo de uso.
3. **Melhore a descrição** das que ficaram, para servirem de novo: nome claro, descrição do que aparece e do que ela
   ilustrou ("home da Anthropic, título serifado em fundo creme; usada como exemplo de 'clichê de site de IA'"),
   palavras-chave pelos assuntos em que ela serve (edite o `item.json`, ou `banco.py descrever <id>` para a IA sugerir e
   depois corrija). Se só um pedaço do vídeo é bom, crie o trecho (`banco.py trecho`).
   **E a tag** (`tags` no `item.json` do original; o trecho não tem tag própria): uma, no máximo duas, sempre das que
   já existem. A tag diz **o que a mídia mostra**, não onde foi usada (o uso o card já mostra); o tema fino (n8n, MCP,
   prompts) vai nas palavras-chave. Tag nova só com 3 mídias ou mais, e perguntando ao criador. A árvore:
   - `asimov/`: aulas, cursos, formacoes, hub, site, design-systems (a galeria ds.asimov), autoridade (eventos, equipe,
     podcasts, seguidores), asimov-skills, prisma, ofertas (preços, planos, checkout);
   - `bf26`: a campanha da Black (a live, a arte, as VSLs dela);
   - `projeto/` (projetos feitos com IA: os do criador e os de fora que mostram o que dá para construir): neo-stitch,
     interfaces (rodando no monitor), neo-obsidian, editor, agentes (os dele e os exemplos: Jarvis, Ultron, n8n
     montando o fluxo, Claude Max 3 AM), skills (as dele), testes (os testes e demos que ele rodou);
   - `sites/` (de fora): 3d, referencias, ai-slop;
   - `ferramentas/` (produtos de terceiros, a tela ou o anúncio oficial): claude, openai, google, agentes, skills, voz,
     dev, redes (YouTube, Instagram, TikTok, Hacker News);
   - `noticias` e `broll`.
4. **A tag do vídeo aprovado** (o projeto: `tags` no `edicao.json`, ou o "+ tag" no card da página Projetos): todo vídeo
   aprovado sai com tag, como as mídias, sempre das que já existem (a barra de tags da página Projetos). O padrão é
   `<produto>/<destino>`, o mesmo das copies no vault sem o emoji (🤖fia/reels → `fia/reels`): o produto (`fia`, `fid`,
   `bf26`) e o destino: `reels` (o orgânico), `lp`, `vsl`, `isca` e, na Black, `captura`, `carrinho`, `lembrete` (os
   anúncios da Black sem destino único ficam em `bf26`). Um CTA leva a tag do destino dele (o CTA da Black de carrinho
   é `bf26/carrinho`, mesmo vindo de um vídeo da FID). O formato com barra própria (`manychat`, `stories`) é a tag
   dele. Na dúvida do produto, a tag da copy no vault decide. Tag nova, pergunte ao criador.

## 3. Consolidar (a cada 5 vídeos aprovados)

Os arquivos de `aprendizados/` são lidos em toda edição: precisam ficar curtos. A cada 5 vídeos aprovados (conte os
`prj-*` em `biblioteca/referencias/`), releia cada arquivo: junte bullets que dizem a mesma coisa (somando as
origens), tire os defeitos que já viraram correção no código, e os gostos que o criador desmentiu depois. Mostre ao
criador o antes e o depois de cada arquivo em poucas linhas e grave com o "ok" dele.

## 4. Encerrar o projeto (quando o criador disser que acabou)

Depois dos exports (todas as saídas que ele quis) e dos aprendizados, o projeto não precisa carregar o histórico de
renders. **Encerrar** deixa só a última versão (cada render é do vídeo inteiro: ela tem a última de todos os blocos), as
revisões (o texto dos comentários e das respostas), a mídia original e o `final/`; saem as versões anteriores e o
`.cache` (as fotos da camada, o áudio, o corpo em 4K das saídas e os temporários).

```bash
uv run ferramentas/revisao.py encerrar <slug>              # mostra o que sai e quanto libera; não apaga nada
uv run ferramentas/revisao.py encerrar <slug> --confirmar  # apaga (sem lixeira: não tem volta)
```

- Só depois que **o criador disser que encerrou** (ou aceitar a sua sugestão): mostre a ele o que sai e quanto libera, e
  confirme. Nunca no meio de exports: o comando recusa se há um render do projeto rodando, ou uma saída aprovada sem
  export (passe `--mesmo-assim` só se ele mandar).
- **Sugira o encerramento** quando o vídeo foi exportado e os aprendizados gravados ("posso encerrar o <nome>? libera
  X GB: as versões v1–v(N-1) e o cache"), com o número do `encerrar` sem `--confirmar`.
- Encerrado não é trancado: plugar uma saída nova depois reabre o projeto (volta para Em edição) e o render refaz o que
  precisar (o corpo em 4K, a camada: mais lento na primeira vez).

## No fim

Diga ao criador, em 3 linhas: quantos aprendizados entraram e em quais áreas, quantas mídias saíram do banco e quantas
ganharam descrição melhor, e que a referência do vídeo está na Calibragem esperando a revisão dele. Na mesma mensagem,
sugira encerrar o projeto (o passo 4), com quanto libera.
