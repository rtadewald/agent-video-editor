// Os carrosséis (4:5): a aba (#/carrosseis: a lista e o "+ Carrossel") e a página de um (#/c/<slug>[/vN]: os slides ao
// vivo, o preset e o destaque, o texto do slide editável, os comentários por slide e o aprovar). Os slides são a página
// render/carrossel.html num iframe; trocar o preset, ou editar o texto, avisa os iframes (postMessage) e grava. O Claude
// escreve os slides (carrossel.py).
import { $, $$, ICONE, abrirAba, agora, aviso, confirmar, copiar, enviar, esc, fecharAba, janela, json, preferencia, quandoCurto } from './comum.js'

const ESTADOS = { novo: ['Aguardando o Claude', 'selo-amarelo'], em_revisao: ['Em revisão', 'selo-coral'], aprovado: ['Aprovado', 'selo-menta'] }
const TIPOS = { cru: 'Cru', derivado: 'Derivado' }

/** Um slide ao vivo: o iframe de 1080×1350 encolhido para a largura da caixa (`escalar` acerta a escala). */
const quadro = (slug, v, i, preset, destaque = 1, extra = '') =>
  `<div class="slide-quadro" ${extra}><iframe src="/render/carrossel.html?c=${encodeURIComponent(slug)}&v=${v}&s=${i}&preset=${preset}&destaque=${destaque}" loading="lazy" tabindex="-1" title="Slide ${i + 1}"></iframe></div>`
function escalar(raiz) {
  for (const q of $$('.slide-quadro', raiz)) q.style.setProperty('--s', q.clientWidth / 1080)
}
const avisar = (raiz, msg) => {
  for (const f of $$('.slide-quadro iframe', raiz)) f.contentWindow?.postMessage(msg, '*')
}

