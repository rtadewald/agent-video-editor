// O app de revisão: roteamento pelo endereço e o início (os projetos). As páginas: #/ (projetos), #/p/<slug>[/vN] (a
// revisão de uma versão), #/calibragem[/<id>], #/referencias, #/heuristica, #/aprendizados[/<área>] e as da biblioteca
// (#/presets, #/transicoes[/<de>><para>], #/banco (os inserts), #/motions, #/trilhas); os carrosséis: #/carrosseis e
// #/c/<slug>[/vN] (carrosseis.js).
import { $, $$, ICONE, abasAbertas, abrirAba, aviso, preferencia, chipCodigo, codigos, confirmar, copiar, enviar, esc, fecharAba, json, mmss } from './comum.js'
import { abrirRevisao } from './revisao.js'
import { abrirBiblioteca, PAGINAS_BIBLIOTECA, preCarregarBanco } from './biblioteca.js'
import { abrirCalibragem, abrirRevisaoReferencia } from './calibragem.js'
import { abrirAprendizados, abrirHeuristica, abrirReferencias } from './referencias.js'
import { abrirLixeira } from './lixeira.js'
import { abrirCarrossel, abrirCarrosseis } from './carrosseis.js'
import { barraDeTags, datalistTags, htmlTagsCard, ligarTags, tagEscolhida, temTag } from './tags.js'
import { CATEGORIA_PADRAO, botaoCategorias, carregarCategorias, categoriaCta, editarCategorias, pilulasCategoria, seletorCategoria } from './categorias.js'

const ESTADOS = {
  em_revisao: ['Em revisão', 'selo-coral'],
  aprovado: ['Aprovado', 'selo-menta'],
}


// a ordem dos projetos (lembrada neste navegador)
const ORDENS = { recentes: 'Recentes', antigos: 'Antigos', nome: 'A–Z' }
const lembrar = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k)
    localStorage.setItem(k, v)
  } catch {
    return null
  }
}

/** Dias de calendário entre a data e hoje (0 = hoje). */
const diasAtras = (ts) => {
  const d = new Date(ts * 1000), h = new Date()
  return Math.round((new Date(h.getFullYear(), h.getMonth(), h.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5)
}

/** "hoje às 14:32", "ontem às 9:10", "há 3 dias", "há 2 semanas", "há 4 meses". */
function quandoFoi(ts) {
  const n = diasAtras(ts)
  const hora = new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: 'numeric', minute: '2-digit' })
  if (n <= 0) return `hoje às ${hora}`
  if (n === 1) return `ontem às ${hora}`
  if (n < 7) return `há ${n} dias`
  if (n < 30) return n < 14 ? 'há 1 semana' : `há ${Math.floor(n / 7)} semanas`
  if (n < 365) return n < 60 ? 'há 1 mês' : `há ${Math.floor(n / 30)} meses`
  return n < 730 ? 'há 1 ano' : `há ${Math.floor(n / 365)} anos`
}

/** Quantas saídas o projeto tem (as de agora; nos antigos, as do encaixe). */
const nSaidas = (p) => p.saidas_novas?.length || p.saidas || 0

/** O play do meio do card: o vídeo com som, ali mesmo (só um por vez); de novo, pausa. */
function tocarComSom(caixa, ligar) {
  const v = $('video', caixa)
  const b = $('[data-tocar-card]', caixa)
  if (ligar) {
    for (const outra of $$('.caixa-projeto')) if (outra !== caixa && $('video', outra)?.dataset.som) tocarComSom(outra, false)
    if (!v.dataset.comecou || v.ended) v.currentTime = 0 // a 1ª vez do começo (a miniatura mostra o quadro de 1,5 s); depois de pausar, segue de onde parou
    v.dataset.comecou = '1'
    v.dataset.som = '1'
    v.muted = false
    v.play().catch(() => {})
  } else {
    delete v.dataset.som
    v.muted = true
    v.pause()
  }
  caixa.classList.toggle('tocando-com-som', ligar)
  if (b) b.innerHTML = ligar ? ICONE.pausar : ICONE.tocar
}

