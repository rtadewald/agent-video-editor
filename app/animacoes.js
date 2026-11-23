// As animações (#/animacoes e #/a/<slug>): cada uma é uma sequência de cenas, os presets de motion da biblioteca na
// ordem (animacoes/<slug>/animacao.json). A página toca as prévias gravadas das cenas uma depois da outra.
import { $, $$, ICONE, aviso, copiar, esc, json, mmss } from './comum.js'

const total = (a) => a.cenas.reduce((s, c) => s + (c.duracao || 0), 0)
const selo = (a) => (a.cenas.some((c) => c.a_revisar) ? ['Em revisão', 'selo-coral'] : ['Aprovado', 'selo-menta'])

/** A lista (#/animacoes): um card por animação, com a 1ª cena. */
export async function abrirAnimacoes(tela) {
  tela.className = 'pagina pagina-inicio pagina-animacoes'
  const { animacoes = [] } = (await json('/api/animacoes', {})) || {}
  const card = (a) => {
    const [estado, cor] = selo(a)
    const previa = a.cenas.find((c) => c.previa)?.previa
    return `<div class="caixa-projeto"><a class="card-projeto" href="#/a/${encodeURIComponent(a.slug)}">
      <div class="mini mini-916">${previa ? `<video muted playsinline preload="metadata" src="${previa}#t=1.5"></video>` : ''}
        <span class="selo ${cor}">${estado}</span></div>
      <div class="card-titulo"><h3 title="${esc(a.nome)}">${esc(a.nome)}</h3></div>
      <p class="sub">${a.cenas.length} ${a.cenas.length === 1 ? 'cena' : 'cenas'} · ${mmss(total(a))}${a.estilo ? ` · ${esc(a.estilo)}` : ''}</p></a></div>`
  }
  tela.innerHTML = `<div class="cabeca-secao"><span class="eyebrow">Animações · ${String(animacoes.length).padStart(2, '0')}</span></div>
    ${animacoes.length ? `<div class="grade grade-projetos">${animacoes.map(card).join('')}</div>`
      : '<p class="vazio">Nenhuma animação ainda. Peça uma ao Claude Code: as cenas são presets de motion, e a animação junta elas na ordem.</p>'}`
  // com o mouse em cima, o card toca a 1ª cena sem som
  for (const c of $$('.caixa-projeto', tela)) {
    const v = $('video', c)
    if (!v) continue
    c.addEventListener('mouseenter', () => v.play().catch(() => {}))
    c.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 1.5 })
  }
}

/** Uma animação (#/a/<slug>): o player toca as cenas em sequência; a lista ao lado pula para qualquer uma. */
export async function abrirAnimacao(tela, slug) {
  tela.className = 'pagina pagina-animacao'
  const a = await json(`/api/animacoes/${encodeURIComponent(slug)}`)
  if (!a) {
    tela.innerHTML = '<p class="vazio">Animação não encontrada. <a href="#/animacoes">Voltar às animações</a></p>'
    return
  }
  const cenas = a.cenas.filter((c) => c.previa)
  const [estado, cor] = selo(a)
  tela.innerHTML = `<div class="cabeca-secao"><a class="pilula pequena" href="#/animacoes">${ICONE.voltar} Animações</a>
      <h2 class="titulo-animacao">${esc(a.nome)}</h2><span class="selo-inline ${cor}">${estado}</span>
      <span class="uma-linha dica">${esc(a.estilo)} · ${a.cenas.length} ${a.cenas.length === 1 ? 'cena' : 'cenas'} · ${mmss(total(a))}</span></div>
    <div class="animacao-corpo">
      <div class="animacao-player"><div class="mini mini-916"><video playsinline controls></video><span class="selo selo-dir selo-amarelo" data-qual></span></div></div>
      <ol class="animacao-cenas">${a.cenas.map((c, i) => `<li class="cena${c.previa ? '' : ' sem-previa'}" data-i="${i}">
        <div class="mini mini-916">${c.previa ? `<video muted playsinline preload="metadata" src="${c.previa}#t=1.5"></video>` : ''}</div>
        <div class="cena-texto"><span class="eyebrow">Cena ${i + 1} · ${mmss(c.duracao)}${c.a_revisar ? ' · em revisão' : ' · aprovada'}</span>
          <h3>${esc(c.nome || c.preset)}</h3>
          <p class="desc" title="${esc(c.descricao)}">${esc(c.descricao)}</p>
          <button class="chip-preset" data-copiar-preset="${esc(c.preset)}" title="Copiar o nome do preset para citar no chat">${ICONE.copiar}${esc(c.preset)}</button></div></li>`).join('')}</ol>
    </div>`
  const v = $('.animacao-player video', tela)
  let atual = 0
  const tocar = (i, play = true) => {
    const c = a.cenas[i]
    if (!c?.previa) return
    atual = i
    v.src = c.previa
    $('[data-qual]', tela).textContent = `Cena ${i + 1}/${a.cenas.length}`
    for (const li of $$('.cena', tela)) li.classList.toggle('ativa', +li.dataset.i === i)
    if (play) v.play().catch(() => {})
  }
  // ao acabar uma cena, a próxima; na última, para
  v.addEventListener('ended', () => {
    const prox = a.cenas.findIndex((c, i) => i > atual && c.previa)
    if (prox >= 0) tocar(prox)
  })
  tela.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copiar-preset]')
    if (cp) {
      e.stopPropagation()
      await copiar(cp.dataset.copiarPreset)
      return aviso(`Copiado · ${cp.dataset.copiarPreset}`)
    }
    const li = e.target.closest('.cena')
    if (li) tocar(+li.dataset.i)
  })
  if (cenas.length) tocar(a.cenas.indexOf(cenas[0]), false)
  return () => v.pause()
}
