# 04 · Inserts

Cada plano com insert (Insert tela cheia, Tela dividida · insert, Comentário + insert + ator) precisa de **mídia real**:
vídeos e imagens que mostrem o que a marcação pede. Você não busca nada no contexto principal: dispara **subagentes em
grupos de 3 pedidos, todos de uma vez, em segundo plano** (modelo `sonnet`), com **até 3 min por insert**, e segue para
outras etapas enquanto eles trabalham.

> **Antes de começar, leia `biblioteca/aprendizados/inserts.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/inserts.md`) (e mande cada subagente ler também)**: o que o criador já corrigiu em vídeos anteriores. Não repita esses erros.

## Rodar

```bash
uv run ferramentas/inserts.py listar <slug>      # cada pedido: id, formato, tempo, duração, fala, marcação, mídias
# … subagentes gravam projetos/<slug>/inserts/<plano>.json …
uv run ferramentas/inserts.py juntar <slug>      # liga as mídias achadas a cada pedido
```

## De onde vem a mídia (nesta ordem)

1. **Materiais do criador** (`projetos/<slug>/apoio/`): se servem, use-os (suba ao banco).
2. **O banco** (`banco.py buscar "<termos>"`): mídias já usadas em outros vídeos, com descrição, fonte e selo. Prefira
   as **★ usado em vídeo aprovado** e as **✓ aprovado** (o criador já gostou delas); evite as **✗ recusado** (ficaram de
   fora de um vídeo aprovado).
3. **Captura do site real** (`captura.py <url>`), quando a fala cita um site, ferramenta, produto ou repositório: grava
   a página rolando/carregando, como ela é. 16:9 para tela dividida; 9:16 (um computador em pé) para tela cheia. Num
   vídeo **deitado** (16:9), tudo em 16:9 (o brief já diz).
4. **Web, fontes oficiais**: o site, o blog, o changelog, o X ou o YouTube **do próprio produto** (vídeo: `yt-dlp` só do
   trecho útil; imagem: o arquivo original). Nunca o rosto de outro criador de conteúdo; nunca vídeo de outro criador.
   Registre a URL de cada mídia.
5. Nada real serve: diga no resultado; você decide depois entre um motion e trocar o plano para Full ator.

Sem imagem gerada por IA (o criador não pediu).

## Os subagentes (em grupos, pelos briefs da ferramenta)

```bash
uv run ferramentas/inserts.py briefs <slug> --contexto "<1 frase do vídeo>"   # um arquivo por grupo de 3 pedidos sem mídia
```
Dispare **um subagente por arquivo, todos no mesmo turno, em segundo plano** (Agent, `subagent_type: general-purpose`,
`model: sonnet`, `run_in_background: true`), com o prompt **só**: `Leia <caminho> e siga.` — não escreva o brief à mão
(o modelo é `04-brief-inserts.md`; mude lá). Com 24 inserts são 8 subagentes, abaixo do limite de 20 simultâneos, e sobra
vaga para o motion novo (que já deve estar rodando, ver `06`). Cada subagente grava um `inserts/<plano>.json` por insert.
Pedidos que ficaram sem mídia: `inserts.py briefs <slug> --grupo 1` só com eles, ou o plano B abaixo.

## Depois

- `inserts.py juntar <slug>`; leia o que ficou **sem mídia**. Para cada um: rode de novo com outra estratégia, ou troque
  o plano (motion novo, Full ator) — e então reaplique a direção (`direcao.py aplicar`) com o roteiro ajustado.
- Comentário + insert + ator: o card do comentário usa o texto do plano; a mídia é o insert por trás dele.
- O que entrou no banco fica para os próximos vídeos (o banco cresce sozinho).

Tempo esperado: ≤ 3 min (em paralelo com Áudio, Legenda e Transições).
