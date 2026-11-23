// A biblioteca: presets (aprovar e os recomendados por situação), transições (as favoritas de cada par de grupos),
// banco de inserts (corrigir nome, descrição e palavras-chave; apagar), motions (aprovar os novos) e trilhas.
// O Claude é quem cria; aqui o criador vê, aprova e marca os melhores.
import { marcarTrechos } from './trechos.js'
import { barraDeTags, datalistTags, htmlTagsCard, ligarTags, tagEscolhida, tagLimpa, temTag } from './tags.js'
import { $, $$, ESTRELA_CHEIA, ICONE, achaBusca, ajuda, aviso, chipCodigo, codigos, confirmar, dataHora, enviar, esc, janela, json, lista, mmss, num, preferencia, seg, semAcento, tempo, tocarTrecho, urlRef } from './comum.js'

export const PAGINAS_BIBLIOTECA = ['presets', 'transicoes', 'banco', 'motions', 'trilhas']

export async function abrirBiblioteca(tela, aba, resto = []) {
  if (aba === 'banco' && resto[0] === 'motions') aba = 'motions' // o endereço antigo dos motions (#/banco/motions)
  tela.className = `pagina pagina-biblioteca pagina-${aba === 'motions' ? 'banco' : aba}`
  tela.innerHTML = '<p class="vazio">Carregando…</p>'
  const sair = await { banco, presets, transicoes, motions, trilhas }[aba](tela, resto)
  return () => {
    for (const m of $$('video, audio', tela)) m.pause()
    sair?.()
  }
}

/** O seletor da aba Presets: os presets dos inserts ou as transições (as duas páginas moram na mesma aba). */
const trocaPresets = (atual) => `<div class="troca-presets alternar">${[['presets', 'Presets'], ['transicoes', 'Transições']]
  .map(([k, n]) => `<a class="pilula${k === atual ? ' ativa' : ''}" href="#/${k}">${n}</a>`).join('')}</div>`

/** Os JSONs de uma pasta (menos os que não são itens). */
export async function jsons(pasta, fora = []) {
  const nomes = (await lista(pasta)).filter((n) => n.endsWith('.json') && !fora.includes(n))
  return (await Promise.all(nomes.map((n) => json(`/${pasta}/${n}`)))).filter(Boolean)
}

let sonsCache
async function nomesDosSons() {
  sonsCache ||= json('/biblioteca/sons/catalogo.json', []).then((l) => Object.fromEntries((l || []).map((s) => [s.id, s.nome])))
  return sonsCache
}

/** As prévias dos motions tocam sozinhas, em loop, enquanto estão na tela (fora dela, pausam: a grade fica leve). */
const tocandoNaTela = new IntersectionObserver((es) => {
  for (const e of es) e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause()
}, { rootMargin: '200px' })

/** Um vídeo que toca com o mouse em cima (mudo) e volta ao começo ao sair. */
function tocarNoHover(card, video, inicio = 0) {
  card.addEventListener('mouseenter', () => {
    if (!video.src && video.dataset.src) video.src = video.dataset.src
    video.currentTime = inicio
    video.play().catch(() => {})
  })
  card.addEventListener('mouseleave', () => video.pause())
}

/** O cabeçalho das páginas: uma linha, o título com a contagem; a explicação fica na dica do "?". */
const cabeca = (titulo, explica = '', extra = '') =>
  `<div class="cabeca-secao"><span class="eyebrow">${titulo}</span>${explica ? ajuda(explica) : ''}${extra}</div>`
const dois = (n) => String(n).padStart(2, '0')
const chip = (ativo, html, attrs = '') => `<button class="pilula pequena${ativo ? ' ativa' : ''}" ${attrs}>${html}</button>`

// ---------- Banco ----------

/** O Banco (as mídias dos inserts) e os Motions (os presets de motion), cada um na sua aba da barra de cima, na mesma
 *  grade e com os mesmos selos (o filtro por selo, com ícones). */
async function banco(el) {
  await bancoInserts(el, 'inserts', 'cache')
}
async function motions(el) {
  await bancoInserts(el, 'motions', 'cache')
}


