# 11 · Aplicar uma revisão

O criador comenta a versão no app (os comentários se gravam sozinhos em `projetos/<slug>/revisoes/vN.json`) e avisa
no chat: "comentei no VSL Isca", "marquei umas coisas no B3". Não há texto colado: o que é para fazer são os
comentários **pendentes** (ainda sem a sua resposta) de qualquer versão: ele comenta a versão que está vendo, que nem
sempre é a última (revisa um bloco na v7 enquanto outro já foi refeito na v8). O `ler` sem a versão mostra todos, e
todos entram na versão nova (os comentários estão presos às palavras, que valem em qualquer versão).

## Rodar

```bash
uv run ferramentas/revisao.py pendentes                      # os projetos com comentários sem resposta (se ele não disse qual)
uv run ferramentas/revisao.py ler <slug> [vN] [--bloco B3]   # cada comentário com id, âncora (palavra), bloco, plano e estado
```

O `ler` acende no app o aviso "Claude aplicando…" com um loader sobre os blocos dos pendentes; o render da versão nova
o apaga sozinho. Se terminar sem render novo (só respostas), rode `revisao.py pronto <slug>`.

Aplique só os `pendente`: os já respondidos são de rodadas anteriores. Se ele citou um bloco ("no B3"), leia com
`--bloco B3`, mas os pendentes de outros blocos também valem (ele comentou e avisou); na dúvida, pergunte.

## Blocos

O app divide o corpo de todo vídeo em blocos de ~30 s (B1, B2…; nenhum abaixo de 15 s, um vídeo curto é um só), cada um começando numa palavra: o mesmo bloco continua o mesmo
trecho nas versões seguintes. O `ler` mostra a lista e quais estão finalizados:

```text
Blocos: B1 0:00,0–0:31,3 ✓ finalizado, B2 0:31,3–1:00,4, B3 1:00,4–1:30,6, …
```

- **Finalizados (travados)**: o criador deu o bloco por pronto. Não mude nada que apareça neles (plano, insert, motion,
  legenda, áudio). Se uma correção precisar atravessar a fronteira (um corte que puxa a fala do bloco vizinho),
  pergunte antes.
- A versão nova sai inteira, mas só os blocos com comentários mudam; os outros ficam como estavam (o app conta a versão
  de cada bloco pelo que mudou nele).

## O ritmo: um bloco, um render

O render monta o vídeo em trechos de ~20 s guardados no cache (`10-render.md`): uma versão nova só remonta os trechos
em que algo mudou, e sai em ~1 min. Por isso:

- **Renderize logo depois de aplicar os comentários de cada bloco**, sem juntar vários blocos num render só no fim: o
  criador revisa o bloco pronto enquanto você faz o próximo. Avisou "obs no B10"? Aplique o B10, renderize, responda,
  e só então passe ao próximo bloco que ele comentou.
- **Vários projetos comentados** (os CTAs, os Reels de um bloco só): o mesmo ritmo **por projeto**, um de cada vez (na
  ordem em que ele comentou), e não todos e só no fim.
- **O aviso no app** ("Claude aplicando…") acende com o `revisao.py ler` e apaga sozinho quando a versão nova chega:
  rode o `ler` de cada projeto (ou bloco) no momento em que começa a trabalhar nele.
- **Cada render é uma versão de entrega, nunca um teste**: todo `render.py <slug>` vira a v(N+1) e sobe a versão de
  cada bloco em que algo mudou. Confira antes, fora do projeto: o motion na página dele
  (`render/motion.html?preset=…&formato=…&duracao=…`), a mídia e o recorte com o ffmpeg. Renderize quando o bloco
  estiver pronto, uma vez.
- **Fale em blocos, não na versão do vídeo**: o seletor do app numera cada bloco (só sobe quando ele muda). Nas
  respostas e no chat, nada de "v10"; diga o bloco ("B1 e B2 prontos") e, para abrir, o link do projeto.
  _design-por-imagem · 2026-10-28_
- **Nunca apague uma versão** (`versoes/vN`): o app, os comentários e o histórico dos blocos dependem delas. Uma versão
  errada se corrige com a próxima.
- **Não mexa no `edicao.json`** de um projeto enquanto um render ou um pré-render dele está fotografando a camada: o
  que mudar no meio sai misturado. Espere terminar (ou pare o render) e renderize de novo.

## Aplicar

0. **Abra os anexos**: cada comentário com `↳ print:` / `↳ anexo: projetos/<slug>/revisoes/anexos/…` (também no
   `revisao.py ler`) tem imagens ou vídeos do criador; abra cada imagem com a ferramenta Read (ela mostra a imagem) e,
   num vídeo, tire alguns quadros com o ffmpeg e leia-os, antes de aplicar.
   **Códigos citados** (`BAN-074`, `PRE-04`, `TRA-02`…: o criador copia do chip no app) e **marcados com @**
   (`@BAN-111 @MOT-07`: ele digita @ no comentário e escolhe no Banco e nos Motions, um ou vários): resolva cada um
   com `codigo.py <código>` — é a mídia, o preset, a transição, o motion, a trilha ou o som exato que ele quer.
   Vários marcados num comentário são as opções que ele aponta para aquele ponto (use as que couberem; na dúvida, pergunte).
