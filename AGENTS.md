# AGENTS — editor de Reels por linguagem natural

O Claude Code é o editor: recebe um vídeo bruto (e, se houver, um briefing) e entrega a edição completa — cortes, 9:16,
look, direção visual, inserts, presets, motions, elementos, transições, áudio e legenda —, com revisão num app local
estilo frame.io; e carrosséis 4:5 (cru ou derivado de um vídeo), com o preset escolhido no app. Tudo pela skill
`.claude/skills/editor/` (comece pelo `SKILL.md`).

Responda em PT-BR, direto. Separe o que existe do que é plano.

## Estrutura

- `.claude/skills/editor/`: `SKILL.md` (o passo a passo, curto), `guias/padrao.md` (o guia de estilo: o gosto do
  criador, o único lugar dele; reescrito ao fim de cada vídeo), `etapas/` (o como de cada ferramenta, lido na hora),
  `edicao.md` (o contrato do `edicao.json`).
- `ferramentas/`: um script por etapa, `uv run ferramentas/<script>.py` (dependências no próprio arquivo, PEP 723).
  `base.py` (os caminhos) e `servidor.py` são o comum; `gravar.py` grava páginas e apps para os inserts (quadro a quadro
  ou ao vivo). `ferramentas/inicial/`: o que uma biblioteca nova recebe.
- `render/`: a página que desenha a camada dos inserts e motions para o render (fonte em `render/src/`), e o que ela
  usa (`motion/`: runtime, GSAP e fontes; `fundos/`; `avatares/`); `claude-desktop.html`: o Claude desktop desenhado no
  tempo, para gravar uma conversa real.
- `app/`: o app de revisão. `uv run ferramentas/servidor.py` → http://localhost:8719/app/
- `biblioteca/` (fora do git; copia-se entre máquinas, por cima): `exemplos/` (criador.md e, por categoria de vídeo, os
  favoritos e os roteiros dirigidos, gerados pela Calibragem, para consulta), (os aprendizados antigos e as regras por categoria viraram o guia de
  estilo e o gosto da etapa 15 em 2026-11-23 e estão na Lixeira), presets, transições, sons, trilhas, LUTs, motions, banco de inserts, referências, códigos (os CTAs são projetos da categoria CTA) e
  `lixeira/` (o que se apaga no app: `base.para_lixeira`; restaurar ou apagar de vez pela página Lixeira).
- `projetos/<slug>/` (fora do git): um vídeo por pasta.
- `animacoes/<slug>/animacao.json` (fora do git): uma animação por pasta, as cenas na ordem (presets de
  `biblioteca/motions/presets/`, tocados pelas prévias gravadas); no app, Animações (`app/animacoes.js`).
- `carrosseis/<slug>/` (fora do git): um carrossel por pasta (4:5; o gosto e o como em `etapas/15-carrossel.md`; `ferramentas/carrossel.py`, os slides em
  `render/carrossel.html` e os 4 presets, com 5 destaques cada, em `render/carrossel.css`).

Referência: `../18-harness-video-editor` (o app web anterior). Só leitura: copie ideias e código, nunca mexa lá.

## Regras de trabalho

- **Enxuto.** O `SKILL.md` fica curto; os .md das etapas crescem conforme a skill aprende. Nada de configuração, flag ou
  abstração antes de um caso real. Arquivo novo fora deste mapa: pergunte antes.
- **Decisões editoriais são do Claude**, guiadas por `biblioteca/exemplos/`; o código valida e calcula tempos.
- **Tudo preso às palavras** (IDs da transcrição), nunca a segundos (`edicao.md`).
- **Correção pontual não é regra geral.** Ao fim de cada vídeo aprovado, o guia e a skill são reescritos com o que ele
  ensinou (`etapas/14-concluir.md`): generalizar, corrigir e tirar, nunca empilhar casos; grave só o que o criador aprovar.
- **Não declare aprovado** o que o criador não aprovou.
- Os originais em `projetos/*/midia/` nunca são alterados.
- Chaves (OpenRouter, ElevenLabs) só no `.env` da raiz. Nunca mostre, registre ou faça commit delas.
- Caminhos com espaços: use aspas. Docs de bibliotecas: Context7.

## Git

Commits na `main`, um por entrega, terminando com a linha de coautoria do Claude.