function origemDe(o) {
  if (!o) return ''
  if (o.url) {
    const curto = o.url.replace(/^https?:\/\//, '').replace(/[#?].*$/, '')
    return `${o.tipo === 'captura de site' ? 'Captura de site' : esc(o.tipo || 'Link')} · <a href="${esc(o.url)}" target="_blank" rel="noopener" title="${esc(o.url)}">${esc(curto)}</a>`
  }
  if (o.tipo === 'upload') return `Upload${o.nome_original ? ` · ${esc(o.nome_original)}` : ''}`
  return esc(o.tipo || '')
}

/** Os selos do banco e dos motions (o que entrou num vídeo aprovado, o aprovado à mão, o recusado). */
// a ordem da grade do Banco e dos Motions (lembrada por aba)
const ORDENS_BANCO = { recentes: 'Recentes', usados: 'Mais usados' }
const SELOS = { usado: ['Usado em vídeo', 'selo-menta'], aprovado: ['Aprovado', 'selo-verde'], recusado: ['Recusado', 'selo-coral'] }
/** Os trechos no card do banco; com mais de 3, recolhidos num expansor (não ocupam a altura toda da grade). */
function listaTrechos(ts, cod) {
  if (!ts.length) return ''
  const ul = `<ul class="trechos">${ts.map((t) => `<li data-ini="${t.inicio}" data-fim="${t.fim}"><span>${esc(t.nome)}</span>${chipCodigo(cod[t.id], t.nome)}<span class="apagado">${seg(t.fim - t.inicio)}</span></li>`).join('')}</ul>`
  return ts.length > 3 ? `<details class="dobra-trechos"><summary>${ts.length} trechos</summary>${ul}</details>` : ul
}

const FILTROS_BANCO = { todos: ['Todos', null], usado: ['Usados', 'usado'], aprovado: ['Aprovados', 'check'], recusado: ['Recusados', 'fechar'], sem: ['Em edição', 'semSelo'] }
/** Os chips de onde a peça entrou nos vídeos aprovados ("PRJ-05·p3"): abrem a revisão da versão aprovada naquele plano.
 *  Agrupados por projeto: um projeto com vários planos vira um chip só ("PRJ-07 · 12 planos ▾") que abre a lista. */
/** O selo de uma mídia ou motion. O de usado diz quantas vezes ("Usado 6×": cada plano de um vídeo aprovado conta) e,
 *  com o mouse em cima, abre a lista dos projetos (`popUsos`), cada plano um link para aquele ponto do vídeo. */
const seloDe = (estado, usos, cods, classe = '') => {
  const [rotulo, cor] = SELOS[estado] || []
  if (!rotulo) return ''
  if (estado !== 'usado' || !usos?.length) return `<span class="selo-linha ${classe} ${cor}">${rotulo}</span>`
  const porProjeto = {}
  for (const u of usos) (porProjeto[u.projeto] ||= []).push(u)
  const lista = Object.entries(porProjeto).map(([projeto, l]) => `<div class="pop-prj"><div class="pop-prj-nome"><b>${esc(cods.projeto?.[projeto] || '')}</b> ${esc(projeto)}<span>${l.length}×</span></div>
    <div class="pop-planos">${l.map((u) => `<a href="#/p/${encodeURIComponent(u.projeto)}/v${u.versao}${u.t != null ? `/t${(+u.t + 0.05).toFixed(2)}` : ''}" title="Abrir a v${u.versao} de ${esc(projeto)} neste plano">${esc(u.plano)}${u.t != null ? ` · ${mmss(u.t)}` : ''}</a>`).join('')}</div></div>`).join('')
  return `<span class="selo-linha selo-usado ${classe} ${cor}" tabindex="0" data-pop-usos="${esc(lista)}">Usado ${usos.length}×</span>`
}

// o balão dos usos: fora do card (a miniatura corta o que passa da borda), preso ao selo; fica aberto enquanto o mouse
// está no selo ou nele
let balao = null
let fecharBalao = null
function popUsos(selo) {
  clearTimeout(fecharBalao)
  balao?.remove()
  balao = document.createElement('div')
  balao.className = 'balao-usos'
  balao.innerHTML = `<span class="eyebrow">Onde foi usado</span>${selo.dataset.popUsos}`
  document.body.appendChild(balao)
  const r = selo.getBoundingClientRect()
  const w = balao.offsetWidth, h = balao.offsetHeight
  balao.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`
  balao.style.top = `${r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`
  const sair = () => (fecharBalao = setTimeout(() => { balao?.remove(); balao = null }, 180))
  const ficar = () => clearTimeout(fecharBalao)
  selo.addEventListener('mouseleave', sair, { once: true })
  balao.addEventListener('mouseenter', ficar)
  balao.addEventListener('mouseleave', sair)
  balao.addEventListener('click', (e) => e.target.closest('a') && (balao.remove(), (balao = null)))
}
document.addEventListener('mouseover', (e) => {
  const selo = e.target.closest?.('[data-pop-usos]')
  if (selo && !selo.contains(e.relatedTarget)) popUsos(selo)
})
window.addEventListener('hashchange', () => { balao?.remove(); balao = null })

const chipsDeUso = (usos, cods) => {
  const porProjeto = {}
  for (const u of usos || []) (porProjeto[u.projeto] ||= []).push(u)
  return Object.entries(porProjeto).map(([projeto, l]) => {
    const prj = cods.projeto?.[projeto] || projeto
    const chips = l.map((u) => {
      const t = u.t != null ? `/t${(+u.t + 0.05).toFixed(2)}` : ''
      return `<a class="chip-uso" href="#/p/${encodeURIComponent(u.projeto)}/v${u.versao}${t}" title="Abrir a v${u.versao} de ${esc(u.projeto)} no plano ${esc(u.plano)}">${esc(l.length > 1 ? u.plano : `${prj}·${u.plano}`)}</a>`
    }).join('')
    return l.length === 1 ? chips
      : `<details class="usos-projeto"><summary class="chip-uso" title="Os planos de ${esc(projeto)} que usam">${esc(prj)} · ${l.length} planos${ICONE.seta_baixo}</summary><div class="usos-lista">${chips}</div></details>`
  }).join('')
}

let tagsConhecidas = [] // as tags do banco, para o autocompletar do modal da mídia
// o modo Selecionar do banco: os ids marcados (null = fora do modo); o clique no card marca em vez de abrir, e o selo
// (Aprovar / Recusar) vai para todos de uma vez. `ultimoMarcado`: o shift-clique marca o intervalo até ele
let selecao = null
let ultimoMarcado = null
// o @ de um comentário (escolherDoBanco): a mesma grade, sempre no modo Selecionar, sem editar nada; null = a página normal
let escolhendo = null
const buscas = { inserts: preferencia('banco.busca', ''), motions: preferencia('motions.busca', '') } // a busca de cada página (guardada: voltar à aba devolve)

// o que o Banco e os Motions leram por último (por aba): voltar à aba mostra isso na hora e confere por trás
const cacheBanco = {}
async function lerBanco(tipo) {
  // as mídias numa resposta só (/api/banco); os motions (um HTML cada), só na aba Motions
  const d = await Promise.all([json('/api/banco', []), codigos(), json('/api/estados', { midias: {}, motions: {} }), tipo === 'motions' ? lerMotions() : [],
    fetch('/biblioteca/motions/_tags.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    lista('biblioteca/motions/previas')])
  const mudou = JSON.stringify(d) !== JSON.stringify(cacheBanco[tipo])
  cacheBanco[tipo] = d
  return mudou
}

/** Lê o Banco e os Motions em segundo plano (o app chama logo depois de abrir): a 1ª ida à aba já sai do cache. */
export const preCarregarBanco = () => lerBanco('inserts').then(() => lerBanco('motions')).catch(() => {})

/** `modo`: 'cache' (ao entrar na aba: o que já foi lido, na hora, e confere com o servidor por trás, redesenhando só se
 *  algo mudou), 'local' (filtro e seleção: só o que já foi lido) ou 'novo' (depois de uma ação: lê de novo antes). */
async function bancoInserts(el, tipo = 'inserts', modo = 'novo') {
  if (modo === 'novo' || !cacheBanco[tipo]) await lerBanco(tipo)
  else if (modo === 'cache') lerBanco(tipo).then((mudou) => mudou && el.isConnected && bancoInserts(el, tipo, 'local'))
  const [itensBanco, cods, est, ms0, tagsMotion, previas] = cacheBanco[tipo]
  const ms = ms0.map((m) => ({ ...m })) // as tags entram na cópia (o cache fica como veio)
  // a prévia em vídeo de cada motion (render.py previas-motions): a grade toca o vídeo; a animação ao vivo, só no modal
  const comPrevia = new Set((previas || []).map((n) => n.replace(/\.mp4$/, '')))
  for (const m of ms) m.tags = tagsMotion[m.id] || []
  const estados = est?.midias || {}
  const usosM = est?.motions || {}
  const aprovadosPrj = new Set(est?.aprovados || [])
  // o selo de um motion, como o das mídias (a mesma regra de servidor.estado_motion): usado num vídeo aprovado · o
  // selo à mão · recusado (escrito para um projeto já aprovado e que ficou de fora) · a revisar · aprovado
  const estadoMotion = (m) => (usosM[m.id]?.length ? 'usado' : ['aprovado', 'recusado'].includes(m.estado) ? m.estado
    : m.a_revisar ? (aprovadosPrj.has(m.projeto) ? 'recusado' : 'sem') : 'aprovado')
  const chaveFiltro = tipo === 'motions' ? 'motions.filtro' : 'banco.filtro'
  let filtro = FILTROS_BANCO[preferencia(chaveFiltro, 'todos')] ? preferencia(chaveFiltro, 'todos') : 'todos'
  const cod = cods.midia || {}
  const itens = itensBanco || []
  const originais = itens.filter((i) => !i.pai) // a ordem da grade sai no fim (ORDENS_BANCO)
  const trechos = {}
  for (const t of itens.filter((i) => i.pai)) (trechos[t.pai] ||= []).push(t)
  for (const l of Object.values(trechos)) l.sort((a, b) => a.inicio - b.inicio)

  const estadoDe = (it) => estados[it.id]?.estado || 'sem'
  // as tags: a página do Banco filtra as mídias; a de Motions, os motions (cada uma com a sua barra)
  const doTipo = tipo === 'motions' ? ms : originais
  const pref = tipo === 'motions' ? 'motions' : 'banco'
  const conhecidas = [...new Set(doTipo.flatMap((it) => it.tags || []))].sort()
  if (tipo !== 'motions') tagsConhecidas = conhecidas
  const tagAtiva = tagEscolhida(pref, doTipo)
  const passaTag = (it) => !tagAtiva || temTag(it.tags, tagAtiva)
  const midiasT = tipo === 'motions' ? [] : originais.filter(passaTag)
  const motionsT = tipo === 'inserts' ? [] : ms.filter(passaTag)
  const conta = (k) => (k === 'todos' ? midiasT.length + motionsT.length : midiasT.filter((it) => estadoDe(it) === k).length + motionsT.filter((m) => estadoMotion(m) === k).length)
  if (!conta(filtro)) filtro = 'todos' // um filtro vazio some da barra (ex.: Em edição sem projeto em edição)
  const visiveis = midiasT.filter((it) => filtro === 'todos' || estadoDe(it) === filtro)
  const cardsMidia = visiveis.map((it) => {
    const e = estados[it.id] || {}
    const ts0 = trechos[it.id] || []
    const selo = seloDe(e.estado, [...(e.usos || []), ...ts0.flatMap((t) => estados[t.id]?.usos || [])], cods, 'selo-na-thumb')
    const base = `/biblioteca/banco/${it.id}/`
    const video = it.tipo === 'video'
    const ts = trechos[it.id] || []
    const busca = semAcento([it.nome, it.descricao, it.fonte, ...(it.palavras || []), cod[it.id], ...ts.flatMap((t) => [t.nome, cod[t.id]]), ...(it.tags || []).map((t) => `#${t}`)].join(' '))
    return `<article class="card-banco${selecao?.has(it.id) ? ' selecionado' : ''}" data-id="${it.id}" data-busca="${esc(busca)}">
      <div class="mini mini-169"><img src="${base}miniatura.jpg" alt="" loading="lazy">
        ${video ? `<video muted loop playsinline preload="none" data-src="${base}${it.proxy || 'proxy.mp4'}"></video>` : ''}
        <span class="selo ${video ? 'selo-azul' : 'selo-menta'}">${video ? 'Vídeo' : 'Imagem'} · ${esc(it.formato || '')}</span>
        ${video && it.duracao ? `<span class="duracao">${seg(it.duracao)}</span>` : ''}
        ${selo}
        <span class="chip-tipo">Insert${ts.length ? ` · ${ts.length} ${ts.length === 1 ? 'trecho' : 'trechos'}` : ''}</span></div>
      <div class="card-titulo"><h3 title="${esc([it.descricao, it.fonte].filter(Boolean).join('\n'))}">${esc(it.nome)}</h3>${chipCodigo(cod[it.id], it.nome)}</div>
      ${htmlTagsCard(it.tags)}
      ${listaTrechos(ts, cod)}
    </article>`
  }).map((html, k) => ({ html, criado: '' }))
  // os motions na mesma grade: a prévia em pé no meio do card, o chip "Motion" e os selos do mesmo jeito
  // para ordenar: a data do upload e quantas vezes entrou em vídeos (no insert, com os trechos dele)
  cardsMidia.forEach((c, k) => {
    const it = visiveis[k]
    c.criado = it.criado_em || ''
    c.usos = [it, ...(trechos[it.id] || [])].reduce((n, x) => n + (estados[x.id]?.usos?.length || 0), 0)
  })
  const cardsMotion = motionsT.filter((m) => filtro === 'todos' || estadoMotion(m) === filtro).map((m) => {
    const selo = seloDe(estadoMotion(m), usosM[m.id], cods)
    const busca = semAcento([m.nome, m.id, m.descricao, cods.motion?.[m.id], ...(m.tags || []).map((t) => `#${t}`)].join(' '))
    const e = estadoMotion(m)
    return { criado: m.criado_em || '', usos: usosM[m.id]?.length || 0, html: `<article class="card-banco card-banco-motion${selecao?.has(`m:${m.id}`) ? ' selecionado' : ''}" data-motion="${esc(m.id)}" data-busca="${esc(busca)}">
      <div class="mini mini-169 fundo-${esc(m.fundo || 'escuro')}"><div class="palco-motion">${comPrevia.has(m.id)
        ? `<video class="previa-motion" muted loop playsinline preload="metadata" src="/biblioteca/motions/previas/${encodeURIComponent(m.id)}.mp4"></video>`
        : `<iframe src="/render/motion.html?preset=${encodeURIComponent(m.id)}&formato=vertical&tocar=1" loading="lazy" tabindex="-1" title="${esc(m.nome || m.id)}"></iframe>`}</div>
        ${e === 'sem' ? '<span class="selo selo-coral">A revisar</span>' : ''}${m.duracao ? `<span class="duracao">${seg(m.duracao)}</span>` : ''}
        <span class="chip-tipo chip-tipo-motion">Motion</span></div>
      <div class="card-titulo"><h3 title="${esc(m.descricao || '')}">${esc(m.nome || m.id)}</h3>${chipCodigo(cods.motion?.[m.id], m.nome || m.id)}</div>
      ${selo ? `<div class="estado-banco">${selo}</div>` : ''}
      ${htmlTagsCard(m.tags)}
      ${e === 'sem' && !selecao ? `<div class="acoes-pe"><button class="botao pequeno" data-aprovar-motion title="Tira a marca “a revisar”">${ICONE.check} Aprovar</button>
        <button class="botao pequeno botao-perigo-contorno" data-recusar-motion title="Recusa a sugestão (fica em Recusados até o Limpar recusados)">${ICONE.fechar} Recusar</button></div>` : ''}
    </article>` }
  })
  const ordem = ORDENS_BANCO[preferencia(`${tipo}.ordem`, 'recentes')] ? preferencia(`${tipo}.ordem`, 'recentes') : 'recentes'
  const porData = (a, b) => b.criado.localeCompare(a.criado)
  const cards = [...(tipo === 'motions' ? [] : cardsMidia), ...(tipo === 'inserts' ? [] : cardsMotion)]
    .sort(ordem === 'usados' ? (a, b) => b.usos - a.usos || porData(a, b) : porData).map((c) => c.html)
  const icone = (n) => (n ? ICONE[n] : '')
  const nRecusados = conta('recusado')
  el.innerHTML = `<div class="barra-banco">
      ${Object.entries(FILTROS_BANCO).filter(([k]) => k === 'todos' || conta(k)).map(([k, [n, ic]]) => chip(k === filtro, `${icone(ic)}${n} <span class="conta">${conta(k)}</span>`, `data-filtro-banco="${k}"`)).join('')}
      <span class="barra-banco-acoes"><span class="ordens">${Object.entries(ORDENS_BANCO).map(([k, nome]) => chip(k === ordem, nome, `data-ordem-banco="${k}" title="${k === 'usados' ? 'Os que mais entraram em vídeos aprovados primeiro' : 'Os que entraram no banco por último primeiro'}"`)).join('')}</span>
        <input class="busca" type="search" data-busca placeholder="Buscar (nome, descrição, código, #tag)" value="${esc(buscas[tipo])}">
        ${escolhendo ? `<span class="barra-selecao"><b data-sel-conta>${selecao.size}</b> <span data-sel-rotulo>${selecao.size === 1 ? 'selecionada' : 'selecionadas'}</span>
        <button class="botao pequeno" data-sel-todas title="Marca tudo o que está na tela (com este filtro, a tag e a busca)">Todas visíveis</button></span>` : `${tipo === 'motions' ? '' : `<label class="botao pequeno botao-subir" title="Vídeos e imagens, vários de uma vez (ou arraste para esta página): entram Aprovados e a IA descreve">${ICONE.subir} Subir mídia<input type="file" multiple accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp" hidden data-subir></label>`}
        ${selecao
    ? `<span class="barra-selecao"><b data-sel-conta>${selecao.size}</b> <span data-sel-rotulo>${selecao.size === 1 ? 'selecionada' : 'selecionadas'}</span>
        <button class="botao pequeno" data-sel-todas title="Marca tudo o que está na tela (com este filtro, a tag e a busca)">Todas visíveis</button>
        <button class="botao pequeno botao-verde" data-sel-aplicar="aprovado" title="Aprovar as selecionadas: boas, mesmo sem uso (saem do Limpar recusados)">${ICONE.check} Aprovar</button>
        <button class="botao pequeno" data-sel-aplicar="recusado" title="Recusar as selecionadas">${ICONE.fechar} Recusar</button>
        <button class="botao pequeno" data-sel-sair>Cancelar</button></span>`
    : `<button class="botao pequeno" data-selecionar title="Marque vários ${tipo === 'motions' ? 'motions' : 'itens'} (clique; shift-clique marca um intervalo) e aprove ou recuse todos de uma vez">Selecionar</button>`}
        ${nRecusados && tipo !== 'motions' ? `<button class="botao pequeno botao-perigo-contorno" data-limpar-recusados title="Manda os recusados para a Lixeira (de onde dá para restaurar)">${ICONE.lixo} Limpar recusados (${nRecusados})</button>` : ''}
        ${nRecusados && tipo === 'motions' ? `<button class="botao pequeno botao-perigo-contorno" data-limpar-motions title="Tira da biblioteca os motions recusados (vão para o registro que o Claude lê para não repetir)">${ICONE.lixo} Limpar recusados (${nRecusados})</button>` : ''}
        ${ajuda(tipo === 'motions' ? 'Os presets de motion. Usado em vídeo: entrou num vídeo aprovado (o chip abre o plano). A revisar: o Claude escreveu e você ainda não aprovou. Aprovado: bom, mesmo sem uso. Recusado: você recusou, ou foi escrito para um vídeo já aprovado e ficou de fora (o Limpar recusados tira da biblioteca). Passe o mouse para tocar; Selecionar aprova ou recusa vários de uma vez.' : 'Os inserts (vídeos e imagens). Usado em vídeo: entrou num vídeo aprovado (o chip abre o plano). Aprovado: bom, mesmo sem uso. Recusado: ficou de fora de um vídeo aprovado (o Limpar recusados manda para a Lixeira). Passe o mouse para tocar; clique num insert para editar, marcar trechos ou mudar o selo.')}`}</span></div>` +
    `${datalistTags('tags-conhecidas-card', conhecidas)}<div class="banco-com-tags">${barraDeTags(doTipo.map((it) => ({ chave: it.id, tags: it.tags })), tagAtiva, pref, { editar: !escolhendo })}<div class="banco-grade">` +
    (cards.length ? `<div class="grade grade-banco">${cards.join('')}</div><p class="vazio" data-sem-busca hidden>Nada com essa busca.</p>` : '<p class="vazio">Nada com esses filtros.</p>') +
    '</div></div>'
  const subir = async (arquivos) => {
    const l = [...arquivos].filter((f) => /\.(mp4|mov|m4v|webm|png|jpe?g|webp)$/i.test(f.name))
    if (!l.length) return aviso('Use MP4, MOV, WebM, PNG, JPG ou WebP', 'erro')
    let feitos = 0
    for (const f of l) {
      aviso(`Enviando ${feitos + 1} de ${l.length}… ${f.name}`)
      try {
        const r = await fetch('/api/banco', { method: 'POST', headers: { 'X-Nome': encodeURIComponent(f.name) }, body: f })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `HTTP ${r.status}`)
        feitos++
      } catch (x) {
        aviso(`${f.name}: ${x.message}`, 'erro')
      }
    }
    if (feitos) aviso(`${feitos} ${feitos === 1 ? 'mídia subiu' : 'mídias subiram'} · a IA descreve em segundo plano`)
    preferencia('banco.filtro', 'todos', 'todos')
    bancoInserts(el, tipo)
  }
  $('[data-subir]', el)?.addEventListener('change', (e) => subir(e.target.files))
  // a busca esconde os cards que não têm todas as palavras (sem redesenhar: as prévias dos motions não recarregam)
  const buscar = () => {
    let n = 0
    for (const c of $$('.card-banco[data-busca]', el)) {
      const acha = achaBusca(c.dataset.busca, buscas[tipo])
      c.style.display = acha ? '' : 'none'
      n += acha
    }
    const vazio = $('[data-sem-busca]', el)
    if (vazio) vazio.hidden = n > 0
  }
  $('[data-busca]', el).addEventListener('input', (e) => {
    buscas[tipo] = preferencia(tipo === 'motions' ? 'motions.busca' : 'banco.busca', '', e.target.value)
    buscar()
  })
  buscar()
  if (!el.dataset.arrastar && !escolhendo) {  // arrastar arquivos para a página (uma vez por página)
    el.dataset.arrastar = '1'
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('soltando') })
    el.addEventListener('dragleave', (e) => !el.contains(e.relatedTarget) && el.classList.remove('soltando'))
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('soltando'); subir(e.dataTransfer.files) })
  }
  const escalar = () => {
    for (const p of $$('.palco-motion', el)) p.style.setProperty('--escala', String(p.clientHeight / 1920))
  }
  escalar()
  new ResizeObserver(escalar).observe(el)
  for (const b of $$('[data-aprovar-motion]', el)) b.addEventListener('click', async (e) => {
    e.stopPropagation()
    try {
      await enviar('PUT', `/api/motions/${encodeURIComponent(b.closest('[data-motion]').dataset.motion)}/estado`, { estado: 'aprovado' })
      aviso('Motion aprovado')
      bancoInserts(el, tipo)
    } catch (x) {
      aviso(x.message, 'erro')
    }
  })
  for (const b of $$('[data-recusar-motion]', el)) b.addEventListener('click', (e) => {
    e.stopPropagation()
    recusarMotion(ms.find((m) => m.id === b.closest('[data-motion]').dataset.motion), () => bancoInserts(el, tipo))
  })
  ligarTags(el, {
    onde: pref === 'motions' ? 'motions' : 'banco',
    pref,
    lista: 'tags-conhecidas-card',
    conhecidas,
    itemDo: (b) => (tipo === 'motions' ? ms.find((m) => m.id === b.closest('[data-motion]').dataset.motion) : originais.find((it) => it.id === b.closest('[data-id]').dataset.id)),
    gravar: (it, tags) => enviar('PUT', tipo === 'motions' ? `/api/motions/${encodeURIComponent(it.id)}/tags` : `/api/banco/${it.id}`, { tags }),
    recarregar: () => bancoInserts(el, tipo),
  })
  const contarSelecao = () => {
    const n = selecao?.size || 0
    const c = $('[data-sel-conta]', el)
    if (c) c.textContent = n
    const r = $('[data-sel-rotulo]', el)
    if (r) r.textContent = n === 1 ? 'selecionada' : 'selecionadas'
    escolhendo?.aoMudar()
  }
  $('[data-selecionar]', el)?.addEventListener('click', () => {
    selecao = new Set()
    ultimoMarcado = null
    bancoInserts(el, tipo, 'local')
  })
  $('[data-sel-sair]', el)?.addEventListener('click', () => {
    selecao = null
    bancoInserts(el, tipo, 'local')
  })
  $('[data-sel-todas]', el)?.addEventListener('click', () => {
    for (const c of $$('.card-banco[data-id], .card-banco[data-motion]', el)) {
      if (c.style.display === 'none') continue
      selecao.add(chave(c))
      c.classList.add('selecionado')
    }
    contarSelecao()
  })
  for (const b of $$('[data-sel-aplicar]', el)) b.addEventListener('click', async () => {
    const ids = [...selecao]
    if (!ids.length) return aviso('Nada selecionado', 'erro')
    const estado = b.dataset.selAplicar
    let feitos = 0
    const gravar = (k) => (k.startsWith('m:') ? enviar('PUT', `/api/motions/${encodeURIComponent(k.slice(2))}/estado`, { estado }) : enviar('PUT', `/api/banco/${k}`, { estado }))
    try {
      for (let k = 0; k < ids.length; k += 8) {  // de 8 em 8, para não abrir dezenas de pedidos de uma vez
        await Promise.all(ids.slice(k, k + 8).map((id) => gravar(id).then(() => feitos++)))
      }
      aviso(`${feitos} ${feitos === 1 ? 'item' : 'itens'} ${estado === 'aprovado' ? (feitos === 1 ? 'aprovado' : 'aprovados') : (feitos === 1 ? 'recusado' : 'recusados')}`)
    } catch (x) {
      aviso(`${feitos} de ${ids.length} feitas · ${x.message}`, 'erro')
    }
    selecao = null
    bancoInserts(el, tipo)
  })
  for (const b of $$('[data-ordem-banco]', el)) b.addEventListener('click', () => {
    preferencia(`${tipo}.ordem`, 'recentes', b.dataset.ordemBanco)
    bancoInserts(el, tipo, 'local')
  })
  for (const b of $$('[data-filtro-banco]', el)) b.addEventListener('click', () => {
    preferencia(chaveFiltro, 'todos', b.dataset.filtroBanco)
    bancoInserts(el, tipo, 'local')
  })
  $('[data-limpar-recusados]', el)?.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: `Limpar ${nRecusados} ${nRecusados === 1 ? 'mídia recusada' : 'mídias recusadas'}?`,
      texto: 'Elas vão para a Lixeira, com os trechos (de lá dá para restaurar ou apagar de vez). O que você subiu e o que um projeto ainda usa ficam. Para guardar alguma, aprove antes (Selecionar → Aprovar).', ok: 'Mandar para a Lixeira', perigo: true })
    if (!ok) return
    try {
      const r = await enviar('POST', '/api/limpar-recusados')
      aviso(`${r.levados.length} ${r.levados.length === 1 ? 'mídia foi' : 'mídias foram'} para a Lixeira`)
      bancoInserts(el, tipo)
    } catch (x) {
      aviso(x.message, 'erro')
    }
  })

  $('[data-limpar-motions]', el)?.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: `Limpar ${nRecusados} ${nRecusados === 1 ? 'motion recusado' : 'motions recusados'}?`,
      texto: 'Saem da biblioteca e vão para motions/presets/_recusados/, com o motivo: é o registro que o Claude lê para não sugerir de novo o mesmo tipo de coisa. Os que um vídeo aprovado usa ficam.', ok: 'Limpar', perigo: true })
    if (!ok) return
    try {
      const r = await enviar('POST', '/api/motions/limpar-recusados')
      aviso(`${r.levados.length} ${r.levados.length === 1 ? 'motion saiu' : 'motions saíram'} da biblioteca`)
      bancoInserts(el, tipo)
    } catch (x) {
      aviso(x.message, 'erro')
    }
  })
  const chave = (c) => (c.dataset.motion ? `m:${c.dataset.motion}` : c.dataset.id)
  /** No modo Selecionar, o clique marca ou desmarca; com shift, o intervalo desde o último marcado (só os visíveis). */
  const marcar = (card, e) => {
    const visiveisAgora = $$('.card-banco[data-id], .card-banco[data-motion]', el).filter((c) => c.style.display !== 'none')
    const de = visiveisAgora.findIndex((c) => chave(c) === ultimoMarcado)
    const ate = visiveisAgora.indexOf(card)
    const alvo = e.shiftKey && de >= 0 ? visiveisAgora.slice(Math.min(de, ate), Math.max(de, ate) + 1) : [card]
    const ligar = e.shiftKey ? true : !selecao.has(chave(card))
    for (const c of alvo) {
      if (ligar) selecao.add(chave(c))
      else selecao.delete(chave(c))
      c.classList.toggle('selecionado', ligar)
    }
    ultimoMarcado = chave(card)
    contarSelecao()
  }
  for (const card of $$('.card-banco', el)) {
    if (card.dataset.motion) {
      const previa = $('video.previa-motion', card)
      if (previa) tocandoNaTela.observe(previa)
      card.addEventListener('click', (e) => {
        if (e.target.closest('a, summary, button, .tags-card')) return
        if (selecao) return marcar(card, e)
        const m = ms.find((x) => x.id === card.dataset.motion)
        detalheMotion(m, estadoMotion(m), usosM[m.id], cods, () => bancoInserts(el, tipo))
      })
      continue
    }
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, summary, .tags-card')) return
      if (!selecao) return detalheBanco(card.dataset.id, () => bancoInserts(el, tipo), cod, estados[card.dataset.id], cods)
      marcar(card, e)
    })
    const v = $('video', card)
    if (!v) continue
    let trecho = null // [ini, fim] enquanto o mouse está num trecho
    let raf
    const laco = () => {
      if (trecho && v.currentTime >= trecho[1]) v.currentTime = trecho[0]
      raf = requestAnimationFrame(laco)
    }
    card.addEventListener('mouseenter', () => {
      if (!v.src) v.src = v.dataset.src
      v.currentTime = 0
      v.play().catch(() => {})
      laco()
    })
    card.addEventListener('mouseleave', () => {
      v.pause()
      cancelAnimationFrame(raf)
      trecho = null
    })
    for (const li of $$('.trechos li', card)) {
      li.addEventListener('mouseenter', () => {
        trecho = [+li.dataset.ini, +li.dataset.fim]
        v.currentTime = trecho[0]
        li.classList.add('ativo')
      })
      li.addEventListener('mouseleave', () => {
        trecho = null
        li.classList.remove('ativo')
      })
    }
  }
}