// o editor do texto de um slide: parágrafos (<p>), quebra de linha (<br>) e o **destaque** (<mark>), como no slide
const paraEditor = (t) => String(t || '').trim().split(/\n\s*\n/).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/\n/g, '<br>')}</p>`).join('') || '<p><br></p>'
function doEditor(ed) {
  const inline = (n, marcado) => [...n.childNodes].map((x) => {
    if (x.nodeType === 3) return x.nodeValue.replace(/\u00a0/g, ' ')
    if (x.nodeType !== 1) return ''
    if (x.tagName === 'BR') return '\n'
    if (['MARK', 'B', 'STRONG'].includes(x.tagName)) {
      const d = inline(x, true)
      return marcado || !d.trim() ? d : `**${d}**`
    }
    return (['DIV', 'P'].includes(x.tagName) ? '\n' : '') + inline(x, marcado)
  }).join('')
  const blocos = []
  let solto = ''
  for (const x of ed.childNodes) {
    if (x.nodeType === 1 && ['P', 'DIV'].includes(x.tagName)) {
      blocos.push(solto, inline(x))
      solto = ''
    } else solto += inline({ childNodes: [x] })
  }
  blocos.push(solto)
  return blocos.map((b) => b.replace(/\*\*(\s*)([^*]*?)(\s*)\*\*/g, '$1**$2**$3').split('\n').map((l) => l.trimEnd()).join('\n').trim())
    .filter(Boolean).join('\n\n')
}
/** Liga ou desliga o destaque: dentro de um, tira; senão, marca a seleção. */
function destacar(ed) {
  const sel = getSelection()
  if (!sel.rangeCount) return false
  const r = sel.getRangeAt(0)
  if (!ed.contains(r.commonAncestorContainer)) return false
  const marca = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest('mark')
  const m = marca(r.startContainer) || marca(r.endContainer)
  if (m && ed.contains(m)) {
    m.replaceWith(...m.childNodes)
    ed.normalize()
  } else if (!r.collapsed) {
    const novo = document.createElement('mark')
    novo.append(r.extractContents())
    for (const x of novo.querySelectorAll('mark')) x.replaceWith(...x.childNodes)
    r.insertNode(novo)
    sel.selectAllChildren(novo)
  } else return false
  return true
}

// ---------------------------------------------------------------- a aba (a lista)

export async function abrirCarrosseis(tela) {
  tela.className = 'pagina pagina-inicio pagina-carrosseis'
  let { carrosseis = [] } = await json('/api/carrosseis', {})
  let filtro = preferencia('carrosseis.tipo', '')
  const card = (c) => {
    const [estado, cor] = ESTADOS[c.estado] || ESTADOS.em_revisao
    return `<div class="caixa-projeto" data-slug="${esc(c.slug)}">
      <button class="apagar-projeto" data-apagar title="Apagar o carrossel" aria-label="Apagar ${esc(c.nome)}">${ICONE.lixo}</button>
      ${c.tem_final ? `<button class="abrir-exports" data-abrir-final title="Abrir a pasta dos exports no Finder" aria-label="Abrir os exports de ${esc(c.nome)}">${ICONE.abrir}</button>` : ''}
      <a class="card-projeto" href="#/c/${encodeURIComponent(c.slug)}">
        <div class="mini mini-45">${c.ultima ? quadro(c.slug, c.ultima, 0, c.preset, c.destaque) : `<div class="mini-vazio">${ICONE.balaoTexto}<span>O Claude ainda vai montar</span></div>`}
          <span class="selo ${cor}">${estado}</span></div>
        <div class="card-titulo"><h3 title="${esc(c.nome)}">${esc(c.nome)}</h3></div>
        <p class="sub">${TIPOS[c.tipo] || c.tipo}${c.origem ? ` · de ${esc(c.origem_nome)}` : ''}${c.ultima ? ` · ${c.slides} slides · v${c.ultima}` : ''}${c.comentarios ? ` · ${c.comentarios} ${c.comentarios === 1 ? 'comentário' : 'comentários'}` : ''}</p>
      </a></div>`
  }
  const desenhar = () => {
    const lista = carrosseis.filter((c) => !filtro || c.tipo === filtro)
    const hoje = (c) => new Date(c.atualizado * 1000).toDateString() === new Date().toDateString()
    const aprovados = lista.filter((c) => c.estado === 'aprovado')
    const grupos = [['Em edição', lista.filter((c) => c.estado !== 'aprovado')], ['Aprovados · hoje', aprovados.filter(hoje)], ['Aprovados · antigos', aprovados.filter((c) => !hoje(c))]]
      .filter(([, cs]) => cs.length)
    tela.innerHTML = `<div class="cabeca-secao"><span class="eyebrow">Carrosséis · ${String(lista.length).padStart(2, '0')}</span>
        <div class="filtro-categorias">${['', 'cru', 'derivado'].map((t) => `<button class="pilula pequena${filtro === t ? ' ativa' : ''}" data-tipo="${t}">${t ? TIPOS[t] : 'Todos'} <span class="conta">${carrosseis.filter((c) => !t || c.tipo === t).length}</span></button>`).join('')}</div>
        <button class="botao botao-coral" data-novo>${ICONE.mais} Carrossel</button></div>
      ${grupos.length ? grupos.map(([g, cs]) => `<h4 class="grupo-data">${g} · ${cs.length}</h4><div class="grade grade-projetos">${cs.map(card).join('')}</div>`).join('')
        : '<p class="vazio">Nenhum carrossel ainda. Crie um no “+ Carrossel”: do zero (cru) ou a partir de um vídeo (derivado).</p>'}`
    escalar(tela)
  }
  desenhar()
  const ro = new ResizeObserver(() => escalar(tela))
  ro.observe(tela)
  const cliques = async (e) => {
    const t = e.target.closest('[data-tipo]')
    if (t) {
      filtro = preferencia('carrosseis.tipo', '', t.dataset.tipo)
      return desenhar()
    }
    if (e.target.closest('[data-novo]')) return criar()
    const caixa = e.target.closest('.caixa-projeto')
    const c = caixa && carrosseis.find((x) => x.slug === caixa.dataset.slug)
    if (c && e.target.closest('[data-abrir-final]')) {
      e.preventDefault()
      return enviar('POST', `/api/carrosseis/${encodeURIComponent(c.slug)}/abrir-final`).catch((err) => aviso(err.message, 'erro'))
    }
    if (c && e.target.closest('[data-apagar]')) {
      if (!(await confirmar({ titulo: `Apagar o carrossel “${c.nome}”?`, texto: 'Ele vai para a Lixeira, de onde dá para restaurar.', ok: 'Apagar', perigo: true }))) return
      try {
        await enviar('DELETE', `/api/carrosseis/${encodeURIComponent(c.slug)}`)
        carrosseis = carrosseis.filter((x) => x !== c)
        fecharAba(c.slug, true)
        desenhar()
        aviso(`“${c.nome}” foi para a Lixeira`)
      } catch (err) {
        aviso(err.message, 'erro')
      }
    }
  }
  tela.addEventListener('click', cliques)
  return () => ro.disconnect()
}

/** O "+ Carrossel": cru (o pedido e os arquivos) ou derivado (o vídeo de origem). Cria a pasta, sobe os arquivos e copia o
 *  "Carrossel novo · <slug>" para colar no chat do Claude Code. */
async function criar() {
  const projetos = (await json('/api/projetos', [])).filter((p) => !p.oculto)
  let tipo = preferencia('carrosseis.novo', 'derivado')
  const { el, fechar } = janela(`<div class="janela-cabeca"><h2>Novo carrossel</h2><button class="botao-icone" data-fechar aria-label="Fechar">${ICONE.fechar}</button></div>
    <form class="form-saida form-carrossel">
      <div class="filtro-categorias">${Object.entries(TIPOS).map(([t, n]) => `<button type="button" class="pilula pequena" data-tipo-novo="${t}">${n}</button>`).join('')}</div>
      <label class="campo" data-so="derivado"><span class="eyebrow">Vídeo de origem</span><select name="origem">${projetos.map((p) => `<option value="${esc(p.slug)}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="campo"><span class="eyebrow">Nome</span><input name="nome" placeholder="Opcional: sem nome, vale o do vídeo ou o do pedido"></label>
      <label class="campo"><span class="eyebrow">Pedido</span><textarea name="pedido" rows="5" placeholder="O que o carrossel diz: o briefing, a copy, a nota do Obsidian… (opcional no derivado)"></textarea></label>
      <label class="campo" data-so="cru"><span class="eyebrow">Arquivos</span><input type="file" name="arquivos" multiple accept="image/*,video/*,.md,.txt"></label>
      <p class="dica">O Claude escreve os slides e busca a mídia; você escolhe o preset e comenta. Ao criar, o pedido vai para a área de transferência: cole no chat do Claude Code.</p>
      <div class="acoes-linha"><button type="button" class="botao" data-fechar>Cancelar</button><button class="botao botao-coral" type="submit">Criar e copiar</button></div>
    </form>`, { classe: 'janela-novo-carrossel' })
  const marcar = () => {
    for (const b of $$('[data-tipo-novo]', el)) b.classList.toggle('ativa', b.dataset.tipoNovo === tipo)
    for (const x of $$('[data-so]', el)) x.hidden = x.dataset.so !== tipo
  }
  marcar()
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo-novo]')
    if (b) {
      tipo = preferencia('carrosseis.novo', 'derivado', b.dataset.tipoNovo)
      marcar()
    }
  })
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = e.target
    const botao = $('[type=submit]', f)
    botao.disabled = true
    try {
      const origem = tipo === 'derivado' ? f.origem.value : null
      const nome = f.nome.value.trim() || (origem ? projetos.find((p) => p.slug === origem)?.nome : '') || f.pedido.value.trim().split('\n')[0].slice(0, 60)
      const { slug } = await enviar('POST', '/api/carrosseis', { nome, tipo, origem, pedido: f.pedido.value })
      for (const arq of tipo === 'cru' ? f.arquivos.files : []) {
        botao.textContent = `Enviando ${arq.name}…`
        const r = await fetch(`/api/carrosseis/${encodeURIComponent(slug)}/entrada`, { method: 'POST', headers: { 'X-Nome': encodeURIComponent(arq.name) }, body: arq })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `Erro ao enviar ${arq.name}`)
      }
      await copiar(`Carrossel novo · ${slug}`)
      fechar()
      aviso('Criado e copiado: cole no chat do Claude Code')
      location.hash = `#/c/${encodeURIComponent(slug)}`
    } catch (err) {
      aviso(err.message, 'erro')
      botao.disabled = false
      botao.textContent = 'Criar e copiar'
    }
  })
}

