// As páginas do que o Claude lê para editar: a galeria de Referências (todos os planos, para ver como cada tipo foi usado
// e favoritar os melhores) e a Skill (o guia de estilo, o passo a passo e as etapas, ao vivo).
import { $, $$, ESTRELA_CHEIA, ICONE, achaBusca, ajuda, aviso, chipCodigo, codigos, enviar, esc, janela, markdown, nomePlano, preferencia, seg, semAcento, tempo, tocarTrecho, urlRef } from './comum.js'
import { jsons } from './biblioteca.js'
import { barraDeTags, datalistTags, htmlTagsCard, ligarTags, tagEscolhida, temTag } from './tags.js'
import { CATEGORIA_PADRAO, botaoCategorias, carregarCategorias, editarCategorias, pilulasCategoria, rotuloCategoria } from './categorias.js'

// o ícone de cada grupo nos chips (o IconeGrupo do 18)
const ICONE_GRUPO = { todos: 'grade', dividida: 'duasFaixas', cheia: 'celular', ator: 'pessoa', comentario: 'balaoTexto' }
const GRUPOS = [
  ['dividida', 'Tela dividida', ['tela_dividida_insert', 'tela_dividida_motion']],
  ['cheia', 'Tela cheia', ['insert_tela_cheia', 'motion_tela_cheia']],
  ['comentario', 'Comentário + insert + ator', ['comentario_insert_ator']],
  ['ator', 'Full ator', ['full_ator', 'full_ator_lettering']], // com e sem lettering: só aparecem com este chip escolhido
]
const SO_ATOR = ['full_ator', 'full_ator_lettering']
// o que entra na tela: insert ou motion (o Full ator não tem nenhum dos dois)
const CONTEUDOS = { todos: 'Todos', insert: 'Inserts', motion: 'Motions' }
const conteudoDo = (t) => (t.includes('motion') ? 'motion' : t.includes('insert') ? 'insert' : null)
const ORDENS = { recentes: 'Mais recentes', video: 'Alfabética', aleatorio: 'Aleatório', longos: 'Mais longos', curtos: 'Mais curtos' }
const sorteio = new Map() // o aleatório é sorteado uma vez por clipe enquanto a página está aberta: favoritar não embaralha
const chaveClipe = (c) => `${c.ref}|${c.inicio}`
const ENTRA = { na_pausa: 'numa pausa', entre_palavras: 'entre palavras coladas', dentro_da_palavra: 'no meio de uma palavra', depois_da_fala: 'depois que a fala acabou' }

// ---------- Referências ----------