/** O detalhe de uma mídia: corrigir nome, descrição e palavras-chave, ver onde é usada e apagar. */
async function detalheBanco(id, recarregar, cod = {}, est = null, cods = {}) {
  let d
  try {
    d = await enviar('GET', `/api/banco/${id}`)
  } catch (e) {
    return aviso(e.message, 'erro')
  }
  const it = d.item
  const base = `/biblioteca/banco/${id}/`
  const video = it.tipo === 'video'
  const projetoDe = (u) => u.split('/')[0]
  const usos = d.usos.concat(d.trechos.flatMap((t) => t.usos.map((u) => `${u} · trecho “${t.nome}”`)))
  const { el, fechar } = janela(`
    <header class="janela-cabeca"><span class="selo-linha ${video ? 'selo-azul' : 'selo-menta'}">${video ? 'Vídeo' : 'Imagem'} · ${esc(it.formato || '')}</span>
      ${chipCodigo(cod[id], it.nome)}<span class="dica">${esc(id)}</span><button class="botao-icone" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button></header>
    <div class="banco-detalhe">
      <div class="banco-midia"><div class="recorte-palco">${video ? `<video src="${base}${it.proxy || 'proxy.mp4'}" controls muted playsinline autoplay loop></video>` : `<img src="${base}${esc(it.arquivo || 'miniatura.jpg')}" alt="">`}
          <div class="recorte" hidden><div class="recorte-caixa">${['nw', 'ne', 'sw', 'se'].map((c) => `<i data-canto="${c}"></i>`).join('')}</div></div></div>
        <div class="recorte-barra" hidden><div class="alternar">${Object.keys(PROPS_RECORTE).map((p) => `<button class="pilula pequena" type="button" data-proporcao="${p}">${p}</button>`).join('')}</div>
          <span class="dica" data-recorte-px></span>
          <span class="acoes-linha"><button class="botao pequeno" type="button" data-recorte-cancelar>Cancelar</button><button class="botao pequeno botao-coral" type="button" data-recorte-salvar>Salvar recorte</button></span></div>
        <dl class="dados"><dt>Dimensões</dt><dd>${it.largura || '?'} × ${it.altura || '?'}</dd>
          ${it.recorte_de ? `<dt>Recorte de</dt><dd>${esc(cod[it.recorte_de.id] || it.recorte_de.id)} · ${it.recorte_de.w} × ${it.recorte_de.h} a partir de (${it.recorte_de.x}, ${it.recorte_de.y})</dd>` : ''}
          ${video ? `<dt>Duração</dt><dd>${seg(it.duracao || 0)}</dd>` : ''}
          <dt>Origem</dt><dd>${origemDe(it.origem) || '—'}</dd>
          <dt>Entrou em</dt><dd>${dataHora(it.criado_em) || '—'}${it.projeto ? ` · ${esc(it.projeto)}` : ''}</dd></dl></div>
      <form class="banco-campos" autocomplete="off">
        <label class="campo"><span class="eyebrow">Nome</span><input name="nome" value="${esc(it.nome)}"></label>
        <label class="campo"><span class="eyebrow">Descrição</span><textarea name="descricao" rows="5">${esc(it.descricao || '')}</textarea></label>
        <label class="campo"><span class="eyebrow">Palavras-chave <span class="apagado">· separadas por vírgula</span></span><input name="palavras" value="${esc((it.palavras || []).join(', '))}"></label>
        <div class="campo"><span class="eyebrow">Tags <span class="apagado">· #tag ou #grupo/tag, Enter para incluir</span></span>
          <div class="tags-editor"><span data-tags-chips></span><input data-nova-tag list="tags-conhecidas" placeholder="#fia/reels" autocomplete="off"></div>
          <datalist id="tags-conhecidas">${tagsConhecidas.map((t) => `<option value="#${esc(t)}">`).join('')}</datalist></div>
        ${it.descricao_ia && it.descricao_ia !== it.descricao ? `<p class="dica"><b>A IA descreveu:</b> ${esc(it.descricao_ia)}</p>` : ''}
        <div class="bloco-lista"><span class="eyebrow">Selo</span>
          <div class="acoes-linha">${est?.estado ? `<span class="selo-linha ${SELOS[est.estado][1]}">${SELOS[est.estado][0]}</span>` : '<span class="dica">Sem selo (o projeto dela ainda está em edição)</span>'}
            ${est?.estado === 'usado' ? '' : `<button class="botao pequeno" type="button" data-selo="aprovado" title="Boa, mesmo sem ter sido usada">${ICONE.check} Aprovar</button>
            <button class="botao pequeno" type="button" data-selo="recusado">Recusar</button>
            ${it.estado ? '<button class="botao pequeno" type="button" data-selo="">Automático</button>' : ''}`}</div>
          ${est?.usos?.length ? `<div class="estado-banco">${chipsDeUso(est.usos, cods)}</div>` : ''}</div>
        <div class="acoes-linha"><button class="botao botao-coral" type="submit" disabled>Salvar</button>
          ${!it.pai && it.largura && it.altura ? `<button class="botao" type="button" data-recortar title="Recorte o quadro (ex.: o vídeo 9:16 que veio num 16:9 com laterais pretas) e, num vídeo, corte o começo e o fim: vira uma mídia nova, o original fica">${ICONE.recortar} Recortar</button>` : ''}
          ${video && !it.pai ? `<button class="botao" type="button" data-marcar-trechos title="Selecione na linha do tempo os pedaços que servem: cada trecho vira uma mídia com código próprio">${ICONE.tesoura} Marcar trechos</button>` : ''}
          <button class="botao botao-perigo-contorno" type="button" data-apagar>${ICONE.lixo} Apagar do banco</button></div>
        <p class="erro-linha" hidden></p>
        ${d.trechos.length ? `<div class="bloco-lista"><span class="eyebrow">Trechos · ${d.trechos.length}</span><ul class="lista-simples">${d.trechos.map((t) => `<li><span>${esc(t.nome)}</span>${chipCodigo(cod[t.id], t.nome)}<span class="apagado">${seg(t.fim - t.inicio)} · ${mmss(t.inicio)}${t.usos.length ? ` · em ${t.usos.length}` : ''}</span></li>`).join('')}</ul></div>` : ''}
        <div class="bloco-lista"><span class="eyebrow">Usada em · ${usos.length}</span>
          ${usos.length ? `<ul class="lista-simples">${usos.map((u) => `<li><a href="#/p/${encodeURIComponent(projetoDe(u))}" data-fechar>${esc(u)}</a></li>`).join('')}</ul>` : '<p class="dica">Nenhum projeto usa esta mídia.</p>'}</div>
      </form>
    </div>`, { classe: 'janela-banco' })
  const form = $('form', el)
  const salvar = $('[type="submit"]', form)
  const erro = $('.erro-linha', el)
  let tags = [...(it.tags || [])]
  const valores = () => ({ nome: form.nome.value.trim(), descricao: form.descricao.value.trim(), palavras: form.palavras.value.split(',').map((p) => p.trim()).filter(Boolean), tags })
  const inicial = JSON.stringify(valores())
  const mudou = () => (salvar.disabled = JSON.stringify(valores()) === inicial || !form.nome.value.trim())
  form.addEventListener('input', mudou)
  const novaTag = $('[data-nova-tag]', el)
  const desenharTags = () => {
    $('[data-tags-chips]', el).innerHTML = tags.map((t, k) => `<span class="tag">#${esc(t)}<button type="button" data-tirar-tag="${k}" aria-label="Tirar #${esc(t)}">×</button></span>`).join('')
    for (const b of $$('[data-tirar-tag]', el)) b.addEventListener('click', () => {
      tags = tags.filter((_, k) => k !== +b.dataset.tirarTag)
      desenharTags()
    })
    mudou()
  }
  const incluirTag = () => {
    const novas = novaTag.value.split(/[,\s]+(?=#)|,/).map(tagLimpa).filter((t) => t && !tags.includes(t))
    novaTag.value = ''
    if (!novas.length) return
    tags = [...tags, ...novas]
    desenharTags()
  }
  novaTag.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      incluirTag()
    } else if (e.key === 'Backspace' && !novaTag.value && tags.length) {
      tags = tags.slice(0, -1)
      desenharTags()
    }
  })
  novaTag.addEventListener('change', () => novaTag.value.includes('#') && tagsConhecidas.includes(tagLimpa(novaTag.value)) && incluirTag()) // escolhida no autocompletar
  novaTag.addEventListener('blur', incluirTag)
  desenharTags()
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await enviar('PUT', `/api/banco/${id}`, valores())
      aviso('Salvo')
      fechar()
      recarregar()
    } catch (x) {
      erro.hidden = false
      erro.textContent = x.message
    }
  })
  $('[data-marcar-trechos]', el)?.addEventListener('click', () => {
    fechar()
    marcarTrechos(it, d.trechos, () => {
      recarregar()
      detalheBanco(id, recarregar, cod, est, cods)
    })
  })
  $('[data-recortar]', el)?.addEventListener('click', ({ currentTarget: b }) => {
    b.disabled = true
    recortarQuadro(el, it, () => (b.disabled = false), () => {
      fechar()
      recarregar()
    })
  })
  for (const b of $$('[data-selo]', el)) b.addEventListener('click', async () => {
    try {
      await enviar('PUT', `/api/banco/${id}`, { estado: b.dataset.selo || null })
      aviso(b.dataset.selo ? `Marcada como ${SELOS[b.dataset.selo][0].toLowerCase()}` : 'O selo volta a ser automático')
      fechar()
      recarregar()
    } catch (x) {
      aviso(x.message, 'erro')
    }
  })
  $('[data-apagar]', el).addEventListener('click', async () => {
    const ok = await confirmar({ titulo: `Apagar “${it.nome}” do banco?`, texto: `Vai para a Lixeira${d.trechos.length ? `, com os ${d.trechos.length} trechos dela` : ''} (de lá dá para restaurar).`, ok: 'Apagar', perigo: true })
    if (!ok) return
    try {
      await enviar('DELETE', `/api/banco/${id}`)
      aviso('Foi para a Lixeira')
      fechar()
      recarregar()
    } catch (x) {
      erro.hidden = false
      erro.textContent = x.message
    }
  })
}

