---
name: publicar
description: Publica os vídeos aprovados no editor (Reels e anúncios de perpétuo e pico da Asimov) a partir do que já está exportado na pasta final/ do projeto (as saídas: corpo + final, com as transcrições) — cria as pastas no Google Drive, sobe os arquivos, cria/preenche os cards no Notion ("Edição e Publicação - 2026"), atualiza a nota da copy no Obsidian e agenda os Reels (Metricool; automação "comente X" no ManyChat). Use quando o criador aprovar um Reels e pedir para exportar, subir, organizar ou publicar (VSL, aulas e YouTube longo ficam de fora).
---

# Publicar: do aprovado ao Drive e ao Notion

Vale para **Reels e anúncios** (Reels, perpétuo LP/VSL/ISCA, pico). VSL, aulas e YouTube são outro processo.
As regras do `~/Movies/CLAUDE.md` valem aqui: **nunca apagar nem sobrescrever vídeo** (antes de copiar/mover, confira que
o destino não existe) e a **regra de ouro**: antes de criar qualquer pasta no Drive ou card no Notion, mostre ao criador o
plano completo (cada arquivo → qual pasta, o nome exato de cada pasta e cada card, os valores de cada campo) e só execute
depois de um "sim" claro.

## 1. O que publicar: a pasta `final/` do projeto

A publicação trabalha **só com os arquivos já exportados** — não monta, não encaixa e não abre o app:

- `projetos/<slug>/final/<nome> - <destino>.mp4` — cada **saída** do projeto (o corpo + o final dela: um final
  falado, um CTA gravado à parte ou nenhum), com a **transcrição** ao lado (`<nome> - <destino>.md`: a fala da saída, em
  parágrafos, com a grafia corrigida);
- `projetos/<slug>/final/<nome>.mp4` (+ `.md`) — o vídeo de um projeto sem saídas (um CTA, um Reels só com o corpo).