export async function abrirReferencias(tela) {
  tela.className = 'pagina pagina-referencias'
  tela.innerHTML = '<p class="vazio">Carregando…</p>'
  let dados
  try {
    dados = await enviar('GET', '/api/referencias/clipes')
  } catch (e) {
    tela.innerHTML = `<p class="vazio">${esc(e.message)}</p>`
    return null
  }
  const [presets, cods, cats] = await Promise.all([jsons('biblioteca/presets', ['ordem.json']), codigos(), carregarCategorias()])
  const clipes = dados.clipes
  // a categoria do vídeo de origem (Reels, Ad…), numa lista compacta (a barra já tem muitos chips)
  let categoria = preferencia('refCategoria', '')
  if (categoria && !cats.some((c) => c.id === categoria)) categoria = ''
  const codigoDo = (c) => (cods.referencia?.[c.ref] ? `${cods.referencia[c.ref]}·${c.id}` : null)
  const chipDo = (c) => chipCodigo(codigoDo(c), `${nomePlano(c.tipo)} · ${c.ref_nome} ${tempo(c.inicio)}`)
  for (const c of clipes) {
    if (!sorteio.has(chaveClipe(c))) sorteio.set(chaveClipe(c), Math.random())
    c.presets = presets.filter((p) => (p.fontes || []).some((f) => f.ref === c.ref && f.inicio >= c.inicio - 0.5 && f.fim <= c.fim + 0.5))
  }
  const grupos = [...GRUPOS]
  const conhecidos = new Set(GRUPOS.flatMap((g) => g[2]))
  for (const t of new Set(clipes.map((c) => c.tipo))) if (!conhecidos.has(t)) grupos.splice(grupos.length - 1, 0, [t, nomePlano(t), [t]])
  // o que estava escolhido fica guardado: voltar à aba devolve os filtros, a busca, a ordem e quanto da grade já tinha aberto
  let filtro = preferencia('refFiltro', 'todos')
  let conteudo = CONTEUDOS[preferencia('refConteudo', 'todos')] ? preferencia('refConteudo', 'todos') : 'todos'
  let ordem = preferencia('refOrdem2', 'recentes') // padrão: os vídeos que entraram por último primeiro, e na ordem dentro de cada um
  let visiveis = []
  // a grade em lotes: os primeiros na hora, o resto conforme rola (mil e tantos cards de uma vez travavam a abertura)
  const LOTE = 120
  let mostrar = preferencia('refMostrar', LOTE)
  let assinatura = preferencia('refAssinatura', '')

  const chaveDo = (c) => `${c.ref}|${c.inicio}`
  let tagAtiva = ''
  // a busca: todas as palavras digitadas, sem acento, no nome do vídeo, na marcação, na fala, no texto, nas tags e no código
  let busca = preferencia('refBusca', '')
  const textoDo = (c) => (c.busca ||= semAcento([c.ref_nome, nomePlano(c.tipo), c.descricao, c.fala, c.texto, codigoDo(c), ...(c.tags || []).map((t) => `#${t}`)].join(' ')))
  const acha = (c) => achaBusca(textoDo(c), busca)
  // os filtros de cima (sem a tag): o que a barra de tags conta
  // o Full ator (com e sem lettering) só entra com o chip dele: nos outros (e em Todos) ele polui a grade
  const comAtor = () => filtro === 'ator'
  const semTag = () => clipes.filter((c) => (!busca || acha(c)) && SO_ATOR.includes(c.tipo) === comAtor()
    && (comAtor() || conteudo === 'todos' || conteudoDo(c.tipo) === conteudo) && (!categoria || (c.tipo_video || CATEGORIA_PADRAO) === categoria))
  const base = () => semTag().filter((c) => !tagAtiva || temTag(c.tags, tagAtiva))
  const card = (c, k) => `<article class="card-clipe" data-k="${k}">
      <div class="mini mini-916">${c.miniatura ? `<img src="${c.miniatura}" alt="" loading="lazy">` : ''}
        <span class="selo tipo-${esc(c.tipo)}">${esc(nomePlano(c.tipo))}</span>
        ${c.presets.length ? '<span class="selo selo-preset">preset</span>' : ''}
        <button class="estrela${c.favorito ? ' ligada' : ''}" data-favoritar title="${c.favorito ? 'Tirar dos favoritos' : 'Favoritar'} (F no clipe aberto)">${c.favorito ? ESTRELA_CHEIA : ICONE.estrela}</button>
        ${c.revisado ? '<span class="selo-revisado">✓ revisado</span>' : ''}<span class="duracao duracao-baixo">${seg(c.fim - c.inicio)}</span></div>
      <p class="sub">${esc(c.ref_nome)} · ${tempo(c.inicio)}</p><div class="card-pe">${chipDo(c)}</div>
      ${c.texto ? `<p class="texto-clipe">“${esc(c.texto)}”</p>` : ''}
      <p class="desc desc-2">${esc(c.descricao || '')}</p>
      ${htmlTagsCard(c.tags)}
    </article>`

  const desenhar = () => {
    tagAtiva = tagEscolhida('refs', clipes.map((c) => ({ tags: c.tags })))
    const l = base()
    const nFav = l.filter((c) => c.favorito).length
    const contar = (tipos) => l.filter((c) => tipos.includes(c.tipo)).length
    const ativos = grupos
    if (filtro !== 'todos' && filtro !== 'favoritos' && !ativos.some(([id]) => id === filtro)) filtro = 'todos'
    // a contagem do Full ator vem de fora da grade (que, fora do chip dele, não tem Full ator)
    const nAtor = clipes.filter((c) => SO_ATOR.includes(c.tipo) && (!busca || acha(c)) && (!categoria || (c.tipo_video || CATEGORIA_PADRAO) === categoria)).length
    const tiposDo = grupos.find(([id]) => id === filtro)?.[2]
    visiveis = l.filter((c) => (filtro === 'favoritos' ? c.favorito : !tiposDo || tiposDo.includes(c.tipo)))
    const dur = (c) => c.fim - c.inicio
    visiveis.sort({
      aleatorio: (a, b) => sorteio.get(chaveClipe(a)) - sorteio.get(chaveClipe(b)),
      longos: (a, b) => dur(b) - dur(a),
      curtos: (a, b) => dur(a) - dur(b),
      video: (a, b) => a.ref_nome.localeCompare(b.ref_nome, 'pt-BR') || a.inicio - b.inicio,
      recentes: (a, b) => (b.ref_criado_em || '').localeCompare(a.ref_criado_em || '') || a.ref.localeCompare(b.ref) || a.inicio - b.inicio,
    }[ordem])
    const sig = JSON.stringify([filtro, conteudo, categoria, ordem, busca, tagAtiva])
    if (sig !== assinatura) { // filtro novo: volta ao primeiro lote (um redesenho por tag ou favorito mantém o que já estava)
      assinatura = preferencia('refAssinatura', '', sig)
      mostrar = preferencia('refMostrar', LOTE, LOTE)
    }
    const chip = (id, html, classe = '') => `<button class="pilula pequena${classe}${filtro === id ? ' ativa' : ''}" data-filtro="${id}">${html}</button>`
    const icone = (id) => ICONE[ICONE_GRUPO[id]] || ''
    tela.innerHTML = `<div class="filtros filtros-ref">
        ${chip('favoritos', `${filtro === 'favoritos' ? ESTRELA_CHEIA : ICONE.estrela} Favoritos <span class="conta">${nFav}</span>`, ' chip-favoritos')}
        ${chip('todos', `${icone('todos')} Todos <span class="conta">${l.length}</span>`)}
        ${ativos.map(([id, nome, tipos]) => chip(id, `${icone(id)} ${esc(nome)} <span class="conta">${id === 'ator' ? nAtor : contar(tipos)}</span>`)).join('')}
        <span class="filtros-dir"><input class="busca" type="search" data-busca placeholder="Buscar (nome, marcação, fala, #tag)" value="${esc(busca)}">
          <label class="caixa">Categoria <select data-categoria-ref><option value="">Todas</option>${cats.map((c) => `<option value="${esc(c.id)}"${c.id === categoria ? ' selected' : ''}>${esc(rotuloCategoria(cats, c.id))}</option>`).join('')}</select></label>
          <span class="alternar">${Object.entries(CONTEUDOS).map(([k, n]) => `<button class="pilula${k === conteudo ? ' ativa' : ''}" data-conteudo="${k}">${n}</button>`).join('')}</span>
          <label class="caixa">Ordenar <select data-ordem>${Object.entries(ORDENS).map(([k, n]) => `<option value="${k}"${k === ordem ? ' selected' : ''}>${n}</option>`).join('')}</select></label></span></div>
      ${!clipes.length ? '<p class="vazio">Nenhum clipe ainda. Suba vídeos editados na <a href="#/calibragem">Calibragem</a>: quando a análise terminar, cada plano aparece aqui.</p>'
        : `${datalistTags('tags-conhecidas-ref', conhecidas())}<div class="banco-com-tags">${barraDeTags(semTag().map((c) => ({ chave: chaveDo(c), tags: c.tags })), tagAtiva, 'refs')}<div class="banco-grade">${visiveis.length ? `<div class="grade grade-clipes">${visiveis.slice(0, mostrar).map(card).join('')}</div>${visiveis.length > mostrar ? '<div class="mais-clipes" data-mais></div>' : ''}` : '<p class="vazio">Nenhum clipe com esses filtros.</p>'}</div></div>`}`
    // a barra de tags gruda logo abaixo dos filtros (que também grudam e mudam de altura quando quebram a linha)
    const filtros = $('.filtros', tela)
    tela.altura?.disconnect()
    tela.altura = new ResizeObserver(() => tela.style.setProperty('--alto-filtros', `${filtros.offsetHeight}px`))
    tela.altura.observe(filtros)
    const opcoes = {
      onde: 'referencias',
      pref: 'refs',
      lista: 'tags-conhecidas-ref',
      conhecidas: conhecidas(),
      itemDo: (b) => visiveis[+b.closest('[data-k]').dataset.k],
      gravar: async (c, tags) => {
        const r = await enviar('PUT', `/api/referencias/${encodeURIComponent(c.ref)}/tags`, { inicio: c.inicio, fim: c.fim, tags })
        c.tags = r.tags
        delete c.busca
      },
      recarregar: desenhar,
      aposRenomear: () => abrirReferencias(tela),
    }
    ligarTags(tela, opcoes)
    // o próximo lote quando o fim da grade chega perto (um ouvinte de rolagem por página)
    if (!tela.dataset.lotes) {
      tela.dataset.lotes = '1'
      window.addEventListener('scroll', () => tela.isConnected && tela.maisLote?.(), { passive: true })
    }
    tela.maisLote = () => {
      const fim = $('[data-mais]', tela)
      if (!fim || fim.getBoundingClientRect().top > innerHeight + 1200) return
      const de = mostrar
      mostrar = preferencia('refMostrar', LOTE, Math.min(visiveis.length, mostrar + LOTE))
      const t = document.createElement('template')
      t.innerHTML = visiveis.slice(de, mostrar).map((c, i) => card(c, de + i)).join('')
      ligarTags(t.content, opcoes)
      $('.grade-clipes', tela).append(t.content)
      if (mostrar >= visiveis.length) fim.remove()
    }
  }
  const conhecidas = () => [...new Set(clipes.flatMap((c) => c.tags || []))].sort()

  const favoritar = async (c) => {
    c.favorito = !c.favorito
    atualizarEstrelas(c)
    try {
      await enviar('PUT', `/api/referencias/${encodeURIComponent(c.ref)}/favorito`, { inicio: c.inicio, fim: c.fim, favorito: c.favorito })
      aviso(c.favorito ? '★ Favorito' : 'Tirado dos favoritos')
    } catch (e) {
      c.favorito = !c.favorito // o servidor recusou: volta
      atualizarEstrelas(c)
      aviso(e.message, 'erro')
    }
  }
  const atualizarEstrelas = (c) => {
    for (const b of $$('[data-favoritar]', document)) {
      const dono = b.closest('[data-k]')
      const x = dono ? visiveis[+dono.dataset.k] : null
      if (x !== c) continue
      b.classList.toggle('ligada', c.favorito)
      b.innerHTML = b.classList.contains('botao') ? `${c.favorito ? ESTRELA_CHEIA : ICONE.estrela} ${c.favorito ? 'Favorito' : 'Favoritar'}` : c.favorito ? ESTRELA_CHEIA : ICONE.estrela
    }
    const fav = $('[data-filtro="favoritos"] .conta', tela)
    if (fav) fav.textContent = base().filter((x) => x.favorito).length
  }

  // o clipe tocando mudo com o mouse em cima (um vídeo só, que passa de card em card)
  const previa = document.createElement('video')
  previa.muted = true
  previa.playsInline = true
  previa.preload = 'auto'
  let parar = null
  tela.addEventListener('mouseover', (e) => {
    const mini = e.target.closest('.card-clipe .mini')
    if (!mini || mini.contains(previa)) return
    const c = visiveis[+mini.closest('.card-clipe').dataset.k]
    parar?.()
    if (!previa.src.endsWith(c.video)) previa.src = c.video
    mini.append(previa)
    parar = tocarTrecho(previa, c.inicio, c.fim)
  })
  tela.addEventListener('mouseout', (e) => {
    const mini = e.target.closest('.card-clipe .mini')
    if (!mini || mini.contains(e.relatedTarget)) return
    parar?.()
    previa.pause()
    previa.remove()
  })
  tela.addEventListener('click', (e) => {
    const k = e.target.closest('[data-conteudo]')
    if (k) {
      conteudo = preferencia('refConteudo', 'todos', k.dataset.conteudo)
      return desenhar()
    }
    const f = e.target.closest('[data-filtro]')
    if (f) {
      filtro = preferencia('refFiltro', 'todos', f.dataset.filtro)
      return desenhar()
    }
    const card = e.target.closest('.card-clipe')
    if (!card || e.target.closest('.tags-card, .tag-campo')) return
    const c = visiveis[+card.dataset.k]
    if (e.target.closest('[data-favoritar]')) return favoritar(c)
    parar?.()
    previa.pause()
    previa.remove()
    abrirClipe(+card.dataset.k)
  })
  let esperaBusca = null
  tela.addEventListener('input', (e) => {
    if (!e.target.matches('[data-busca]')) return
    clearTimeout(esperaBusca)
    esperaBusca = setTimeout(() => {
      busca = preferencia('refBusca', '', e.target.value)
      desenhar()
      const campo = $('[data-busca]', tela) // o redesenho troca o campo: o foco e o cursor voltam
      campo.focus()
      campo.setSelectionRange(campo.value.length, campo.value.length)
    }, 150)
  })
  tela.addEventListener('change', (e) => {
    if (e.target.matches('[data-busca]')) return
    if (e.target.matches('[data-ordem]')) ordem = preferencia('refOrdem2', 'recentes', e.target.value)
    if (e.target.matches('[data-categoria-ref]')) categoria = preferencia('refCategoria', '', e.target.value)
    desenhar()
  })

  /** O modal do clipe: este trecho em loop (com som) ou o vídeo de origem, os dados e a faixa dos planos da origem. */
  const abrirClipe = (k0) => {
    let k = k0
    let modo = 'trecho'
    let pararTrecho = null
    const { el } = janela('', {
      classe: 'janela-clipe',
      aoFechar: () => {
        pararTrecho?.()
        document.removeEventListener('keydown', tecla)
      },
    })
    const tocar = () => {
      const c = visiveis[k]
      const v = $('video', el)
      pararTrecho?.()
      pararTrecho = null
      for (const b of $$('[data-modo]', el)) b.classList.toggle('ativa', b.dataset.modo === modo)
      if (modo === 'trecho') pararTrecho = tocarTrecho(v, c.inicio, c.fim)
      else {
        v.currentTime = c.inicio
        v.play().catch(() => {})
      }
    }
    const mostrar = () => {
      const c = visiveis[k]
      const o = dados.origens[c.ref] || { planos: [], proporcao: {}, duracao: c.fim }
      const e = c.entrada
      const entra = !e ? 'abre o vídeo' : [ENTRA[e.onde] || e.onde, e.frase ? (e.frase === 'inicio' ? 'no começo de uma frase' : 'no meio de uma frase') : '',
        e.palavra && e.ms != null ? `${Math.abs(e.ms)} ms ${e.ms < 0 ? 'antes' : 'depois'} de “${esc(e.palavra)}”` : ''].filter(Boolean).join(' · ')
      const viz = (x, fim) => (x ? `${esc(nomePlano(x.tipo))} · ${seg(x.duracao)}` : `— (${fim} o vídeo)`)
      const props = Object.entries(o.proporcao || {}).sort((a, b) => b[1] - a[1])
      el.innerHTML = `<header class="janela-cabeca" data-k="${k}"><span class="chip-plano tipo-${esc(c.tipo)}">${esc(nomePlano(c.tipo))}</span>
          ${chipDo(c)}${c.revisado ? '<span class="t-revisado">✓ revisado</span>' : ''}<span class="dica">${k + 1} de ${visiveis.length}</span>
          ${c.presets.length ? `<a class="link" href="#/presets" data-fechar>${c.presets.length === 1 ? 'Virou preset' : `${c.presets.length} presets`} ↗</a>` : ''}
          <span class="espaco"></span>
          <button class="botao pequeno estrela-botao${c.favorito ? ' ligada' : ''}" data-favoritar>${c.favorito ? ESTRELA_CHEIA : ICONE.estrela} ${c.favorito ? 'Favorito' : 'Favoritar'} <kbd>F</kbd></button>
          <button class="botao-icone" data-anterior title="Anterior (←)">${ICONE.quadroAntes}</button><button class="botao-icone" data-seguinte title="Seguinte (→)">${ICONE.quadroDepois}</button>
          <button class="botao-icone" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button></header>
        <div class="clipe-corpo" data-k="${k}">
          <div class="clipe-video"><video src="${c.video}" controls playsinline></video>
            <div class="alternar"><button class="pilula pequena" data-modo="trecho">Este trecho</button><button class="pilula pequena" data-modo="origem">Vídeo de origem</button></div></div>
          <div class="clipe-info">
            ${c.texto ? `<p class="clipe-texto">“${esc(c.texto)}”</p>` : ''}
            <div class="campo"><span class="eyebrow">Marcação</span><p>${esc(c.descricao || '—')}</p></div>
            <dl class="dados"><dt>Duração</dt><dd>${seg(c.fim - c.inicio)}</dd>
              <dt>Onde no vídeo</dt><dd>${tempo(c.inicio)} → ${tempo(c.fim)} · ${Math.round((c.posicao || 0) * 100)}% · plano ${c.numero} de ${c.total}</dd>
              <dt>Entra</dt><dd>${entra}</dd>
              <dt>Fala no trecho</dt><dd>${c.palavras} palavras${c.por_minuto ? ` · ${c.por_minuto} por minuto` : ''}</dd>
              <dt>Vem depois de</dt><dd>${viz(c.anterior, 'abre')}</dd><dt>Vai para</dt><dd>${viz(c.seguinte, 'fecha')}</dd></dl>
            ${c.elementos?.length ? `<div class="campo"><span class="eyebrow">Elementos dentro do plano</span><ul class="lista-simples">${c.elementos.map((x) => `<li><span>${esc(dados.elementos?.[x.tipo] || x.tipo)}${x.texto ? ` · “${esc(x.texto)}”` : ''}</span><span class="apagado">${tempo(x.inicio)}</span></li>`).join('')}</ul></div>` : ''}
            ${c.fala ? `<div class="campo"><span class="eyebrow">Fala</span><p class="fala">“${esc(c.fala)}”</p></div>` : ''}
            <div class="campo"><span class="eyebrow">Vídeo de origem</span>
              <p><b>${esc(o.nome || c.ref_nome)}</b> · ${tempo(o.duracao)} · ${o.planos.length} planos · <a class="link" href="#/calibragem/${encodeURIComponent(c.ref)}" data-fechar>abrir na calibragem ↗</a></p>
              <div class="barras">${props.map(([t, f]) => `<div class="barra-prop"><span>${esc(nomePlano(t))}</span><i><b class="tipo-${esc(t)}" style="width:${(f * 100).toFixed(1)}%"></b></i><span class="apagado">${Math.round(f * 100)}%</span></div>`).join('')}</div></div>
          </div>
        </div>
        <div class="faixa-origem" title="Clique para ver o vídeo de origem a partir daí">${o.planos.map((p) => `<span class="tipo-${esc(p.tipo)}${Math.abs(p.inicio - c.inicio) < 0.05 ? ' este' : ''}" style="left:${(p.inicio / o.duracao) * 100}%;width:${((p.fim - p.inicio) / o.duracao) * 100}%" title="${esc(nomePlano(p.tipo))} · ${tempo(p.inicio)}"></span>`).join('')}<i class="cabeca-origem"></i></div>`
      const v = $('video', el)
      v.addEventListener('timeupdate', () => ($('.cabeca-origem', el).style.left = `${(v.currentTime / o.duracao) * 100}%`))
      tocar()
    }
    const ir = (d) => {
      k = (k + d + visiveis.length) % visiveis.length
      mostrar()
    }
    el.addEventListener('click', (e) => {
      const m = e.target.closest('[data-modo]')
      if (m) {
        modo = m.dataset.modo
        return tocar()
      }
      if (e.target.closest('[data-favoritar]')) return favoritar(visiveis[k])
      if (e.target.closest('[data-anterior]')) return ir(-1)
      if (e.target.closest('[data-seguinte]')) return ir(1)
      const faixa = e.target.closest('.faixa-origem')
      if (faixa) {
        const caixa = faixa.getBoundingClientRect()
        const o = dados.origens[visiveis[k].ref]
        modo = 'origem'
        pararTrecho?.()
        pararTrecho = null
        for (const b of $$('[data-modo]', el)) b.classList.toggle('ativa', b.dataset.modo === modo)
        const v = $('video', el)
        v.currentTime = ((e.clientX - caixa.left) / caixa.width) * o.duracao
        v.play().catch(() => {})
      }
    })
    const tecla = (e) => {
      if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      const v = $('video', el)
      const f = {
        ArrowLeft: () => ir(-1),
        ArrowRight: () => ir(1),
        f: () => favoritar(visiveis[k]),
        F: () => favoritar(visiveis[k]),
        ' ': () => (v.paused ? v.play().catch(() => {}) : v.pause()),
      }[e.key]
      if (f) {
        e.preventDefault()
        e.stopPropagation()
        f()
      }
    }
    document.addEventListener('keydown', tecla)
    mostrar()
  }

  desenhar()
  return () => {
    parar?.()
    previa.pause()
  }
}

