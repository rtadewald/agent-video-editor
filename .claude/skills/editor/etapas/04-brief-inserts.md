Você busca a mídia de {n} inserts de um Reels, um de cada vez, na ordem. Repositório: {raiz}. Rode os scripts com
`cd "{raiz}" && uv run ferramentas/<x>.py`. Projeto: {slug}. Contexto do vídeo: {contexto}
Antes: leia o GUIA DE ESTILO no fim deste brief (o gosto do criador) e siga.
LIMITE: 3 minutos por insert. Estourou, deixe o melhor que tiver (ou nada) e passe ao próximo.

Os inserts:
{pedidos}

Para cada um, nesta ordem:
 (1) materiais do criador em projetos/{slug}/apoio/, se houver;
 (2) o banco: `banco.py buscar "<termos>"` (prefira ★ usado em vídeo aprovado e ✓ aprovado; evite ✗ recusado);
 (3) a captura do site real, quando a fala cita um site/ferramenta (ache a URL oficial com WebSearch):
     `captura.py <url> --proporcao <a do insert> --duracao <dur+1, mín. 4> --projeto {slug}`.
     Site pesado (3D/WebGL, animação de abertura longa) sai no loader: espere a página carregar antes de gravar (ou
     corte o começo com um trecho). Página do Cloudflare ("Attention Required", "Um momento…"): busque o HTML com
     `uvx --with curl_cffi python` (`requests.get(url, impersonate="chrome")`) e renderize-o local num Playwright (os
     CSS e imagens também pelo curl_cffi), ou troque de site;
 (4) web oficial: imagens/vídeos do próprio produto. Vídeo do YouTube ou do X: SEMPRE
     `uvx yt-dlp@latest -f "bv*[height<=2160]" --download-sections "*<ini>-<fim>" <url>` (o yt-dlp antigo leva 403 e
     só baixa 360p: nunca aceite 360p, o texto fica ilegível); os vídeos oficiais (canais da OpenAI, Anthropic, Google,
     n8n, Meta) mostram o produto em uso. Suba com
     `banco.py adicionar <arquivo> --nome … --descricao "<o que aparece, concreto>" --palavras … --fonte <url> --projeto {slug}`.
Nunca rosto ou vídeo de outro criador; nunca imagem gerada por IA; nunca mockup seu. Não procure "um site genérico
feito por IA" ao vivo (não existe como site real): use o que o banco tiver e, sem nada, deixe sem mídia e diga na nota.
Mídias: 1 a 3 (se a fala cita duas coisas, uma de cada). Vídeo com movimento é melhor que imagem parada; o vídeo precisa
durar pelo menos a duração do insert. Use material diferente entre os inserts vizinhos.
Confira o que achou: `folha.py <video>` e leia a imagem (começo, meio e fim); imagens, leia direto. Vídeo que você não
consegue julgar pelos quadros: `gemini.py <video> "<pergunta>"`. Só um trecho serve: `banco.py trecho <id> <ini> <fim>`
e use o id do trecho. Apague do banco o que você capturou ou baixou e NÃO usou: `banco.py apagar <id…>`.
Para cada insert, grave projetos/{slug}/inserts/<plano>.json = {{"plano": "<plano>", "midias": ["<banco_id>", …],
"fontes": ["<url>", …], "nota": "o que achou, ou por que não achou"}}. Não mexa no edicao.json nem em outros inserts.
Responda uma linha por insert: plano · ids · nota.

O GUIA DE ESTILO DO CRIADOR
{aprendizados}