O criador diz em linguagem natural o que vai para onde ("a ManyChat no Instagram, a LP e a VSL como anúncio de perpétuo,
a BF Captura no pico"); o destino no nome do arquivo ajuda a montar o plano. Se uma saída citada não está na pasta,
peça para exportá-la no editor (aprovar a saída no app, ou `uv run ferramentas/render.py <slug> --saida <id>`; todas:
`--saidas`) — não exporte nem encaixe aqui.

**Reels com ManyChat ("comente X") tem duas versões**: a do Instagram, com o CTA "comente X", e a do TikTok/YouTube
Shorts, com um CTA "acesse o link da descrição" (lá não há ManyChat). Se a saída "link da descrição" não existe na
pasta, avise o criador antes de publicar.

## 2. Conferir os arquivos

1. Liste `final/` e confira que cada vídeo tem o `.md` ao lado; mostre a lista ao criador com a
   duração de cada um (`ffprobe`).
2. Os arquivos são 2160×3840 (4K), 24 fps, HEVC, −14 LUFS. Para as redes, a versão 4K em H.264 sai na hora de agendar
   (seção do Metricool).

## 3. Drive

Antes de numerar, **liste a pasta raiz** e ache o maior número (e liste de novo **logo antes de criar**: o time cria
pastas ao mesmo tempo; se o número do plano foi tomado, use o seguinte e avise) (filtre por `createdTime` recente; a de Ads tem 1000+ pastas
e a primeira página não basta). Crie a pasta pelo MCP do Drive (`create_file` com mimeType de pasta) e **suba os vídeos
pelo rclone** (o remote `asimov:`, autorizado pelo criador na conta com acesso às pastas; o token fica em
`~/.config/rclone/rclone.conf`, nunca mostre):
```bash
rclone copy "<arquivo>" asimov: --drive-root-folder-id <id da pasta> --drive-chunk-size 64M \
  --contimeout 30s --timeout 60s --low-level-retries 3 -v --stats 15s --stats-one-line
rclone lsl asimov: --drive-root-folder-id <id da pasta>     # confira nome e tamanho
```
Lote grande: um script em segundo plano que cria cada pasta (número livre conferido na hora), sobe e compara o
tamanho remoto com o local, gravando o resultado em JSON para retomar de onde parou. Sem os timeouts, um upload pode travar em silêncio (em 20/10 ficou 9 min num arquivo de 92 MB, com a rede livre): com
eles, o rclone refaz o pedaço e termina. Um vídeo por vez, com o progresso à vista.
Nem o MCP do Drive nem o navegador sobem arquivos grandes (o upload do Claude in Chrome tem limite de 10 MB), e o Drive
Desktop está fora: ele dá conflito com o app da câmera (EOS Canon). Sem o remote (`rclone listremotes` vazio), rode
`rclone config create asimov drive scope=drive` e peça ao criador para autorizar no navegador. Desde 20/10 o remote
usa um **client_id próprio** (OAuth "Desktop app" `rclone-asimov` no projeto Google Cloud "Asimov Academy"): o
compartilhado do rclone estourava a cota (`403 rateLimitExceeded`) e travava os uploads. Se o token cair, o criador
roda `rclone config reconnect asimov:`; nunca mostre nem registre client_secret ou token.

| Saída | Pasta raiz | Nome da pasta |
|---|---|---|
| Reels | "Rodrigo" `1j9kZtWZJZgh7eb31qnqKLOJYB_nD3Dtp` | `n_nome_do_reels` (ex.: `56_3_niveis_de_ia`) |
| Perpétuo LP / VSL / ISCA | Ads `15Igbv6wQnMihfrFh-f_25zBY8XMxdw1w` | `NNN [COD_PROD FUNIL] Nome do ad` (ex.: `1085 [FIA VSL] 3 Níveis de IA`), uma pasta por funil |
| Pico · Captura (Black) | `11TDBjW0vvaaldLq_wboyC4XzborO65pn` | `XX Nome do Ad` (ex.: `21 Rodrigo 3 níveis de IA`) |
| Pico · Carrinho (Black) | `11yWWQni7MmyonmpOzIvMCHb6iYAbYL2U` | idem |
| Pico · Lembrete (Black) | `1Hv3RegJCYsYS1UnPMhQ_MgL9eMwvoYZ9` | idem (ex.: `06 Rodrigo Lembretes`), todos os lembretes numa pasta |

**Série com várias versões do mesmo ad** (ex.: Sim sim sim Agentes/Aplicativos/Dados/Design/IA): **uma pasta por fase**
com todas as versões dentro (`44 Rodrigo Sim sim sim` na Captura, `10 Rodrigo Sim sim sim` no Carrinho), **um card por
fase** no Notion e **uma nota por fase** no Obsidian, com a fala de cada versão e o CTA (igual em todas) uma vez.
**Lembretes da live** (3 dias, amanhã, hoje, ao vivo, coringa): uma pasta, **um card** com Fase Black Friday =
**Lembrete** e as falas de todos, e **sem nota** no Obsidian.

Perpétuo: **LP** faz o pitch direto para a landing page (compra); **VSL** convida para uma aula gratuita (curiosidade,
ainda não é venda); **ISCA** atrai para uma isca digital.

## 4. Notion

Base "Edição e Publicação - 2026", data source `3063ee05-7ee5-8134-a30f-000bbc36e56c` (título = chave `""`). Pelo MCP do
Notion (ou pelo navegador do criador, se algum campo não aceitar). Em todos: **Responsável pela gravação, Copywriter e
Editor = Rodrigo Tadewald** (`8147cc82-d2ee-4a16-ab14-0fec77b9f1a5`), **Prazo = hoje**, **Status = ✔️ Aguardando
Publicação**, **Formato = 📽️ Vídeo**, **Perfil = Rodrigo**, **Link da Pasta = a pasta do Drive**. Antes de criar, procure
o card pelo nome: se o criador já criou, preencha esse.

- **Reels** (template Reels `3063ee05-7ee5-81c4-9d86-d23a41763aac`): título = o nome do vídeo (ex.: "3 níveis de IA"),
  **ícone 📱** (como os demais Reels);
  Mídia 📸 Reels / Tiktok. No corpo: o roteiro (a fala do vídeo, `projetos/<corpo>/roteiro.md` sem as marcações + o CTA
  do Reels) e a **descrição** proposta com a skill `roteiro-to-descricao` (vault: `~/Obsidian Notes/3 Skills/`).
- **Perpétuo** (template Criativo `3063ee05-7ee5-816f-b147-f12935ee6519`), um card por funil: título `[FUNIL]_NNN_Nome`
  (ex.: `[VSL]_1085_3 Níveis de IA`), ícone 💰; Produto (ex.: 🤖 FIA), Mídia 💰 Criativo, Etapa do Funil Topo;
  **LP: Responsável pela gravação = Renata Lopes** (`90d28337-53cb-489e-8b69-6859640dede5`), sempre (Copywriter e
  Editor seguem Rodrigo). **Campanha**: LP em branco · VSL `[COD_PROD]_VSL_Nome_do_ad` · ISCA `[COD_PROD]_ISC_NNN_Nome_do_ad` (ex.:
  `[FIA]_ISC_932_5_plugins_Claude`); **Landing Page em branco** (o criador preenche).
  **VSL: uma campanha por ad**, `[COD_PROD]_VSL_Nome_do_ad` (ex.: `[FIA]_VSL_Strix_2`), e a **Landing Page da VSL da FIA
  é `/formacoes/engenheiro-de-ia/vsl/v12`** (já existe como opção).
  **Campanha e Landing Page são listas fechadas** e a API recusa valor novo. **Nunca** crie opção pelo
  `notion-update-data-source` (`ALTER COLUMN … MULTI_SELECT` exige listar todas as opções e apaga as que faltarem: centenas
  de campanhas em uso). Opção nova se cria **digitando no campo do card**, no navegador do criador (Claude in Chrome:
  abrir o card → clicar no valor de Campanha → digitar o nome → Enter em "Create" → Esc); depois confirme pela API
  (`update_properties` com o valor só passa se a opção existe).
- **Pico · Black** (template Criativo): título **`P2🟡BF26_Nome_do_ad`** (ex.: `P2🟡BF26_3_niveis_de_IA`), com
  **Nível prioridade = P2🟡 Importante mas não urgente** (o prefixo do título é a prioridade); Fase Black Friday (Captura ou
  Carrinho), Produto Black Friday, Público Black Friday (Público geral), Campanha `[PICO_BF26]_Geral_Rodrigo`, Mídia 💰
  Criativo. A pasta do Drive segue `XX Nome do Ad` (ex.: `21 Rodrigo 3 níveis de IA`), em dois dígitos.
  **Carrinho é idêntico à Captura**, com **Fase Black Friday = Carrinho** e a pasta raiz do Carrinho; a copy termina
  na compra (garantir o vitalício com desconto agora), não no cadastro da live. Com captura e carrinho do mesmo vídeo,
  o título leva o sufixo: `P2🟡BF26_Strix_2_Captura`, `P2🟡BF26_Strix_2_Carrinho`.

**Prazo (temporário, pedido em 20/10):** LP e VSL → **20/11**; Pico · Carrinho → **05/11**; Pico · Captura → **hoje**.
O `scheduled` da nota no Obsidian acompanha.

**Copy de tráfego (todo anúncio: perpétuo LP, VSL, ISCA e pico):** no corpo do card, um **toggle H2 "COPY DE TRÁFEGO"**
com **3 títulos** diferentes (`### Títulos`, uma lista; curtos, até ~40 caracteres) e **2 textos principais**
(`### Texto principal 1`, o longo, em 4–5 parágrafos; `### Texto principal 2`, o curto, num parágrafo), sempre terminando
no CTA do funil (LP: comprar/começar hoje; VSL: assistir à aula gratuita, curiosidade, ainda não é venda; ISCA: pegar a
isca; captura da Black: cadastrar na live). O template Criativo já traz um toggle vazio "Copy de Descrições (Tráfego)"
com Texto principal 1–3: substitua esse bloco inteiro pelo novo (`notion-update-page` → `update_content`).
**Escreva o toggle como `<toggle heading="h2">` … `</toggle>`** (título na 1ª linha, filhos sem tab, em parágrafos
separados por linha em branco). Desde 20/10 o `## COPY DE TRÁFEGO {toggle="true"}` com filhos indentados vira texto
cru (`\{toggle\}`, `<br />`). Depois de criar, faça `notion-fetch` de um card e confira que volta `<toggle heading="h2">`. Escreva a
partir do roteiro do corpo e do CTA; preços só conferidos em https://asimov.academy/#assine (mudam); sem superlativos
que a fala não sustenta.

## 5. Obsidian

O paralelo do Notion no vault (`~/Obsidian Notes/1 Copies/`): **uma nota de copy por card**, com só o emoji do
formato no início do nome (📱 Reels, 🎥 YouTube, 📺 VSL, 💰 ads), sem outros emojis antes. Ache a nota do rascunho
pelo nome ou por uma frase da fala (`grep -rl` em `1 Copies/`); o título dela costuma ser outro (ex.: "3 níveis de IA"
era `🧑🏼‍🔧📱💰 Quizz Descubra teu nível de IA`). Ao fechar o vídeo:
- **O nome passa a ser o do vídeo no Notion**, com o funil no começo nos anúncios: **📱 `<nome>`** com o corpo e os
  CTAs orgânicos (ManyChat, TikTok: publicados juntos) e uma **💰 `<VSL|LP|ISCA|Pico Captura|Pico Carrinho> - <nome>`**
  por saída de anúncio, cada uma com o corpo e o CTA dela (ex.: `📱 3 níveis de IA`, `💰 VSL - 3 níveis de IA`). A nota
  do rascunho vira a 📱 (renomeada); atualize os `[[links]]` que apontavam para ela.
- **Corpo da nota = a transcrição final**, a fala de `roteiro.md` (só as linhas entre aspas, sem marcações), em
  `# Corpo` e `# CTA <tipo>`. Corrija o que a transcrição errou (Cloud → Claude, Zmove → Asimov). Mantenha a linha
  `Referência:` e o frontmatter.
- **Tags** = `<produto>/<funil>`: produto `🤖fia` (agentes de IA, skills) ou `🖼️fid` (design com IA: sites, front-end,
  edição); funil `ad-lp`, `ad-vsl`, `reels-vsl` (Reels com CTA para a VSL) ou `isca` (ex.: `🤖fia/ad-vsl`). Black Friday tem
  a tag da fase no lugar: **`💰bf26/captura`** ou **`💰bf26/carrinho`** (inclusive o Reels com CTA da captura). A antiga
  `💰pico/black26` não se usa mais.
- **👁️ na frente do nome de toda nota que você criar ou editar** (ex.: `👁️📱 3 níveis de IA`): o criador confere e
  tira o 👁️. Uma nota em que você só trocou um `[[link]]` não ganha 👁️ (renomeá-la quebraria os links para ela).
- **Renomear pelo shell não atualiza os links** (só o Obsidian faz isso): antes de `mv`, confira que o destino não
  existe; depois, `grep -rl "<nome antigo>]]"` no vault (fora de `.obsidian/`) e troque cada `[[link]]`.
- **`scheduled`** = o **Prazo** do card correspondente no Notion (a data de publicação), entre aspas: `"2026-10-16"`.
- **Puxou uma nota (repost, nota de outra pasta)? Ela vai para `1 Copies/1 Priorizar/`**, com o `publicado` limpo.
- Sem nota: crie em `1 Copies/1 Priorizar/` com o frontmatter do template `2 Notas/Engine/templates/T-Copy.md`
  (`publicado:`, `scheduled:`, `tags:`).

## 6. Agendar (Metricool e ManyChat)

Só os orgânicos (Reels; os anúncios sobem pelo gerenciador de anúncios, fora daqui). Pelo MCP do **Metricool**: marca
`rodrigotadewald` (`blogId` 7482213, fuso `America/Sao_Paulo`), com Instagram, TikTok, YouTube e Facebook. O vídeo
entra em `media` como **link do Drive** (a pasta do passo 3; o Drive está vinculado no Metricool), não como arquivo.
Antes de agendar, liste o que já está na fila (`getScheduledPosts`) e mostre o plano (vídeo, legenda, redes, data e
hora); só agende depois de um "sim". Data = o Prazo do card; sem hora definida, `getBestTimeToPostByNetwork`.
Por rede: Instagram `instagramData.type: "REEL"`; YouTube `youtubeData.type: "short"`, com `title` e
`madeForKids: false`; TikTok `tiktokData` com o `title`. `autoPublish: true` (publica sozinho).

**O que vai pelo Metricool é 4K (2160×3840) a 24 fps, em H.264.** O criador quer 4K nas redes: elas sempre recomprimem,
e um 1080p sai mais estragado que um 4K (2026-10-20). O que borrou no TikTok em 19/10 foi o **HEVC** (ele recodifica mal);
por isso a versão das redes é o mesmo 4K do editor recodificado em H.264, uma para todas as redes. Gere ao lado da saída e
suba na mesma pasta do Drive; use o link desse arquivo no `media`:
```bash
ffmpeg -i "<saída>.mp4" -c:v libx264 -preset slow -profile:v high -level 5.2 -crf 16 -maxrate 45M -bufsize 90M \
  -pix_fmt yuv420p -g 48 -keyint_min 48 -sc_threshold 0 -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart "<saída> (redes).mp4"
```
(mantém os 24 fps do editor; ~35 Mbps num Reels de 45 s, ~200 MB). O 4K HEVC original fica como master (Drive, anúncios).

O Metricool copia o vídeo do Drive para ele na hora (`media` volta como `static.metricool.com/...`): o link
`https://drive.google.com/file/d/<id>/view` basta (id pelo `rclone lsjson`). Ele recusa horário no passado: confira a
hora (`TZ=America/Sao_Paulo date`) antes de propor o horário.

**Repost** (vídeo antigo, já pronto no Drive): ache o card no Notion e a nota no Obsidian; card com **Prazo = a nova
data** e **Status ✔️ Aguardando Publicação**; baixe o final da pasta do Drive (`rclone copy`), transcreva
(`ferramentas/transcricao.py`: `extrair_audio` + `transcrever`) e troque o Roteiro do card pela **fala real**; gere a
descrição (`roteiro-to-descricao`) e ponha nos dois (card: `## Descrição`; nota: `# Corpo` e `# Descrição`); a nota
vai para `1 Priorizar` com o nome do card e 👁️. Sem CTA "comente X", segue o "Sem ManyChat".

**Sem ManyChat:** tudo pelo Metricool, na data do Prazo, numa postagem só com as redes.

**Com ManyChat ("comente X para receber o link")**, um Reels por vez:
1. **Instagram (versão "comente X")**: agende pelo Metricool **para o mesmo dia** (nunca dias antes).
2. **ManyChat, no navegador do criador (Claude in Chrome)**: crie a automação com o gatilho **"próxima publicação ou
   Reel"**, a palavra-chave, as respostas públicas no comentário e a DM com o link. Antes, confira no Metricool que nada
   (outro post, carrossel, outro Reels) sai antes deste: a automação se prende ao **próximo** post publicado. Modelo:
   Automação → "Auto-DM de links dos comentários" (conta `fb3802114`). Mostre a automação e só publique com o "sim".
3. **TikTok e YouTube Shorts (versão "acesse o link da descrição")**: pelo Metricool, numa postagem à parte, com a
   descrição dizendo **onde está o link** em cada rede.

Depois que sair, confira que a automação ficou presa no Reels certo (ManyChat → a automação → o post do gatilho).

**Carrossel** (`carrosseis/<slug>/final/`: slides 1080×1350 em png/mp4, `legenda.txt`, `copy.md`): pasta no Drive
`NN_carrossel_<tema>`, card com Formato 🎠 Carrossel e Mídia 📱 Feed (modelo: "Carrossel Grill me"), nota 🏞️. A legenda é
complementar aos slides (`roteiro-to-descricao`). As redes aceitam coisas diferentes (2026-11-03):
- **Instagram**: os png e mp4 do `final/`, `instagramData.type "POST"`.
- **Facebook e TikTok**: só imagens. Com vídeo no meio, o Facebook deu erro 500 e o TikTok não aceita. Gere uma versão em
  JPG (`ffmpeg -i NN.png -q:v 2 NN.jpg`; o vídeo vira um quadro limpo dele, olhe antes de escolher), suba em
  `<pasta>/tiktok/` e use nas duas. TikTok com `tiktokData.title` curto e `autoAddMusic: true`.
- Uma postagem por grupo: IG numa, FB + TikTok noutra (mesma legenda).

## 7. Entrega

Mande ao criador **todos os links do Notion criados/preenchidos** (para conferência), os das pastas do Drive, a lista das notas 👁️ do Obsidian para conferir e o que ficou agendado (Metricool, com o link do planner, e a automação do ManyChat). Depois,
os vídeos seguem a etapa de conclusão do editor (Calibragem e aprendizados).

## Aprendizados (manter atualizado)
