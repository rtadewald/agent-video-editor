Escreva um preset de motion novo em {raiz}/biblioteca/motions/presets/{preset}.html (id: {preset}) para o editor de
Reels em {raiz}.
Leia antes: os APRENDIZADOS no fim deste brief (o que o criador já corrigiu nos motions, em qualquer vídeo e nos de
{categoria}, a categoria deste: não repita nenhum); os recusados em
{raiz}/biblioteca/motions/presets/_recusados/ (o JSON do topo tem o `motivo`), para não repetir; 2 presets existentes
(prompt.html e lettering.html) e {raiz}/render/motion/runtime.js: copie a estrutura (o JSON <script id="preset">
com nome, descricao, fundo, duracao, sons, "a_revisar": true e "projeto": "{projeto}"; o <script id="campos">; o <style>; a timeline do GSAP
pausada entregue com motion.pronto(tl); motion.som/motion.digitar/motion.curva/motion.aCada).
Pedido: {pedido}
Formato: {formato} ({palco}) · duração ~{duracao} s · fala: "{fala}"
{extra}
Estilo: 3D, na linha de {raiz}/biblioteca/motions/presets/entrada-saida-3d.html (leia-o inteiro e copie a estrutura:
importmap do Three.js em /render/motion/three/, a cena desenhada no motion.aCada, bloom, chão que reflete, vidro e
metal, câmera sempre andando; o EffectComposer com um WebGLRenderTarget de samples: 4, senão as arestas serrilham); só faça em 2D se o pedido for uma janela de app real.
Regras: poucos elementos; quase nenhum texto além de rótulos curtos (campos editáveis com esses padrões); entrada curta
e suave, chegada longa (curva perto de 0.25,0.1,0.1,1 em 0,8–1 s), nunca linear; a cena nunca para até o corte; fontes
Inter, Instrument Serif ou SF Pro; sons só da biblioteca (biblioteca/sons/catalogo.json). Texto legível num celular (não
menor que ~28 px no palco de 1080). Algo já na tela no 1º quadro: nunca o fundo vazio esperando uma palavra.
Nunca zoom na mídia dentro de um card ou quadro (ela fica parada, preenchendo-o); a aproximação, se houver, é no card
inteiro ou na cena. Cada movimento visível tem o som certo e nenhum som fica sem movimento: motion.som(m, t) põe o PICO
do som (o "ataque" do catálogo) em t; motion.som(m, t, dur) começa o som em t e corta em dur. Pop ou clique no instante
em que o elemento aparece; whoosh no meio do deslocamento; desenho de linha com dur do traço; nunca um som de ataque
longo (> 0,5 s) sem dur. No teste, fotografe o instante de cada som e confira o movimento ali. No formato vertical, a cena ocupa a tela, centrada: nunca a metade de baixo (ou de cima)
vazia. A legenda vai onde sobrar espaço (diga em que altura, em fração, para o plano receber `legenda_y`).
Teste: abra render/motion.html?preset={preset}&formato={formato}&duracao={duracao}&tocar=1 com o servidor
(`uv run ferramentas/servidor.py <porta livre>`) e fotografe 4 instantes com Playwright; olhe as imagens e corrija até
ficar limpo e legível. No fim, grave a prévia que a página Motions do app toca: `uv run ferramentas/render.py
previas-motions {preset}`. Não ligue o motion ao plano (quem edita liga) e não edite outros arquivos. Responda com o id,
os campos e 1 linha sobre como ficou.

APRENDIZADOS (motions)
{aprendizados}