// ---------------------------------------------------------------- a página de um carrossel

export async function abrirCarrossel(tela, slug, pedida) {
  tela.className = 'pagina pagina-carrossel'
  const c = await json(`/api/carrosseis/${encodeURIComponent(slug)}`)
  if (!c) {
    tela.innerHTML = '<p class="vazio">Carrossel não encontrado. <a href="#/carrosseis">Voltar aos carrosséis</a></p>'
    return
  }
  abrirAba(slug, c.nome, false, true) // a aba de cima, ao lado dos projetos abertos
  const v = c.versoes.includes(pedida) ? pedida : c.ultima
  if (!v) {
    tela.innerHTML = `<div class="cabeca-secao cabeca-carrossel"><a class="botao pequeno" href="#/carrosseis">${ICONE.voltar} Carrosséis</a><h2 class="nome-carrossel">${esc(c.nome)}</h2></div>
      <div class="carrossel-esperando"><p class="resumo"><b>O Claude ainda não montou a v1.</b> Cole no chat do Claude Code:</p>
        <button class="botao" data-copiar-pedido>${ICONE.copiar} Carrossel novo · ${esc(slug)}</button>
        ${c.pedido ? `<p class="dica">Pedido: ${esc(c.pedido)}</p>` : ''}${c.entrada.length ? `<p class="dica">Arquivos: ${c.entrada.map(esc).join(', ')}</p>` : ''}</div>`
    $('[data-copiar-pedido]', tela).onclick = () => copiar(`Carrossel novo · ${slug}`).then(() => aviso('Copiado: cole no chat do Claude Code'))
    return
  }
  const versao = await json(`/carrosseis/${encodeURIComponent(slug)}/versoes/v${v}.json`, { slides: [] })
  const rev = c.revisoes[v] || {}
  rev.comentarios ||= []
  let preset = c.preset
  let destaque = c.destaque || 1
  let atual = Math.min(preferencia(`carrossel.${slug}.slide`, 0), versao.slides.length - 1)
  let ponto = null // o ponto marcado no slide grande para o próximo comentário ({x, y} de 0 a 1)
  const ultima = v === c.ultima
  let salvarTexto = null // a gravação pendente do texto editado (sai ao parar de digitar ou ao trocar de slide)

  const gravar = async () => {
    try {
      return await enviar('PUT', `/api/carrosseis/${encodeURIComponent(slug)}/revisao/v${v}`, rev)
    } catch (err) {
      aviso(err.message, 'erro')
    }
  }
  const doSlide = (i) => rev.comentarios.filter((x) => x.slide === i && (x.texto || '').trim())
  const comentario = (x) => `<li class="comentario-carrossel" data-id="${esc(x.id)}">
      ${x.x != null ? `<span class="pino-n" title="O ponto marcado no slide">●</span>` : ''}<p>${esc(x.texto)}</p>
      <span class="sub">${quandoCurto(x.criado_em)}${x.status && x.status !== 'pendente' ? ` · <b class="t-aplicado">${esc(x.status.replace('_', ' '))}</b>` : ''}</span>
      ${x.resposta ? `<p class="resposta-claude">${esc(x.resposta)}</p>` : ''}
      ${!rev.aprovado ? `<button class="botao-icone pequeno" data-tirar title="Apagar o comentário" aria-label="Apagar">${ICONE.lixo}</button>` : ''}</li>`

  // a página é montada uma vez (os slides são iframes: recarregá-los pisca); o resto se redesenha por partes
  const cabeca = () => `<a class="botao pequeno" href="#/carrosseis">${ICONE.voltar} Carrosséis</a>
      <h2 class="nome-carrossel">${esc(c.nome)}</h2>
      <span class="sub">${TIPOS[c.tipo]}${c.origem ? ` · de <a class="link" href="#/p/${encodeURIComponent(c.origem)}">${esc(c.origem_nome)}</a>` : ''}</span>
      <select class="versao-carrossel" data-versao>${[...c.versoes].reverse().map((x) => `<option value="${x}"${x === v ? ' selected' : ''}>v${x}${x === c.ultima ? ' · atual' : ''}</option>`).join('')}</select>
      <span class="espaco"></span>
      ${c.tem_final ? `<button class="botao pequeno" data-abrir-final title="Abrir a pasta dos exports">${ICONE.abrir} Exports</button>` : ''}
      ${c.exportando ? '<span class="sub">exportando…</span>' : ''}
      <button class="botao pequeno" data-copiar-revisao title="Cole no chat do Claude Code: ele lê os comentários e faz a próxima versão">${ICONE.copiar} Copiar revisão</button>
      ${ultima ? (rev.aprovado ? `<button class="botao pequeno botao-verde" data-desaprovar title="Desaprovar (volta para Em revisão)">${ICONE.check} Aprovado</button>`
        : `<button class="botao pequeno botao-coral" data-aprovar title="Aprovar: exporta os slides (PNG/MP4) e a legenda em final/">${ICONE.check} Aprovar</button>`) : ''}`
  const pinos = () => `${doSlide(atual).filter((x) => x.x != null).map((x, k) => `<span class="pino" style="left:${x.x * 100}%;top:${x.y * 100}%">${k + 1}</span>`).join('')}${ponto ? `<span class="pino novo" style="left:${ponto.x * 100}%;top:${ponto.y * 100}%">+</span>` : ''}`
  const editavel = () => ultima && !rev.aprovado
  // o lado do slide: o texto (editável na última versão), o porquê, os comentários curtos e a legenda (fechada)
  const lado = () => {
    const s = versao.slides[atual] || {}
    const gerais = doSlide(null)
    return `<span class="eyebrow">Slide ${atual + 1} de ${versao.slides.length} · ${esc(s.tipo || '')}</span>
      <div class="editor-texto" data-editor${editavel() ? ' contenteditable="true" spellcheck="true"' : ''}>${paraEditor(s.texto)}</div>
      ${editavel() ? `<div class="acoes-linha editor-acoes"><button type="button" class="botao pequeno" data-destacar title="Selecione o trecho e destaque (⌘B); dentro de um destaque, tira">Destacar</button><span class="sub" data-salvo></span></div>`
        : `<p class="dica">${rev.aprovado ? 'Aprovado: desaprove para editar o texto.' : 'Só a última versão se edita.'}</p>`}
      ${s.porque ? `<p class="dica">Por quê: ${esc(s.porque)}</p>` : ''}
      <span class="eyebrow">Comentários</span>
      ${doSlide(atual).length ? `<ul class="comentarios-carrossel">${doSlide(atual).map(comentario).join('')}</ul>` : ''}
      ${!rev.aprovado ? `<form class="campo novo-comentario" data-comentar><textarea rows="2" placeholder="${ponto ? 'No ponto marcado…' : 'Sobre este slide (clique nele para marcar um ponto)…'}"></textarea>
        <div class="acoes-linha">${ponto ? '<button type="button" class="link" data-sem-ponto>Tirar o ponto</button>' : ''}<button class="botao pequeno botao-coral">Comentar</button></div></form>` : ''}
      ${gerais.length ? `<span class="eyebrow">Gerais</span><ul class="comentarios-carrossel">${gerais.map(comentario).join('')}</ul>` : ''}
      <details class="legenda-carrossel"><summary class="eyebrow">Legenda do post</summary><p>${esc(versao.legenda || '(sem legenda)')}</p></details>`
  }
  /** Grava o texto editado do slide i (o slide no app já mudou ao vivo). */
  const gravarTexto = async (i, texto) => {
    const salvo = $('[data-salvo]', tela)
    if (salvo) salvo.textContent = 'Salvando…'
    try {
      await enviar('PUT', `/api/carrosseis/${encodeURIComponent(slug)}/texto/v${v}/${i}`, { texto })
      if (i === atual && salvo) salvo.textContent = 'Salvo'
    } catch (err) {
      aviso(err.message, 'erro')
      if (salvo) salvo.textContent = ''
    }
  }
  const textoMudou = () => {
    const ed = $('[data-editor]', tela)
    const i = atual
    const texto = doEditor(ed)
    versao.slides[i].texto = texto
    avisar(tela, { slide: i, texto })
    clearTimeout(salvarTexto?.t)
    salvarTexto = { t: setTimeout(() => { salvarTexto = null; gravarTexto(i, texto) }, 700), i, texto }
    $('[data-salvo]', tela).textContent = ''
  }
  const gravarPendente = () => {
    if (!salvarTexto) return
    clearTimeout(salvarTexto.t)
    const { i, texto } = salvarTexto
    salvarTexto = null
    return gravarTexto(i, texto)
  }
  // à esquerda os slides; no meio o slide grande; à direita o visual (preset e destaque) e a conversa
  tela.innerHTML = `<div class="cabeca-secao cabeca-carrossel"></div>
    <div class="corpo-carrossel">
      <nav class="fita-carrossel">${versao.slides.map((x, i) => `<button class="slide-mini" data-ir="${i}" title="Slide ${i + 1} · ${esc(x.tipo)}">${quadro(slug, v, i, preset, destaque)}<span class="n-slide">${i + 1}</span><span class="n-coment"></span></button>`).join('')}</nav>
      <div class="palco-carrossel">
        <div class="slide-grande" data-grande><div class="lugar-grande"></div><div class="pinos"></div></div>
      </div>
      <aside class="lado-carrossel">
        <span class="eyebrow">Preset</span>
        <div class="presets-carrossel">${c.presets.map((p) => `<button class="pilula pequena${p.id === preset ? ' ativa' : ''}" data-preset="${p.id}" title="${esc(p.descricao)}"><i class="amostra-preset amostra-${p.id}"></i>${esc(p.nome)}</button>`).join('')}</div>
        <span class="eyebrow">Destaque</span>
        <div class="destaques-carrossel"></div>
        <div class="conversa-carrossel"></div>
      </aside>
    </div>`
  let noGrande = -1
  /** Redesenha o que mudou: o cabeçalho, o slide grande (só se trocou de slide), os pinos, os selos da fita e o lado. */
  // os 5 destaques do preset escolhido (o nome de cada um; o slide mostra como fica)
  const destaques = () => (c.presets.find((p) => p.id === preset)?.destaques || []).map((nome, k) =>
    `<button class="pilula pequena${k + 1 === destaque ? ' ativa' : ''}" data-destaque="${k + 1}" title="Destaque ${k + 1}: ${esc(nome)}"><b>${k + 1}</b> ${esc(nome)}</button>`).join('')
  const desenhar = () => {
    $('.cabeca-carrossel', tela).innerHTML = cabeca()
    $('.destaques-carrossel', tela).innerHTML = destaques()
    if (noGrande !== atual) {
      $('.lugar-grande', tela).innerHTML = quadro(slug, v, atual, preset, destaque)
      noGrande = atual
    }
    $('.pinos', tela).innerHTML = pinos()
    for (const b of $$('.slide-mini', tela)) {
      const i = +b.dataset.ir
      b.classList.toggle('ativo', i === atual)
      const n = doSlide(i).length
      $('.n-coment', b).textContent = n || ''
      $('.n-coment', b).hidden = !n
    }
    $('.conversa-carrossel', tela).innerHTML = lado()
    escalar(tela)
    // o slide ativo à vista na fita (só ela rola; o scrollIntoView rolaria a página junto)
    const fita = $('.fita-carrossel', tela)
    const ativo = $('.slide-mini.ativo', tela)
    if (ativo) {
      const [f, a] = [fita.getBoundingClientRect(), ativo.getBoundingClientRect()]
      if (a.top < f.top) fita.scrollTop -= f.top - a.top + 4
      else if (a.bottom > f.bottom) fita.scrollTop += a.bottom - f.bottom + 4
    }
  }
  desenhar()
  const ro = new ResizeObserver(() => escalar(tela))
  ro.observe(tela)
  // a exportação roda no servidor: acompanha até acabar (o botão Exports aparece)
  let vigia
  const vigiar = () => {
    clearTimeout(vigia)
    if (!c.exportando) return
    vigia = setTimeout(async () => {
      const agoraC = await json(`/api/carrosseis/${encodeURIComponent(slug)}`)
      if (!agoraC) return
      Object.assign(c, { exportando: agoraC.exportando, tem_final: agoraC.tem_final })
      if (!c.exportando) {
        aviso('Exportado: os slides e a legenda estão em final/')
        desenhar()
      }
      vigiar()
    }, 3000)
  }
  vigiar()

  const comentar = async (texto, slide, p) => {
    if (!texto.trim()) return
    const n = Math.max(0, ...rev.comentarios.map((x) => +String(x.id).slice(1) || 0)) + 1
    rev.comentarios.push({ id: `c${n}`, slide, ...(p ? { x: +p.x.toFixed(3), y: +p.y.toFixed(3) } : {}), texto: texto.trim(), criado_em: agora(), status: 'pendente' })
    ponto = null
    await gravar()
    desenhar()
  }
  tela.addEventListener('submit', (e) => {
    e.preventDefault()
    comentar($('textarea', e.target).value, atual, ponto)
  })
  tela.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.matches('.novo-comentario textarea')) e.target.form.requestSubmit()
    const ed = e.target.closest?.('[data-editor]')
    if (ed && (e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault() // nada de negrito, itálico ou sublinhado do navegador: só o destaque
      if (e.key.toLowerCase() === 'b' && destacar(ed)) textoMudou()
    }
  })
  tela.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-destacar]')) e.preventDefault() // o editor não perde a seleção
  })
  tela.addEventListener('input', (e) => {
    if (e.target.closest('[data-editor]')) textoMudou()
  })
  tela.addEventListener('paste', (e) => {
    if (!e.target.closest?.('[data-editor]')) return
    e.preventDefault() // colar vira texto puro
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  })
  tela.addEventListener('focusout', (e) => {
    if (e.target.closest?.('[data-editor]')) gravarPendente()
  })
  tela.addEventListener('change', (e) => {
    if (e.target.matches('[data-versao]')) location.hash = `#/c/${encodeURIComponent(slug)}/v${e.target.value}`
  })
  tela.addEventListener('click', async (e) => {
    if (e.target.closest('[data-destacar]')) {
      const ed = $('[data-editor]', tela)
      if (destacar(ed)) textoMudou()
      return
    }
    const ir = e.target.closest('[data-ir]')
    if (ir) {
      gravarPendente()
      atual = preferencia(`carrossel.${slug}.slide`, 0, +ir.dataset.ir)
      ponto = null
      return desenhar()
    }
    const pr = e.target.closest('[data-preset], [data-destaque]')
    if (pr && (pr.dataset.preset ? pr.dataset.preset !== preset : +pr.dataset.destaque !== destaque)) {
      if (pr.dataset.preset) preset = pr.dataset.preset
      else destaque = +pr.dataset.destaque
      for (const b of $$('[data-preset]', tela)) b.classList.toggle('ativa', b.dataset.preset === preset)
      $('.destaques-carrossel', tela).innerHTML = destaques()
      avisar(tela, { preset, destaque })
      try {
        const r = await enviar('PUT', `/api/carrosseis/${encodeURIComponent(slug)}/preset`, { preset, destaque })
        if (r.exportando) {
          aviso('Visual trocado: exportando de novo com ele')
          c.exportando = true
          desenhar()
          vigiar()
        }
      } catch (err) {
        aviso(err.message, 'erro')
      }
      return
    }
    const grande = e.target.closest('[data-grande]')
    if (grande && !rev.aprovado) {
      const r = grande.getBoundingClientRect()
      ponto = { x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) }
      desenhar()
      return $('[data-comentar] textarea', tela)?.focus()
    }
    if (e.target.closest('[data-sem-ponto]')) {
      ponto = null
      return desenhar()
    }
    const tirar = e.target.closest('[data-tirar]')
    if (tirar) {
      rev.comentarios = rev.comentarios.filter((x) => x.id !== tirar.closest('[data-id]').dataset.id)
      await gravar()
      return desenhar()
    }
    if (e.target.closest('[data-copiar-revisao]')) {
      await copiar(`Revisão carrossel · ${slug} · v${v}`)
      return aviso('Copiado: cole no chat do Claude Code')
    }
    if (e.target.closest('[data-abrir-final]')) return enviar('POST', `/api/carrosseis/${encodeURIComponent(slug)}/abrir-final`).catch((err) => aviso(err.message, 'erro'))
    if (e.target.closest('[data-aprovar]')) {
      if (!(await confirmar({ titulo: `Aprovar “${c.nome}”?`, texto: `Exporta os ${versao.slides.length} slides no preset ${c.presets.find((p) => p.id === preset)?.nome}, destaque ${destaque} (PNG e MP4) e a legenda.`, ok: 'Aprovar e exportar' }))) return
      rev.aprovado = true
      const r = await gravar()
      c.exportando = !!r?.exportando
      aviso('Aprovado: exportando em segundo plano')
      desenhar()
      return vigiar()
    }
    if (e.target.closest('[data-desaprovar]')) {
      rev.aprovado = false
      await gravar()
      return desenhar()
    }
  })
  return () => {
    ro.disconnect()
    clearTimeout(vigia)
    gravarPendente()
  }
}
