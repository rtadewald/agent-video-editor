// O comum das telas do app: buscar dados, montar HTML, formatar tempos, avisos e o diálogo de confirmação.

export const $ = (sel, raiz = document) => raiz.querySelector(sel)
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)]

/** Um JSON do servidor (sem cache); `padrao` se não existir ou falhar. */
export async function json(url, padrao = null) {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    return r.ok ? await r.json() : padrao
  } catch {
    return padrao
  }
}

/** Manda um JSON ao servidor (PUT, POST, DELETE) e devolve a resposta; um erro vem com a mensagem do servidor. */
export async function enviar(metodo, url, corpo) {
  const com = corpo !== undefined
  const r = await fetch(url, { method: metodo, headers: com ? { 'Content-Type': 'application/json' } : {}, body: com ? JSON.stringify(corpo) : undefined })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`)
  return d
}

/** Os nomes de uma pasta pública (pastas terminam em "/"). */
export const lista = (pasta) => json(`/api/lista?pasta=${encodeURIComponent(pasta)}`, [])

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Para buscar: sem acento e em minúsculas. */
export const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Todas as palavras da busca estão no texto (o texto já passou por `semAcento`). */
export const achaBusca = (texto, busca) => semAcento(busca).split(/\s+/).filter(Boolean).every((p) => texto.includes(p))

export const num = (x, casas = 1) =>
  Number(x || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

/** O tempo do vídeo como o criador lê: m:ss,d (0:03,2). */
export function tempo(t) {
  const d = Math.floor(Math.max(0, t || 0) * 10 + 1e-6)
  return `${Math.floor(d / 600)}:${String(Math.floor((d % 600) / 10)).padStart(2, '0')},${d % 10}`
}

/** m:ss (durações de vídeo e música). */
export const mmss = (t) => `${Math.floor((t || 0) / 60)}:${String(Math.round((t || 0) % 60)).padStart(2, '0')}`

/** Segundos curtos: "2,7 s". */
export const seg = (t) => `${num(t, t < 10 ? 1 : 0)} s`

/** Agora, no formato dos JSONs do projeto (ISO local, sem fuso nem milissegundos). */
/** Quando, curto e relativo a hoje: "hoje 15:20", "ontem 9:10", "seg 14:00" (até 6 dias), "12/10" (no ano), "12/10/25". */
export function quandoCurto(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const h = new Date()
  const dias = Math.round((new Date(h.getFullYear(), h.getMonth(), h.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5)
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  if (dias <= 0) return `hoje ${hora}`
  if (dias === 1) return `ontem ${hora}`
  if (dias < 7) return `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()]} ${hora}`
  return d.getFullYear() === h.getFullYear() ? dm : `${dm}/${String(d.getFullYear()).slice(2)}`
}

export function agora() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** "09/10 22:31" a partir do ISO local. */
export const dataHora = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}` : '')

let avisoTimer
/** Um aviso rápido no pé da tela. */
export function aviso(texto, tipo = 'ok') {
  const el = $('#aviso')
  el.textContent = texto
  el.className = `aviso visivel aviso-${tipo}`
  clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => (el.className = 'aviso'), 3200)
}

/** Copia para a área de transferência (com o jeito antigo de reserva). */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const t = document.createElement('textarea')
    t.value = texto
    document.body.append(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }
}

/** Diálogo de confirmação; resolve true/false. Enter confirma, Esc cancela. Com `campo` ({rotulo, dica}), uma caixa de
 *  texto opcional: resolve o texto escrito ('' se nada) ou null se cancelou. */
