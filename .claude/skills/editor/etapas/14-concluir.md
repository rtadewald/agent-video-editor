# 14 · Concluir um vídeo: reescrever o guia e a skill, tags, faxina e encerramento

Depois do vídeo aprovado e exportado (`12-final.md`), feche o ciclo: o guia e a skill reescritos com o que o vídeo
ensinou, as tags e a faxina do banco e, quando o criador disser que acabou, o encerramento. É aqui que a skill aprende.

## 1. Reescrever o guia e a skill (com o criador)

O objetivo não é acrescentar casos: é deixar o guia (`guias/padrao.md`) e a skill **melhores e mais curtos** para o
próximo vídeo.

1. **Junte o que aconteceu**: `uv run ferramentas/revisao.py historico <slug>` (os comentários de todas as versões, com
   as suas respostas e os que voltaram), o que ele disse no chat e o que você mesmo corrigiu na revisão.
2. **Ache a causa de cada erro**, juntando os de mesma causa: faltava no guia; estava no guia e não foi seguido (então o
   texto não está claro ou não está onde a decisão acontece); a skill empurrava para o lado errado (um passo, uma meta, um
   padrão); defeito de ferramenta (corrija o script); gosto novo.
3. **Proponha a reescrita**, não uma lista de adendos:
   - o princípio, não o caso: serve a um vídeo sobre outro assunto? senão, suba um nível;
   - **tire** o que não faz mais sentido, o que virou correção no código e o que o criador desmentiu; junte o que se repete;
   - mude o passo da skill ou da etapa que levou ao erro, não só o guia;
   - um vídeo aprovado que serve de modelo entra nas Referências do guia, com o que ele faz bem.
4. **Mostre ao criador** o que muda (o antes e o depois, curto, com o porquê de cada erro) e grave só o que ele aprovar.
   Um commit com a reescrita.

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

## 3. Encerrar o projeto (quando o criador disser que acabou)

Depois dos exports (todas as saídas que ele quis) e da reescrita, o projeto não precisa carregar o histórico de
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
- **Sugira o encerramento** quando o vídeo foi exportado e a reescrita gravada ("posso encerrar o <nome>? libera
  X GB: as versões v1–v(N-1) e o cache"), com o número do `encerrar` sem `--confirmar`.
- Encerrado não é trancado: plugar uma saída nova depois reabre o projeto (volta para Em edição) e o render refaz o que
  precisar (o corpo em 4K, a camada: mais lento na primeira vez).

## No fim

Diga ao criador, em 3 linhas: o que mudou no guia e na skill, quantas mídias ganharam descrição melhor, e que a referência do vídeo está na Calibragem esperando a revisão dele. Na mesma mensagem,
sugira encerrar o projeto (o passo 3), com quanto libera.