// ---------- Skill: o que o Claude lê para editar, ao vivo ----------
// O guia de estilo, o SKILL.md, as etapas e os briefs (`.claude/skills/editor/`), lidos e editados aqui. A página olha o
// disco a cada 2 s: quando o Claude reescreve um arquivo, ele muda na tela sem recarregar.

let modoSkill = 'ler'
export async function abrirSkill(tela, rel) {
  tela.className = 'pagina pagina-aprendizados pagina-skill'
  let lista, atual
  try {
    lista = await enviar('GET', '/api/skill')
    rel = rel && lista.some((x) => x.arquivo === rel) ? rel : lista[0].arquivo
    atual = await enviar('GET', `/api/skill/${rel}`)
  } catch (e) {
    tela.innerHTML = `<p class="vazio">${esc(e.message)}</p>`
    return null
  }
  let mudouNoDisco = false
  const titulo = () => lista.find((x) => x.arquivo === atual.arquivo)?.titulo || atual.arquivo
  const desenhar = () => {
    const grupos = [...new Set(lista.map((x) => x.grupo))]
    const lado = `<aside class="lado-pares">${grupos.map((g) => `<span class="eyebrow">${esc(g)}</span>
      ${lista.filter((x) => x.grupo === g).map((x) => `<a class="par-link${x.arquivo === atual.arquivo ? ' ativo' : ''}" href="#/skill/${x.arquivo}" title="${esc(x.arquivo)}"><span>${esc(x.titulo)}</span></a>`).join('')}`).join('')}</aside>`
    const corpo = modoSkill === 'ler'
      ? `<div class="markdown">${markdown(atual.texto)}</div>`
      : `<textarea class="editor-regras editor-skill" spellcheck="false">${esc(atual.texto)}</textarea>`
    tela.innerHTML = `<div class="com-lado">${lado}<div class="lado-conteudo bloco-heuristica">
      <div class="cabeca-secao"><span class="eyebrow">Skill · ${esc(titulo())}</span>${ajuda('O que o Claude lê para editar, ao vivo: o guia de estilo (o seu gosto), o passo a passo (SKILL.md), as etapas (o como de cada ferramenta) e os briefs dos subagentes. Quando ele reescreve um arquivo, a página atualiza sozinha. Você também pode editar aqui.')}
        <div class="alternar">${['ler', 'editar'].map((m) => `<button class="pilula pequena${modoSkill === m ? ' ativa' : ''}" data-modo="${m}">${m === 'ler' ? 'Ler' : 'Editar'}</button>`).join('')}</div>
        ${modoSkill === 'editar' ? '<span class="dica">Grava ao sair da caixa.</span>' : ''}<span class="salvo" id="salvo-s">${mudouNoDisco ? 'Mudou no disco: saia da caixa para recarregar' : ''}</span>
        <span class="dica" title="${esc(atual.arquivo)}">.claude/skills/editor/${esc(atual.arquivo)}</span></div>
      ${corpo}</div></div>`
  }
  const salvo = (texto, erro = false) => {
    const el = $('#salvo-s', tela)
    if (!el) return
    el.className = `salvo${erro ? ' salvo-erro' : ''}`
    el.innerHTML = texto
    if (!erro) setTimeout(() => el.textContent === 'Salvo' && (el.innerHTML = ''), 1800)
  }
  tela.addEventListener('click', (e) => {
    const m = e.target.closest('[data-modo]')
    if (!m) return
    modoSkill = m.dataset.modo
    desenhar()
    if (modoSkill === 'editar') $('.editor-skill', tela).focus()
  })
  tela.addEventListener('focusout', async (e) => {
    if (!e.target.matches('.editor-skill')) return
    const texto = e.target.value
    if (texto.trim() === atual.texto.trim()) {
      if (mudouNoDisco) { mudouNoDisco = false; atual = await enviar('GET', `/api/skill/${atual.arquivo}`); desenhar() }
      return
    }
    salvo('Salvando…')
    try {
      const r = await enviar('PUT', `/api/skill/${atual.arquivo}`, { texto })
      atual = { ...atual, texto: texto.trimEnd() + '\n', mtime: r.mtime }
      mudouNoDisco = false
      salvo('Salvo')
    } catch (x) {
      salvo(esc(x.message), true)
    }
  })
  // ao vivo: o disco a cada 2 s (a lista, para arquivos novos, e o arquivo aberto)
  const olhar = setInterval(async () => {
    try {
      const nova = await enviar('GET', '/api/skill')
      const meu = nova.find((x) => x.arquivo === atual.arquivo)
      const listaMudou = nova.length !== lista.length || nova.some((x, i) => x.arquivo !== lista[i]?.arquivo || x.titulo !== lista[i]?.titulo)
      lista = nova
      if (meu && meu.mtime > atual.mtime + 0.001) {
        const editando = modoSkill === 'editar' && document.activeElement?.matches('.editor-skill')
        if (editando) { mudouNoDisco = true; salvo('Mudou no disco: saia da caixa para recarregar') ; return }
        const rolagem = scrollY
        atual = await enviar('GET', `/api/skill/${atual.arquivo}`)
        desenhar()
        scrollTo(0, rolagem)
      } else if (listaMudou && !(modoSkill === 'editar' && document.activeElement?.matches('.editor-skill'))) desenhar()
    } catch { /* o servidor reiniciando: tenta de novo no próximo */ }
  }, 2000)
  desenhar()
  return () => clearInterval(olhar)
}
