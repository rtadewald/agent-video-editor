# 04 · Inserts

Cada plano com insert (Insert tela cheia, Tela dividida · insert, Comentário + insert + ator) precisa de **mídia real**:
vídeos e imagens que mostrem o que a marcação pede. **Você faz todos, um por um, até o "é isso"**, não o primeiro que
serve. Desde 2026-11-18 nada de subagente escolhendo mídia: os do sonnet, com 3 min por insert, pegavam o primeiro
aceitável e não seguiam os aprendizados ("os inserts estão vindo de muito baixa qualidade"), e o criador gastava mais
tempo revisando do que a v1 rápida economizava.

> **Antes de começar, leia `biblioteca/aprendizados/inserts.md` (+ `biblioteca/exemplos/<categoria>/aprendizados/inserts.md`) inteiros.** A checagem abaixo resume; os aprendizados têm o como.

## Rodar

```bash
uv run ferramentas/inserts.py listar <slug>              # cada pedido: id, formato, tempo, duração, fala, marcação, mídias
uv run ferramentas/inserts.py ligar <slug> <plano> <ids…> # liga as mídias escolhidas
```

Vá na ordem do vídeo, começando pela **abertura** (os 3 a 5 primeiros segundos pesam mais que o resto). A cada 4–6
inserts ligados, os presets e o zoom deles e o pré-render em segundo plano (`05-enriquecimento.md`).

## De onde vem a mídia (nesta ordem)

1. **Materiais do criador** (`projetos/<slug>/apoio/`): se servem, use-os (suba ao banco).
2. **O banco** (`banco.py buscar "<termos>"`, e pelo projeto e pelas tags `projeto/…`: o que o criador gravou e fez): prefira
   as **★ usado em vídeo aprovado** e as **✓ aprovado**; evite as **✗ recusado**.
3. **Captura do site real** (`captura.py <url> --proporcao <16:9|9:16> --duracao <s> --projeto <slug>`), quando a fala
   cita um site, ferramenta, produto ou repositório. Num vídeo **deitado** (16:9), tudo em 16:9.
4. **Web, fontes oficiais**: o site, o blog, o changelog, o X ou o YouTube **do próprio produto** (vídeo:
   `uvx --from "yt-dlp[default]@latest" yt-dlp -f "bv*[height<=2160]" --download-sections "*<ini>-<fim>" <url>`, nunca
   360p; imagem: o arquivo original). Nunca o rosto ou o vídeo de outro criador de conteúdo. Registre a URL.
5. **Gravação própria**: o app do Claude Code, o hub da Asimov logado (Claude in Chrome), um terminal rodando de
   verdade, um arquivo real no editor (com as linhas citadas destacadas). Quando nada pronto prova a fala, faça a prova.
6. Nada real serve: troque o plano (motion, Full ator) e reaplique a direção (`direcao.py aplicar`).

Sem imagem gerada por IA, sem mockup. Para uma tarefa só mecânica e bem definida (baixar este trecho deste vídeo,
capturar esta URL), um subagente pode fazer em paralelo (`inserts.py brief <slug> <nome> --tarefa …`); a escolha e a
conferência continuam suas.

## A checagem (cada insert, antes de ligar)

Olhe os quadros do **instante da fala** (`folha.py <video>`, ou o ffmpeg nos segundos certos; nunca só a descrição do
banco). Um "não" e a mídia não entra:

- **Fala + prova:** mostra exatamente o que a frase diz, no instante em que a ação acontece? Se a fala cita um detalhe
  (número, nome, data, linha), ele aparece grande e legível no fim do plano?
- **Legível no celular:** em pé, no tamanho do plano (metade de cima ou tela toda), dá para ler o que importa? Página
  inteira encolhida, terminal miúdo, janela pequena sobre fundo colorido: não. Recorte e amplie só o que importa
  (`banco.py recortar`).
- **1º quadro com conteúdo:** nada de branco, loader ou tela de carregamento; e o trecho não pode começar 1 quadro
  antes da mídia trocar (olhe os 3 primeiros quadros do trecho: `banco.py trecho` com o início medido).
- **Produto em ação** em vez de página, doc ou tabela (página só se a fala cita a própria página).
- **Do criador primeiro:** apoio, banco `projeto/…` e ★ foram olhados antes da web?
- **Atual:** a interface e os nomes de hoje.
- **Proporção:** horizontal nunca cortado em 9:16; nada cropado; recortado no que impressiona.
- **Limpo:** sem marca d'água, cronômetro, legenda do original, barra do navegador, papel de parede, página poluída ou
  rolando rápido.
- **Fluido e nítido:** fps medido, 0 quadros repetidos (`mpdecimate`, ver os aprendizados), resolução que aguenta o
  4K, dura pelo menos o plano (nunca esticado em câmera lenta).
- **Variado:** não repete a mídia nem o mesmo tipo de tela dos vizinhos.
- **Na linha da ref** (`refs:` do roteiro): dá para fazer o plano do jeito que a ref mostra.

Passou em tudo **e é o melhor que existe para esta fala**: ligue. Senão, siga buscando. Anote no `porque` do plano o
que a mídia prova.

## Depois

- Apague do banco o que você baixou ou capturou e não usou (`banco.py apagar`).
- Comentário + insert + ator: o card do comentário usa o texto do plano; a mídia é o insert por trás dele.
- O que entrou no banco fica para os próximos vídeos (o banco cresce sozinho).

Tempo esperado: 1 a 2 min por insert (o "é isso" vale mais que o relógio).