/** Os projetos (#/) ou, com `ctas`, os CTAs (#/ctas): a mesma página, cada uma com as suas categorias, filtros e tags. */
async function inicio(tela, ctas = false) {
  tela.className = 'pagina pagina-inicio'
  const pref = ctas ? 'ctas' : 'projetos'
  const titulo = ctas ? 'CTAs' : 'Projetos'
  const [todos, cods] = await Promise.all([json('/api/projetos', []), codigos()])
  // a categoria do projeto (edicao.formato: Reels, Ad…): filtra a lista e troca no card
  let cats = await carregarCategorias()
  const daPagina = (p) => categoriaCta(cats, p.formato || CATEGORIA_PADRAO) === ctas
  let verOcultos = false // a vista dos ocultos: os projetos que saíram da lista
  const naVista = () => todos.filter((p) => daPagina(p) && !!p.oculto === verOcultos)
  let projetos = naVista()
  const catsDaPagina = () => cats.filter((c) => categoriaCta(cats, c.id) === ctas)
  let filtro = preferencia(`${pref}.categoria`, '')
  if (filtro && !catsDaPagina().some((c) => c.id === filtro)) filtro = ''
  let ordem = ORDENS[lembrar('projetos.ordem')] ? lembrar('projetos.ordem') : 'recentes'
  const card = (p) => {
    const [estado, cor] = ESTADOS[p.estado] || ESTADOS.em_revisao
    const proxy = `/projetos/${encodeURIComponent(p.slug)}/versoes/v${p.ultima}/proxy.mp4`
    return `<div class="caixa-projeto" data-slug="${esc(p.slug)}">
      <button class="apagar-projeto" data-apagar title="Apagar o projeto" aria-label="Apagar ${esc(p.nome)}">${ICONE.lixo}</button>
      <button class="apagar-projeto ocultar-projeto" data-ocultar title="${p.oculto ? 'Mostrar de novo na lista' : 'Ocultar (sai da lista e vai para Ocultos)'}" aria-label="${p.oculto ? 'Mostrar' : 'Ocultar'} ${esc(p.nome)}">${p.oculto ? ICONE.olho : ICONE.olhoFechado}</button>
      ${p.estado !== 'aprovado' ? `<button class="aprovar-projeto" data-aprovar-projeto title="Aprovar o vídeo (copia o “Aprovado” para colar no chat do Claude)" aria-label="Aprovar ${esc(p.nome)}">${ICONE.check}</button>`
        : `<button class="aprovar-projeto desaprovar-projeto" data-desaprovar-projeto title="Desaprovar (volta para Em edição)" aria-label="Desaprovar ${esc(p.nome)}">${ICONE.refazer}</button>`}
      ${p.tem_final ? `<button class="abrir-exports" data-abrir-final title="Abrir a pasta dos exports no Finder" aria-label="Abrir os exports de ${esc(p.nome)}">${ICONE.abrir}</button>` : ''}
      <a class="card-projeto" href="#/p/${encodeURIComponent(p.slug)}">
      <div class="mini mini-916"><video muted playsinline preload="metadata" src="${proxy}#t=1.5"></video>
        <span class="selo ${cor}">${estado}</span></div>
      <div class="card-titulo"><h3 data-renomear title="${esc(p.nome)} · clique para renomear">${esc(p.nome)}</h3><button class="botao-icone pequeno renomear" data-renomear title="Renomear" aria-label="Renomear ${esc(p.nome)}">${ICONE.lapis}</button></div>
      <p class="sub" title="${esc(p.slug)}">${quandoFoi(p.atualizado)} · ${p.conclusao != null ? `${p.conclusao}% concluído` : `v${p.ultima}`}${p.comentarios ? ` · ${p.comentarios} ${p.comentarios === 1 ? 'comentário' : 'comentários'}` : ''}</p>
    </a><div class="centro-mini"><button class="tocar-card" data-tocar-card title="Tocar com som (clique de novo para pausar)" aria-label="Tocar ${esc(p.nome)}">${ICONE.tocar}</button></div>
    <div class="sobre-mini">${nSaidas(p) ? `<span class="chip-saidas">${nSaidas(p)} ${nSaidas(p) === 1 ? 'saída' : 'saídas'}${p.saidas_novas?.length
      ? `<span class="dica-saidas">${p.saidas_novas.map((x) => `<span>${esc(x.destino)}${x.aprovado ? ' ✓' : ''}</span>`).join('')}</span>` : ''}</span>` : ''}${seletorCategoria(cats, p.formato || CATEGORIA_PADRAO)}${p.duracao ? `<span class="duracao-mini">${mmss(p.duracao)}</span>` : ''}</div>
    <div class="pe-projeto">${htmlTagsCard(p.tags)}${p.carrosseis?.length ? `<a class="chip-carrossel" href="#/c/${encodeURIComponent(p.carrosseis[0].slug)}" title="Carrosséis deste vídeo: ${esc(p.carrosseis.map((x) => x.nome).join(', '))}">${ICONE.carrossel}${p.carrosseis.length}</a>` : ''}${chipCodigo(cods.projeto?.[p.slug], p.nome)}</div></div>`
  }
  // as tags (como no Banco): a barra à esquerda conta os projetos da categoria escolhida e filtra a lista
  const daCategoria = () => projetos.filter((p) => !filtro || (p.formato || CATEGORIA_PADRAO) === filtro)
  let tagAtiva = ''
  const lista = () => {
    const l = daCategoria().filter((p) => !tagAtiva || temTag(p.tags, tagAtiva))
    // dentro de cada grupo, pela entrega da última versão (ou pelo nome)
    l.sort((a, b) => (ordem === 'nome' ? a.nome.localeCompare(b.nome, 'pt-BR') : ordem === 'antigos' ? a.atualizado - b.atualizado : b.atualizado - a.atualizado))
    // os em edição em cima; os aprovados embaixo, os de hoje numa linha e os antigos em outra (pela última mexida)
    const aprovados = l.filter((p) => p.estado === 'aprovado')
    const recente = (p) => diasAtras(p.atualizado || 0) <= 0
    return [['Em edição', l.filter((p) => p.estado !== 'aprovado')], ['Aprovados · hoje', aprovados.filter(recente)],
      ['Aprovados · antigos', aprovados.filter((p) => !recente(p))]]
      .filter(([, ps]) => ps.length).map(([g, ps]) => [`${g} · ${ps.length}`, ps])
  }
  const desenhar = () => {
    projetos = naVista() // trocar a categoria no card leva o projeto para a outra página; ocultar, para os Ocultos
    $('.cabeca-secao .eyebrow', tela).textContent = `${titulo} · ${String(projetos.length).padStart(2, '0')}`
    $('.filtro-categorias', tela).innerHTML = pilulasCategoria(catsDaPagina(), filtro, { contar: (id) => projetos.filter((p) => !id || (p.formato || CATEGORIA_PADRAO) === id).length })
      + `<button class="pilula pequena${verOcultos ? ' ativa' : ''}" data-ver-ocultos title="${verOcultos ? 'Voltar à lista' : 'Os projetos que você ocultou'}">${ICONE.olhoFechado} Ocultos <span class="conta">${todos.filter((p) => daPagina(p) && p.oculto).length}</span></button>`
      + botaoCategorias()
    const itens = daCategoria().map((p) => ({ chave: p.slug, tags: p.tags }))
    tagAtiva = tagEscolhida(pref, itens)
    const conhecidas = [...new Set(todos.flatMap((p) => p.tags || []))].sort() // as tags valem para as duas páginas
    const corpo = $('.corpo-projetos', tela)
    corpo.innerHTML = projetos.length
      ? `${datalistTags('tags-conhecidas-projeto', conhecidas)}<div class="banco-com-tags">${barraDeTags(itens, tagAtiva, pref)}<div class="lista-projetos">${
        lista().map(([g, ps]) => `${g ? `<h4 class="grupo-data">${g}</h4>` : ''}<div class="grade grade-projetos">${ps.map(card).join('')}</div>`).join('') || '<p class="vazio">Nenhum projeto com esses filtros.</p>'}</div></div>`
      : verOcultos ? '<p class="vazio">Nada oculto aqui. No card, o olho (com o mouse em cima) oculta um projeto.</p>'
      : ctas ? '<p class="vazio">Nenhum CTA ainda. Um projeto entra aqui quando a categoria dele tem “CTA” no nome.</p>'
      : '<p class="vazio">Nenhum projeto com versão ainda. Mande um vídeo bruto ao Claude Code: quando ele entregar a v1, ela aparece aqui.</p>'
    ligarTags(corpo, {
      onde: 'projetos',
      pref,
      lista: 'tags-conhecidas-projeto',
      conhecidas,
      itemDo: (b) => projetos.find((p) => p.slug === b.closest('.caixa-projeto').dataset.slug),
      gravar: async (p, tags) => {
        p.tags = (await enviar('PUT', `/api/projetos/${encodeURIComponent(p.slug)}/tags`, { tags })).tags
      },
      recarregar: desenhar,
      aposRenomear: async () => {
        todos.splice(0, todos.length, ...(await json('/api/projetos', [])))
        desenhar()
      },
    })
    for (const b of $$('[data-ordem]', tela)) b.classList.toggle('ativa', b.dataset.ordem === ordem)
    // o vídeo só toca pelo play do meio (com som); ao acabar, volta ao botão de play
    for (const c of $$('.caixa-projeto', tela)) $('video', c).addEventListener('ended', (e) => {
      delete e.target.dataset.comecou // acabou: o próximo play começa do início
      tocarComSom(c, false)
    })
  }
  tela.innerHTML = `<div class="cabeca-secao"><span class="eyebrow">${titulo}</span>
      <div class="filtro-categorias"></div>
      <div class="ordens">${Object.entries(ORDENS).map(([k, nome]) => `<button class="pilula pequena" data-ordem="${k}">${nome}</button>`).join('')}</div></div>
    <div class="corpo-projetos"></div>`
  desenhar()
  tela.addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir-final]')
    if (!b) return
    e.preventDefault()
    enviar('POST', `/api/projetos/${encodeURIComponent(b.closest('.caixa-projeto').dataset.slug)}/abrir-final`).catch((err) => aviso(err.message, 'erro'))
  })
  tela.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-mudar-categoria]')) return
    const p = projetos.find((x) => x.slug === e.target.closest('.caixa-projeto').dataset.slug)
    try {
      await enviar('PUT', `/api/projetos/${encodeURIComponent(p.slug)}/categoria`, { categoria: e.target.value })
      p.formato = e.target.value
      if (abasAbertas().some((a) => a.slug === p.slug)) abrirAba(p.slug, p.nome, categoriaCta(cats, p.formato)) // o ícone da aba de cima
      desenhar()
    } catch (err) {
      aviso(err.message, 'erro')
    }
  })
  // renomear: o nome vira um campo no próprio card (Enter grava, Esc desiste)
  const renomear = (caixa) => {
    const p = projetos.find((x) => x.slug === caixa.dataset.slug)
    const h3 = $('.card-titulo h3', caixa)
    const campo = document.createElement('input')
    campo.className = 'campo-nome'
    campo.value = p.nome
    h3.replaceWith(campo)
    campo.focus()
    campo.select()
    let feito = false
    const concluir = async (gravar) => {
      if (feito) return
      feito = true
      const nome = campo.value.trim()
      if (gravar && nome && nome !== p.nome) {
        try {
          await enviar('PUT', `/api/projetos/${encodeURIComponent(p.slug)}/nome`, { nome })
          p.nome = nome
          if (abasAbertas().some((a) => a.slug === p.slug)) abrirAba(p.slug, nome) // a aba de cima também
          aviso('Nome salvo')
        } catch (err) {
          aviso(err.message, 'erro')
        }
      }
      desenhar()
    }
    campo.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') { k.preventDefault(); concluir(true) }
      if (k.key === 'Escape') { k.preventDefault(); concluir(false) }
    })
    campo.addEventListener('blur', () => concluir(true))
    for (const t of ['click', 'mousedown']) campo.addEventListener(t, (k) => { k.preventDefault(); k.stopPropagation() })
  }
  // apagar: a pasta vai para a Lixeira (biblioteca/lixeira/), de onde dá para restaurar
  tela.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-ordem]')
    if (o) {
      ordem = o.dataset.ordem
      lembrar('projetos.ordem', ordem)
      return desenhar()
    }
    const f = e.target.closest('[data-categoria]')
    if (f) {
      filtro = preferencia(`${pref}.categoria`, '', f.dataset.categoria)
      return desenhar()
    }
    if (e.target.closest('[data-editar-categorias]'))
      return editarCategorias(cats, async () => {
        cats = await carregarCategorias()
        desenhar()
      })
    if (e.target.closest('[data-ver-ocultos]')) {
      verOcultos = !verOcultos
      return desenhar()
    }
    const tc = e.target.closest('[data-tocar-card]')
    if (tc) return tocarComSom(tc.closest('.caixa-projeto'), !$('video', tc.closest('.caixa-projeto')).dataset.som)
    const ap = e.target.closest('[data-aprovar-projeto]')
    if (ap) {
      const p = todos.find((x) => x.slug === ap.closest('.caixa-projeto').dataset.slug)
      if (!(await confirmar({ titulo: `Aprovar “${p.nome}”?`, texto: 'O Claude exporta o vídeo final em 4K. O “Aprovado” vai para a área de transferência: cole no chat.', ok: 'Aprovar e copiar' }))) return
      try {
        const { versao } = await enviar('POST', `/api/projetos/${encodeURIComponent(p.slug)}/aprovar`)
        await copiar(`Aprovado · ${p.slug} · v${versao}`)
        p.estado = 'aprovado'
        aviso('Aprovado e copiado: cole no chat do Claude Code')
      } catch (err) {
        aviso(err.message, 'erro')
      }
      return desenhar()
    }
    const dp = e.target.closest('[data-desaprovar-projeto]')
    if (dp) {
      const p = todos.find((x) => x.slug === dp.closest('.caixa-projeto').dataset.slug)
      if (!(await confirmar({ titulo: `Desaprovar “${p.nome}”?`, texto: 'Ele volta para Em edição. O final já exportado fica onde está.', ok: 'Desaprovar', perigo: true }))) return
      try {
        await enviar('POST', `/api/projetos/${encodeURIComponent(p.slug)}/desaprovar`)
        p.estado = 'em_revisao'
        aviso(`“${p.nome}” voltou para Em edição`)
      } catch (err) {
        aviso(err.message, 'erro')
      }
      return desenhar()
    }
    const oc = e.target.closest('[data-ocultar]')
    if (oc) {
      const p = todos.find((x) => x.slug === oc.closest('.caixa-projeto').dataset.slug)
      try {
        p.oculto = (await enviar('PUT', `/api/projetos/${encodeURIComponent(p.slug)}/oculto`, { oculto: !p.oculto })).oculto
        aviso(p.oculto ? `“${p.nome}” foi para Ocultos` : `“${p.nome}” voltou para a lista`)
      } catch (err) {
        aviso(err.message, 'erro')
      }
      return desenhar()
    }
    const r = e.target.closest('[data-renomear]')
    if (r) {
      e.preventDefault() // o lápis fica dentro do link do card
      return renomear(r.closest('.caixa-projeto'))
    }
    const b = e.target.closest('[data-apagar]')
    if (!b) return
    const caixa = b.closest('.caixa-projeto')
    const p = projetos.find((x) => x.slug === caixa.dataset.slug)
    const ok = await confirmar({
      titulo: `Apagar o projeto “${p.nome}”?`,
      texto: 'O projeto sai da lista e vai para a Lixeira, de onde dá para restaurar.',
      ok: 'Apagar',
      perigo: true,
    })
    if (!ok) return
    try {
      await enviar('DELETE', `/api/projetos/${encodeURIComponent(p.slug)}`)
      fecharAba(p.slug)
      todos.splice(todos.indexOf(p), 1)
      desenhar()
      aviso(`“${p.nome}” foi para a Lixeira`)
    } catch (err) {
      aviso(err.message, 'erro')
    }
  })
}