const PROPS_RECORTE = { Original: 'original', '9:16': 9 / 16, '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5, Livre: null }
const MIN_TRECHO = 0.2 // s, como o MIN_TRECHO do banco.py
const MIN_RECORTE = 16 // px do original, como o MIN_RECORTE do banco.py

/** Recortar o quadro de um original no modal da mídia: o retângulo sobre a prévia (arrastar move; as alças redimensionam,
 * presas à proporção, menos no Livre; Original é o quadro inteiro) e, num vídeo, a barra do tempo embaixo (as pontas
 * cortam o começo e o fim). Tudo em px e s do original; "Salvar recorte" cria um item novo (o original fica). */
function recortarQuadro(el, it, aoCancelar, aoSalvar) {
  const W = it.largura
  const H = it.altura
  const palco = $('.recorte-palco', el)
  const midia = $('video, img', palco)
  const camada = $('.recorte', palco)
  const caixa = $('.recorte-caixa', camada)
  const barra = $('.recorte-barra', el)
  const par = (n) => (it.tipo === 'video' ? n - (n % 2) : n) // o H.264 pede lados pares (o banco.py arredonda igual)
  const limita = (n, a, b) => Math.max(a, Math.min(b, n))
  let prop = 'Original'
  let r = { x: 0, y: 0, w: W, h: H }
  const aspecto = (p) => (PROPS_RECORTE[p] === 'original' ? W / H : PROPS_RECORTE[p])
  const centrar = (p) => { // a maior caixa da proporção, no meio; o Livre mantém a que está
    prop = p
    const a = aspecto(p)
    if (a) {
      const [w, h] = W / H > a ? [H * a, H] : [W, W / a]
      r = { x: (W - w) / 2, y: (H - h) / 2, w, h }
    }
    desenhar()
  }
  // a camada cobre só a imagem dentro do elemento (object-fit: contain deixa faixas em volta)
  const caber = () => {
    const m = midia.getBoundingClientRect()
    const p = palco.getBoundingClientRect()
    const k = Math.min(m.width / W, m.height / H)
    Object.assign(camada.style, { left: `${m.left - p.left + (m.width - W * k) / 2}px`, top: `${m.top - p.top + (m.height - H * k) / 2}px`, width: `${W * k}px`, height: `${H * k}px` })
  }
  const desenhar = () => {
    Object.assign(caixa.style, { left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%` })
    $('[data-recorte-px]', barra).textContent = `${par(Math.round(r.w))} × ${par(Math.round(r.h))} px`
    for (const b of $$('[data-proporcao]', barra)) b.classList.toggle('ativa', b.dataset.proporcao === prop)
  }
  const obs = new ResizeObserver(caber)
  obs.observe(midia)
  if (midia.tagName === 'VIDEO') midia.controls = false // a camada fica por cima dos controles
  camada.hidden = barra.hidden = false
  caber()
  centrar(prop)

  // o tempo (só vídeo): a tira de quadros com as pontas de início e fim; o vídeo toca só o que fica
  const video = midia.tagName === 'VIDEO'
  const D = video ? it.duracao || midia.duration || 0 : 0
  let ini = 0
  let fim = D
  let faixa = null
  let laco = 0
  if (D) {
    faixa = document.createElement('div')
    faixa.className = 'corte-tempo'
    faixa.innerHTML = `<div class="ct-trilha"><div class="ct-fora ct-antes"></div><div class="ct-fora ct-depois"></div>
        <div class="ct-sel"><i data-ponta="ini" title="Arraste: o começo"></i><i data-ponta="fim" title="Arraste: o fim"></i></div><div class="ct-cabeca"></div></div>
      <div class="ct-rotulo"><span data-ct-tempos></span><span class="dica">arraste as pontas para cortar o começo e o fim</span></div>`
    barra.before(faixa)
    const trilha = $('.ct-trilha', faixa)
    json(`/api/banco/${it.id}/tira`, null).then((d) => d?.url && (trilha.style.backgroundImage = `url('${d.url}')`))
    const pct = (t) => `${(t / D) * 100}%`
    const desenharTempo = () => {
      Object.assign($('.ct-sel', faixa).style, { left: pct(ini), width: pct(fim - ini) })
      $('.ct-antes', faixa).style.width = pct(ini)
      Object.assign($('.ct-depois', faixa).style, { left: pct(fim), width: pct(D - fim) })
      $('[data-ct-tempos]', faixa).textContent = ini > 0.05 || fim < D - 0.05 ? `${tempo(ini)} – ${tempo(fim)} · ${num(fim - ini, 1)} s de ${num(D, 1)} s` : `o vídeo inteiro · ${num(D, 1)} s`
    }
    desenharTempo()
    // o vídeo fica no trecho escolhido (volta ao começo dele ao chegar no fim) e a cabeça acompanha
    const passo = () => {
      if (midia.currentTime >= fim - 0.02 || midia.currentTime < ini - 0.05) midia.currentTime = ini
      $('.ct-cabeca', faixa).style.left = pct(midia.currentTime)
      laco = requestAnimationFrame(passo)
    }
    laco = requestAnimationFrame(passo)
    trilha.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      const caixaT = trilha.getBoundingClientRect()
      const tDe = (ev) => Math.max(0, Math.min(D, ((ev.clientX - caixaT.left) / caixaT.width) * D))
      const ponta = e.target.dataset.ponta
      if (!ponta) return (midia.currentTime = Math.max(ini, Math.min(fim - 0.05, tDe(e)))) // clicar na tira: vai àquele ponto
      const tocava = !midia.paused
      midia.pause()
      const mover = (ev) => {
        const t = tDe(ev)
        if (ponta === 'ini') ini = Math.min(t, fim - MIN_TRECHO)
        else fim = Math.max(t, ini + MIN_TRECHO)
        midia.currentTime = ponta === 'ini' ? ini : Math.max(ini, fim - 0.04)
        desenharTempo()
      }
      const soltar = () => {
        removeEventListener('pointermove', mover)
        removeEventListener('pointerup', soltar)
        midia.currentTime = ini
        if (tocava) midia.play().catch(() => {})
      }
      addEventListener('pointermove', mover)
      addEventListener('pointerup', soltar)
    })
  }

  caixa.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    const k = camada.getBoundingClientRect().width / W
    const canto = e.target.dataset.canto
    const [x0, y0, r0] = [e.clientX, e.clientY, { ...r }]
    const a = aspecto(prop)
    const mover = (ev) => {
      if (!canto) {
        r.x = limita(r0.x + (ev.clientX - x0) / k, 0, W - r.w)
        r.y = limita(r0.y + (ev.clientY - y0) / k, 0, H - r.h)
        return desenhar()
      }
      // a ponta oposta fica parada; a caixa cresce para o lado da alça, até a borda do quadro
      const dx = canto.includes('w') ? -1 : 1
      const dy = canto.includes('n') ? -1 : 1
      const ax = dx < 0 ? r0.x + r0.w : r0.x
      const ay = dy < 0 ? r0.y + r0.h : r0.y
      const maxW = dx < 0 ? ax : W - ax
      const maxH = dy < 0 ? ay : H - ay
      let w = limita(dx * (r0.w * dx + (ev.clientX - x0) / k), MIN_RECORTE, maxW)
      let h = limita(dy * (r0.h * dy + (ev.clientY - y0) / k), MIN_RECORTE, maxH)
      if (a) {
        w = Math.min(Math.max(w, h * a), maxW, maxH * a)
        h = w / a
      }
      r = { x: dx < 0 ? ax - w : ax, y: dy < 0 ? ay - h : ay, w, h }
      desenhar()
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  })
  const sair = () => {
    cancelAnimationFrame(laco)
    faixa?.remove()
    obs.disconnect()
    camada.hidden = barra.hidden = true
    if (midia.tagName === 'VIDEO') midia.controls = true
    barra.onclick = null
  }
  barra.onclick = async (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.proporcao) return centrar(b.dataset.proporcao)
    if (b.hasAttribute('data-recorte-cancelar')) {
      sair()
      return aoCancelar()
    }
    if (!b.hasAttribute('data-recorte-salvar')) return
    b.disabled = true
    b.textContent = 'Recortando…'
    try {
      const corte = D && (ini > 0.05 || fim < D - 0.05) ? { inicio: +ini.toFixed(3), fim: +fim.toFixed(3) } : {}
      const { item } = await enviar('POST', `/api/banco/${it.id}/recorte`, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), ...corte })
      const c = (await codigos()).midia?.[item.id]
      aviso(`Recorte salvo · ${c || item.id}`)
      sair()
      aoSalvar()
    } catch (x) {
      aviso(x.message, 'erro')
      b.disabled = false
      b.textContent = 'Salvar recorte'
    }
  }
}

// ---------- Presets ----------

const TELAS = { dividida: 'Tela dividida', vertical: 'Tela cheia', atras: 'Ator embaixo' }
const PROPORCOES = { pe: '9:16', quadrada: 'Quadrada', deitada: 'Horizontal' }
const nMidias = (r) => Math.max(1, ...(r?.cards || []).map((c, k) => (c.midia ?? k) + 1))
const chaveMidias = (n) => (n <= 1 ? '1' : n === 2 ? '2' : '2+')
/** Onde o preset vale (como o `usosDe` do 18): o marcado, ou o que a receita suporta. */
function usosDe(p) {
  if (p.usos) return p.usos
  const telas = p.formatos || ['dividida', 'vertical']
  return { telas: telas.includes('dividida') ? [...telas, 'atras'] : telas, midias: p.receita?.repete ? ['2', '2+'] : [chaveMidias(nMidias(p.receita))] }
}
/** O preset serve à situação (como o `serve` do 18): a tela, o número de mídias e, com 1 mídia, a proporção dela. */
function serve(p, { tela, n, prop }) {
  const u = usosDe(p)
  const cabe = p.receita?.repete ? n >= 1 : n <= nMidias(p.receita)
  const props = !prop || !u.proporcoes || u.proporcoes.includes(prop)
  return cabe && props && u.midias.includes(chaveMidias(n)) && u.telas.includes(tela)
}
/** As situações dos recomendados (as chaves de presets/ordem.json): com 1 mídia, pela proporção; com várias, pelo número. */
const VARIANTES = [{ n: 1, prop: 'pe', nome: '1 mídia 9:16' }, { n: 1, prop: 'deitada', nome: '1 mídia horizontal' }, { n: 2, nome: '2 mídias' }, { n: 3, nome: '3 ou mais' }]
const situacao = (tela, n, prop) => `${tela}:${chaveMidias(n)}${n === 1 && prop ? `:${prop}` : ''}`
const N_RECOMENDADOS = 3
/** As situações de ordem.json em que o preset é favorito, juntas por tela: "Tela dividida: 1 em pé · 2". */
function favoritasPorTela(chaves) {
  const curto = (n, prop) => (n === '1' ? (prop === 'pe' ? '1 em pé' : '1 horizontal') : n === '2+' ? '3 ou mais' : `${n}`)
  const por = {}
  for (const c of chaves) {
    const [tela, n, prop] = c.split(':')
    ;(por[tela] ||= []).push(curto(n, prop))
  }
  return Object.entries(por).map(([tela, l]) => `<b>${TELAS[tela] || tela}</b> ${l.join(' · ')}`)
}
const botaoRecusar = (p) =>
  `<button class="botao-icone pequeno botao-recusar" data-recusar title="${p.aprovado ? 'Descartar (sai da biblioteca)' : 'Recusar a sugestão'}" aria-label="${p.aprovado ? 'Descartar' : 'Recusar'}">${p.aprovado ? ICONE.lixo : ICONE.fechar}</button>`
const botaoAprovar = (aprovado) =>
  `<button class="botao-check${aprovado ? ' ligado' : ''}" data-aprovar title="${aprovado ? 'Aprovado · clique para tirar a aprovação' : 'Aprovar'}" aria-pressed="${!!aprovado}">${ICONE.check}</button>`

/** O clipe da referência (com som; `revisao.py clipes`) e a simulação (render/preset.html) de um preset. */
const urlClipe = (p) => `/biblioteca/presets/clipes/${p.id}.mp4`
const urlSim = (p, s = {}) => `/render/preset.html?${new URLSearchParams({ preset: p.id, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v != null)) })}`
/** O instante parado do trecho da referência: o quadro que a miniatura mostra parada (a referência e a recriação). É
 *  o `instanteParado` de render/src/preset.ts (mude os dois juntos): o começo do repouso em que mais cards estão parados
 *  na tela (no empate, o mais cedo); numa sequência de tomadas, a 1ª tomada parada, nunca depois de todas saírem. */
function repousoDe(p) {
  const f = p.fontes?.[0]
  const dur = f ? f.fim - f.inicio : p.receita?.duracao_ref || 1
  const cards = p.receita?.cards || []
  const janela = (c) => {
    const ini = c.inicio_frac * dur
    return { ini, fim: Math.max(c.fim_frac != null ? Math.min(c.fim_frac * dur + (c.fim_mais ?? 0), dur) : dur - (c.sai_antes_do_fim || 0), ini + 0.05) }
  }
  const vidas = cards.map(janela)
  const repousos = cards.map((c, k) => [vidas[k].ini + (c.entrada?.duracao ?? 0), vidas[k].fim - (c.saida?.duracao ?? 0)]).filter(([a, b]) => b - a > 0.05)
  let t = dur / 2
  if (repousos.length) {
    const parados = (x) => repousos.filter(([a, b]) => x >= a - 1e-6 && x <= b + 1e-6).length
    let n = -1
    for (const [a, b] of repousos) {
      const x = Math.min(a + 0.1, (a + b) / 2)
      const k = parados(x)
      if (k > n || (k === n && x < t)) [t, n] = [x, k]
    }
  } else if (vidas.length) {
    const j = vidas.reduce((m, v) => (v.fim - v.ini > m.fim - m.ini ? v : m))
    t = (j.ini + j.fim) / 2
  }
  return +Math.min(Math.max(t, 0), dur - 0.05).toFixed(3)
}
/** As proporções simuladas: com 1 mídia, uma só; com várias, as combinações que acontecem (as do 18). */
const PROPS_SIM = (n) => (n === 1 ? [['pe', '9:16'], ['1:1', '1:1'], ['4:3', '4:3'], ['16:9', '16:9']] : [['pe', 'Todas 9:16'], ['mista', '9:16 + horizontais'], ['deitada', 'Só horizontais']])

/** O `__sim` da página de simulação dentro do iframe, quando ela termina de carregar (null se falhou). */
function simDe(f) {
  return new Promise((ok) => {
    const pegar = () => {
      const s = f.contentWindow?.__sim
      if (!s) return ok(null)
      s.pronto.then(() => ok(s), () => ok(null))
    }
    if (f.contentWindow?.__sim && f.contentDocument?.readyState === 'complete') pegar()
    else f.addEventListener('load', pegar, { once: true })
  })
}
let audioSim = null // o áudio dos sons da simulação: criado no clique (aqui, onde houve o gesto) e emprestado ao iframe
const audioDoClique = () => {
  audioSim ||= new AudioContext()
  if (audioSim.state === 'suspended') audioSim.resume().catch(() => {})
  return audioSim
}

/** Referência e recriação tocando juntas: o vídeo da referência (com ou sem som) e a simulação no relógio dele. Devolve
 *  a função que para (e volta ao repouso). */
function tocarPar(v, f, { comSom, rep }) {
  let parado = false
  v.muted = !comSom
  v.loop = true
  v.currentTime = 0
  v.play().catch(() => {
    v.muted = true
    v.play().catch(() => {})
  })
  const s = simDe(f).then((sim) => (parado ? null : (sim?.tocar({ relogio: () => v.currentTime, som: false }), sim)))
  return () => {
    parado = true
    v.pause()
    v.currentTime = rep
    s.then((sim) => sim?.parar())
  }
}

async function presets(el) {
  const [ps, ordem0, cods] = await Promise.all([jsons('biblioteca/presets', ['ordem.json']), json('/biblioteca/presets/ordem.json', {}), codigos()])
  const sons = await nomesDosSons()
  const cod = cods.preset || {}
  let ordem = ordem0 || {}
  let filtro = 'todos'
  ps.sort((a, b) => (a.aprovado ? 1 : 0) - (b.aprovado ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR')) // os a revisar primeiro
  const favoritasDe = (p) => Object.entries(ordem).filter(([, o]) => (o.ids || []).slice(0, o.favoritos || 0).includes(p.id)).map(([c]) => c)

  // um card toca por vez: com o mouse em cima, mudo; clicado, com o som da referência (clicar de novo para)
  let atual = null // { card, comSom, parar }
  const pararCard = () => {
    atual?.parar()
    atual?.card.classList.remove('tocando', 'com-som')
    atual = null
  }
  const tocarCard = (c, comSom) => {
    const v = $('.v-ref', c)
    if (atual?.card === c) {
      if (comSom && !atual.comSom) {
        atual.comSom = true
        v.muted = false
        c.classList.add('com-som')
      }
      return
    }
    pararCard()
    const p = ps.find((x) => x.id === c.dataset.id)
    atual = { card: c, comSom, parar: tocarPar(v, $('iframe', c), { comSom, rep: repousoDe(p) }) }
    c.classList.add('tocando')
    c.classList.toggle('com-som', comSom)
  }
  const fora = new IntersectionObserver((es) => es.forEach((e) => !e.isIntersecting && atual?.card === e.target && pararCard()))

  const card = (p) => {
    const nFav = favoritasDe(p).length
    const rep = repousoDe(p)
    return `<article class="card-preset" data-id="${p.id}">
      <div class="mini mini-par" title="Clique para tocar com som">
        <div class="lado"><video class="v-ref" playsinline preload="metadata" src="${urlClipe(p)}#t=${rep}"></video><span class="sem-clipe">sem clipe</span><span class="rotulo">Referência</span></div>
        <div class="lado"><iframe loading="lazy" tabindex="-1" allow="autoplay" title="Recriação" src="${urlSim(p, { t: rep })}"></iframe><span class="rotulo">Recriação</span></div>
        <span class="selo ${p.aprovado ? 'selo-menta' : 'selo-coral'}">${p.aprovado ? 'Aprovado' : 'A revisar'}</span>
        <span class="video-tocar">${ICONE.tocar}</span></div>
      <div class="card-titulo"><h3 data-abrir title="${esc(p.descricao || p.nome)}">${esc(p.nome)}</h3>
        ${nFav ? `<span class="n-fav" title="Recomendado em ${nFav} ${nFav === 1 ? 'situação' : 'situações'}">${ESTRELA_CHEIA}${nFav}</span>` : ''}
        ${botaoAprovar(p.aprovado)}${botaoRecusar(p)}<button class="botao-icone pequeno" data-abrir title="Simular em outras telas">${ICONE.ajustes}</button></div>
      <div class="card-pe">${chipCodigo(cod[p.id], p.nome)}</div>
    </article>`
  }
  const ligarCard = (c) => {
    const v = $('.v-ref', c)
    v.addEventListener('error', () => c.classList.add('sem-video'))
    const mini = $('.mini', c)
    mini.addEventListener('mouseenter', () => !atual?.comSom && tocarCard(c, false))
    mini.addEventListener('mouseleave', () => atual?.card === c && !atual.comSom && pararCard())
    mini.addEventListener('click', () => (atual?.card === c && atual.comSom ? pararCard() : tocarCard(c, true)))
    fora.observe(c)
  }
  const desenhar = () => {
    pararCard()
    const n = { todos: ps.length, revisar: ps.filter((p) => !p.aprovado).length, aprovados: ps.filter((p) => p.aprovado).length }
    const vis = ps.filter((p) => filtro === 'todos' || (filtro === 'aprovados') === !!p.aprovado)
    el.innerHTML = `<div class="filtros filtros-topo">${trocaPresets('presets')}${[['todos', 'Todos'], ['revisar', 'A revisar'], ['aprovados', 'Aprovados']].map(([k, nome]) => chip(filtro === k, `${nome} <span class="conta">${n[k]}</span>`, `data-filtro="${k}"`)).join('')}
        ${ajuda('Os movimentos dos inserts, recriados das referências. Clique na miniatura para tocar a referência com som, ao lado da recriação; no nome ou na engrenagem, simule em outras telas. Só os aprovados entram nas edições.')}
        <button class="pilula pequena filtros-fim" data-recomendados title="Os favoritos de cada situação, que ficam em cima nas edições">${ICONE.estrela} Recomendados</button></div>
      ${vis.length ? `<div class="grade grade-presets">${vis.map(card).join('')}</div>` : '<p class="vazio">Nenhum preset aqui. Mande ao Claude o trecho de uma referência e ele monta o preset.</p>'}`
    for (const c of $$('.card-preset', el)) ligarCard(c)
  }
  const aprovar = async (p) => {
    try {
      Object.assign(p, await enviar('PUT', `/api/presets/${p.id}`, { aprovado: !p.aprovado }))
      aviso(p.aprovado ? `“${p.nome}” aprovado` : `“${p.nome}” voltou para a revisão`)
    } catch (x) {
      return aviso(x.message, 'erro')
    }
    const c = $(`.card-preset[data-id="${p.id}"]`, el)
    if (!c) return
    if (atual?.card === c) pararCard()
    c.outerHTML = card(p)
    ligarCard($(`.card-preset[data-id="${p.id}"]`, el))
  }
  /** Recusar (um sugerido, "a revisar") ou descartar (um aprovado): vai para presets/_recusados/, com o motivo. */
  const recusar = async (p, aoRecusar) => {
    const usos = await json(`/api/presets/${p.id}/usos`, {})
    const onde = Object.entries(usos || {}).map(([slug, planos]) => `${slug} (${planos.join(', ')})`)
    const n = Object.values(usos || {}).flat().length
    const verbo = p.aprovado ? 'Descartar' : 'Recusar'
    const motivo = await confirmar({
      titulo: `${verbo} “${p.nome}”?`,
      texto: `${p.aprovado ? 'O preset sai da biblioteca e dos recomendados de todas as situações' : 'A sugestão sai da biblioteca'} (vai para presets/_recusados/).${n ? `\n${n === 1 ? '1 insert usa' : `${n} inserts usam`} este preset — ${onde.join('; ')}: os inserts que o usam voltam ao 1º favorito da situação.` : ''}`,
      ok: verbo,
      perigo: true,
      campo: { rotulo: 'Por quê? (opcional: o Claude lê para não sugerir de novo o mesmo tipo de coisa)', dica: 'ex.: movimento exagerado, parece template' },
    })
    if (motivo == null) return
    try {
      await enviar('POST', `/api/presets/${p.id}/recusar`, { motivo })
    } catch (x) {
      return aviso(x.message, 'erro')
    }
    aviso(`“${p.nome}” ${p.aprovado ? 'descartado' : 'recusado'}${n ? ` · ${n} ${n === 1 ? 'insert voltou' : 'inserts voltaram'} ao 1º favorito` : ''}`)
    ps.splice(ps.indexOf(p), 1)
    ordem = (await json('/biblioteca/presets/ordem.json', {})) || {}
    aoRecusar?.()
    desenhar()
  }
  const abrirRecomendados = () => recomendados(ps, ordem, (o) => {
    ordem = o
    desenhar()
  })
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filtro]')
    if (f) {
      filtro = f.dataset.filtro
      return desenhar()
    }
    if (e.target.closest('[data-recomendados]')) return abrirRecomendados()
    const c = e.target.closest('.card-preset')
    const p = c && ps.find((x) => x.id === c.dataset.id)
    if (!p) return
    if (e.target.closest('[data-aprovar]')) return aprovar(p)
    if (e.target.closest('[data-recusar]')) return recusar(p)
    if (e.target.closest('[data-abrir]')) {
      pararCard()
      detalhePreset(p, { aprovar, recusar, recomendados: abrirRecomendados, favoritas: favoritasDe(p), sons, codigo: cod[p.id] })
    }
  })
  desenhar()
  return () => {
    pararCard()
    fora.disconnect()
  }
}

/** O modal de um preset: a referência com som e a Simulação (Original · as telas, os números de mídias e as proporções
 *  em que o preset vale, como o "Simular" do 18), tocando juntas; Aprovar e Recomendados no título. */
function detalhePreset(p, { aprovar, recusar, recomendados: abrirRecomendados, favoritas, sons, codigo }) {
  const u = usosDe(p)
  const r = p.receita || {}
  const fonte = p.fontes?.[0]
  const rep = repousoDe(p)
  const telas = Object.keys(TELAS).filter((t) => u.telas.includes(t))
  const ns = ['1', '2', '2+'].filter((m) => u.midias.includes(m)).map((m) => (m === '1' ? 1 : m === '2' ? 2 : 3))
  const nomeN = (n) => (n === 1 ? '1 mídia' : n === 2 ? '2 mídias' : r.repete || nMidias(r) < 3 ? '3 ou mais' : nMidias(r) === 3 ? '3 mídias' : `3 a ${nMidias(r)} mídias`)
  const ok = (x) => !u.proporcoes || u.proporcoes.includes(x)
  const vale = (id) => (id === 'pe' ? ok('pe') : id === '1:1' ? ok('quadrada') : id === 'mista' ? ok('pe') && ok('deitada') : ok('deitada'))
  const props = (n) => PROPS_SIM(n).filter(([id]) => vale(id))
  let sim = null // null: a tela original (sincronizada com a referência)
  let ouvir = 'ref' // quem se ouve: a referência ou os sons da simulação
  let tocando = false
  const sonsP = (r.sons || []).filter((s) => s.som).map((s) => `${esc(sons[s.som] || s.som)} <span class="apagado">(${esc(s.momento)})</span>`)

  const { el, fechar } = janela(`
    <header class="janela-cabeca"><h2 title="${esc(p.id)}">${esc(p.nome)}</h2>${chipCodigo(codigo, p.nome)}
      <button class="botao pequeno${p.aprovado ? ' botao-menta' : ''}" data-aprovar-modal>${ICONE.check} <span>${p.aprovado ? 'Aprovado' : 'Aprovar'}</span></button>
      <button class="botao pequeno botao-perigo-contorno" data-recusar-modal title="${p.aprovado ? 'Tira o preset da biblioteca (vai para os recusados)' : 'Recusa a sugestão (vai para os recusados)'}">${ICONE.fechar} <span>${p.aprovado ? 'Descartar' : 'Recusar'}</span></button>
      <button class="botao pequeno" data-recomendados-modal>${ICONE.estrela} Recomendados</button>
      <button class="botao-icone" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button></header>
    <div class="preset-detalhe">
      <div class="preset-palco mini-par" title="Clique para tocar ou parar">
        <div class="lado"><video class="v-ref" playsinline preload="auto" src="${urlClipe(p)}#t=${rep}"></video>
          <button class="rotulo" data-ouvir="ref" title="Ouvir a referência"></button></div>
        <div class="lado"><iframe allow="autoplay" tabindex="-1" title="Simulação"></iframe>
          <button class="rotulo" data-ouvir="sim" title="Ouvir os sons do preset"></button></div>
        <span class="video-tocar">${ICONE.tocar}</span></div>
      <aside class="preset-lado">
        ${p.descricao ? `<p class="desc-preset">${esc(p.descricao)}</p>` : ''}
        <div class="bloco-sim"><span class="eyebrow">Simular</span><div class="chips" data-linha="tela"></div><div class="chips" data-linha="n"></div><div class="chips" data-linha="prop"></div></div>
        <dl class="dados">
          <dt>Sons</dt><dd>${sonsP.length ? sonsP.join(' · ') : '<span class="apagado">nenhum</span>'}</dd>
          ${fonte ? `<dt>Referência</dt><dd>${esc(String(fonte.ref).replace(/^externa:/, ''))} · ${mmss(fonte.inicio)}${p.fontes.length > 1 ? ` <span class="apagado">+${p.fontes.length - 1}</span>` : ''}</dd>` : ''}
          ${favoritas.length ? `<dt class="t-fav">★ Recomendado</dt><dd class="favoritas">${favoritasPorTela(favoritas).join('<br>')}</dd>` : ''}
        </dl>
      </aside>
    </div>`, { classe: 'janela-preset', aoFechar: () => parar() })
  const v = $('.v-ref', el)
  const f = $('iframe', el)
  const palco = $('.preset-palco', el)

  const marcar = () => {
    const linhas = {
      tela: [chip(!sim, 'Original', 'data-tela="original" title="Como na referência"'), ...telas.map((t) => chip(sim?.tela === t, TELAS[t], `data-tela="${t}"`))],
      n: sim ? ns.map((n) => chip(sim.n === n, nomeN(n), `data-n="${n}"`)) : [],
      prop: sim ? props(sim.n).map(([id, nome]) => chip(sim.prop === id, nome, `data-prop="${id}"`)) : [],
    }
    for (const [k, l] of Object.entries(linhas)) $(`[data-linha="${k}"]`, el).innerHTML = l.join('')
    $('[data-ouvir="ref"]', el).innerHTML = `${ouvir === 'ref' ? ICONE.som : ICONE.mudo} Referência`
    $('[data-ouvir="sim"]', el).innerHTML = `${ouvir === 'sim' ? ICONE.som : ICONE.mudo} ${sim ? 'Simulação' : 'Recriação'}`
    for (const b of $$('[data-ouvir]', el)) b.classList.toggle('ativo', b.dataset.ouvir === ouvir)
    palco.classList.toggle('tocando', tocando)
  }
  // a página da simulação que está no iframe (a cada troca de situação, outra)
  let simAtual = Promise.resolve(null)
  const parar = () => {
    tocando = false
    v.pause()
    v.currentTime = rep
    simAtual.then((s) => s?.parar())
    marcar()
  }
  // na tela original, a recriação anda no relógio da referência; simulando, cada uma no seu (a simulação dura o que um
  // insert daquele número de mídias dura). Os sons da simulação tocam no áudio criado aqui, no clique.
  const tocar = () => {
    tocando = true
    const audio = ouvir === 'sim' ? audioDoClique() : undefined
    v.muted = ouvir !== 'ref'
    v.loop = true
    v.currentTime = 0
    v.play().catch(() => {
      v.muted = true
      v.play().catch(() => {})
    })
    simAtual.then((s) => tocando && s?.tocar({ relogio: sim ? null : () => v.currentTime, som: ouvir === 'sim', audio }))
    marcar()
  }
  const carregar = () => {
    simAtual = new Promise((ok) => f.addEventListener('load', () => simDe(f).then(ok), { once: true }))
    f.src = urlSim(p, sim ? { tela: sim.tela, n: sim.n, prop: sim.prop } : { t: rep })
    if (tocando) tocar() // recomeça junto, na situação nova
    else marcar()
  }
  const mudar = (novo) => {
    const antes = !!sim
    sim = novo
    if (sim && !props(sim.n).some(([id]) => id === sim.prop)) sim.prop = props(sim.n).at(-1)?.[0] ?? (sim.n === 1 ? '16:9' : 'deitada')
    if (antes !== !!sim) ouvir = sim ? 'sim' : 'ref' // simulando, ouve-se o preset; na original, a referência
    carregar()
  }

  palco.addEventListener('click', (e) => {
    const o = e.target.closest('[data-ouvir]')
    if (o) {
      e.stopPropagation()
      ouvir = o.dataset.ouvir
      if (tocando) {
        parar()
        tocar()
      } else marcar()
      return
    }
    tocando ? parar() : tocar()
  })
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tela], [data-n], [data-prop], [data-aprovar-modal], [data-recomendados-modal], [data-recusar-modal]')
    if (!b) return
    if (b.hasAttribute('data-recusar-modal')) return recusar(p, fechar)
    if (b.dataset.tela) {
      const n0 = ns[0] ?? 1
      return mudar(b.dataset.tela === 'original' ? null : { tela: b.dataset.tela, n: sim?.n ?? n0, prop: sim?.prop ?? '' })
    }
    if (b.dataset.n) return mudar({ ...sim, n: +b.dataset.n, prop: sim.n === +b.dataset.n ? sim.prop : '' })
    if (b.dataset.prop) return mudar({ ...sim, prop: b.dataset.prop })
    if (b.hasAttribute('data-recomendados-modal')) return abrirRecomendados()
    aprovar(p).then(() => {
      b.classList.toggle('botao-menta', !!p.aprovado)
      $('span', b).textContent = p.aprovado ? 'Aprovado' : 'Aprovar'
      $('[data-recusar-modal] span', el).textContent = p.aprovado ? 'Descartar' : 'Recusar'
    })
  })
  v.addEventListener('error', () => palco.classList.add('sem-video'))
  carregar()
}

/** Os recomendados por situação (§8.16 do 18): os aprovados que valem em cada situação, na ordem; arrastar reordena e a
 *  estrela favorita até 3 (sempre no começo). Grava em presets/ordem.json, no mesmo formato. */
function recomendados(ps, ordem, mudou) {
  let sit = { tela: 'vertical', n: 1, prop: 'pe' }
  const valem = (s) => ps.filter((p) => p.aprovado && serve(p, s))
  const { el } = janela(`<header class="janela-cabeca"><h2>Recomendados por situação</h2>
      <span class="dica">Arraste para ordenar. A ★ favorita até ${N_RECOMENDADOS}: eles ficam no começo e são os recomendados de cada situação.</span>
      <button class="botao-icone" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button></header>
    <div class="recomendados"><nav class="situacoes"></nav><section class="situacao"></section></div>`, { classe: 'janela-cheia' })
  const nav = $('.situacoes', el)
  const corpo = $('.situacao', el)
  let ids = []
  let nFav = 0
  const salvar = async (novos, favoritos) => {
    const chave = situacao(sit.tela, sit.n, sit.prop)
    try {
      ordem = await enviar('PUT', '/api/presets/ordem', { chave, ids: novos, favoritos })
      mudou(ordem)
    } catch (x) {
      aviso(x.message, 'erro')
    }
    desenhar()
  }
  const desenharNav = () => {
    nav.innerHTML = Object.entries(TELAS).map(([tela, nome]) => `<div class="grupo-situacao"><span class="eyebrow">${nome}</span><div>${VARIANTES.map((v) => {
      const s = { tela, n: v.n, prop: v.prop }
      const nf = ordem[situacao(tela, v.n, v.prop)]?.favoritos || 0
      const ativa = situacao(tela, v.n, v.prop) === situacao(sit.tela, sit.n, sit.prop)
      return chip(ativa, `${v.nome} <span class="conta">${valem(s).length}</span>${nf ? ` <span class="t-fav">★${nf}</span>` : ''}`, `data-sit="${tela}|${v.n}|${v.prop || ''}"`)
    }).join('')}</div></div>`).join('')
  }
  const cardRec = (p, i) => {
    const fav = i < nFav
    const cheio = !fav && nFav >= N_RECOMENDADOS
    const u = usosDe(p)
    return `<div class="card-rec${fav ? ' fav' : ''}" draggable="true" data-id="${p.id}">
      <div class="mini mini-916"><video muted loop playsinline preload="metadata" src="/biblioteca/presets/clipes/${p.id}.mp4#t=0.05"></video>
        <span class="ordem-num">${i + 1}</span>
        <button class="estrela${fav ? ' ligada' : ''}" data-estrela ${cheio ? 'disabled' : ''} title="${fav ? 'Tirar dos recomendados' : cheio ? `Já há ${N_RECOMENDADOS} favoritos: tire um antes` : 'Favoritar (recomendado nesta situação)'}">${fav ? ESTRELA_CHEIA : ICONE.estrela}</button></div>
      <b>${esc(p.nome)}</b><span class="dica">${(u.proporcoes || Object.keys(PROPORCOES)).map((x) => PROPORCOES[x]).join(' · ')}</span></div>`
  }
  const desenhar = () => {
    desenharNav()
    const chave = situacao(sit.tela, sit.n, sit.prop)
    const o = ordem[chave]
    const l = valem(sit)
    const pos = (p) => (o?.ids?.includes(p.id) ? o.ids.indexOf(p.id) : 1e9)
    const ordenados = o?.ids?.length ? [...l].sort((a, b) => pos(a) - pos(b)) : l
    const favs = new Set((o?.ids || []).slice(0, o?.favoritos || 0))
    nFav = ordenados.filter((p) => favs.has(p.id)).length
    ids = [...ordenados.filter((p) => favs.has(p.id)), ...ordenados.filter((p) => !favs.has(p.id))].map((p) => p.id)
    const nomeVar = VARIANTES.find((v) => v.n === sit.n && (v.prop || '') === (sit.prop || '')).nome
    corpo.innerHTML = `<p class="titulo-situacao"><b>${TELAS[sit.tela]} · ${nomeVar}</b> <span class="dica">${nFav}/${N_RECOMENDADOS} favoritos</span>
        ${o ? '<button class="link" data-limpar title="Volta a uma lista só, sem recomendados">Limpar a ordem</button>' : ''}</p>
      ${ids.length ? `<div class="grade-rec">${ids.map((id, i) => cardRec(ps.find((p) => p.id === id), i)).join('')}</div>` : '<p class="dica">Nenhum preset aprovado vale nesta situação (veja o “Vale em” de cada um).</p>'}`
    for (const c of $$('.card-rec', corpo)) tocarNoHover(c, $('video', c))
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sit]')
    if (!b) return
    const [tela, n, prop] = b.dataset.sit.split('|')
    sit = { tela, n: +n, prop: prop || undefined }
    desenhar()
  })
  corpo.addEventListener('click', (e) => {
    if (e.target.closest('[data-limpar]')) return salvar([], 0)
    const b = e.target.closest('[data-estrela]')
    if (!b) return
    const id = b.closest('.card-rec').dataset.id
    const fav = ids.indexOf(id) < nFav
    const novos = ids.filter((x) => x !== id)
    novos.splice(fav ? nFav - 1 : nFav, 0, id) // favoritar põe no fim dos favoritos; desfavoritar, logo depois deles
    salvar(novos, nFav + (fav ? -1 : 1))
  })
  // arrastar: os cards mudam de lugar enquanto arrasta (o que cai entre os favoritos vira favorito; o último sai)
  let arrastando = null
  corpo.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.card-rec')
    if (!c) return
    arrastando = c
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', c.dataset.id)
    requestAnimationFrame(() => c.classList.add('arrastando'))
  })
  corpo.addEventListener('dragover', (e) => {
    if (!arrastando) return
    e.preventDefault()
    const alvo = e.target.closest('.card-rec')
    if (!alvo || alvo === arrastando) return
    const grade = alvo.parentElement
    const todos = [...grade.children]
    grade.insertBefore(arrastando, todos.indexOf(arrastando) < todos.indexOf(alvo) ? alvo.nextSibling : alvo)
  })
  corpo.addEventListener('drop', (e) => {
    if (!arrastando) return
    e.preventDefault()
    const novos = $$('.card-rec', corpo).map((c) => c.dataset.id)
    arrastando = null
    if (novos.join() !== ids.join()) salvar(novos, nFav)
    else desenhar()
  })
  corpo.addEventListener('dragend', () => {
    if (arrastando) desenhar() // soltou fora: volta
    arrastando = null
  })
  desenhar()
}

// ---------- Transições ----------

const GRUPOS = [['ator', 'Full ator'], ['dividida', 'Tela dividida'], ['cheia', 'Tela cheia']]
const NOME_GRUPO = Object.fromEntries(GRUPOS)
const N_FAVORITAS = 2
/** O grupo de um plano para as transições (§8.8 do 18): Full ator · Tela dividida (com o comentário) · Tela cheia. */
const grupoDe = (tipo) => (tipo.startsWith('full_ator') ? 'ator' : tipo.startsWith('tela_dividida') || tipo === 'comentario_insert_ator' ? 'dividida' : 'cheia')

async function transicoes(el, resto) {
  const [ts, ordem0, pares, sons, cods] = await Promise.all([
    jsons('biblioteca/transicoes', ['ordem.json', 'pares.json']),
    json('/biblioteca/transicoes/ordem.json', {}),
    json('/biblioteca/transicoes/pares.json', {}),
    nomesDosSons(),
    codigos(),
  ])
  let ordem = ordem0 || {}
  const porId = Object.fromEntries(ts.map((t) => [t.id, t]))
  ts.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const par = /^(ator|dividida|cheia)>(ator|dividida|cheia)$/.test(resto[0] || '') ? resto[0] : null
  // os cortes das referências em cada par de grupos (pares.json é por par de categorias)
  const cortes = {}
  for (const [k, v] of Object.entries(pares || {})) {
    const [de, para] = k.split('>')
    const g = `${grupoDe(de)}>${grupoDe(para)}`
    ;(cortes[g] ||= { n: 0, sons: {}, cortes: [] }).n += v.n || 0
    for (const [s, q] of Object.entries(v.sons || {})) cortes[g].sons[s] = (cortes[g].sons[s] || 0) + q
    cortes[g].cortes.push(...(v.cortes || []).map((c) => ({ ...c, par: k })))
  }
  /** A ordem do par: as ids (todas as transições, as que faltam no fim) e quantas são favoritas. */
  const ordemDo = (g) => {
    const o = ordem[`familia:${g}`]
    const ids = (o?.ids || []).filter((id) => porId[id])
    for (const t of ts) if (!ids.includes(t.id)) ids.push(t.id)
    return { ids, favoritas: Math.min(o?.favoritas ?? 0, ids.length) }
  }
  const padraoDo = (g) => {
    const o = ordemDo(g)
    return o.favoritas ? porId[o.ids[0]].nome : 'Corte seco'
  }
  const card = (t, { k = -1, nFav = 0 } = {}) => {
    const fav = k >= 0 && k < nFav
    return `<article class="card-transicao" id="tr-${t.id}" data-id="${t.id}">
      <div class="mini mini-916"><video playsinline preload="metadata" src="/biblioteca/transicoes/clipes/${t.id}.mp4#t=1.4"></video>
        <span class="selo ${t.aprovado ? 'selo-menta' : 'selo-coral'}">${t.aprovado ? 'Aprovada' : 'A revisar'}</span>
        ${par && k === 0 && fav ? '<span class="selo selo-amarelo selo-dir">Padrão do par</span>' : ''}
        <button class="video-tocar" data-tocar="${t.id}" aria-label="Tocar com som">${ICONE.tocar}</button>
        <span class="sem-clipe">sem clipe de referência</span></div>
      <div class="card-titulo"><h3 title="${esc(t.descricao || '')}">${esc(t.nome)}</h3>
        ${par ? `<button class="estrela${fav ? ' ligada' : ''}" data-estrela title="${fav ? 'Tirar das favoritas do par' : 'Favorita deste par'}">${fav ? ESTRELA_CHEIA : ICONE.estrela}</button>` : ''}
        ${botaoAprovar(t.aprovado)}</div>
      <div class="card-pe">${chipCodigo(cods.transicao?.[t.id], t.nome)}</div>
      ${par && k === 1 && fav ? '<button class="link" data-padrao>Tornar o padrão do par</button>' : ''}
    </article>`
  }

  const lado = `<aside class="lado-pares">
      ${trocaPresets('transicoes')}
      <a class="par-link${par ? '' : ' ativo'}" href="#/transicoes"><b>Todas as transições</b><span class="conta">${ts.length}</span><small>ver, ouvir e aprovar</small></a>
      <span class="eyebrow">De onde sai → para onde vai</span>
      ${GRUPOS.map(([de, nomeDe]) => `<div class="grupo-pares"><span class="grupo-nome">${nomeDe}<span class="conta">${GRUPOS.reduce((n, [para]) => n + (cortes[`${de}>${para}`]?.n || 0), 0)}</span></span>
        ${GRUPOS.map(([para, nomePara]) => `<a class="par-link${par === `${de}>${para}` ? ' ativo' : ''}" href="#/transicoes/${de}>${para}"><span>→ ${nomePara}</span><span class="conta">${cortes[`${de}>${para}`]?.n || 0}</span><small>${esc(padraoDo(`${de}>${para}`))}</small></a>`).join('')}</div>`).join('')}
    </aside>`

  let conteudo
  if (!par) {
    conteudo = cabeca(`Transições · ${dois(ts.length)}`, 'Como o vídeo passa de um plano para o outro. Clique num card para ver o corte da referência com som. As favoritas de cada par ficam nos pares, à esquerda.') +
      `<div class="grade grade-transicoes">${ts.map((t) => card(t)).join('')}</div>`
  } else {
    const [de, para] = par.split('>')
    const o = ordemDo(par)
    const c = cortes[par] || { n: 0, sons: {}, cortes: [] }
    const sonsPar = Object.entries(c.sons).sort((a, b) => b[1] - a[1]).map(([s, q]) => `${esc(sons[s] || s)} ×${q}`)
    const favs = o.ids.slice(0, o.favoritas)
    const outras = o.ids.slice(o.favoritas)
    conteudo = cabeca(`${NOME_GRUPO[de]} → ${NOME_GRUPO[para]}`, '', `<span class="dica uma-linha" title="${esc(sonsPar.join(', '))}">${c.n ? `${c.n} cortes nas referências · ${sonsPar.length ? `sons: ${sonsPar.join(', ')}` : 'sem som de corte'}` : 'Nenhum corte assim nas referências.'}</span>`) +
      `<h4 class="subtitulo">Favoritas do par <span class="dica">· no máximo ${N_FAVORITAS}; a 1ª é o padrão (entra sozinha em cada corte deste par)</span></h4>
      ${favs.length ? `<div class="grade grade-transicoes">${favs.map((id, k) => card(porId[id], { k, nFav: favs.length })).join('')}</div>` : '<p class="dica">Nenhuma favorita: os cortes deste par ficam secos. Marque a estrela de uma transição.</p>'}
      <h4 class="subtitulo">Outras transições</h4>
      <div class="grade grade-transicoes">${outras.map((id, j) => card(porId[id], { k: favs.length + j, nFav: favs.length })).join('')}</div>
      ${c.cortes.length ? `<h4 class="subtitulo">Os cortes deste par nas referências <span class="dica">· de 1,5 s antes a 1,5 s depois, com som</span></h4>
        <div class="cortes-par"><div class="mini mini-916 previa-corte"><video playsinline preload="none"></video></div>
          <div class="chips-cortes">${c.cortes.map((x, i) => `<button class="pilula pequena" data-corte="${i}" title="${esc(x.par.replace('>', ' → '))} · ${esc(x.classe || 'seco')}${x.sons?.length ? ` · ${esc(x.sons.join(', '))}` : ''}">${esc(x.ref)} · ${mmss(x.t)}${x.sons?.length ? ' 🔊' : ''}</button>`).join('')}</div></div>` : ''}`
  }
  el.innerHTML = `<div class="com-lado">${lado}<div class="lado-conteudo">${conteudo}</div></div>`

  let atual = null
  const tocar = (id) => {
    const cardEl = $(`#tr-${id}`, el)
    const v = cardEl && $('video', cardEl)
    if (!v) return
    for (const x of $$('video', el)) if (x !== v) x.pause()
    if (v.paused) {
      v.currentTime = 0
      v.play().catch(() => {})
      if (atual !== id) cardEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else v.pause()
    atual = id
  }
  for (const c of $$('.card-transicao', el)) {
    const v = $('video', c)
    v.addEventListener('error', () => c.classList.add('sem-video'))
    v.addEventListener('play', () => c.classList.add('tocando'))
    for (const ev of ['pause', 'ended']) v.addEventListener(ev, () => c.classList.remove('tocando'))
    $('.mini', c).addEventListener('click', () => tocar(c.dataset.id))
  }
  let pararCorte = null
  const salvarOrdem = async (ids, favoritas) => {
    try {
      ordem = await enviar('PUT', '/api/transicoes/ordem', { chave: `familia:${par}`, ids, favoritas })
    } catch (x) {
      aviso(x.message, 'erro')
    }
    transicoes(el, resto)
  }
  el.onclick = async (e) => {
    const b = e.target.closest('[data-aprovar], [data-estrela], [data-padrao], [data-corte]')
    if (!b) return
    if (b.dataset.corte != null) {
      const x = cortes[par].cortes[+b.dataset.corte]
      const v = $('.previa-corte video', el)
      for (const y of $$('video', el)) if (y !== v) y.pause()
      for (const y of $$('[data-corte]', el)) y.classList.toggle('ativa', y === b)
      pararCorte?.()
      v.muted = false
      v.src = urlRef(x.ref, 'proxy.mp4')
      pararCorte = tocarTrecho(v, Math.max(0, x.t - 1.5), x.t + 1.5)
      return
    }
    const t = porId[b.closest('.card-transicao').dataset.id]
    if (b.dataset.aprovar != null) {
      try {
        Object.assign(t, await enviar('PUT', `/api/transicoes/${t.id}`, { aprovado: !t.aprovado }))
        aviso(t.aprovado ? `“${t.nome}” aprovada` : `“${t.nome}” voltou para a revisão`)
      } catch (x) {
        return aviso(x.message, 'erro')
      }
      return transicoes(el, resto)
    }
    const { ids, favoritas } = ordemDo(par)
    const k = ids.indexOf(t.id)
    const sem = ids.filter((id) => id !== t.id)
    if (b.dataset.padrao != null) return salvarOrdem([t.id, ...sem], favoritas)
    if (k < favoritas) {
      sem.splice(favoritas - 1, 0, t.id) // tirar: logo depois das favoritas
      return salvarOrdem(sem, favoritas - 1)
    }
    if (favoritas < N_FAVORITAS) {
      sem.splice(favoritas, 0, t.id) // marcar: no fim das favoritas
      return salvarOrdem(sem, favoritas + 1)
    }
    sem.splice(N_FAVORITAS - 1, 0, t.id) // uma terceira: entra no lugar da 2ª, que vai para as outras
    return salvarOrdem(sem, N_FAVORITAS)
  }
  return () => pararCorte?.()
}

// ---------- Motions ----------

/** Os presets de motion (o JSON do topo de cada HTML), com a data do arquivo quando o preset não tem `criado_em`. */
async function lerMotions() {
  const nomes = (await lista('biblioteca/motions/presets')).filter((n) => n.endsWith('.html'))
  return Promise.all(nomes.map(async (n) => {
    const r = await fetch(`/biblioteca/motions/presets/${n}`, { cache: 'no-store' })
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html')
    let dados = {}
    let campos = {}
    try {
      dados = JSON.parse(doc.getElementById('preset')?.textContent || '{}')
      campos = JSON.parse(doc.getElementById('campos')?.textContent || '{}')
    } catch {}
    const data = r.headers.get('Last-Modified')
    return { id: n.replace(/\.html$/, ''), criado_em: dados.criado_em || (data ? new Date(data).toISOString() : ''), ...dados, campos }
  }))
}

/** Recusar um motion: o selo Recusado, com o motivo no JSON do topo; o Limpar recusados tira da biblioteca. */
/** O modal de um motion: a animação tocando grande, os dados (campos, duração, fundo), o selo com os usos e, se o Claude
 *  o escreveu e ninguém aprovou ainda, Aprovar e Recusar. */
function detalheMotion(m, estado, usos, cods, recarregar) {
  const [rotulo, cor] = SELOS[estado] || []
  const revisar = estado === 'sem'
  const campos = Object.entries(m.campos || {})
  const { el, fechar } = janela(`
    <header class="janela-cabeca"><span class="selo-linha selo-amarelo">Motion</span>
      <h2>${esc(m.nome || m.id)}</h2>${chipCodigo(cods.motion?.[m.id], m.nome || m.id)}<span class="dica">${esc(m.id)}</span>
      <button class="botao-icone" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button></header>
    <div class="banco-detalhe">
      <div class="banco-midia motion-midia fundo-${esc(m.fundo || 'escuro')}"><video class="previa-motion" autoplay muted loop playsinline src="/biblioteca/motions/previas/${encodeURIComponent(m.id)}.mp4?v=${Date.now()}"></video></div>
      <div class="banco-campos">
        ${m.descricao ? `<p>${esc(m.descricao)}</p>` : ''}
        <dl class="dados">${m.duracao ? `<dt>Duração</dt><dd>${seg(m.duracao)} (estica até o fim do plano)</dd>` : ''}
          ${m.fundo ? `<dt>Fundo</dt><dd>${esc(m.fundo)}</dd>` : ''}
          ${m.criado_em ? `<dt>Entrou em</dt><dd>${dataHora(m.criado_em)}</dd>` : ''}</dl>
        ${campos.length ? `<div class="bloco-lista"><span class="eyebrow">Campos · ${campos.length}</span><ul class="lista-simples">${campos.map(([k, c]) => `<li><span>${esc(c.rotulo || k)}</span><span class="apagado">${esc(c.tipo || 'texto')}${c.padrao ? ` · “${esc(String(c.padrao))}”` : ''}</span></li>`).join('')}</ul></div>` : ''}
        <div class="bloco-lista"><span class="eyebrow">Selo</span>
          <div class="acoes-linha">${rotulo ? `<span class="selo-linha ${cor}">${rotulo}</span>` : revisar ? '<span class="selo-linha selo-coral">A revisar</span>' : '<span class="dica">Sem selo</span>'}
            ${estado === 'usado' ? '' : `${estado === 'aprovado' ? '' : `<button class="botao pequeno" data-aprovar>${ICONE.check} Aprovar</button>`}
              ${estado === 'recusado' ? '' : `<button class="botao pequeno botao-perigo-contorno" data-recusar>${ICONE.fechar} Recusar</button>`}
              ${m.estado ? '<button class="botao pequeno" data-automatico title="Volta ao selo automático">Automático</button>' : ''}`}</div>
          ${usos?.length ? `<div class="estado-banco">${chipsDeUso(usos, cods)}</div>` : ''}</div>
      </div>
    </div>`, { classe: 'janela-banco' })
  // o modal toca a prévia gravada (um motion em 3D ao vivo trava aqui); sem prévia, a animação ao vivo
  $('video.previa-motion', el)?.addEventListener('error', (ev) => {
    ev.target.outerHTML = `<iframe src="/render/motion.html?preset=${encodeURIComponent(m.id)}&formato=vertical&tocar=1" title="${esc(m.nome || m.id)}"></iframe>`
  })
  $('[data-aprovar]', el)?.addEventListener('click', async () => {
    try {
      await enviar('PUT', `/api/motions/${encodeURIComponent(m.id)}/estado`, { estado: 'aprovado' })
      aviso('Motion aprovado')
      fechar()
      recarregar()
    } catch (x) {
      aviso(x.message, 'erro')
    }
  })
  $('[data-recusar]', el)?.addEventListener('click', () => {
    fechar()
    recusarMotion(m, recarregar)
  })
  $('[data-automatico]', el)?.addEventListener('click', async () => {
    try {
      await enviar('PUT', `/api/motions/${encodeURIComponent(m.id)}/estado`, { estado: null })
      fechar()
      recarregar()
    } catch (x) {
      aviso(x.message, 'erro')
    }
  })
  for (const a of $$('a.chip-uso', el)) a.addEventListener('click', () => fechar())
}

async function recusarMotion(m, recarregar) {
  const usos = await json(`/api/motions/${encodeURIComponent(m.id)}/usos`, {})
  const onde = Object.entries(usos || {}).map(([slug, planos]) => `${slug} (${planos.join(', ')})`)
  const motivo = await confirmar({
    titulo: `Recusar “${m.nome || m.id}”?`,
    texto: `Fica em Recusados; o Limpar recusados tira da biblioteca.${onde.length ? `\nUsado em ${onde.join('; ')} (projetos ainda em edição).` : ''}`,
    ok: 'Recusar',
    perigo: true,
    campo: { rotulo: 'Por quê? (opcional: o Claude lê para não sugerir de novo o mesmo tipo de coisa)', dica: 'ex.: lento demais, texto pequeno' },
  })
  if (motivo == null) return
  try {
    await enviar('PUT', `/api/motions/${encodeURIComponent(m.id)}/estado`, { estado: 'recusado', motivo })
    aviso(`“${m.nome || m.id}” recusado`)
    recarregar()
  } catch (x) {
    aviso(x.message, 'erro')
  }
}

// ---------- Trilhas ----------

async function trilhas(el) {
  const [cat, cods] = await Promise.all([json('/biblioteca/trilhas/catalogo.json', { faixas: [] }), codigos()])
  const faixas = cat?.faixas || (Array.isArray(cat) ? cat : [])
  el.innerHTML = cabeca(`Trilhas · ${dois(faixas.length)}`, 'As músicas de fundo (instrumentais, para tocar baixo sob a voz).') +
    `<div class="lista-trilhas">${faixas.map((f) => `<div class="trilha" data-id="${esc(f.id)}">
        <button class="botao-icone botao-tocar" data-src="/biblioteca/trilhas/${esc(f.arquivo || `${f.id}.m4a`)}" aria-label="Ouvir">${ICONE.tocar}</button>
        <div class="trilha-nome"><b>${esc(f.nome)}</b><span class="apagado">${esc(f.id)}</span>${chipCodigo(cods.trilha?.[f.id], f.nome)}</div>
        <span class="trilha-clima">${esc(f.clima || '')}</span>
        <span class="trilha-num">${f.bpm ? `${Math.round(f.bpm)} BPM` : ''}</span>
        <span class="trilha-num">${f.duracao ? mmss(f.duracao) : ''}</span>
        <div class="trilha-barra"><i></i></div>
      </div>`).join('')}</div>`
  const audio = new Audio()
  let linha = null
  const marcar = (tocando) => {
    for (const t of $$('.trilha', el)) {
      const ativa = t === linha && tocando
      t.classList.toggle('tocando', ativa)
      $('button', t).innerHTML = ativa ? ICONE.pausar : ICONE.tocar
    }
  }
  audio.addEventListener('timeupdate', () => linha && ($('.trilha-barra i', linha).style.width = `${(audio.currentTime / (audio.duration || 1)) * 100}%`))
  audio.addEventListener('pause', () => marcar(false))
  audio.addEventListener('play', () => marcar(true))
  for (const b of $$('.trilha button', el))
    b.addEventListener('click', () => {
      const t = b.closest('.trilha')
      if (linha === t && !audio.paused) return audio.pause()
      if (linha !== t) {
        if (linha) $('.trilha-barra i', linha).style.width = '0'
        linha = t
        audio.src = b.dataset.src
      }
      audio.play().catch(() => {})
    })
  return () => audio.pause()
}

/** O @ de um comentário: a grade do Banco (e a dos Motions, na outra aba) num modal, sempre no modo Selecionar, sem
 *  editar nada. Devolve os códigos marcados (["BAN-111", "MOT-07"]) ou null (cancelou). */
export function escolherDoBanco() {
  return new Promise((resolve) => {
    const daPagina = [selecao, ultimoMarcado] // a seleção da página do Banco, se houver, volta ao fechar
    selecao = new Set()
    ultimoMarcado = null
    let aba = preferencia('escolher.aba', 'inserts') === 'motions' ? 'motions' : 'inserts'
    let marcados = null
    const abas = () => [['inserts', 'Banco'], ['motions', 'Motions']].map(([k, n]) => chip(k === aba, n, `data-aba-escolher="${k}"`)).join('')
    const { el, fechar } = janela(`<header class="janela-cabeca"><h2>Marcar do banco</h2><span class="ordens" data-abas-escolher>${abas()}</span>
        <span class="escolher-acoes"><button class="botao pequeno" data-fechar>Cancelar</button>
        <button class="botao pequeno botao-verde" data-marcar-escolha disabled>Marcar</button></span></header>
      <div class="escolher-corpo"></div>`, {
      classe: 'janela-cheia janela-escolher',
      aoFechar: () => {
        ;[selecao, ultimoMarcado] = daPagina
        escolhendo = null
        resolve(marcados)
      },
    })
    const corpo = $('.escolher-corpo', el)
    const botao = $('[data-marcar-escolha]', el)
    const contar = () => {
      const n = selecao.size
      botao.disabled = !n
      botao.textContent = n ? `Marcar ${n}` : 'Marcar'
    }
    escolhendo = { aoMudar: contar }
    const desenhar = () => bancoInserts(corpo, aba, 'cache').then(contar)
    $('[data-abas-escolher]', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-aba-escolher]')
      if (!b || b.dataset.abaEscolher === aba) return
      aba = preferencia('escolher.aba', 'inserts', b.dataset.abaEscolher)
      $('[data-abas-escolher]', el).innerHTML = abas()
      corpo.scrollTop = 0
      desenhar()
    })
    botao.addEventListener('click', async () => {
      const cods = await codigos()
      marcados = [...selecao].map((k) => (k.startsWith('m:') ? cods.motion?.[k.slice(2)] || k.slice(2) : cods.midia?.[k] || k))
      fechar()
    })
    desenhar()
  })
}