1. **Classifique** cada comentário pela etapa que ele toca e leia o `.md` dessa etapa:
   - fala (corta/volta palavra, repetição) → `02-cortes.md` (edite a `selecao.json` e `cortes.py aplicar`);
   - plano, tipo, o que aparece, lettering, elementos → `03-direcao.md` (edite o `roteiro.md` e `direcao.py aplicar`:
     os inserts que continuam no mesmo plano mantêm as mídias);
   - mídia errada/faltando → `04-inserts.md` (você mesmo, com a checagem; subagente só para uma tarefa mecânica que você
     define, pelo `inserts.py brief`);
   - preset, zoom, card → `05-enriquecimento.md`; motion → `06-…`; transição → `07-…`; música/volume → `08-…`;
     legenda → `09-…`.
2. Os comentários são presos ao **tempo da versão revisada** e à palavra falada ali: use a palavra (id) como âncora,
   não o segundo (o tempo muda quando os cortes mudam).
3. Aplique tudo, depois `render.py <slug>` (vira a v(N+1)) e a revisão: `folha.py --soltos` no vídeo inteiro
   (sempre) e `folha.py --planos` olhando os planos mexidos (`10-render.md`).
4. **Responda cada comentário** no JSON:
   ```bash
   uv run ferramentas/revisao.py responder <slug> vN <id> --status aplicado --resposta "troquei por tela dividida com o site do X"
   ```
   `status`: `aplicado` · `respondido` (era pergunta) · `nao_aplicado` (diga por quê). As respostas aparecem no app,
   no comentário e, nas versões seguintes, no histórico do bloco: é por elas que o criador sabe o que foi feito.
   **Seja conciso:** uma frase curta (até ~25 palavras) com o que mudou no vídeo, nas palavras dele ("troquei por tela
   dividida com o site do X"), ou por que não mudou. Sem explicar o processo nem a ferramenta. Só responda os
   comentários desta revisão (as versões anteriores não pedem resposta nova).
5. Entregue como no `10-render.md`: o link, o que mudou em 3–5 linhas.

## Saídas (corpo + final)

Num projeto com saídas (`cortes.py saidas <slug>`), o app abre uma saída de cada vez: os blocos do corpo e, depois, o
bloco **Final** dela. Um comentário feito no Final tem `saida` no JSON e o `ler` diz de qual saída é:

- **Final falado:** mexa só na direção daquele final — um plano, motion, fala gravada ou ajuste de legenda que só esta
  saída tem leva `"saida": "<id>"` (`edicao.md`); sem isso, a mudança vale para todas as saídas que falam aquelas palavras.
- **CTA à parte:** o comentário é sobre o projeto do CTA (um coringa pode estar em vários vídeos): só aí você abre o
  projeto dele — aplique **no projeto do CTA** e renderize ele; o corpo não muda. Aprovado o CTA, exporte o final dele de
  novo (`12-final.md`): é esse arquivo que todas as saídas plugam.
- Um comentário do corpo vale para todas as saídas.

O render do projeto já traz a prévia de cada saída na versão nova (`versoes/vN/saidas/<id>/`, com o `info.json` dizendo
qual versão do CTA ela plugou: `cta_versao`).

**O Final é um bloco como os outros, com versões.** No seletor de cima, com a saída aberta, ele mostra `Final · vN`:
num CTA à parte, N é a versão do projeto do CTA que aquela prévia plugou (Final · v4 = o CTA na v4); num final falado,
sobe quando a fala dele muda. Por isso, depois de renderizar o CTA, **renderize o corpo de novo** (a versão nova só
remonta as saídas, em segundos): sem isso a prévia continua com o CTA anterior e o criador não vê a correção. Responda
os comentários do Final na revisão do corpo (é onde eles estão), como os de qualquer bloco. _design-por-imagem v27 · 2026-10-28_

## Aprendizados: ler sempre, gravar só na conclusão

**Antes de aplicar cada comentário, leia os aprendizados da área dele** (um comentário de insert: `inserts.md`; de
zoom ou preset: `enriquecimento.md`; de motion: `motions.md`; de corte: `cortes.md`…), o geral
(`biblioteca/aprendizados/<área>.md`) e o da categoria (`biblioteca/exemplos/<categoria>/aprendizados/<área>.md`): a
correção que o criador pede costuma já estar escrita ali, e a sua solução não pode criar outro erro que já está.

Não grave aprendizados no meio das revisões: eles saem todos juntos quando o vídeo é aprovado (`14-concluir.md`), lendo
as revisões de todas as versões. Aqui, só cuide de responder bem cada comentário (a resposta diz o que mudou: é o
registro que a conclusão lê). Exceção: se o criador disser explicitamente que algo vale para sempre ("regra geral",
"sempre", "nunca mais"), confirme com ele o texto e grave já, como manda o `14-concluir.md`.

**O look é do criador.** Na revisão, o botão **Look** do app prova LUT, intensidade e vinheta em 3 s do bruto e, ao
aplicar, grava `edicao.look` e renderiza uma versão nova sozinho (sem comentários). Não mude o look de volta: se uma
versão chegou sem comentários e com o look diferente, foi ele.