// os projetos abertos, como abas logo depois da marca (× fecha; fechar a aberta volta aos projetos)
function desenharAbas() {
  const el = $('#abas-projetos')
  const aberto = location.hash.match(/^#\/p\/([^/]+)/)?.[1]
  el.innerHTML = abasAbertas().map((a) => {
    const ativa = aberto && decodeURIComponent(aberto) === a.slug
    return `<div class="aba-projeto${ativa ? ' ativa' : ''}" data-slug="${esc(a.slug)}" title="${esc(a.nome)}">
      <a href="#/p/${encodeURIComponent(a.slug)}" title="${a.cta ? 'CTA' : 'Projeto'} · ${esc(a.nome)}">${a.cta ? ICONE.cta : ICONE.projeto}<span>${esc(a.nome)}</span></a>
      <button type="button" data-fechar-aba title="Fechar a aba" aria-label="Fechar ${esc(a.nome)}">${ICONE.fechar}</button></div>`
  }).join('')
  $('.aba-projeto.ativa', el)?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
}
window.addEventListener('abas-projetos', desenharAbas)
// as abas abertas antes (ou de um projeto que trocou de categoria): o ícone de projeto ou CTA pela categoria de agora
Promise.all([json('/api/projetos', []), carregarCategorias()]).then(([ps, cats]) => {
  for (const a of abasAbertas()) {
    const p = ps.find((x) => x.slug === a.slug)
    if (p) abrirAba(a.slug, a.nome, categoriaCta(cats, p.formato || CATEGORIA_PADRAO))
  }
})
window.addEventListener('storage', desenharAbas)
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-fechar-aba]')
  if (!b) return
  const aba = b.closest('.aba-projeto')
  fecharAba(aba.dataset.slug)
  if (aba.classList.contains('ativa')) location.hash = '#/'
})