/** Liga o @ nos campos de comentário (`seletor`): digitar @ (no começo ou depois de um espaço) abre o escolherDoBanco,
 *  e os marcados entram no lugar do @ ("@BAN-111 @MOT-07 "). Um ouvinte só por seletor. */
const arrobasLigadas = new Set()
export function ligarArroba(seletor) {
  if (arrobasLigadas.has(seletor)) return
  arrobasLigadas.add(seletor)
  document.addEventListener('input', async (e) => {
    const ta = e.target
    if (!ta.matches?.(seletor) || !e.inputType?.startsWith('insert') || !e.data?.endsWith('@')) return
    const p = ta.selectionStart
    if (ta.value[p - 1] !== '@' || (p > 1 && !/[\s(]/.test(ta.value[p - 2]))) return // um e-mail, não uma marcação
    const l = await escolherDoBanco()
    if (!ta.isConnected) return
    ta.focus()
    if (!l?.length) return ta.setSelectionRange(p, p)
    const v = ta.value
    const i = v[p - 1] === '@' ? p - 1 : v.lastIndexOf('@', p - 1)
    const novo = `${l.map((c) => `@${c}`).join(' ')} `
    ta.value = v.slice(0, i) + novo + v.slice(i + 1)
    ta.setSelectionRange(i + novo.length, i + novo.length)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
