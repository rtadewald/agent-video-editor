// Um slide de carrossel (render/carrossel.html): lê a versão, monta o slide com as peças que todo preset recebe (o topo
// com o autor, o conteúdo, o pé com o contador e a seta) e encolhe o texto até caber. Cada preset (carrossel.css) mostra
// as peças que quer e decide o visual, inclusive o do destaque (**palavra** no texto vira <mark class="d">).
;(async function () {
  const q = new URLSearchParams(location.search)
  const slug = q.get('c')
  const exportar = q.get('exportar') === '1'
  const AUTOR = { nome: 'Rodrigo Tadewald', arroba: '@rodrigotadewald', iniciais: 'RT' }
  const el = document.querySelector('.slide')
  document.documentElement.dataset.preset = q.get('preset') || 'notas'
  if (exportar) document.documentElement.classList.add('exportar')

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  // o texto do slide: parágrafos na linha em branco, quebra na linha simples, **destaque**
  const texto = (t) => String(t || '').trim().split(/\n\s*\n/).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, '<mark class="d">$1</mark>').replace(/\n/g, '<br>')}</p>`).join('')
  const linha = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<mark class="d">$1</mark>').replace(/\n/g, '<br>')
  const url = (m) => (m.startsWith('/') ? m : `/carrosseis/${encodeURIComponent(slug)}/${m.split('/').map(encodeURIComponent).join('/')}`)
  const ehVideo = (m) => /\.(mp4|mov|webm|m4v)$/i.test(m || '')

  const versao = await fetch(`/carrosseis/${encodeURIComponent(slug)}/versoes/v${q.get('v')}.json`, { cache: 'no-store' }).then((r) => r.json())
  const slides = versao.slides || []
  const i = Math.min(Math.max(+q.get('s') || 0, 0), slides.length - 1)
  const s = slides[i] || {}
  const tipo = s.tipo || 'texto'
  const data = new Date(versao.criado_em || Date.now())
  const quando = `${data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

  let midia = ''
  if (s.midia) {
    const m = ehVideo(s.midia)
      ? `<video src="${url(s.midia)}" muted loop playsinline ${exportar ? 'preload="auto"' : 'autoplay'}></video>`
      : `<img src="${url(s.midia)}" alt="">`
    midia = `<figure class="midia${s.ajuste === 'conter' ? ' conter' : ''}">${m}</figure>`
  }
  const corpo = `${s.titulo ? `<h1 class="titulo">${linha(s.titulo)}</h1>` : ''}${s.texto ? `<div class="texto">${texto(s.texto)}</div>` : ''}${s.acao ? `<div class="acao"><span>${linha(s.acao)}</span></div>` : ''}`
  el.className = `slide t-${tipo}${s.midia ? ' com-midia' : ''}${i === 0 ? ' primeiro' : ''}${i === slides.length - 1 ? ' ultimo' : ''}`
  el.innerHTML = `<header class="topo"><span class="avatar">${AUTOR.iniciais}</span><span class="autor"><b>${AUTOR.nome}</b><i>${AUTOR.arroba}</i></span></header>
    ${tipo === 'midia' ? `${midia}<div class="conteudo sobre" data-data="${quando}">${corpo}</div>`
      : `<div class="conteudo" data-data="${quando}">${corpo}${midia}</div>`}
    <footer class="pe"><span class="contador">${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}</span><span class="arrasta">Arrasta</span></footer>`

  // o texto encolhe (até 60%) enquanto não cabe: nem dentro do conteúdo nem no slide (as peças passando da margem; o
  // fundo dos presets, maior que o slide para o desfoque, não conta)
  const conteudo = el.querySelector('.conteudo')
  const naoCabe = () => {
    if (conteudo.scrollHeight > conteudo.clientHeight + 1) return true
    const cs = getComputedStyle(el)
    const baixo = el.clientHeight - parseFloat(cs.paddingBottom)
    return [...el.children].some((c) => {
      if (getComputedStyle(c).display === 'none') return false
      const r = c.getBoundingClientRect()
      return r.top < -1 || r.bottom > (getComputedStyle(c).position === 'absolute' ? el.clientHeight : baixo) + 1
    })
  }
  const encaixar = () => {
    let e = 1
    conteudo.style.setProperty('--e', e)
    while (e > 0.6 && naoCabe()) {
      e = Math.round((e - 0.04) * 100) / 100
      conteudo.style.setProperty('--e', e)
    }
  }
  // onde o vídeo fica (px do slide), para o ffmpeg pôr o clipe no lugar dele
  const ondeVideo = () => {
    const f = el.querySelector('.midia')
    if (!f || !f.querySelector('video')) return null
    const r = f.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      raio: parseFloat(getComputedStyle(f).borderTopLeftRadius) || 0, conter: f.classList.contains('conter') }
  }
  const pronto = async () => {
    await document.fonts.ready
    await Promise.all([...el.querySelectorAll('img')].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r }))))
    encaixar()
    window.__carrossel = { pronto: true, tipo, video: ondeVideo(), frente: tipo === 'midia' && !!(s.titulo || s.texto || s.acao), som: !!s.som }
  }
  await pronto()

  // o app troca o preset de todos os slides de uma vez, sem recarregar
  window.addEventListener('message', (e) => {
    if (e.data?.preset) {
      document.documentElement.dataset.preset = e.data.preset
      pronto()
    }
    if (e.data?.tocar !== undefined) el.querySelector('video')?.[e.data.tocar ? 'play' : 'pause']?.()
  })
})()