let sair = null
let vez = 0
// a rolagem de cada página (fora das revisões): voltar à aba volta ao mesmo ponto
let rotaAtual = null
const comRolagem = (r) => r && !/^#\/(p|calibragem|c)\/./.test(r)
async function rotear() {
  const minha = ++vez
  if (comRolagem(rotaAtual)) preferencia(`rolagem.${rotaAtual}`, 0, Math.round(scrollY))
  rotaAtual = location.hash || '#/'
  sair?.()
  sair = null
  let partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (partes[0] === 'biblioteca') partes = partes.slice(1).length ? partes.slice(1) : ['banco'] // endereços antigos
  const velha = $('#tela')
  const tela = velha.cloneNode(false) // uma tela nova a cada página: nenhum ouvinte da anterior fica para trás
  tela.className = ''
  velha.replaceWith(tela)
  $('#barra-versao').innerHTML = ''
  desenharAbas()
  // os projetos abrem pela marca; num projeto, acende a aba dele; o endereço antigo dos motions (#/banco/motions) acende Motions
  const aba = !partes[0] ? 'projetos' : partes[0] === 'banco' && partes[1] === 'motions' ? 'motions' : partes[0] === 'transicoes' ? 'presets' : partes[0] === 'c' ? 'carrosseis' : partes[0] // as transições moram na aba Presets
  for (const a of $$('.abas a, .abas-casa a')) a.classList.toggle('ativa', a.dataset.aba === aba)
  document.body.classList.toggle('em-revisao', (partes[0] === 'p' || partes[0] === 'calibragem') && !!partes[1])
  let s
  // #/p/<slug>/vN/t12.3 (o chip "usado em" do Banco e dos Motions): a revisão abre naquele instante
  if (partes[0] === 'p' && partes[1] && /^v\d+$/.test(partes[2] || '') && /^t[\d.]+$/.test(partes[3] || '')) {
    preferencia(`posicao.${partes[1]}.${partes[2]}`, 0, +partes[3].slice(1))
    history.replaceState(null, '', `#/p/${encodeURIComponent(partes[1])}/${partes[2]}`)
  }
  if (partes[0] === 'p' && partes[1]) s = await abrirRevisao(tela, partes[1], partes[2] ? parseInt(partes[2].replace(/^v/, ''), 10) : null)
  else if (partes[0] === 'calibragem') s = await (partes[1] ? abrirRevisaoReferencia(tela, partes[1]) : abrirCalibragem(tela))
  else if (partes[0] === 'referencias') s = await abrirReferencias(tela)
  else if (partes[0] === 'heuristica') s = await abrirHeuristica(tela)
  else if (partes[0] === 'aprendizados') s = await abrirAprendizados(tela, partes[1])
  else if (partes[0] === 'lixeira') s = await abrirLixeira(tela)
  else if (partes[0] === 'carrosseis') s = await abrirCarrosseis(tela)
  else if (partes[0] === 'c' && partes[1]) s = await abrirCarrossel(tela, partes[1], partes[2] ? parseInt(partes[2].replace(/^v/, ''), 10) : null)
  else if (PAGINAS_BIBLIOTECA.includes(partes[0])) s = await abrirBiblioteca(tela, partes[0], partes.slice(1))
  else s = await inicio(tela, partes[0] === 'ctas')
  if (minha !== vez) s?.() // já mudou de tela enquanto carregava
  else {
    sair = s
    if (comRolagem(rotaAtual)) setTimeout(() => scrollTo(0, preferencia(`rolagem.${rotaAtual}`, 0)), 0)
  }
}

// o botão copiar dos códigos (comum.chipCodigo), em qualquer página: na captura, antes do clique do card ou do link
// o chip inteiro copia, não só o botão
const botaoCopiar = (alvo) => alvo.closest?.('[data-copiar-codigo]') || alvo.closest?.('.codigo, [data-chip-copia]')?.querySelector('[data-copiar-codigo]')
document.addEventListener('click', (e) => {
  const b = botaoCopiar(e.target)
  if (!b) return
  e.preventDefault()
  e.stopPropagation()
  copiar(b.dataset.copiarCodigo).then(() => {
    aviso(`Copiado · ${b.dataset.copiarCodigo}`)
    b.classList.add('copiado')
    b.innerHTML = ICONE.check
    setTimeout(() => {
      b.classList.remove('copiado')
      b.innerHTML = ICONE.copiar
    }, 1400)
  })
}, true)
for (const ev of ['pointerdown', 'mousedown']) document.addEventListener(ev, (e) => botaoCopiar(e.target) && e.stopPropagation(), true)

window.addEventListener('hashchange', rotear)
setTimeout(preCarregarBanco, 1500) // o Banco e os Motions já lidos quando a aba abrir
rotear()