export function confirmar({ titulo, texto = '', ok = 'Confirmar', perigo = false, campo = null }) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div')
    fundo.className = 'modal-fundo'
    fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <button class="modal-fechar" data-r="0" aria-label="Fechar" title="Fechar">${ICONE.fechar}</button>
      <h2>${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}
      ${campo ? `<label class="modal-campo"><span>${esc(campo.rotulo)}</span><textarea rows="3" placeholder="${esc(campo.dica || '')}"></textarea></label>` : ''}
      <div class="modal-acoes"><button class="botao" data-r="0">Cancelar</button>
      <button class="botao ${perigo ? 'botao-perigo' : 'botao-coral'}" data-r="1">${esc(ok)}</button></div></div>`
    const caixa = fundo.querySelector('textarea')
    const fechar = (r) => {
      document.removeEventListener('keydown', tecla, true)
      fundo.remove()
      resolve(campo ? (r ? caixa.value.trim() : null) : r)
    }
    const tecla = (e) => {
      if (e.key === 'Enter' && e.shiftKey && e.target === caixa) return // Shift+Enter quebra a linha
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        fechar(e.key === 'Enter')
      }
    }
    fundo.addEventListener('click', (e) => {
      if (e.target === fundo) return fechar(false)
      const b = e.target.closest('[data-r]')
      if (b) fechar(b.dataset.r === '1')
    })
    document.addEventListener('keydown', tecla, true)
    document.body.append(fundo)
    ;(caixa || fundo.querySelector('[data-r="1"]')).focus()
  })
}

/** Os códigos da biblioteca e dos projetos ({tipo: {id: código}}; ferramentas/codigo.py): pedidos a cada página (o
 *  servidor dá o próximo número aos itens novos). */
export const codigos = () => json('/api/codigos', {})

/** O código de um item, discreto, com o botão que copia "código · nome" (o clique é tratado no app.js). */
export function chipCodigo(codigo, nome) {
  if (!codigo) return ''
  const texto = `${codigo} · ${nome}`
  return `<span class="codigo" title="Código para citar no chat com o Claude">${esc(codigo)}<button type="button" class="copiar-codigo" data-copiar-codigo="${esc(texto)}" title="Copiar “${esc(texto)}”" aria-label="Copiar o código">${ICONE.copiar}</button></span>`
}

export const modalAberto = () => !!$('.modal-fundo')

/** As categorias de plano (as do 18), com o nome e o curto para blocos estreitos. */
export const PLANOS = {
  full_ator: ['Full ator', 'Ator'],
  full_ator_lettering: ['Full ator + lettering', 'Ator+L'],
  insert_tela_cheia: ['Insert tela cheia', 'Insert'],
  motion_tela_cheia: ['Motion tela cheia', 'Motion'],
  tela_dividida_insert: ['Tela dividida · insert', 'Div. insert'],
  tela_dividida_motion: ['Tela dividida · motion', 'Div. motion'],
  comentario_insert_ator: ['Comentário + insert + ator', 'Comentário'],
}
export const nomePlano = (tipo) => (PLANOS[tipo] || [tipo])[0]
/** Os elementos que aparecem por cima dos planos nas referências. */
export const ELEMENTOS = {
  lettering: 'Lettering',
  palavra_manychat: 'Palavra ManyChat',
  caixinha_perguntas: 'Caixinha de perguntas',
  print_sobreposto: 'Print/imagem sobreposta',
}
/** Um arquivo de uma referência da calibragem. */
export const urlRef = (ref, arq) => `/biblioteca/referencias/${encodeURIComponent(ref)}/${arq}`

/** Toca o trecho [ini, fim] de um vídeo em loop (com som se o navegador deixar); devolve a função que para. */
export function tocarTrecho(video, ini, fim, { loop = true } = {}) {
  let raf
  const vigiar = () => {
    if (video.currentTime >= fim - 0.03) {
      if (!loop) return video.pause()
      video.currentTime = ini
    }
    raf = requestAnimationFrame(vigiar)
  }
  const comecar = () => {
    video.currentTime = ini
    video.play().catch(() => {
      video.muted = true
      video.play().catch(() => {})
    })
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(vigiar)
  }
  video.preload = 'auto' // com preload="none" o metadado nunca chegaria
  if (video.readyState >= 1) comecar()
  else video.addEventListener('loadedmetadata', comecar, { once: true })
  return () => {
    cancelAnimationFrame(raf)
    video.removeEventListener('loadedmetadata', comecar)
  }
}

/** Uma janela escura por cima da página. Fecha com Esc, clique fora ou a função devolvida; `aoFechar` roda ao fechar. */
export function janela(html, { classe = '', aoFechar } = {}) {
  const fundo = document.createElement('div')
  fundo.className = 'modal-fundo'
  fundo.innerHTML = `<div class="janela ${classe}" role="dialog" aria-modal="true">${html}</div>`
  let fechada = false
  const fechar = () => {
    if (fechada) return
    fechada = true
    document.removeEventListener('keydown', tecla, true)
    for (const m of fundo.querySelectorAll('video, audio')) m.pause()
    fundo.remove()
    aoFechar?.()
  }
  const tecla = (e) => {
    if (e.key !== 'Escape' || fundo !== [...document.querySelectorAll('.modal-fundo')].at(-1)) return
    if (e.target.closest?.('input, textarea, select') && e.target.closest('.janela')) return e.target.blur()
    e.preventDefault()
    e.stopPropagation()
    fechar()
  }
  fundo.addEventListener('mousedown', (e) => e.target === fundo && fechar())
  fundo.addEventListener('click', (e) => e.target.closest('[data-fechar]') && fechar())
  document.addEventListener('keydown', tecla, true)
  document.body.append(fundo)
  return { el: fundo.firstElementChild, fechar }
}

/** Lê e grava uma preferência deste navegador (sem quebrar se o armazenamento estiver bloqueado). */
export function preferencia(chave, padrao, valor) {
  try {
    if (valor !== undefined) localStorage.setItem(`revisao.${chave}`, JSON.stringify(valor))
    const v = localStorage.getItem(`revisao.${chave}`)
    return v == null ? padrao : JSON.parse(v)
  } catch {
    return valor ?? padrao
  }
}

/** Os projetos abertos como abas na barra de cima (como no 18), guardados neste navegador: [{slug, nome}]. */
export const abasAbertas = () => {
  const l = preferencia('abas', [])
  return Array.isArray(l) ? l.filter((a) => a && typeof a.slug === 'string') : []
}
const gravarAbas = (l) => {
  preferencia('abas', [], l)
  window.dispatchEvent(new Event('abas-projetos'))
}
/** Abre (ou atualiza) a aba de um projeto; `cta`: se ele é um CTA (o ícone da aba). Sem `cta`, fica o que a aba já tinha. */
export function abrirAba(slug, nome, cta) {
  const l = abasAbertas()
  const a = l.find((x) => x.slug === slug)
  const nova = { slug, nome, cta: cta ?? a?.cta ?? false }
  if (a?.nome === nova.nome && a?.cta === nova.cta) return window.dispatchEvent(new Event('abas-projetos'))
  gravarAbas(a ? l.map((x) => (x.slug === slug ? nova : x)) : [...l, nova])
}
export const fecharAba = (slug) => gravarAbas(abasAbertas().filter((x) => x.slug !== slug))

/** Um Markdown pequeno (títulos, listas — com as linhas recuadas continuando o item —, parágrafos, negrito, itálico,
 *  código, links e imagens), o bastante para as regras e os aprendizados. `imagem(src)` dá o endereço de uma imagem
 *  (null: fica o texto); clicar numa imagem (`data-ampliar`) é com quem chama. */
export function markdown(texto, { imagem = () => null } = {}) {
  const inline = (s) =>
    esc(s)
      .replace(/(?:\s*·)?((?:\s*!\[[^\]]*\]\([^)\s]+\))+)/g, (m, grupo) => { // as imagens seguidas, numa linha abaixo
        const imgs = [...grupo.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map(([x, alt, src]) => [imagem(src), alt, x])
        if (!imgs.some(([url]) => url)) return m
        return `<span class="md-imagens">${imgs.map(([url, alt, x]) => (url ? `<button class="md-imagem" data-ampliar="${url}" title="Ampliar"><img src="${url}" alt="${alt}" loading="lazy"></button>` : x)).join('')}</span>`
      })
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#\/[^)\s]*)\)/g, '<a class="link" href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:·<]|$)/g, '$1<i>$2</i>')
  let html = ''
  let item = null // o item da lista em aberto (as linhas recuadas seguintes continuam nele)
  let lista = false
  let paragrafo = []
  const fecharParagrafo = () => {
    if (paragrafo.length) html += `<p>${inline(paragrafo.join(' '))}</p>`
    paragrafo = []
  }
  const fecharItem = () => {
    if (item) html += `<li>${inline(item.join(' '))}</li>`
    item = null
  }
  const fecharLista = () => {
    fecharItem()
    if (lista) html += '</ul>'
    lista = false
  }
  for (const linha of texto.split('\n')) {
    const t = linha.trim()
    const titulo = t.match(/^(#{1,4})\s+(.*)$/)
    if (titulo) {
      fecharParagrafo()
      fecharLista()
      html += `<h${titulo[1].length + 1}>${inline(titulo[2])}</h${titulo[1].length + 1}>`
    } else if (/^[-*]\s+/.test(t)) {
      fecharParagrafo()
      fecharItem()
      if (!lista) html += '<ul>'
      lista = true
      item = [t.replace(/^[-*]\s+/, '')]
    } else if (!t) {
      fecharParagrafo()
      fecharLista()
    } else if (item && /^\s/.test(linha)) {
      item.push(t)
    } else {
      fecharLista()
      paragrafo.push(t)
    }
  }
  fecharParagrafo()
  fecharLista()
  return html
}

/** Um "?" discreto com a explicação da página na dica (no lugar da frase no cabeçalho). */
export const ajuda = (texto) => `<span class="ajuda" tabindex="0" title="${esc(texto)}" aria-label="${esc(texto)}">?</span>`

/** Ícones (traço, 24×24). */
const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`
export const ICONE = {
  tocar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l13-7.5z"/></svg>`,
  pausar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>`,
  lapis: svg('<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>'),
  lixo: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  voltar: svg('<path d="M15 5l-7 7 7 7"/>'),
  seta: svg('<path d="M7 17L17 7M9 7h8v8"/>'),
  quadroAntes: svg('<path d="M15 6l-6 6 6 6"/>'),
  quadroDepois: svg('<path d="M9 6l6 6-6 6"/>'),
  segAntes: svg('<path d="M12 6l-6 6 6 6M19 6l-6 6 6 6"/>'),
  segDepois: svg('<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>'),
  balao: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  mais: svg('<path d="M12 5v14M5 12h14"/>'),
  menos: svg('<path d="M5 12h14"/>'),
  som: svg('<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  estrela: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  fechar: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  refazer: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>'),
  desfazer: svg('<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  recortar: svg('<path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/>'),
  tesoura: svg('<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 18M8 15.5L20 6"/>'),
  subir: svg('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
  abrir: svg('<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/>'),
  olho: svg('<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>'),
  olhoFechado: svg('<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/>'),
  projeto: svg('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'),
  cta: svg('<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'),
  carrossel: svg('<path d="M2 3v18"/><rect width="12" height="18" x="6" y="3" rx="2"/><path d="M22 3v18"/>'),
  seta_baixo: svg('<path d="M6 9l6 6 6-6"/>'),
  ajustes: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  mudo: svg('<path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6"/>'),
  copiar: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  clipe: svg('<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l8-8"/>'),
  imagem: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  // os ícones dos grupos de planos nos chips das Referências (lucide, os do IconeGrupo do 18)
  motion: svg('<path d="m12.296 3.464 3.02 3.956"/><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m6.18 5.276 3.1 3.899"/>'),
  usado: svg('<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>'),
  semSelo: svg('<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>'),
  expandir: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  grade: svg('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
  duasFaixas: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h18"/>'),
  celular: svg('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>'),
  letra: svg('<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>'),
  pessoa: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  balaoTexto: svg('<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/>'),
}
/** A estrela cheia (favorito ligado). */
export const ESTRELA_CHEIA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`

// ---------- a barra acima das linhas do tempo (revisão do vídeo e revisão da direção de uma referência) ----------

const SVG_ATALHO = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
export const ICONE_ATALHO = {
  plano: SVG_ATALHO('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  trecho: SVG_ATALHO('<path d="M16 3h3v18h-3"/><path d="M8 21H5V3h3"/>'),
  zoom: SVG_ATALHO('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>'),
}

/** A barra (como a do 18): "Linha do tempo", os atalhos [tecla, ação, ícone] no estilo do "Cortar D" e, à direita, o
 *  zoom (− +) e o Ajustar (data-acao zoom-, zoom+ e ajustar). */
export const barraDaLinha = (atalhos) => `<div class="linha-barra"><span class="eyebrow">Linha do tempo</span>
    <div class="linha-atalhos">${atalhos.map(([tecla, acao, icone]) => `<span>${icone}${acao}<kbd>${tecla}</kbd></span>`).join('')}</div>
    <button class="botao-icone pequeno" data-acao="zoom-" title="Afastar">${ICONE.menos}</button>
    <button class="botao-icone pequeno" data-acao="zoom+" title="Aproximar (⌘ + rolagem)">${ICONE.mais}</button>
    <button class="botao pequeno botao-ajustar" data-acao="ajustar" title="O vídeo inteiro na largura">${ICONE.expandir} Ajustar</button></div>`
