# AGENTS — editor de Reels por linguagem natural

O Claude Code é o editor: recebe um vídeo bruto (e, se houver, um briefing) e entrega a edição completa — cortes, 9:16,
look, direção visual, inserts, presets, motions, elementos, transições, áudio e legenda —, com revisão num app local
estilo frame.io; e carrosséis 4:5 (cru ou derivado de um vídeo), com o preset escolhido no app. Tudo pela skill
`.claude/skills/editor/` (comece pelo `SKILL.md`).

Responda em PT-BR, direto. Separe o que existe do que é plano.

## Estrutura

- `.claude/skills/editor/`: `SKILL.md` (os fluxos), `etapas/` (um .md por etapa, lido na hora), `edicao.md` (o contrato
  do `edicao.json`). Só o "como editar": o que é do criador mora na biblioteca.
- `ferramentas/`: um script por etapa, `uv run ferramentas/<script>.py` (dependências no próprio arquivo, PEP 723).
  `base.py` (os caminhos) e `servidor.py` são o comum. `ferramentas/inicial/`: o que uma biblioteca nova recebe.
- `render/`: a página que desenha a camada dos inserts e motions para o render (fonte em `render/src/`), e o que ela
  usa (`motion/`: runtime, GSAP e fontes; `fundos/`; `avatares/`).
- `app/`: o app de revisão. `uv run ferramentas/servidor.py` → http://localhost:8719/app/
- `biblioteca/` (fora do git; copia-se entre máquinas, por cima): `exemplos/` (criador.md e, por categoria de vídeo, as
  regras e os roteiros dirigidos, gerados pela Calibragem), `aprendizados/` (um .md por área com as correções do criador,
  e `imagens/`), presets, transições, sons, trilhas, LUTs, motions, banco de inserts, referências, códigos (os CTAs são projetos da categoria CTA) e
  `lixeira/` (o que se apaga no app: `base.para_lixeira`; restaurar ou apagar de vez pela página Lixeira).
- `projetos/<slug>/` (fora do git): um vídeo por pasta.
- `carrosseis/<slug>/` (fora do git): um carrossel por pasta (4:5; `ferramentas/carrossel.py`, os slides em
  `render/carrossel.html` e os 10 presets em `render/carrossel.css`).

Referência: `../18-harness-video-editor` (o app web anterior). Só leitura: copie ideias e código, nunca mexa lá.

## Regras de trabalho

- **Enxuto.** O `SKILL.md` fica curto; os .md das etapas crescem conforme a skill aprende. Nada de configuração, flag ou
  abstração antes de um caso real. Arquivo novo fora deste mapa: pergunte antes.
- **Decisões editoriais são do Claude**, guiadas por `biblioteca/exemplos/`; o código valida e calcula tempos.
- **Tudo preso às palavras** (IDs da transcrição), nunca a segundos (`edicao.md`).
- **Correção pontual não é regra geral.** Os aprendizados saem quando um vídeo é aprovado (`etapas/14-concluir.md`):
  junte-os por área, mostre ao criador e grave só o que ele confirmar.
- **Não declare aprovado** o que o criador não aprovou.
- Os originais em `projetos/*/midia/` nunca são alterados.
- Chaves (OpenRouter, ElevenLabs) só no `.env` da raiz. Nunca mostre, registre ou faça commit delas.
- Caminhos com espaços: use aspas. Docs de bibliotecas: Context7.

## Git

Commits na `main`, um por entrega, terminando com a linha de coautoria do Claude.
