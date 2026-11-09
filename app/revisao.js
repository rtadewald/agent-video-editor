// A revisão de uma versão: o player do proxy, a linha do tempo (planos, fala e comentários) e os
// comentários do criador, gravados sozinhos em projetos/<slug>/revisoes/vN.json (o Claude responde no mesmo arquivo).
import { $, $$, ESTRELA_CHEIA, ICONE, ICONE_ATALHO, abrirAba, barraDaLinha, agora, aviso, chipCodigo, codigos, confirmar, copiar, dataHora, enviar, esc, quandoCurto, fecharAba, janela, json, mmss, modalAberto, nomePlano, num, PLANOS, preferencia, tempo } from './comum.js'
import { CATEGORIA_PADRAO, carregarCategorias, categoriaCta } from './categorias.js'

/** A data do comentário, curta e relativa a hoje (o dia e a hora inteiros no title). */
const dataComentario = (c) => (c.criado_em ? `<time class="data-comentario" datetime="${esc(c.criado_em)}" title="${esc(dataHora(c.criado_em))}">${quandoCurto(c.criado_em)}</time>` : '')

const QUADRO = 1 / 24
const VELOCIDADES = [0.5, 1, 1.5, 2]
const r3 = (t) => Math.round(t * 1000) / 1000
const listaDe = (x, chave) => (Array.isArray(x) ? x : x?.[chave] || [])
const limpar = (s) => s.replace(/^[\s,.;:!?…]+|[\s,.;:!?]+$/g, '')
/** O status que o Claude escreve (revisao.py responder): rótulo e classe. */
const STATUS = {
  aplicado: ['Aplicado', 'aplicado'],
  respondido: ['Respondido', 'respondido'],
  nao_aplicado: ['Não aplicado', 'nao-aplicado'],
  'não aplicado': ['Não aplicado', 'nao-aplicado'],
}
const chaveStatus = (s) => (s === 'não aplicado' ? 'nao_aplicado' : s || 'pendente')
const quando = (c) => (c.geral ? 'Geral' : c.fim != null ? `${tempo(c.t)}–${tempo(c.fim)}` : tempo(c.t))
/** Ordem da lista: os gerais primeiro, depois pelo tempo. */
const ordem = (c) => (c.geral ? -1 : c.t)
/** Um comentário que conta: com texto ou com print anexado. */
const temConteudo = (c) => !!(c.texto?.trim() || c.anexos?.length)
const numero = (id) => parseInt(String(id).replace(/\D/g, ''), 10) || 0
const VIDEO = /\.(mp4|mov|webm)$/i
/** Uma caixa de texto que cresce com o que se escreve (até 40% da tela). */
const crescer = (el) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(innerHeight * 0.4))}px`
}
/** O botão de clipe de uma caixa de comentário (`alvo`: nova ou editor). */
// a barra acima da linha do tempo (comum.js): os atalhos da revisão
const ATALHOS = () => [
  ['R', 'plano', ICONE_ATALHO.plano], ['C', 'geral', ICONE.balao], ['arrastar', 'trecho', ICONE_ATALHO.trecho],
  ['Espaço', 'tocar', ICONE.tocar], ['← →', 'quadro', ICONE.quadroDepois], ['⇧ ← →', 'corte', ICONE.segDepois], ['⌘ + −', 'zoom', ICONE_ATALHO.zoom],
]

const clipe = (alvo) =>
  `<label class="botao-icone pequeno botao-clipe" title="Anexar imagens ou vídeos (também dá para colar com ⌘V ou arrastar)"><input type="file" accept="image/*,video/*" multiple hidden data-anexar="${alvo}">${ICONE.clipe}</label>`
/** O estado da revisão de uma versão, no seletor de versões (GET /api/projetos/<slug>/versoes). */
const ESTADO_VERSAO = {
  sem: () => 'sem revisão',
  em_revisao: (n) => `em revisão (${n} ${n === 1 ? 'comentário' : 'comentários'})`,
  aprovada: () => 'aprovada',
}

export async function abrirRevisao(tela, slug, vPedida) {
  const projetos = await json('/api/projetos', [])
  const proj = projetos.find((p) => p.slug === slug)
  if (!proj) {
    fecharAba(slug)
    tela.className = 'pagina'
    tela.innerHTML = `<p class="vazio">O projeto <b>${esc(slug)}</b> não existe ou ainda não tem versão. <a href="#/">Voltar aos projetos</a></p>`
    return null
  }
  const r = new Revisao(tela, proj, proj.versoes.includes(vPedida) ? vPedida : proj.ultima)
  await r.abrir()
  return () => r.fechar()
}

class Revisao {
  constructor(tela, proj, v) {
    Object.assign(this, { tela, proj, v, slug: proj.slug })
    const s = encodeURIComponent(proj.slug)
    this.base = `/projetos/${s}/versoes/v${v}/`
    this.urlRevisao = `/projetos/${s}/revisoes/v${v}.json`
    this.pxs = 1
    this.ajustar = true // a linha do tempo cabe inteira na largura
    this.entrada = null // a marca I (s)
    this.editor = null // editando um comentário: {t, fim, id?, texto?, anexos?}
    this.nova = { preso: false, geral: false, t: 0, fim: null, anexos: [], novoId: null } // a caixa de baixo: o comentário novo
    this.sel = null
    this.fila = Promise.resolve()
    this.sujo = false
    this.iPalavra = this.iPlano = -2
  }

  async abrir() {
    const [rev, cods, edicao, infoCorpo] = await Promise.all([json(this.urlRevisao, null), codigos(), json(`/projetos/${encodeURIComponent(this.slug)}/edicao.json?${Date.now()}`, {}), json(this.base + 'info.json', {})])
    // as saídas do projeto (corpo + final), com a prévia desta versão (uma nova só tem prévia na próxima versão); a
    // escolhida fica guardada por projeto
    this.saidas = []
    for (const x of (edicao.saidas || []).filter((x) => x?.final)) {
      const info = x.final.tipo === 'nenhum' ? null : await json(`${this.base}saidas/${x.id}/info.json`, null)
      this.saidas.push({ id: x.id, destino: x.destino, tipo: x.final.tipo, cta: x.final.cta, aprovado: !!x.aprovado, info })
    }
    this.corpoDur = infoCorpo?.duracao || 0
    const pedida = preferencia(`saida.${this.slug}`, null)
    this.saidaId = this.saidas.find((x) => x.id === pedida)?.id ?? this.saidas.find((x) => x.info)?.id ?? null
    this.dir = this.saidaAtual()?.info ? `${this.base}saidas/${this.saidaId}/` : this.base // a sem final é o próprio corpo
    const [palavras, planos, info] = await Promise.all([json(this.dir + 'palavras.json', []), json(this.dir + 'planos.json', []), json(this.dir + 'info.json', {})])
    this.codigo = cods.projeto?.[this.slug]
    this.cods = cods
    // o que entrou em cada plano nesta versão: as mídias do banco, o preset do enriquecimento e o motion
    this.usado = {}
    for (const q of edicao.inserts?.pedidos || []) this.usado[q.plano] = { midias: (q.midias || []).map((m) => m.banco).filter(Boolean), preset: q.enriquecimento?.preset }
    for (const [pl, m] of Object.entries(edicao.motions || {})) (this.usado[pl] ||= {}).motion = m
    for (const [pl, t] of Object.entries(edicao.transicoes || {})) if (t?.id) (this.usado[pl] ||= {}).transicao = t.id
    this.receitas = {} // os JSONs dos presets e das transições já buscados (o nome), por 'preset:<id>' / 'transicao:<id>'
    this.midias = {} // os itens do banco já buscados (nome, fonte, vídeo)
    this.palavras = listaDe(palavras, 'palavras').slice().sort((a, b) => a.ini - b.ini)
    this.planos = listaDe(planos, 'planos')
    this.info = info || {}
    this.rev = rev || { projeto: this.slug, versao: this.v, aprovado: false, enviado_em: null, comentarios: [] }
    this.rev.comentarios ||= []
    if (this.rev.geral?.trim() || this.rev.anexos_geral?.length) {
      const g = this.rev.resposta_geral || {}
      const n = Math.max(0, ...this.rev.comentarios.map((c) => numero(c.id))) + 1
      this.rev.comentarios.push({ id: `c${n}`, geral: true, t: null, fim: null, palavra: null, fala: '', texto: (this.rev.geral || '').trim(),
        criado_em: agora(), de: 'rodrigo', status: g.status || 'pendente', resposta: g.resposta || null, ...(this.rev.anexos_geral?.length ? { anexos: this.rev.anexos_geral } : {}) })
      delete this.rev.geral
      delete this.rev.anexos_geral
      delete this.rev.resposta_geral
    }
    await this.carregarAnteriores()
    this.dur = this.info.duracao || this.palavras.at(-1)?.fim || 60
    this.prepararBlocos()
    this.montar()
    if (this.blocos) this.carregarVersoesBlocos().then(() => {
      if (this.fechado) return
      this.renderBlocos()
      if (this.blocoSel && !this.editor) this.renderLista()
    })
    this.verTrabalho()
    if (this.blocosNovos && this.v === this.proj.ultima) this.agendarSalvar() // os blocos nascem (ou vêm da versão anterior) no arquivo desta
    this.ligar()
    this.mostrarSalvo(rev ? 'salvo' : '')
    this.relogio = setInterval(() => this.verDisco(), 4000)
  }

  // ---------- os blocos (~30 s, nos vídeos de mais de 2 min): revisar, aprovar e mandar por trecho ----------
  // Cada bloco começa numa palavra (o id da transcrição): continua o mesmo trecho nas versões seguintes, mesmo que os
  // cortes antes dele mudem os tempos. O arquivo da revisão guarda {id, palavra, aprovado}; a versão nova herda os da
  // anterior (com as aprovações: um bloco aprovado fica travado para o Claude).

  prepararBlocos() {
    if (!this.rev.blocos?.length) {
      const herdado = Object.keys(this.anteriores).map(Number).sort((a, b) => b - a).map((x) => this.anteriores[x]).find((r) => r?.blocos?.length)
      const novos = herdado ? herdado.blocos.map((b) => ({ ...b })) : this.cortarBlocos()
      if (novos?.length) {
        this.rev.blocos = novos
        this.blocosNovos = true
      }
    }
    this.calcularBlocos()
  }

  /** Os blocos de uma versão sem blocos: a cada ~30 s, na troca de plano mais perto (até 12 s para cada lado); sem
   *  troca de plano por perto, na palavra mais perto dos 30 s. Nenhum bloco com menos de 15 s. */
  cortarBlocos() {
    const fim = this.fimCorpo() // só o corpo: os finais das saídas são o bloco Final de cada uma
    const ws = this.palavras.filter((w) => w.ini < fim)
    if (!ws.length) return null
    const inicios = []
    let ant = 0
    for (let alvo = 30; alvo < fim - 15; alvo += 30) {
      const perto = this.planos.map((q) => q.ini).filter((t) => t > ant + 15 && t < fim - 15 && Math.abs(t - alvo) <= 12)
      const t = perto.length ? perto.reduce((a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a)) : alvo
      if (t <= ant + 15) continue
      inicios.push(t)
      ant = t
    }
    const palavras = [ws[0].id, ...inicios.map((t) => (ws.find((w) => w.ini >= t - 0.05) || ws.at(-1)).id)]
    return [...new Set(palavras)].map((palavra, k) => ({ id: `B${k + 1}`, palavra, aprovado: false }))
  }

  /** Onde cada bloco cai nesta versão: do começo da palavra dele até o começo do próximo. */
  calcularBlocos() {
    const defs = this.rev.blocos || []
    if (!defs.length) return (this.blocos = null)
    const fim = this.fimCorpo()
    const inicio = (id) => (this.palavras.find((w) => w.id === id) || this.palavras.find((w) => w.id > id))?.ini
    const l = defs.map((def, k) => ({ id: def.id, def, ini: k === 0 ? 0 : Math.min(inicio(def.palavra) ?? fim, fim) })).sort((a, b) => a.ini - b.ini)
    l.forEach((b, k) => (b.fim = l[k + 1]?.ini ?? fim))
    // o corpo encolheu (um final novo recuou o ponto comum): o último bloco, se ficou curto e ninguém finalizou, junta ao de antes
    const ult = l.at(-1)
    if (l.length > 1 && ult.fim - ult.ini < 15 && !ult.def.aprovado) l.at(-2).fim = l.pop().fim
    this.blocos = l.filter((b) => b.fim - b.ini > 0.05)
    // a saída escolhida: depois do corpo, o bloco Final dela (com o Finalizar próprio, guardado por saída na revisão)
    const sx = this.saidaAtual()
    if (sx && this.dur - fim > 0.05) {
      const finais = (this.rev.finais ||= {})
      this.blocos.push({ id: 'Final', final: true, def: (finais[sx.id] ||= { aprovado: false }), ini: fim, fim: this.dur })
    }
  }

  /** Onde o corpo termina no vídeo aberto: com uma saída, a duração do corpo; sem, o vídeo todo. */
  fimCorpo() {
    return this.saidaAtual() && this.corpoDur ? Math.min(this.corpoDur, this.dur) : this.dur
  }

  saidaAtual() {
    return this.saidas?.find((x) => x.id === this.saidaId) || null
  }

  /** Um comentário aparece na saída aberta: os do corpo em todas; os do final, só na saída deles. */
  visivel(c) {
    return !c.saida || c.saida === this.saidaId
  }

  /** Escolher um bloco pela mão (faixa, cabeçalho, estrela): sempre na versão mais recente do vídeo; numa antiga, abre
   *  a última já com ele escolhido, no começo dele. (O painel que acompanha o cursor não troca de versão.) */
  abrirBloco(id) {
    const b = this.blocos.find((x) => x.id === id)
    if (this.v < this.proj.ultima) {
      preferencia(`painel.${this.slug}.v${this.proj.ultima}`, null, { bloco: id, irAoBloco: true })
      location.hash = `#/p/${encodeURIComponent(this.slug)}/v${this.proj.ultima}`
      return
    }
    this.irAoBloco(b)
    this.escolherBloco(id)
  }

  /** O começo de um bloco, um quadro para dentro: o vídeo para alguns ms antes do pedido, e o painel (que acompanha o
   *  cursor) trocaria para o bloco de trás. */
  irAoBloco(b) {
    this.buscar(Math.min(b.ini + 0.05, b.fim - 0.01))
  }

  blocoEm(t) {
    return this.blocos?.find((b) => t >= b.ini && t < b.fim) || (t != null ? this.blocos?.at(-1) : null)
  }

  /** Os comentários (e réplicas) que caem num bloco. */
  doBloco(b) {
    return this.rev.comentarios.filter((c) => temConteudo(c) && !c.geral && this.visivel(c) && this.blocoEm(c.t)?.id === b.id)
  }

  renderBlocos() {
    const el = $('#f-blocos')
    if (!el || !this.blocos) return
    const px = this.pxs
    // as divisas atravessam todas as faixas; o bloco escolhido fica marcado de cima a baixo
    const foco = this.blocos.find((b) => b.id === this.blocoSel)
    $('#divisas').innerHTML = this.blocos.slice(1).map((b) => `<i class="divisa" style="left:${(b.ini * px).toFixed(1)}px"></i>`).join('')
      + (foco ? `<i class="bloco-faixa-sel" style="left:${(foco.ini * px).toFixed(1)}px;width:${((foco.fim - foco.ini) * px).toFixed(1)}px"></i>` : '')
    // o Claude trabalhando: um loader sobre os trechos dos blocos que ele está aplicando
    const emTrabalho = new Set(this.trabalho?.blocos || [])
    $('#divisas').innerHTML += this.blocos.filter((b) => emTrabalho.has(b.id))
      .map((b) => `<i class="bloco-trabalhando" style="left:${(b.ini * px).toFixed(1)}px;width:${((b.fim - b.ini) * px).toFixed(1)}px"></i>`).join('')
    // o que há de novo em cada bloco: um ícone pulsando sobre ele
    $('#novidades').innerHTML = this.blocos.map((b) => {
      const n = this.novidade(b)
      if (!n) return ''
      const dica = n.tipo === 'nova' ? `O ${b.id} tem uma versão mais nova: abrir` : `O ${b.id} mudou: ainda não foi visto`
      return `<button class="bloco-novidade${n.tipo === 'nova' ? ' novidade-nova' : ''}" data-novidade="${b.id}" ${n.v ? `data-v="${n.v}"` : ''} title="${dica}" aria-label="${dica}"
        style="left:${(b.fim * px - 14).toFixed(1)}px">${ESTRELA_CHEIA}</button>`
    }).join('')
    el.innerHTML = this.blocos.map((b) => {
      const n = this.doBloco(b).length
      const cls = b.def.aprovado ? 'bloco-aprovado' : n ? 'bloco-com' : ''
      const trab = this.trabalho?.blocos?.includes(b.id)
      return `<button class="bloco-faixa ${cls}${trab ? ' bloco-em-trabalho' : ''}${this.loop?.id === b.id ? ' bloco-loop' : ''}${this.blocoSel === b.id ? ' bloco-escolhido' : ''}" data-bloco="${b.id}" data-ir="${b.ini}" style="left:${(b.ini * px).toFixed(1)}px;width:${((b.fim - b.ini) * px).toFixed(1)}px"
        title="${b.id} · ${tempo(b.ini)}–${tempo(b.fim)}${b.def.aprovado ? ' · finalizado (travado)' : n ? ` · ${n} comentário(s)` : ''}">${trab ? '<span class="girando" aria-hidden="true"></span>' : ''}${b.id}${b.def.aprovado ? ` ${ICONE.check}` : n ? ` <i>${n}</i>` : ''}
        <span class="bloco-check" data-check="${b.id}" title="${b.def.aprovado ? `Reabrir o ${b.id}` : `Finalizar o ${b.id}`}">${b.def.aprovado ? ICONE.fechar : ICONE.check}</span></button>`
    }).join('')
  }

  htmlCabecaBloco(b, n, foco = false) {
    const ok = b.def.aprovado
    return `<div class="bloco-cabeca${ok ? ' bloco-ok' : ''}${foco ? ' bloco-sel' : ''}" data-cab-bloco="${b.id}">
      ${foco ? `<button class="botao-icone pequeno" data-sair-bloco title="Voltar a todos os blocos">${ICONE.voltar}</button>` : ''}
      <button class="bloco-nome" data-bloco="${b.id}" data-ir="${b.ini}" title="${b.id} · ${tempo(b.ini)}–${tempo(b.fim)} · ir ao começo">${b.id}</button>${n ? `<span class="conta" title="${n} ${n === 1 ? 'comentário' : 'comentários'} nesta versão">${ICONE.balao} ${n}</span>` : ''}
      <span class="bloco-acoes">
        <button class="botao-icone pequeno${this.loop?.id === b.id ? ' ativo' : ''}" data-loop-bloco="${b.id}" title="${this.loop?.id === b.id ? 'Parar o loop' : 'Tocar só este bloco, em loop'}">${ICONE_ATALHO.plano}</button>
        <button class="botao pequeno${ok ? ' feito' : ''}" data-aprovar-bloco="${b.id}" title="${ok ? 'Reabrir o bloco' : 'Marcar o bloco como finalizado: ele fica travado para o Claude'}">${ICONE.check} ${ok ? 'Finalizado' : 'Finalizar'}</button></span></div>`
  }

  /** O que há de novo num bloco: `nova` (uma versão mais nova do vídeo mudou o bloco: abrir lá) ou `mudou` (mudou
   *  nesta versão e ainda não foi aberto aqui). */
  novidade(b) {
    const vb = this.versoesBloco?.[b.id]
    if (!vb?.length) return null
    const ultimaB = vb.at(-1)
    if (ultimaB.vs[0] > this.v) return { tipo: 'nova', v: ultimaB.vs[0] }
    const aqui = vb.find((x) => x.vs.includes(this.v))
    this.vistos ||= preferencia(`vistos.${this.slug}.v${this.v}`, {})
    if (aqui && aqui.bv > 1 && aqui.vs[0] === this.v && !this.vistos[b.id]) return { tipo: 'mudou' }
    return null
  }

  marcarVisto(id) {
    this.vistos ||= preferencia(`vistos.${this.slug}.v${this.v}`, {})
    if (this.vistos[id]) return
    this.vistos[id] = true
    preferencia(`vistos.${this.slug}.v${this.v}`, {}, this.vistos)
  }

  /** Escolher um bloco (na faixa ou no cabeçalho): o painel mostra só ele e o seletor de cima, a versão dele; `null`
   *  volta a todos. */
  escolherBloco(id) {
    this.blocoSel = id
    if (id) this.marcarVisto(id)
    this.menuVersoes = null
    this.renderLista()
    this.renderMarcas()
    this.renderVersoes()
    $('#lista').scrollTop = 0
    if (id) this.carregarVersoesBlocos().then(() => {
      if (this.fechado || this.blocoSel !== id) return
      this.renderVersoes()
      if (!this.editor) this.renderLista()
    })
  }

  /** As versões de cada bloco: o bloco só ganha versão nova quando o que há nele mudou de uma versão do vídeo para a
   *  outra (as palavras que ficaram, os planos com o tipo, o texto e a mídia, os motions, os presets e o enriquecimento: o
   *  ator, os ajustes, a legenda). Lido uma vez,
   *  na primeira escolha de bloco. `this.versoesBloco[id]`: [{bv, vs: [versões do vídeo com esse conteúdo]}]. */
  async carregarVersoesBlocos() {
    if (this.versoesBloco) return
    const s = encodeURIComponent(this.slug)
    const vs = this.proj.versoes.filter((x) => x <= this.proj.ultima)
    this.dadosVersao ||= {} // o que já foi lido de cada versão (uma versão nova lê só a dela)
    await Promise.all(vs.filter((x) => !this.dadosVersao[x]).map(async (x) =>
      (this.dadosVersao[x] = await Promise.all(['palavras', 'planos', 'edicao'].map((f) => json(`/projetos/${s}/versoes/v${x}/${f}.json`, null))))))
    const dados = vs.map((x) => this.dadosVersao[x])
    const assinatura = (def, prox, [pal, pla, ed]) => {
      const ws = listaDe(pal, 'palavras').slice().sort((a, b) => a.ini - b.ini)
      const ini = (ws.find((w) => w.id === def.palavra) || ws.find((w) => w.id > def.palavra))?.ini ?? 0
      const fim = prox ? (ws.find((w) => w.id === prox.palavra) || ws.find((w) => w.id > prox.palavra))?.ini ?? Infinity : Infinity
      const dentro = (a, b) => a < fim - 0.05 && b > ini + 0.05
      const midias = {}
      for (const q of ed?.inserts?.pedidos || []) midias[q.plano] = [(q.midias || []).map((m) => m.banco || m.id), q.enriquecimento ?? null, q.legenda_y ?? null]
      for (const [pl, m] of Object.entries(ed?.motions || {})) midias[pl] = [...(midias[pl] || []), m.preset || m.tipo, m.valores]
      return JSON.stringify([
        ws.filter((w) => dentro(w.ini, w.fim)).map((w) => w.id),
        listaDe(pla, 'planos').filter((q) => dentro(q.ini, q.fim)).map((q) => [q.tipo, q.texto, Math.round((q.ini - ini) * 4), Math.round((q.fim - ini) * 4), midias[q.id]]),
      ])
    }
    this.versoesBloco = {}
    const defs = this.rev.blocos || []
    defs.forEach((def, k) => {
      const l = []
      vs.forEach((x, i) => {
        if (!dados[i][0]) return
        const a = assinatura(def, defs[k + 1], dados[i])
        if (l.at(-1)?.a === a) l.at(-1).vs.push(x)
        else l.push({ bv: l.length + 1, a, vs: [x] })
      })
      this.versoesBloco[def.id] = l
    })
    // o bloco Final da saída aberta: como um bloco, com versões. Num CTA à parte, a versão é a do projeto do CTA que a
    // prévia daquela versão do vídeo plugou (Final · v4 = o CTA na v4); num final falado, sobe quando a fala dele muda
    const sx = this.saidaAtual()
    if (sx && this.blocos?.some((b) => b.final)) {
      const infos = await Promise.all(vs.map((x) => json(`/projetos/${s}/versoes/v${x}/saidas/${encodeURIComponent(sx.id)}/info.json`, null)))
      const l = []
      vs.forEach((x, i) => {
        const f = infos[i]
        if (!f) return
        const a = f.cta ? `${f.cta}@${f.cta_versao}` : JSON.stringify([f.final, Math.round((f.duracao - f.corpo) * 4)])
        if (l.at(-1)?.a === a) l.at(-1).vs.push(x)
        else l.push({ bv: f.cta && f.cta_versao ? f.cta_versao : l.length + 1, a, vs: [x] })
      })
      if (l.length) this.versoesBloco.Final = l
    }
  }

  aprovarBloco(id) {
    const b = this.blocos.find((x) => x.id === id)
    b.def.aprovado = !b.def.aprovado
    aviso(b.def.aprovado ? `${id} finalizado: o Claude não mexe mais nele` : `${id} reaberto`)
    this.renderLista()
    this.renderMarcas()
    this.agendarSalvar()
  }

  alternarLoop(id) {
    const b = this.blocos.find((x) => x.id === id)
    this.loop = this.loop?.id === id ? null : b
    if (this.loop) {
      this.irAoBloco(b)
      this.video.play().catch(() => {})
    }
    this.renderLista()
    this.renderMarcas()
  }

  // ---------- as versões anteriores: o que já foi pedido e respondido em cada bloco (só para ler) ----------

  /** As revisões das versões antes desta (o histórico de cada bloco e os blocos que esta herda). */
  async carregarAnteriores() {
    this.anteriores = {}
    const s = encodeURIComponent(this.slug)
    const vs = this.proj.versoes.filter((x) => x < this.v)
    const revs = await Promise.all(vs.map((x) => json(`/projetos/${s}/revisoes/v${x}.json`, null)))
    vs.forEach((x, k) => revs[k] && (this.anteriores[x] = revs[k]))
  }

  /** Onde um comentário de outra versão cai nesta: pela palavra em que ele foi feito (os ids da transcrição não mudam
   *  entre as versões); se ela foi cortada, a próxima que ficou. */
  ondeAgora(c) {
    if (c.geral) return { t: null, fim: null }
    let w = c.palavra ? this.palavras.find((x) => x.id === c.palavra) : null
    if (!w && c.palavra) w = this.palavras.find((x) => x.id > c.palavra) || this.palavras.at(-1)
    const t = w ? w.ini : Math.min(c.t || 0, this.dur)
    return { t, fim: c.fim != null ? Math.min(t + (c.fim - c.t), this.dur) : null }
  }

  /** As versões anteriores de um bloco: em cada uma, os comentários que caíram nele e a resposta do Claude. */
  /** A versão do bloco num vídeo (a numeração do seletor de cima: só sobe quando o bloco mudou). */
  versaoDoBloco(id, x) {
    return this.versoesBloco?.[id]?.find((g) => g.vs.includes(x))?.bv ?? null
  }

  /** Os comentários das versões anteriores do vídeo que caem no bloco, separados pela versão do bloco: os feitos sobre
   *  o conteúdo que ele ainda tem (`atuais`: o bloco não mudou desde então) e os de versões anteriores dele (`antigos`,
   *  {bv: [{x, c}]}). Sem as versões dos blocos carregadas, tudo vai para os antigos, pela versão do vídeo. */
  comentariosAntigos(b) {
    const aqui = this.versaoDoBloco(b.id, this.v)
    const atuais = []
    const antigos = {}
    for (const x of Object.keys(this.anteriores).map(Number)) {
      for (const c of this.anteriores[x].comentarios || []) {
        if (!temConteudo(c) || c.geral || !this.visivel(c) || this.blocoEm(this.ondeAgora(c).t)?.id !== b.id) continue
        const bv = this.versaoDoBloco(b.id, x)
        if (aqui != null && bv === aqui) atuais.push({ x, c })
        else (antigos[bv ?? `vídeo ${x}`] ||= []).push({ x, c })
      }
    }
    return { atuais, antigos }
  }

  htmlVelho({ c }) {
    const o = this.ondeAgora(c) // o tempo de lá levado para esta versão (pela palavra)
    return `<div class="item-velho"><div class="item-velho-cabeca"><button class="chip-tempo" data-ir-velho="${o.t}" title="Ir a este ponto">${quando(o)}</button>${dataComentario(c)}</div>
      <p class="texto">${esc(c.texto || '(só o print)')}</p>${this.htmlResposta(c)}</div>`
  }

  /** As versões anteriores de um bloco (pela versão do bloco, como no seletor de cima): o que foi pedido e a resposta. */
  htmlHistoricoBloco(b) {
    const { antigos } = this.comentariosAntigos(b)
    const grupos = Object.entries(antigos).sort(([a], [z]) => (parseInt(z) || 0) - (parseInt(a) || 0))
    if (!grupos.length) return ''
    return `<div class="historico-bloco"><span class="eyebrow">Versões anteriores do ${b.id}</span>${grupos.map(([bv, l], k) => `<details class="versao-bloco"${k === 0 ? ' open' : ''}>
        <summary><b>${/^\d+$/.test(bv) ? `${b.id} · v${bv}` : bv}</b> · ${l.length} ${l.length === 1 ? 'comentário' : 'comentários'}</summary>
        ${l.sort((a, z) => a.c.t - z.c.t).map((it) => this.htmlVelho(it)).join('')}</details>`).join('')}</div>`
  }

  // ---------- o provador de look (LUT, intensidade e vinheta do ator; servidor.py, render.py amostra-look) ----------

  /** O provador de look num modal: as opções à esquerda, as duas amostras (o atual e o testado) grandes ao lado. */
  async abrirLook() {
    this.video.pause()
    const d = await json(`/api/projetos/${encodeURIComponent(this.slug)}/look`, null)
    if (!d) return aviso('Não consegui ler o look do projeto', 'erro')
    const { el, fechar } = janela('<div class="look-modal"></div>', { classe: 'janela-look', aoFechar: () => clearInterval(this.relogioRender) })
    this.lk = { el, fechar, atual: d.look, teste: { ...d.look }, luts: d.luts, vinhetas: d.vinhetas, nitidezes: d.nitidezes || ['sem'], renderizando: d.renderizando, t: this.video.currentTime }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-look]')
      if (!b) return
      const [campo, valor] = b.dataset.look.split(':')
      if (campo === 'aplicar') return this.aplicarLook()
      this.lk.teste[campo] = valor === '-' ? null : valor
      this.renderLook()
      this.provarLook(this.lk.t)
    })
    el.addEventListener('change', (e) => {
      if (!e.target.matches('[data-look-intensidade]')) return
      this.lk.teste.intensidade = +e.target.value / 100
      this.renderLook()
      this.provarLook(this.lk.t)
    })
    this.renderLook()
    this.provarLook(this.lk.t)
    if (d.renderizando) this.esperarRender()
  }

  renderLook() {
    const lk = this.lk
    const igual = JSON.stringify(lk.teste) === JSON.stringify(lk.atual)
    const pilula = (campo, valor, nome) => `<button class="pilula pequena${(lk.teste[campo] ?? '-') === valor ? ' ativa' : ''}" data-look="${campo}:${valor}">${esc(nome)}</button>`
    const nomeV = { sem: 'Sem', leve: 'Leve', normal: 'Normal', forte: 'Forte', mais: 'Mais' }
    lk.teste.nitidez ??= 'sem'
    lk.atual.nitidez ??= 'sem'
    if (!lk.el?.isConnected) return
    $('.look-modal', lk.el).innerHTML = `<header class="janela-cabeca"><h2>Look do ator</h2><span class="dica">em ${tempo(lk.t)} · 3 s do bruto, sem inserts nem legenda</span>
        <button class="botao-icone" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button></header>
      <div class="look-corpo"><div class="look-opcoes">
      <div class="look-linha"><span class="dica">LUT</span>${pilula('lut', '-', 'Sem')}${Object.entries(lk.luts).map(([id, nome]) => pilula('lut', id, nome)).join('')}</div>
      <label class="look-linha"><span class="dica">Intensidade</span><input type="range" min="0" max="100" step="5" value="${Math.round((lk.teste.intensidade ?? 1) * 100)}" data-look-intensidade ${lk.teste.lut ? '' : 'disabled'}><b>${Math.round((lk.teste.intensidade ?? 1) * 100)}%</b></label>
      <div class="look-linha"><span class="dica">Vinheta</span>${lk.vinhetas.map((v) => pilula('vinheta', v, nomeV[v] || v)).join('')}</div>
      <div class="look-linha"><span class="dica">Nitidez</span>${lk.nitidezes.map((v) => pilula('nitidez', v, nomeV[v] || v)).join('')}</div>
      <div class="look-acoes"><button class="botao pequeno botao-coral" data-look="aplicar" ${igual || lk.renderizando ? 'disabled' : ''} title="Grava o look no projeto e renderiza a próxima versão (~1 min)">${lk.renderizando ? 'Renderizando…' : `Aplicar · v${this.proj.ultima + 1}`}</button></div></div>
        <div class="look-amostras">${['atual', 'teste'].map((k) => `<figure><video data-amostra="${k}" muted loop playsinline autoplay${lk.amostras?.[k] ? ` src="${lk.amostras[k]}"` : ''}></video><figcaption>${k === 'atual' ? 'Atual' : 'Testando'}</figcaption></figure>`).join('')}</div></div>`
  }

  async provarLook(t) {
    const lk = this.lk
    lk.t = t
    const vez = (lk.vez = (lk.vez || 0) + 1)
    const pedir = (look) => enviar('POST', `/api/projetos/${encodeURIComponent(this.slug)}/look/amostra`, { t, ...look }).then((r) => r.video)
    const amostras = () => $$('[data-amostra]', lk.el)
    for (const v of amostras()) v.closest('figure').classList.add('carregando')
    try {
      const [atual, teste] = await Promise.all([pedir(lk.atual), pedir(lk.teste)])
      if (vez !== lk.vez || this.fechado) return
      lk.amostras = { atual, teste }
      for (const [k, src] of Object.entries(lk.amostras)) {
        const v = $(`[data-amostra="${k}"]`, lk.el)
        if (v) v.src = src
      }
    } catch (e) {
      aviso(e.message, 'erro')
    } finally {
      for (const v of amostras()) v.closest('figure').classList.remove('carregando')
    }
  }

  async aplicarLook() {
    const lk = this.lk
    try {
      await enviar('PUT', `/api/projetos/${encodeURIComponent(this.slug)}/look`, lk.teste)
      lk.atual = { ...lk.teste }
      lk.renderizando = true
      this.renderLook()
      aviso('Renderizando com o look novo: aparece aqui quando ficar pronto')
      this.esperarRender()
    } catch (e) {
      aviso(e.message, 'erro')
    }
  }

  /** Enquanto o render do look roda, o botão fica em "Renderizando…" (a versão nova, quando chega, o `verDisco` avisa). */
  esperarRender() {
    clearInterval(this.relogioRender)
    this.relogioRender = setInterval(async () => {
      if (this.fechado) return clearInterval(this.relogioRender)
      const d = await json(`/api/projetos/${encodeURIComponent(this.slug)}/look`, null)
      if (d && !d.renderizando) {
        clearInterval(this.relogioRender)
        this.lk.renderizando = false
        this.renderLook()
      }
    }, 3000)
  }

  // ---------- a música (a faixa e o volume do fundo; servidor.py musica, render.py musica/remixar) ----------
  // O vídeo fica mudo e toca o áudio da versão sem a música, com a faixa por cima pelo Web Audio, como a mistura do render
  // (audio.filtros_fundo): o nível base, o ducking nas falas, as voltas do laço com crossfade e o fade no fim. Trocar a
  // faixa ou o volume soa na hora; Salvar grava no projeto (travada para o Claude) e põe a música no proxy.

  async abrirMusica() {
    const el = $('#musica')
    if (!this.ctxMusica) { // criado no clique: o Safari (iPad) só deixa o Web Audio tocar se ele nasce num toque
      this.ctxMusica = new AudioContext()
      this.ctxMusica.resume()
      if (navigator.audioSession) navigator.audioSession.type = 'playback' // o iPhone/iPad no silencioso não cala o Web Audio
    }
    if (this.mu?.aberto) {
      this.mu.aberto = false
      el.hidden = true
      return
    }
    el.hidden = false
    if (!this.mu) {
      el.innerHTML = '<span class="eyebrow">Música</span><p class="dica">Preparando o áudio sem a música…</p>'
      try {
        // numa saída, a mistura dela (a falada, a própria; a de CTA, corpo e CTA com uma trilha só)
        const sid = this.dir === this.base ? null : this.saidaId
        const d = await enviar('GET', `/api/projetos/${encodeURIComponent(this.slug)}/musica/v${this.v}${sid ? `?saida=${encodeURIComponent(sid)}` : ''}`)
        d.aoVivo = !!d.sem_musica && !d.fundo_mudo
        this.mu = { d, fundo: d.fundo, nivel: d.nivel, salvo: { fundo: d.fundo, nivel: d.nivel }, buffers: {}, fontes: [], estado: d.remixando ? 'pondo' : '' }
      } catch (e) {
        el.innerHTML = `<span class="eyebrow">Música</span><p class="dica">${esc(e.message)}</p>`
        return
      }
      this.mu.aoVivo = this.mu.d.aoVivo
      if (this.mu.aoVivo) this.ligarMusica()
      if (this.mu.estado === 'pondo') this.esperarRemix()
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-musica]')
        if (!b) return
        const v = b.dataset.musica
        if (v === 'fechar') return this.abrirMusica()
        if (v === 'salvar') return this.salvarMusica()
        if (v === 'padrao') return this.volumeMusica(0)
        this.mu.fundo = v === '-' ? null : v
        this.renderMusica()
        this.tocarMusica()
      })
      el.addEventListener('input', (e) => e.target.matches('[data-musica-nivel]') && this.volumeMusica(+e.target.value))
    }
    this.mu.aberto = true
    this.renderMusica()
  }

  renderMusica() {
    const mu = this.mu
    const el = $('#musica')
    if (!mu || !el) return
    const mudou = mu.fundo !== mu.salvo.fundo || mu.nivel !== mu.salvo.nivel
    const linha = (id, nome, clima) => `<button class="musica-faixa${(mu.fundo ?? '-') === id ? ' ativa' : ''}" data-musica="${esc(id)}">
        <b>${esc(nome)}</b>${clima ? `<span>${esc(clima)}</span>` : ''}${id !== '-' && id === mu.d.na_versao ? '<i title="A que está no vídeo desta versão">no vídeo</i>' : ''}</button>`
    const estado = mu.estado === 'pondo' ? 'Pondo a música no vídeo…' : mu.estado === 'pronto' ? 'Salvo, e já no vídeo' : mu.estado === 'proxima' ? 'Salvo: entra na próxima versão' : mudou ? '' : mu.d.travada ? 'Escolhida por você' : ''
    el.innerHTML = `<div class="musica-cabeca"><span class="eyebrow">Música</span><button class="botao-icone pequeno" data-musica="fechar" title="Fechar">${ICONE.fechar}</button></div>
      <div class="musica-faixas">${linha('-', 'Sem música', '')}${mu.d.faixas.map((f) => linha(f.id, f.nome, f.clima)).join('')}</div>
      <label class="musica-volume"><span class="dica">Volume</span><input type="range" min="-12" max="6" step="0.5" value="${mu.nivel}" data-musica-nivel ${mu.fundo ? '' : 'disabled'}>
        <b>${mu.nivel > 0 ? '+' : ''}${num(mu.nivel, mu.nivel % 1 ? 1 : 0)} dB</b></label>
      <button class="botao-link" data-musica="padrao" ${mu.nivel ? '' : 'hidden'}>Voltar ao padrão (0 dB)</button>
      <div class="musica-acoes"><span class="dica">${esc(estado)}</span><button class="botao pequeno botao-coral" data-musica="salvar" ${mudou && mu.estado !== 'salvando' ? '' : 'disabled'}>Salvar</button></div>
      <p class="dica">${mu.aoVivo ? 'Toque o vídeo para ouvir: a troca soa na hora.' : (mu.d.fundo_mudo ? 'Este vídeo toca sem música própria (a de quem vem antes dele).' : 'Esta saída é de antes da prévia ao vivo: escolha no corpo, ou salve e ela pega a música na próxima versão.')}</p>`
  }

  volumeMusica(nivel) {
    const mu = this.mu
    mu.nivel = nivel
    if (mu.ctx) mu.nivelNo.gain.setTargetAtTime(10 ** (nivel / 20), mu.ctx.currentTime, 0.03)
    const el = $('#musica')
    if (!$('[data-musica-nivel]', el)) return
    $('[data-musica-nivel]', el).value = nivel
    $('.musica-volume b', el).textContent = `${nivel > 0 ? '+' : ''}${num(nivel, nivel % 1 ? 1 : 0)} dB`
    $('[data-musica="padrao"]', el).hidden = !nivel
    $('[data-musica="salvar"]', el).disabled = mu.fundo === mu.salvo.fundo && nivel === mu.salvo.nivel
  }

  async salvarMusica() {
    const mu = this.mu
    mu.estado = 'salvando'
    this.renderMusica()
    try {
      const r = await enviar('PUT', `/api/projetos/${encodeURIComponent(this.slug)}/musica/v${this.v}`, { fundo: mu.fundo, nivel: mu.nivel })
      mu.salvo = { fundo: mu.fundo, nivel: mu.nivel }
      mu.d.travada = true
      mu.estado = r.remixando ? 'pondo' : 'proxima'
      if (r.aviso) aviso(r.aviso)
      if (r.remixando) this.esperarRemix()
    } catch (e) {
      mu.estado = ''
      aviso(e.message, 'erro')
    }
    this.renderMusica()
  }

  /** Enquanto a música entra no proxy (alguns segundos), o painel diz; pronto, a versão passa a ter essa faixa. */
  esperarRemix() {
    clearInterval(this.relogioMusica)
    this.relogioMusica = setInterval(async () => {
      if (this.fechado) return clearInterval(this.relogioMusica)
      const d = await json(`/api/projetos/${encodeURIComponent(this.slug)}/musica/v${this.v}?estado=1`, null)
      if (d && !d.remixando) {
        clearInterval(this.relogioMusica)
        this.mu.estado = 'pronto'
        this.mu.d.na_versao = this.mu.salvo.fundo
        this.renderMusica()
      }
    }, 2000)
  }

  /** O modo ao vivo: o vídeo mudo; a voz sem música e a faixa tocam pelo Web Audio, agendadas no mesmo relógio a partir
   *  do instante do vídeo (de novo a cada play, pulo, troca de velocidade ou quando o vídeo escorrega mais de 0,15 s). */
  ligarMusica() {
    const mu = this.mu
    const v = this.video
    mu.ctx = this.ctxMusica
    mu.nivelNo = mu.ctx.createGain()
    mu.nivelNo.gain.value = 10 ** (mu.nivel / 20)
    mu.nivelNo.connect(mu.ctx.destination)
    mu.bufVoz = fetch(mu.d.sem_musica).then((r) => r.arrayBuffer()).then((b) => mu.ctx.decodeAudioData(b))
    v.muted = true
    const tocar = () => {
      mu.ctx.resume()
      this.tocarMusica()
    }
    const parar = () => this.pararMusica()
    const conferir = () => {
      if (v.paused || !mu.relogio) return
      const esperado = mu.relogio.t0 + (mu.ctx.currentTime - mu.relogio.quando) * mu.relogio.rate
      if (Math.abs(esperado - v.currentTime) > 0.15) this.tocarMusica()
    }
    mu.eventos = { playing: tocar, pause: parar, waiting: parar, seeking: parar, seeked: () => !v.paused && tocar(), ratechange: () => !v.paused && tocar(),
      timeupdate: conferir, ended: parar }
    for (const [ev, f] of Object.entries(mu.eventos)) v.addEventListener(ev, f)
    if (!v.paused) tocar()
  }

  desligarMusica() {
    const mu = this.mu
    clearInterval(this.relogioMusica)
    this.ctxMusica?.close()
    if (!mu?.eventos) return
    for (const [ev, f] of Object.entries(mu.eventos)) this.video.removeEventListener(ev, f)
    this.video.muted = false
  }

  pararMusica() {
    for (const f of this.mu?.fontes || []) {
      try {
        f.stop?.()
      } catch {}
      f.disconnect()
    }
    if (this.mu) Object.assign(this.mu, { fontes: [], relogio: null })
  }

  async bufferMusica(id) {
    const mu = this.mu
    if (!mu.buffers[id]) {
      const f = mu.d.faixas.find((x) => x.id === id)
      mu.buffers[id] = fetch(f.url).then((r) => r.arrayBuffer()).then((b) => mu.ctx.decodeAudioData(b))
    }
    return mu.buffers[id]
  }

  /** A voz sem música e a faixa a partir do instante do vídeo: as voltas do laço (`audio.voltas_do_fundo`), cada uma
   *  com o seu crossfade, e o ganho da faixa no tempo (o nível base, o ducking das falas, o fade no fim) numa curva só. */
  async tocarMusica() {
    const mu = this.mu
    if (!mu?.ctx) return
    this.pararMusica()
    const v = this.video
    if (v.paused) return
    const pedido = (mu.pedido = (mu.pedido || 0) + 1)
    const id = mu.fundo
    const [bufVoz, buf] = await Promise.all([mu.bufVoz, id ? this.bufferMusica(id) : null])
    if (pedido !== mu.pedido || v.paused || mu.fundo !== id) return
    const d = mu.d
    const ctx = mu.ctx
    const rate = v.playbackRate
    const t0 = v.currentTime
    const quando = ctx.currentTime + 0.03
    const fimV = d.duracao
    if (t0 >= fimV - 0.05) return
    const voz = ctx.createBufferSource()
    voz.buffer = bufVoz
    voz.playbackRate.value = rate
    voz.connect(ctx.destination)
    voz.start(quando, t0)
    mu.fontes = [voz]
    mu.relogio = { t0, quando, rate }
    if (!id) return
    const f = d.faixas.find((x) => x.id === id)
    const [ini, fimL0] = f.laco
    const fimL = Math.min(fimL0, buf.duration)
    const desde = ini + (d.continua || 0)
    const cruza = Math.min(d.cruza, (fimL - ini) / 2)
    // as voltas no tempo da faixa emendada: a 1ª de 0 a fimL, as outras de ini a fimL, cada uma cruzando a anterior
    const voltas = []
    for (let S = 0, k = 0; S < desde + fimV; k++) {
      const de = k ? ini : 0
      voltas.push({ S, de, L: fimL - de })
      S += fimL - de - cruza
      if (fimL - de - cruza <= 0) break
    }
    // o ganho no tempo do vídeo: base + ducking + fade (dB → linear)
    const sobe = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x) }
    const baixo = 1 - 10 ** (-d.ducking_db / 20)
    const ganho = (t) => {
      let soma = 0
      for (const [a, b] of d.falas) {
        if (t < a - d.subida || t > b + d.descida) continue
        soma += Math.min(sobe((t - (a - d.subida)) / d.subida), sobe((b + d.descida - t) / d.descida))
      }
      const fade = d.fade_fim ? Math.min(Math.max((fimV - t) / d.fade, 0), 1) : 1
      return 10 ** (d.base_db / 20) * (1 - baixo * Math.min(soma, 1)) * fade
    }
    const passo = 1 / 30
    const n = Math.max(2, Math.ceil((fimV - t0) / passo) + 1)
    const curva = new Float32Array(n)
    for (let k = 0; k < n; k++) curva[k] = ganho(Math.min(t0 + k * passo, fimV))
    const g = ctx.createGain()
    g.gain.setValueCurveAtTime(curva, quando, (n - 1) * passo / rate)
    g.connect(mu.nivelNo)
    const T0 = desde + t0
    const T1 = desde + fimV
    const fontes = mu.fontes
    fontes.push(g)
    voltas.forEach((vt, k) => {
      const fimV_ = vt.S + vt.L
      if (fimV_ <= T0 || vt.S >= T1) return
      const a = Math.max(vt.S, T0)
      const b = Math.min(fimV_, T1)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = rate
      const sg = ctx.createGain()
      // o crossfade de potência constante (o qsin do acrossfade): entra na volta k, sai antes da k+1
      const m = Math.max(2, Math.ceil((b - a) * 60) + 1)
      const cv = new Float32Array(m)
      for (let i = 0; i < m; i++) {
        const T = a + (b - a) * i / (m - 1)
        const entra = k ? Math.sin(Math.PI / 2 * Math.min(Math.max((T - vt.S) / cruza, 0), 1)) : 1
        const sai = k < voltas.length - 1 ? Math.cos(Math.PI / 2 * Math.min(Math.max((T - (fimV_ - cruza)) / cruza, 0), 1)) : 1
        cv[i] = entra * sai
      }
      const em = quando + (a - T0) / rate
      sg.gain.setValueCurveAtTime(cv, em, (b - a) / rate)
      src.connect(sg).connect(g)
      src.start(em, vt.de + (a - vt.S), b - a)
      fontes.push(src, sg)
    })
  }

  // ---------- a tela ----------

  montar() {
    abrirAba(this.slug, this.proj.nome) // o nome do projeto fica na aba; a versão, logo ao lado dela na barra
    carregarCategorias().then((cats) => {
      this.ehCta = categoriaCta(cats, this.proj.formato || CATEGORIA_PADRAO)
      abrirAba(this.slug, this.proj.nome, this.ehCta) // o ícone: projeto ou CTA
      this.renderSaidas()
    })
    $('#barra-versao').innerHTML = '<div class="seletor-versao" id="versoes"></div><span class="aviso-versao" id="aviso-versao"></span>'
    this.tela.className = 'pagina-revisao'
    this.tela.innerHTML = `<div class="revisao">
      <section class="palco">
        <div class="lado lado-esq">
          <div class="bloco"><span class="eyebrow">Plano agora</span><div id="plano-atual" class="plano-atual"></div></div>
          <div class="bloco"><span class="eyebrow">Fala</span><p id="fala-atual" class="fala-atual"></p></div>
        </div>
        <div class="video-caixa"><video id="video" src="${this.dir}proxy.mp4" preload="auto" playsinline></video>
          <button class="video-tocar" data-acao="tocar" aria-label="Tocar">${ICONE.tocar}</button>
          <button class="botao-icone video-tela-cheia" data-acao="tela-cheia" title="Tela cheia (F)" aria-label="Tela cheia">${ICONE.expandir}</button></div>
        <div class="lado lado-dir">
          <div class="bloco" id="usado"></div>
        </div>
      </section>
      <div class="controles">
        <div class="grupo">
          <button class="botao-icone" data-acao="corte-" title="O corte anterior (Shift+←)">${ICONE.segAntes}</button>
          <button class="botao-icone" data-acao="quadro-" title="−1 quadro (←)">${ICONE.quadroAntes}</button>
          <button class="botao-icone botao-tocar" data-acao="tocar" id="b-tocar" title="Tocar / pausar (Espaço)">${ICONE.tocar}</button>
          <button class="botao-icone" data-acao="quadro+" title="+1 quadro (→)">${ICONE.quadroDepois}</button>
          <button class="botao-icone" data-acao="corte+" title="O próximo corte (Shift+→)">${ICONE.segDepois}</button>
          <span class="tempo"><b id="t-atual">0:00,0</b> / <span id="t-total">${tempo(this.dur)}</span></span>
        </div>
        <div class="grupo velocidades">${VELOCIDADES.map((x) => `<button class="pilula pequena${x === 1 ? ' ativa' : ''}" data-vel="${x}">${num(x, x % 1 ? 1 : 0)}×</button>`).join('')}</div>
        <div class="grupo">
          <span class="musica-ancora"><button class="botao" data-acao="musica" title="Escolher a música de fundo e o volume, ouvindo na hora">${ICONE.som} Música</button>
            <div class="bloco musica" id="musica" hidden></div></span>
          <button class="botao" data-acao="look" title="Testar LUT, intensidade e vinheta do ator">${ICONE.ajustes} Look</button>
          <button class="botao" data-acao="entrada" id="b-entrada">Entrada <kbd>I</kbd></button>
          <button class="botao" data-acao="saida">Saída <kbd>O</kbd></button>
        </div>
      </div>
      <section class="linha">
        ${barraDaLinha(ATALHOS())}
        <div class="linha-rotulos"><span class="r-regua"></span>${this.blocos ? '<span title="Os blocos de ~30 s: revise, aprove e mande um de cada vez">Blocos</span>' : ''}<span class="r-planos">Planos</span><span>Fala</span><span>Você</span></div>
        <div class="linha-rolo" id="rolo"><div class="linha-conteudo" id="conteudo">
          <div class="regua" id="regua"></div>
          ${this.blocos ? '<div class="faixa faixa-blocos" id="f-blocos"></div>' : ''}
          <div class="faixa faixa-planos" id="f-planos"></div>
          <div class="faixa faixa-palavras" id="f-palavras"></div>
          <div class="faixa faixa-comentarios" id="f-comentarios"></div>
          <div id="divisas"></div>
          <div id="novidades"></div>
          <div id="io"></div>
          <div class="cabeca" id="cabeca"></div>
        </div></div>
      </section>
      <aside class="painel">
        <div class="painel-cabeca"><div class="painel-titulo"><span class="resumo" id="resumo"></span><span class="salvo" id="salvo"></span></div>
          <button class="botao botao-coral" data-acao="aprovar" id="b-aprovar" title="Aprovar o vídeo todo: o Claude exporta o final em 4K">Aprovar</button></div>
        <div class="seletor-saida" id="saidas"></div>
        <div id="estado"></div>
        <div class="lista" id="lista"></div>

        <div class="caixa-nova" id="caixa-nova">
          <div class="item-cabeca"><span class="eyebrow" id="nova-rotulo">Comentar em</span><button class="chip-tempo chip-alternar" data-acao="alternar-tempo" id="nova-quando" title="Desligar o tempo: vira um comentário geral (C)">0:00,0</button>
            <button class="botao-icone pequeno" data-acao="soltar" id="nova-soltar" hidden title="Soltar: a caixa volta a acompanhar o vídeo">${ICONE.fechar}</button></div>
          <textarea id="nova-texto" rows="3" placeholder="O que mudar aqui? Ao escrever, o vídeo pausa e o comentário fica neste instante."></textarea>
          <div id="nova-anexos"></div>
          <div class="editor-acoes">${clipe('nova')}<span class="dica">Enter grava · Shift+Enter quebra a linha · ⌘V cola print ou vídeo</span>
            <button class="botao pequeno botao-coral" data-acao="salvar-nova">Comentar</button></div></div>
      </aside>
    </div>`
    this.video = $('#video')
    this.renderVersoes()
    this.renderEstado()
    this.renderLista()
    this.renderLinha()
  }

  /** A caixa do comentário novo: o instante (acompanha o vídeo até começar a escrever; com I e O, o trecho). */
  quandoNova() {
    const n = this.nova
    if (n.geral) return { geral: true, t: null, fim: null }
    if (n.preso) return { t: n.t, fim: n.fim }
    const t = this.video.currentTime
    if (this.entrada != null) {
      const [a, b] = [Math.min(this.entrada, t), Math.max(this.entrada, t)]
      return { t: a, fim: b - a < 0.05 ? null : b }
    }
    return { t, fim: null }
  }

  renderNova() {
    const q = this.quandoNova()
    const rotulo = quando(q)
    if (rotulo !== this.rotuloNova || this.nova.preso !== this.presoNova) {
      this.rotuloNova = rotulo
      this.presoNova = this.nova.preso
      const geral = !!q.geral
      const chip = $('#nova-quando')
      chip.innerHTML = geral ? `<s>${tempo(this.video?.currentTime || 0)}</s> sem tempo` : rotulo
      chip.classList.toggle('desligado', geral)
      chip.title = geral ? 'Religar o tempo: o comentário fica no instante do vídeo (C)' : 'Desligar o tempo: vira um comentário geral (C)'
      $('#nova-rotulo').textContent = geral ? 'Comentário geral' : this.nova.preso ? 'Comentário em' : 'Comentar em'
      $('#nova-soltar').hidden = geral || !this.nova.preso
      $('#caixa-nova').classList.toggle('presa', this.nova.preso && !geral)
      $('#caixa-nova').classList.toggle('geral', geral)
      $('#nova-texto').placeholder = geral ? 'Sobre o vídeo todo (ex.: legenda um pouco mais baixa).' : 'O que mudar aqui? Ao escrever, o vídeo pausa e o comentário fica neste instante.'
    }
  }

  renderNovaAnexos() {
    $('#nova-anexos').innerHTML = this.htmlAnexos(this.nova.anexos, 'nova')
  }

  /** Começou a escrever (ou anexou): pausa o vídeo e prende o comentário no instante (ou no trecho de I a agora). */
  prenderNova() {
    if (this.nova.preso || this.nova.geral) return
    this.video.pause()
    Object.assign(this.nova, this.quandoNova(), { preso: true })
    this.entrada = null
    this.renderNova()
    this.renderMarcas()
  }

  /** O tempo da caixa: desligado, o comentário é geral (sobre o vídeo todo); religado, volta a seguir o vídeo. */
  alternarTempo(foco = false) {
    this.nova.geral = !this.nova.geral
    this.nova.preso = false
    this.nova.fim = null
    this.entrada = null
    this.rotuloNova = null
    this.renderNova()
    this.renderMarcas()
    if (!this.nova.geral && $('#nova-texto').value.trim()) this.prenderNova() // religou com texto: fica no instante
    if (foco || this.nova.geral) $('#nova-texto').focus()
  }

  /** A caixa volta a acompanhar o vídeo (o texto escrito fica). */
  soltarNova() {
    this.nova.preso = false
    this.nova.fim = null
    this.entrada = null
    this.renderNova()
    this.renderMarcas()
  }

  salvarNova() {
    const campo = $('#nova-texto')
    const texto = campo.value.trim()
    const n = this.nova
    if (!texto && !n.anexos.length) return
    const q = this.quandoNova()
    const c = this.novoComentario({ ...q, novoId: n.novoId, anexos: n.anexos }, texto)
    this.rev.comentarios.push(c)
    const b = c.geral ? null : this.blocoEm(c.t)
    if (b?.def.aprovado) {
      b.def.aprovado = false
      aviso(`${b.id} estava finalizado: com o comentário, ele volta a ficar aberto`)
    }
    this.sel = c.id
    this.nova = { preso: false, geral: false, t: 0, fim: null, anexos: [], novoId: null }
    this.entrada = null
    this.rotuloNova = null
    campo.value = ''
    crescer(campo)
    this.renderNovaAnexos()
    this.renderNova()
    this.renderLista()
    this.renderMarcas()
    this.agendarSalvar()
  }

  /** O seletor de saída (corpo + final): trocar troca o vídeo e o bloco Final; ao lado, aprovar a saída e o + Saída. */
  renderSaidas() {
    const el = $('#saidas')
    if (!el) return
    if (this.ehCta) return void (el.innerHTML = '') // um CTA não tem saídas: ele é o final das dos outros
    const sx = this.saidaAtual()
    const rotulo = (x) => `${esc(x.destino)}${x.aprovado ? ' ✓' : ''}`
    el.innerHTML = `${this.saidas.length ? `<label class="cta-categoria escolha-saida" title="A saída: o corpo seguido do final dela">
        <span>${sx ? `Saída · ${rotulo(sx)}` : 'Só o corpo'}</span>${ICONE.seta_baixo}
        <select data-trocar-saida aria-label="Saída">${this.saidas.map((x) => `<option value="${esc(x.id)}"${x.id === this.saidaId ? ' selected' : ''}${x.info || x.tipo === 'nenhum' ? '' : ' disabled'}>${rotulo(x)}${x.tipo === 'nenhum' ? ' (o corpo)' : x.info ? '' : x.gerando ? ' (gerando a prévia…)' : ' (na próxima versão)'}</option>`).join('')}
          <option value=""${this.saidaId ? '' : ' selected'}>Só o corpo</option></select></label>` : ''}
      ${sx ? `<button class="botao pequeno aprovar-saida${sx.aprovado ? ' feito' : ''}" data-aprovar-saida="${esc(sx.id)}" title="${sx.aprovado ? 'Saída aprovada · clique para desaprovar' : 'Aprovar só esta saída: o Claude exporta ela'}">${ICONE.check} ${sx.aprovado ? 'Saída aprovada' : 'Aprovar saída'}</button>` : ''}
      ${sx ? `<button class="botao-icone pequeno" data-tirar-saida="${esc(sx.id)}" title="Remover a saída ${esc(sx.destino)}" aria-label="Remover a saída ${esc(sx.destino)}">${ICONE.lixo}</button>` : ''}
      <button class="botao pequeno" data-nova-saida title="Uma saída nova com um CTA gravado à parte (os finais falados, peça ao Claude)">${ICONE.mais} Saída</button>`
  }

  /** Trocar a saída aberta: o vídeo, as palavras e os planos dela (o tempo fica, dentro do que existe). */
  async trocarSaida(id) {
    preferencia(`saida.${this.slug}`, null, id || null)
    this.saidaId = id || null
    if (this.mu) { // a música ao vivo é da mistura de cada saída: reabrir o painel prepara a da nova
      this.desligarMusica()
      this.mu = this.ctxMusica = null
      $('#musica').hidden = true
    }
    this.versoesBloco = null // as versões do Final são da saída: refeitas para a nova (o que já foi lido fica em memória)
    this.dir = this.saidaAtual()?.info ? `${this.base}saidas/${this.saidaId}/` : this.base // a sem final é o próprio corpo
    const t = this.video.currentTime
    const [palavras, planos, info] = await Promise.all([json(this.dir + 'palavras.json', []), json(this.dir + 'planos.json', []), json(this.dir + 'info.json', {})])
    this.palavras = listaDe(palavras, 'palavras').slice().sort((a, b) => a.ini - b.ini)
    this.planos = listaDe(planos, 'planos')
    this.info = info || {}
    this.dur = this.info.duracao || this.palavras.at(-1)?.fim || this.dur
    this.video.src = `${this.dir}proxy.mp4`
    this.video.addEventListener('loadedmetadata', () => this.buscar(Math.min(t, this.dur - 0.05)), { once: true })
    if (this.blocoSel === 'Final' && !this.saidaId) this.blocoSel = null
    this.calcularBlocos()
    this.renderSaidas()
    this.renderLista()
    this.renderLinha()
  }

  /** Remover uma saída: some do projeto (as prévias e os arquivos já exportados ficam onde estão). */
  async tirarSaida(id) {
    const sx = this.saidas.find((x) => x.id === id)
    if (!(await confirmar({ titulo: `Remover a saída ${sx.destino}?`, texto: 'Ela sai do projeto. O arquivo que já foi exportado fica na pasta final.', ok: 'Remover', perigo: true }))) return
    try {
      await enviar('DELETE', `/api/projetos/${encodeURIComponent(this.slug)}/saidas/${encodeURIComponent(id)}`)
      this.saidas = this.saidas.filter((x) => x !== sx)
      aviso(`Saída ${sx.destino} removida`)
      await this.trocarSaida(this.saidas.find((x) => x.info || x.tipo === 'nenhum')?.id || '')
    } catch (e) {
      aviso(e.message, 'erro')
    }
  }

  /** Depois do + Saída: a lista na hora; a de CTA mostra "gerando a prévia" e abre sozinha quando ela fica pronta
   * (o servidor a monta em segundo plano, render.py --previa-saida); a sem final abre já (é o corpo). */
  async saidasNovas(lista, destinos) {
    const antes = new Map(this.saidas.map((x) => [x.id, x]))
    this.saidas = lista.map((x) => ({ ...x, info: antes.get(x.id)?.info || null }))
    const novas = this.saidas.filter((x) => destinos.includes(x.destino))
    if (!novas.length) return this.renderSaidas()
    const nomes = novas.map((x) => x.destino).join(', ')
    const ctas = novas.filter((x) => x.tipo === 'cta')
    for (const x of ctas) Object.assign(x, { info: null, gerando: true })
    if (!ctas.length) {
      aviso(`${novas.length > 1 ? 'Saídas criadas' : 'Saída criada'}: ${nomes}`)
      return this.trocarSaida(novas[0].id)
    }
    this.renderSaidas()
    aviso(`${novas.length > 1 ? 'Saídas criadas' : 'Saída criada'}: ${nomes}. Montando as prévias (uns segundos)`)
    let abriu = false
    for (let k = 0; k < 60 && !this.fechado && ctas.some((x) => x.gerando); k++) {
      await new Promise((r) => setTimeout(r, 3000))
      for (const x of ctas.filter((c) => c.gerando)) {
        const info = await json(`${this.base}saidas/${x.id}/info.json?${Date.now()}`, null)
        if (!info) continue
        Object.assign(x, { info, gerando: false })
        if (!abriu) {
          abriu = true
          await this.trocarSaida(x.id) // a primeira que fica pronta abre; as outras ficam no seletor
        } else this.renderSaidas()
      }
    }
    for (const x of ctas) x.gerando = false
    this.renderSaidas() // a que não ficou pronta (o CTA sem versão): entra no próximo render
  }

  async aprovarSaida(id) {
    const sx = this.saidas.find((x) => x.id === id)
    const ligar = !sx.aprovado
    // aprovar pede confirmação (o Claude exporta); clicar de novo desaprova direto (o arquivo já exportado fica)
    if (ligar && !(await confirmar({ titulo: `Aprovar a saída ${sx.destino}?`, texto: 'O Claude exporta só ela (o corpo e este final). O “Aprovado” vai para a área de transferência: cole no chat.', ok: 'Aprovar e copiar' }))) return
    try {
      await enviar('PUT', `/api/projetos/${encodeURIComponent(this.slug)}/saidas/${encodeURIComponent(id)}`, { aprovado: ligar })
      sx.aprovado = ligar
      if (ligar) await copiar(`Aprovado · ${this.slug} · saída ${sx.destino}`)
      aviso(ligar ? `Saída ${sx.destino} aprovada e copiada: cole no chat` : `Saída ${sx.destino} desaprovada`)
    } catch (e) {
      aviso(e.message, 'erro')
    }
    this.renderSaidas()
  }

  /** + Saída: um CTA gravado à parte (um projeto da página CTAs) ou o corpo puro, com o nome do destino. */
  /** + Saída: escolher um CTA aprovado (com as tags e o vídeo para tocar ali mesmo) e dar o nome do destino. */
  async novaSaida() {
    const [projetos, cats] = await Promise.all([json('/api/projetos', []), carregarCategorias()])
    // os mais usados nas saídas de ontem e de hoje em cima; empatados (ou ninguém usou nesses dias), os mais usados no
    // total; depois, pelo nome
    const h = new Date()
    const desde = new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1).getTime()
    const recentes = {}, total = {}
    for (const [cta, em] of projetos.flatMap((p) => p.usos_cta || [])) {
      total[cta] = (total[cta] || 0) + 1
      if (em && new Date(em).getTime() >= desde) recentes[cta] = (recentes[cta] || 0) + 1
    }
    const ctas = projetos.filter((p) => p.estado === 'aprovado' && !p.oculto && categoriaCta(cats, p.formato || CATEGORIA_PADRAO))
      .sort((a, b) => (recentes[b.slug] || 0) - (recentes[a.slug] || 0) || (total[b.slug] || 0) - (total[a.slug] || 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
    const tags = [...new Set(ctas.flatMap((p) => p.tags || []))].sort()
    // os escolhidos, na ordem do clique: slug do CTA ('' = nenhum, o corpo puro) → o destino (o nome da saída)
    const escolhidos = new Map()
    const nomeDe = (slug) => (slug ? ctas.find((p) => p.slug === slug)?.nome || slug : 'Só o corpo (sem CTA)')
    const destinoPadrao = (slug) => (slug ? nomeDe(slug).replace(/^\s*CTA\b[\s·:-]*/i, '').trim() || nomeDe(slug) : 'Só o corpo')
    let tag = ''
    const card = (p) => `<div class="cta-escolha" data-escolher-cta="${esc(p.slug)}" data-busca="${esc(`${p.nome} ${(p.tags || []).join(' ')}`.toLowerCase())}" data-tags="${esc((p.tags || []).join('|'))}">
        <div class="mini mini-916"><video muted playsinline preload="metadata" src="/projetos/${encodeURIComponent(p.slug || this.slug)}/versoes/v${p.ultima}/proxy.mp4#t=1.5"></video>
          <button type="button" class="tocar-card" data-tocar-cta title="Tocar com som (clique de novo para pausar)" aria-label="Tocar ${esc(p.nome)}">${ICONE.tocar}</button>
          ${p.duracao ? `<span class="duracao-mini">${mmss(p.duracao)}</span>` : ''}</div>
        <h3 title="${esc(p.nome)}">${esc(p.nome)}</h3>
        ${p.dica ? `<p class="dica">${esc(p.dica)}</p>` : ''}
        ${p.tags?.length ? `<div class="tags-cta">${p.tags.map((t) => `<button type="button" class="tag" data-filtrar-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}</div>`
    const { el, fechar } = janela(`<header class="janela-cabeca"><h2>Nova saída</h2><button class="botao-icone" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button></header>
      <form class="form-saida form-saida-ctas">
        <div class="filtros-cta"><input type="search" name="busca" placeholder="Buscar CTA por nome ou tag…" aria-label="Buscar CTA">
          ${tags.length ? `<div class="tags-cta">${tags.map((t) => `<button type="button" class="tag" data-filtrar-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}</div>
        <div class="grade-ctas">${card({ slug: '', nome: 'Só o corpo (sem CTA)', dica: 'O vídeo termina no corpo', ultima: this.v, duracao: this.proj?.duracao, tags: [] })}
          ${ctas.map(card).join('') || '<p class="dica">Nenhum CTA aprovado ainda (página CTAs).</p>'}</div>
        <div class="escolhidos-saida" id="escolhidos-saida"></div>
        <div class="pe-saida">
          <p class="dica">Escolha um ou vários CTAs (ou só o corpo, para o vídeo terminar sem CTA); cada um vira uma saída, com o nome do destino (LP, VSL, Isca…). Um final falado, peça ao Claude no chat.</p>
          <button class="botao pequeno botao-coral" disabled>Criar saída</button></div>
      </form>`, { classe: 'janela-ctas' })
    const form = $('form', el)
    const criar = $('.botao-coral', form)
    const tocar = (caixa, ligar) => {
      const v = $('video', caixa)
      if (ligar) {
        for (const outra of $$('.cta-escolha.tocando', el)) if (outra !== caixa) tocar(outra, false)
        if (!v.dataset.comecou || v.ended) v.currentTime = 0
        v.dataset.comecou = '1'
        v.muted = false
        v.play().catch(() => {})
      } else {
        v.muted = true
        v.pause()
      }
      caixa.classList.toggle('tocando', ligar)
      $('[data-tocar-cta]', caixa).innerHTML = ligar ? ICONE.pausar : ICONE.tocar
    }
    const filtrar = () => {
      const q = form.busca.value.trim().toLowerCase()
      for (const c of $$('.cta-escolha:not([data-escolher-cta=""])', el)) c.hidden = (q && !c.dataset.busca.includes(q)) || (tag && !c.dataset.tags.split('|').includes(tag))
      for (const b of $$('.filtros-cta [data-filtrar-tag]', el)) b.classList.toggle('ativa', b.dataset.filtrarTag === tag)
    }
    form.busca.addEventListener('input', filtrar)
    el.addEventListener('click', (e) => {
      const tc = e.target.closest('[data-tocar-cta]')
      if (tc) return tocar(tc.closest('.cta-escolha'), !tc.closest('.cta-escolha').classList.contains('tocando'))
      const ft = e.target.closest('[data-filtrar-tag]')
      if (ft) {
        tag = tag === ft.dataset.filtrarTag ? '' : ft.dataset.filtrarTag
        return filtrar()
      }
      const tira = e.target.closest('[data-tirar-escolhido]')
      const ec = tira ? null : e.target.closest('[data-escolher-cta]')
      if (!tira && !ec) return
      const slug = tira ? tira.dataset.tirarEscolhido : ec.dataset.escolherCta
      if (escolhidos.has(slug)) escolhidos.delete(slug)
      else escolhidos.set(slug, destinoPadrao(slug))
      desenharEscolhidos()
      if (!tira && escolhidos.has(slug)) $(`[data-destino="${CSS.escape(slug)}"]`, el)?.select()
    })
    // embaixo, um campo de destino por escolhido (já com um nome sugerido, a partir do nome do CTA)
    const desenharEscolhidos = () => {
      for (const x of $$('[data-escolher-cta]', el)) x.classList.toggle('escolhido', escolhidos.has(x.dataset.escolherCta))
      $('#escolhidos-saida', el).innerHTML = [...escolhidos].map(([slug, destino]) => `<div class="escolhido-saida">
          <span class="nome-escolhido" title="${esc(nomeDe(slug))}">${esc(nomeDe(slug))}</span><span class="seta-escolhido">→</span>
          <input data-destino="${esc(slug)}" value="${esc(destino)}" placeholder="Destino (LP, VSL, Isca…)" maxlength="60" required aria-label="Destino da saída com ${esc(nomeDe(slug))}">
          <button type="button" class="botao-icone pequeno" data-tirar-escolhido="${esc(slug)}" title="Tirar" aria-label="Tirar ${esc(nomeDe(slug))}">${ICONE.fechar}</button></div>`).join('')
      criar.disabled = !escolhidos.size
      criar.textContent = escolhidos.size > 1 ? `Criar ${escolhidos.size} saídas` : 'Criar saída'
    }
    el.addEventListener('input', (e) => {
      const d = e.target.closest('[data-destino]')
      if (d) escolhidos.set(d.dataset.destino, d.value)
    })
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const pedidos = [...escolhidos].map(([slug, destino]) => [slug, destino.trim()])
      if (!pedidos.length) return
      if (new Set(pedidos.map(([, d]) => d.toLowerCase())).size < pedidos.length) return aviso('Duas saídas com o mesmo destino: dê nomes diferentes.', 'erro')
      criar.disabled = true
      let r = null
      const feitos = []
      for (const [slug, destino] of pedidos) {
        try {
          r = await enviar('POST', `/api/projetos/${encodeURIComponent(this.slug)}/saidas`, slug ? { destino, cta: slug } : { destino, nenhum: true })
          feitos.push(destino)
          escolhidos.delete(slug)
        } catch (x) {
          aviso(`${destino}: ${x.message}`, 'erro')
        }
      }
      if (r) this.saidasNovas(r.saidas, feitos)
      if (escolhidos.size) desenharEscolhidos() // o que falhou fica no modal, para corrigir
      else fechar()
    })
  }

  renderVersoes() {
    this.renderSaidas()
    const s = encodeURIComponent(this.slug)
    const ultima = this.proj.ultima
    const lista = this.menuVersoes
    const vb = this.blocoSel && this.versoesBloco?.[this.blocoSel]
    if (vb?.length) {
      // um bloco escolhido: a versão dele (só sobe quando o bloco mudou); cada uma abre a versão do vídeo onde nasceu
      const id = this.blocoSel
      const agora = vb.find((x) => x.vs.includes(this.v))
      const ultimaB = vb.at(-1)
      $('#versoes').innerHTML = `<button class="botao botao-versao" data-acao="versoes" aria-haspopup="listbox" aria-expanded="${!!lista}" title="As versões do ${id}">
          <b>${id} · v${agora?.bv ?? '?'}</b>${agora === ultimaB ? '<span class="atual">atual</span>' : ''}${ICONE.seta_baixo}</button>
        ${lista ? `<div class="menu-versoes" role="listbox">${vb.slice().reverse().map((x) => `<a class="item-versao${x === agora ? ' ativa' : ''}" role="option" aria-selected="${x === agora}" href="#/p/${s}/v${x.vs[0]}" data-versao-bloco="${x.vs[0]}">
            <b>${id} · v${x.bv}</b>${x === ultimaB ? '<span class="atual">atual</span>' : ''}</a>`).join('')}</div>` : ''}`
      $('#aviso-versao').innerHTML = agora !== ultimaB ? `Você está vendo uma versão antiga do ${id} · <a href="#/p/${s}/v${ultima}" data-versao-bloco="${ultima}">ver a atual</a>` : ''
      return this.renderAprovar()
    }
    if (this.blocos) {
      // vídeo com blocos e nenhum escolhido: não há versão do vídeo para mostrar (as versões são de cada bloco)
      $('#versoes').innerHTML = ''
      $('#aviso-versao').innerHTML = this.v < ultima ? `Você está vendo uma versão antiga · <a href="#/p/${s}/v${ultima}">ver a atual</a>` : ''
      return this.renderAprovar()
    }
    $('#versoes').innerHTML = `<button class="botao botao-versao" data-acao="versoes" aria-haspopup="listbox" aria-expanded="${!!lista}" title="Trocar de versão">
        <b>v${this.v}</b>${this.v === ultima ? '<span class="atual">atual</span>' : ''}${ICONE.seta_baixo}</button>
      ${lista ? `<div class="menu-versoes" role="listbox">${lista.map((x) => `<a class="item-versao${x.v === this.v ? ' ativa' : ''}" role="option" aria-selected="${x.v === this.v}" href="#/p/${s}/v${x.v}">
          <b>v${x.v}</b>${x.v === ultima ? '<span class="atual">atual</span>' : ''}
          <span class="versao-dados">${x.criado_em ? dataHora(x.criado_em) : '—'}${x.duracao ? ` · ${mmss(x.duracao)}` : ''}</span>
          <span class="versao-estado ve-${x.estado}">${(ESTADO_VERSAO[x.estado] || ESTADO_VERSAO.sem)(x.comentarios)}${x.aplicados ? ` · <b>${x.aplicados} ${x.aplicados === 1 ? 'aplicado' : 'aplicados'}</b>` : ''}</span></a>`).join('')}</div>` : ''}`
    $('#aviso-versao').innerHTML = this.v < ultima ? `Você está vendo a v${this.v} (há uma v${ultima} mais nova) · <a href="#/p/${s}/v${ultima}">abrir a v${ultima}</a>` : ''
    this.renderAprovar()
  }

  renderAprovar() {
    const b = $('#b-aprovar')
    b.innerHTML = this.rev.aprovado ? `${ICONE.check} Aprovado` : 'Aprovar'
    b.title = this.rev.aprovado ? 'Aprovado · clique para desaprovar' : 'Aprovar o vídeo todo: o Claude exporta o final em 4K'
    b.classList.toggle('botao-menta', !!this.rev.aprovado)
    b.classList.toggle('botao-coral', !this.rev.aprovado)
  }

  /** O seletor de versões: abre com a lista fresca (data do render, duração e o estado da revisão de cada uma). */
  async alternarVersoes(abrir = !this.menuVersoes) {
    if (!abrir) {
      this.menuVersoes = null
      return this.renderVersoes()
    }
    if (this.blocoSel && this.versoesBloco?.[this.blocoSel]?.length) { // as versões do bloco já estão na memória
      await new Promise((r) => setTimeout(r)) // depois do clique: senão o "clicou fora" vê o botão já trocado e fecha
      this.menuVersoes = true
      return this.renderVersoes()
    }
    const l = await json(`/api/projetos/${encodeURIComponent(this.slug)}/versoes`, null)
    if (this.fechado) return
    this.menuVersoes = l || this.proj.versoes.slice().reverse().map((v) => ({ v, estado: 'sem', comentarios: 0, aplicados: 0 }))
    this.renderVersoes()
  }

  renderEstado() {
    const r = this.rev
    let html = ''
    if (r.aprovado) html += `<div class="faixa-estado estado-aprovado">${ICONE.check} Aprovada. O Claude exporta o final em 4K.</div>`
    const tr = this.trabalho
    if (tr) {
      const onde = tr.blocos?.length ? ` ${tr.blocos.join(', ')}` : ''
      html = `<div class="faixa-estado estado-trabalhando"><span class="girando" aria-hidden="true"></span>${tr.fase === 'renderizando'
        ? `Claude renderizando${onde ? ` ${onde.trim()}` : ' a versão nova'}…` : `Claude aplicando a revisão${onde}…`}</div>` + html
    }
    $('#estado').innerHTML = html
  }

  renderResumo() {
    // nos vídeos com blocos, em cima vai o quanto do vídeo já está concluído (os blocos finalizados)
    if (this.blocos) {
      const feitos = this.blocos.filter((b) => b.def.aprovado).length
      const pct = Math.round((feitos / this.blocos.length) * 100)
      $('#resumo').innerHTML = `<span class="conclusao" title="${feitos} de ${this.blocos.length} blocos finalizados"><b>${pct}% concluído</b>
        <i class="barra-conclusao"><i style="width:${pct}%"></i></i><span>${feitos} de ${this.blocos.length} blocos</span></span>`
      return
    }
    const cs = this.rev.comentarios.filter(temConteudo)
    const n = (k) => cs.filter((c) => chaveStatus(c.status) === k).length
    const partes = [`${cs.length} ${cs.length === 1 ? 'comentário' : 'comentários'}`]
    for (const [k, um, varios] of [['aplicado', 'aplicado', 'aplicados'], ['respondido', 'respondido', 'respondidos'], ['nao_aplicado', 'não aplicado', 'não aplicados']]) {
      const q = n(k)
      if (q) partes.push(`<b class="t-${STATUS[k][1]}">${q} ${q === 1 ? um : varios}</b>`)
    }
    $('#resumo').innerHTML = partes.join(' · ')
  }

  // ---------- a lista de comentários ----------

  renderLista() {
    const campo0 = $('#editor-texto')
    if (campo0 && this.editor) this.editor.texto = campo0.value // o que já foi digitado sobrevive ao redesenho
    const comentarios = this.rev.comentarios.filter((c) => this.visivel(c)).sort((a, b) => ordem(a) - ordem(b))
    this.numeros = new Map(comentarios.map((c, k) => [c.id, k + 1]))
    let html = comentarios.map((c) => this.htmlComentario(c)).join('')
    const foco = this.blocos?.find((b) => b.id === this.blocoSel)
    if (foco) {
      // um bloco escolhido: só os comentários dele e, embaixo, o que já foi pedido nele nas versões anteriores
      const cs = comentarios.filter((c) => !c.geral && this.blocoEm(c.t)?.id === foco.id)
      // os de vídeos anteriores sobre o conteúdo que o bloco ainda tem (ele não mudou desde então) também são desta versão dele
      const { atuais } = this.comentariosAntigos(foco)
      html = `<section class="bloco-grupo bloco-foco${foco.def.aprovado ? ' bloco-grupo-ok' : ''}">${this.htmlCabecaBloco(foco, cs.length, true)}
        ${cs.map((c) => this.htmlComentario(c)).join('')}${atuais.sort((a, z) => a.c.t - z.c.t).map((it) => this.htmlVelho(it)).join('')}
        ${cs.length || atuais.length ? '' : `<p class="vazio-lista">Nenhum comentário nesta versão do ${foco.id}.<br>Comente na caixa abaixo, com o vídeo dentro do bloco.</p>`}
        ${this.htmlHistoricoBloco(foco)}</section>`
    } else if (this.blocos) {
      const gerais = comentarios.filter((c) => c.geral)
      html = gerais.map((c) => this.htmlComentario(c)).join('') + this.blocos.map((b) => {
        const cs = comentarios.filter((c) => !c.geral && this.blocoEm(c.t)?.id === b.id)
        return `<section class="bloco-grupo${b.def.aprovado ? ' bloco-grupo-ok' : ''}">${this.htmlCabecaBloco(b, cs.length)}${cs.map((c) => this.htmlComentario(c)).join('')}</section>`
      }).join('')
    }
    if (!comentarios.length && !this.blocos) html = `<p class="vazio-lista">Nenhum comentário ainda.<br>Escreva na caixa abaixo: o vídeo pausa e o comentário fica naquele instante (<kbd>I</kbd> e <kbd>O</kbd> marcam um trecho).</p>`
    $('#lista').innerHTML = html
    this.renderResumo()
    const campo = $('#editor-texto')
    if (campo) {
      crescer(campo)
      campo.focus()
      campo.setSelectionRange(campo.value.length, campo.value.length)
      campo.closest('.editor').scrollIntoView({ block: 'nearest' })
    }
  }

  htmlComentario(c) {
    if (this.editor?.id === c.id) return this.htmlEditor()
    return `<article class="item${this.sel === c.id ? ' item-sel' : ''}" data-id="${c.id}"${c.geral ? '' : ` data-ir="${c.t}"`}>
      <header class="item-cabeca"><span class="num">${this.numeros.get(c.id)}</span>
        ${c.geral ? '<span class="chip-tempo estatico">Geral</span>' : `<button class="chip-tempo" data-ir="${c.t}">${quando(c)}</button>`}
        ${dataComentario(c)}
        <span class="item-acoes"><button class="botao-icone pequeno" data-editar="${c.id}" title="Editar">${ICONE.lapis}</button>
        <button class="botao-icone pequeno" data-apagar="${c.id}" title="Apagar">${ICONE.lixo}</button></span></header>
      ${c.texto ? `<p class="texto">${esc(c.texto)}</p>` : ''}${this.htmlAnexos(c.anexos, c.id)}
      ${this.htmlResposta(c)}
    </article>`
  }

  /** As miniaturas dos prints de um comentário (`dono`: o id dele, "nova" ou "editor"): clicar amplia; × tira. */
  htmlAnexos(lista, dono) {
    if (!lista?.length) return ''
    return `<div class="anexos">${lista.map((a) => `<span class="anexo"><button class="anexo-img" data-ampliar="${esc(a)}" title="${VIDEO.test(a) ? 'Tocar o vídeo' : 'Ampliar o print'}">${VIDEO.test(a)
      ? `<video muted playsinline preload="metadata" src="${this.urlAnexo(a)}#t=0.1"></video><span class="anexo-play">${ICONE.tocar}</span>`
      : `<img src="${this.urlAnexo(a)}" alt="print" loading="lazy">`}</button>
      <button class="anexo-tirar" data-tirar-anexo="${esc(`${dono}|${a}`)}" title="Tirar o print" aria-label="Tirar o print">${ICONE.fechar}</button></span>`).join('')}</div>`
  }

  urlAnexo(a) {
    return `/projetos/${encodeURIComponent(this.slug)}/${a.split('/').map(encodeURIComponent).join('/')}`
  }

  /** O que o Claude respondeu a um comentário (status + texto). */
  htmlResposta(c) {
    const k = chaveStatus(c.status)
    if (k === 'pendente' && !c.resposta) return ''
    const [rotulo, cls] = STATUS[k] || [k, 'respondido']
    return `<div class="resposta resposta-${cls}"><span class="status">${k === 'aplicado' ? ICONE.check : ''}Claude · ${rotulo}</span>
      ${c.resposta ? `<p>${esc(c.resposta)}</p>` : ''}</div>`
  }

  htmlEditor() {
    const ed = this.editor
    return `<div class="editor">
      <div class="item-cabeca"><span class="eyebrow">Editar comentário</span><span class="chip-tempo estatico">${quando(ed)}</span></div>
      <textarea id="editor-texto" rows="3" placeholder="O que mudar aqui? (⌘V ou arraste para anexar print ou vídeo)">${esc(ed.texto || '')}</textarea>
      ${this.htmlAnexos(ed.anexos, 'editor')}
      <div class="editor-acoes">${clipe('editor')}<span class="dica">Enter salva · Shift+Enter quebra a linha · Esc cancela</span>
        <button class="botao pequeno" data-acao="cancelar">Cancelar</button>
        <button class="botao pequeno botao-coral" data-acao="salvar-editor">Salvar</button></div>
    </div>`
  }

  // ---------- a linha do tempo ----------

  renderLinha() {
    if (this.blocos) this.calcularBlocos() // a duração pode ter mudado (o vídeo carregou): o último bloco vai até o fim
    const rolo = $('#rolo')
    const ajuste = Math.max(rolo.clientWidth - 2, 100) / this.dur
    if (this.ajustar || this.pxs < ajuste) {
      this.pxs = ajuste
      this.ajustar = true
    }
    $('#conteudo').style.width = `${this.dur * this.pxs}px`
    this.renderRegua()
    this.renderPlanos()
    this.renderPalavras()
    this.renderMarcas()
    this.renderBlocos()
    this.iPalavra = this.iPlano = -2
    this.atualizar()
  }

  renderRegua() {
    const px = this.pxs
    const passo = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * px >= 56) || 60
    const sub = passo >= 5 ? passo / 5 : passo / 2
    let html = ''
    for (let t = 0; t <= this.dur + 1e-6; t += sub) {
      const k = Math.round(t / sub)
      const grande = k % Math.round(passo / sub) === 0
      if (!grande && sub * px < 6) continue
      const rotulo = grande ? (passo < 1 ? tempo(t) : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`) : ''
      html += `<span class="tique${grande ? ' tique-grande' : ''}" style="left:${(t * px).toFixed(1)}px">${rotulo ? `<i>${rotulo}</i>` : ''}</span>`
    }
    $('#regua').innerHTML = html
  }

  renderPlanos() {
    $('#f-planos').innerHTML = this.planos
      .map((p) => {
        const x = p.ini * this.pxs
        const w = Math.max((p.fim - p.ini) * this.pxs - 1, 1)
        const [nome, curto] = PLANOS[p.tipo] || [p.tipo, p.tipo]
        const rot = w >= 130 ? `<b>${esc(p.id)}</b> ${esc(nome)}` : w >= 70 ? `<b>${esc(p.id)}</b> ${esc(curto)}` : w >= 24 ? `<b>${esc(p.id)}</b>` : ''
        const cod = this.codigoPlano(p)
        const dica = `${cod ? `${cod.codigo} · ` : `${p.id} · `}${nome} · ${tempo(p.ini)}–${tempo(p.fim)}${p.descricao ? `\n${p.descricao}` : ''}${p.texto ? `\nTexto: ${p.texto}` : ''}`
        const copia = cod && w >= 90 ? `<button type="button" class="copiar-codigo" data-copiar-codigo="${esc(cod.texto)}" title="Copiar “${esc(cod.texto)}”" aria-label="Copiar o código do plano">${ICONE.copiar}</button>` : ''
        return `<div class="plano tipo-${esc(p.tipo)}" style="left:${x.toFixed(1)}px;width:${w.toFixed(1)}px" title="${esc(dica)}">${rot}${copia}</div>`
      })
      .join('')
  }

  /** O código de um plano desta versão (PRJ-04·p5) e o texto que o botão copia (com a versão e o tempo). */
  codigoPlano(p) {
    if (!this.codigo) return null
    const codigo = `${this.codigo}·${p.id}`
    return { codigo, texto: `${codigo} · ${nomePlano(p.tipo)} (v${this.v}, ${tempo(p.ini)})` }
  }

  renderPalavras() {
    const ctx = (this.medidor ||= document.createElement('canvas').getContext('2d'))
    ctx.font = '400 11px Manrope, sans-serif'
    $('#f-palavras').innerHTML = this.palavras
      .map((w, i) => {
        const x = w.ini * this.pxs
        const larg = Math.max((w.fim - w.ini) * this.pxs - 1, 1)
        const cabe = larg >= ctx.measureText(w.texto).width + 5
        return `<span class="palavra${cabe ? '' : ' sem-texto'}" data-i="${i}" style="left:${x.toFixed(1)}px;width:${larg.toFixed(1)}px" title="${esc(w.texto)} · ${tempo(w.ini)}">${cabe ? esc(w.texto) : ''}</span>`
      })
      .join('')
  }

  renderMarcas() {
    const px = this.pxs
    const marca = (id, t, fim, rotulo, cls, dica) => {
      const sel = this.sel === id ? ' marca-sel' : ''
      if (fim != null && (fim - t) * px >= 10)
        return `<button class="marca marca-intervalo ${cls}${sel}" data-marca="${id}" data-ir="${t}" style="left:${(t * px).toFixed(1)}px;width:${((fim - t) * px).toFixed(1)}px" title="${esc(dica)}">${rotulo}</button>`
      return `<button class="marca marca-ponto ${cls}${sel}" data-marca="${id}" data-ir="${t}" style="left:${(t * px).toFixed(1)}px" title="${esc(dica)}">${rotulo}</button>`
    }
    this.renderBlocos()
    $('#f-comentarios').innerHTML = this.rev.comentarios
      .filter((c) => !c.geral && this.visivel(c))
      .map((c) => {
        const k = chaveStatus(c.status)
        return marca(c.id, c.t, c.fim, this.numeros.get(c.id), k === 'pendente' ? '' : `marca-${STATUS[k]?.[1] || 'respondido'}`, `${quando(c)} · ${c.texto}`)
      })
      .join('')
    // a marca de entrada (I) e o trecho do comentário sendo escrito na caixa
    const n = this.nova
    let io = ''
    if (n?.preso && n.fim != null) io = `<div class="io-trecho" style="left:${n.t * px}px;width:${(n.fim - n.t) * px}px"></div>`
    else if (n?.preso) io = `<div class="io-entrada io-ponto" style="left:${n.t * px}px"><i>✎</i></div>`
    else if (this.entrada != null) io = `<div class="io-entrada" style="left:${this.entrada * px}px"><i>I</i></div>`
    $('#io').innerHTML = io
    $('#b-entrada').classList.toggle('ativo', this.entrada != null)
  }

  // ---------- o tempo ----------

  atualizar() {
    if (this.fechado) return // o vídeo ainda solta eventos depois de sair da tela
    if (this.loop && !this.video.paused && (this.video.currentTime >= this.loop.fim - 0.03 || this.video.currentTime < this.loop.ini - 0.1)) this.video.currentTime = this.loop.ini
    const t = this.video.currentTime
    $('#t-atual').textContent = tempo(t)
    // com um bloco escolhido, o painel acompanha o cursor: passou para outro bloco, troca (menos no loop e editando)
    if (this.blocoSel && !this.loop && !this.editor) {
      const b = this.blocoEm(t)
      if (b && b.id !== this.blocoSel) this.escolherBloco(b.id)
    }
    this.renderNova()
    const x = t * this.pxs
    $('#cabeca').style.transform = `translateX(${x}px)`
    const tocando = !this.video.paused
    if (tocando !== this.tocando) {
      this.tocando = tocando
      const ic = tocando ? ICONE.pausar : ICONE.tocar
      $('#b-tocar').innerHTML = ic
      $('.video-tocar').classList.toggle('escondido', tocando)
    }
    if (tocando) {
      const rolo = $('#rolo')
      if (x < rolo.scrollLeft || x > rolo.scrollLeft + rolo.clientWidth - 30) rolo.scrollLeft = x - 40
    }
    // a palavra sob o cursor
    const i = this.palavras.findIndex((w) => t >= w.ini && t < w.fim)
    if (i !== this.iPalavra) {
      $('.palavra.agora')?.classList.remove('agora')
      if (i >= 0) $(`.palavra[data-i="${i}"]`)?.classList.add('agora')
      const k = i >= 0 ? i : this.palavras.indexOf(this.palavraPerto(t))
      this.iPalavra = i
      const de = Math.max(0, k - 5)
      $('#fala-atual').innerHTML = k < 0 ? '<span class="apagado">—</span>'
        : (de > 0 ? '… ' : '') + this.palavras.slice(de, k + 6).map((w, j) => (de + j === i ? `<b>${esc(w.texto)}</b>` : esc(w.texto))).join(' ') + (k + 6 < this.palavras.length ? ' …' : '')
    }
    // o plano sob o cursor
    const p = this.planos.findIndex((q) => t >= q.ini && t < q.fim)
    if (p !== this.iPlano) {
      this.iPlano = p
      const q = this.planos[p]
      const cod = q && this.codigoPlano(q)
      $('#plano-atual').innerHTML = q
        ? `<span class="plano-linha" data-chip-copia><span class="chip-plano tipo-${esc(q.tipo)}"><b>${esc(q.id)}</b> ${esc(nomePlano(q.tipo))}</span>${cod ? `<button type="button" class="copiar-codigo" data-copiar-codigo="${esc(cod.texto)}" title="Copiar “${esc(cod.texto)}”" aria-label="Copiar o código do plano">${ICONE.copiar}</button>` : ''}</span>${q.texto ? `<p class="plano-texto">“${esc(q.texto)}”</p>` : ''}`
        : '<span class="apagado">—</span>'
      $('#usado').innerHTML = q ? this.htmlUsado(q.id) : ''
      this.carregarMidias(q?.id)
    }
  }

  /** O que entrou no plano: as mídias do banco (miniatura que abre o vídeo, código, fonte), o motion e o preset. */
  htmlUsado(pl) {
    const u = this.usado[pl]
    if (!u) return ''
    const c = this.cods || {}
    const midias = (u.midias || []).map((id) => {
      const m = this.midias[id]
      const nome = m?.nome || ''
      const fonte = m?.origem?.url
      const dur = m ? (m.pai ? m.fim - m.inicio : m.duracao) : null
      return `<div class="midia-usada">
        <button class="midia-mini" data-ver-midia="${id}" title="Assistir">${m?.tipo === 'imagem' ? '' : `<span class="midia-play">${ICONE.tocar}</span>`}<img src="/biblioteca/banco/${id}/miniatura.jpg" alt="" loading="lazy">${dur ? `<span class="duracao">${tempo(dur)}</span>` : ''}</button>
        <div class="midia-linha"><span class="midia-nome" title="${esc(nome)}">${esc(nome)}</span></div>
        <div class="midia-linha">${chipCodigo(c.midia?.[id], nome || id)}${fonte ? `<a class="midia-fonte" href="${esc(fonte)}" target="_blank" rel="noopener" title="${esc(fonte)}">${esc(new URL(fonte).hostname.replace(/^www\./, ''))} ↗</a>` : ''}</div></div>`
    }).join('')
    const linhas = [
      u.motion && `<div class="midia-linha"><span>Motion · ${esc(u.motion.nome || u.motion.preset || 'novo')}</span>${chipCodigo(c.motion?.[u.motion.preset], u.motion.nome || u.motion.preset)}</div>`,
    ].filter(Boolean).join('')
    // o preset do insert e a transição de entrada do plano: o clipe de referência de cada um, pequeno, em laço
    const receita = (tipo, id, rotulo) => {
      if (!id) return ''
      const nome = this.receitas[`${tipo}:${id}`]?.nome || id
      const clipe = `/biblioteca/${tipo === 'preset' ? 'presets' : 'transicoes'}/clipes/${id}.mp4`
      return `<div class="receita-usada"><button class="receita-mini" data-ver-clipe="${clipe}" title="Assistir com som">
          <video src="${clipe}" muted loop autoplay playsinline preload="metadata" onerror="this.parentNode.classList.add('sem-clipe')"></video></button>
        <div class="receita-info"><span class="dica">${rotulo}</span><span class="midia-nome" title="${esc(nome)}">${esc(nome)}</span>${chipCodigo(c[tipo]?.[id], nome)}</div></div>`
    }
    const receitas = receita('preset', u.preset, 'Preset') + receita('transicao', u.transicao, 'Transição de entrada')
    return midias || linhas || receitas ? `<span class="eyebrow">No plano</span>${midias}${linhas}${receitas}` : ''
  }

  /** A mídia do banco num modal (um trecho toca só o pedaço usado, em laço). */
  verMidia(id) {
    const m = this.midias[id]
    if (!m) return
    this.video.pause()
    const pasta = `/biblioteca/banco/${m.pai || id}/`
    const arq = m.proxy || m.arquivo
    const fechar = `<button class="botao-icone anexo-fechar" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button>`
    if (m.tipo === 'imagem') return janela(`${fechar}<img class="anexo-grande" src="${pasta}${arq}" alt="">`, { classe: 'janela-anexo' })
    // um player próprio: a barra e o tempo são só do trecho usado (o nativo mostraria o vídeo de origem inteiro)
    const ini = m.pai ? m.inicio : 0
    const { el } = janela(`${fechar}<video class="anexo-grande" src="${pasta}${arq}#t=${ini}" autoplay playsinline></video>
      <div class="player-trecho"><button class="botao-icone pequeno" data-tocar-trecho title="Tocar / pausar (Espaço)">${ICONE.pausar}</button>
        <div class="trecho-barra"><i></i></div><span class="trecho-tempo">0:00,0</span></div>`, { classe: 'janela-anexo' })
    const v = $('video', el), bar = $('.trecho-barra', el), b = $('[data-tocar-trecho]', el)
    const fim = () => (m.pai ? m.fim : v.duration || m.duracao || 0)
    const dur = () => Math.max(0.01, fim() - ini)
    const mostrar = () => {
      const t = Math.min(Math.max(v.currentTime - ini, 0), dur())
      $('i', bar).style.width = `${(100 * t) / dur()}%`
      $('.trecho-tempo', el).textContent = `${tempo(t)} / ${tempo(dur())}`
      b.innerHTML = v.paused ? ICONE.tocar : ICONE.pausar
    }
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= fim() - 0.02) v.currentTime = ini // em laço
      mostrar()
    })
    for (const ev of ['play', 'pause', 'loadedmetadata']) v.addEventListener(ev, mostrar)
    const alternar = () => (v.paused ? v.play() : v.pause())
    b.addEventListener('click', alternar)
    v.addEventListener('click', alternar)
    bar.addEventListener('click', (e) => {
      const r = bar.getBoundingClientRect()
      v.currentTime = ini + ((e.clientX - r.left) / r.width) * dur()
    })
    el.addEventListener('keydown', (e) => e.key === ' ' && (e.preventDefault(), alternar()))
    b.focus()
  }

  /** Busca no banco o nome e a fonte das mídias do plano (uma vez cada) e redesenha o bloco. */
  async carregarMidias(pl) {
    const u = this.usado[pl] || {}
    const faltam = (u.midias || []).filter((id) => !(id in this.midias))
    const receitas = [['preset', u.preset], ['transicao', u.transicao]].filter(([t, id]) => id && !(`${t}:${id}` in this.receitas))
    if (!faltam.length && !receitas.length) return
    await Promise.all([
      ...faltam.map(async (id) => (this.midias[id] = (await json(`/api/banco/${id}`, null))?.item || null)),
      ...receitas.map(async ([t, id]) => (this.receitas[`${t}:${id}`] = await json(`/biblioteca/${t === 'preset' ? 'presets' : 'transicoes'}/${id}.json`, null))),
    ])
    if (this.fechado || this.planos[this.iPlano]?.id !== pl) return
    this.iPlano = -2 // força o redesenho do plano atual
    this.atualizar()
  }

  laco() {
    cancelAnimationFrame(this.raf)
    const passo = () => {
      this.atualizar()
      if (!this.video.paused && !this.fechado) this.raf = requestAnimationFrame(passo)
    }
    passo()
  }

  buscar(t) {
    this.video.currentTime = Math.min(Math.max(t, 0), Math.max(this.dur - 0.01, 0))
    this.atualizar()
  }

  passo(d) {
    this.video.pause()
    if (Math.abs(d) < 0.5) this.buscar((Math.round(this.video.currentTime * 24) + Math.sign(d)) / 24 + 0.001)
    else this.buscar(this.video.currentTime + d)
  }

  /** Shift + setas (como no 18): o começo do plano seguinte ou anterior (o corte); no anterior, a 1ª vez volta ao começo
   *  do plano em que se está. */
  irAoCorte(dir) {
    this.video.pause()
    const t = this.video.currentTime
    const inicios = this.planos.map((p) => p.ini).sort((a, b) => a - b)
    const alvo = dir > 0 ? inicios.find((x) => x > t + 0.02) : inicios.filter((x) => x < t - 0.02).at(-1)
    this.buscar(alvo ?? (dir > 0 ? this.dur : 0))
  }

  /** R (como no 18): toca de novo o plano em que se está, do começo; apertado logo depois de voltar, vai ao anterior. */
  replano() {
    const t = this.video.currentTime
    const inicios = this.planos.map((p) => p.ini).sort((a, b) => a - b)
    let ini = inicios.filter((x) => x <= t + 0.001).at(-1) ?? 0
    if (t - ini < 0.35 && Date.now() - (this.ultimoR || 0) < 1500) ini = inicios.filter((x) => x < ini - 0.001).at(-1) ?? 0
    this.ultimoR = Date.now()
    this.buscar(ini + 0.001)
    this.video.play().catch(() => {})
  }

  alternar() {
    if (this.video.paused) this.video.play().catch(() => {})
    else this.video.pause()
  }

  zoom(fator, ancora) {
    const rolo = $('#rolo')
    const a = ancora ?? (this.video.currentTime * this.pxs - rolo.scrollLeft)
    const tAncora = (rolo.scrollLeft + a) / this.pxs
    const ajuste = Math.max(rolo.clientWidth - 2, 100) / this.dur
    this.pxs = Math.min(Math.max(this.pxs * fator, ajuste), 400) // fator 0: o vídeo inteiro na largura (Ajustar)
    this.ajustar = this.pxs <= ajuste * 1.0001
    this.renderLinha()
    rolo.scrollLeft = tAncora * this.pxs - a
  }

  // ---------- palavras e fala ----------

  palavraPerto(t) {
    let melhor = null
    let dist = Infinity
    for (const w of this.palavras) {
      const d = t < w.ini ? w.ini - t : t >= w.fim ? t - w.fim : 0
      if (d < dist) [melhor, dist] = [w, d]
      if (d === 0 || w.ini > t + dist) break
    }
    return melhor
  }

  falaPonto(t) {
    const k = this.palavras.indexOf(this.palavraPerto(t))
    return k < 0 ? '' : limpar(this.palavras.slice(Math.max(0, k - 1), k + 2).map((w) => w.texto).join(' '))
  }

  falaIntervalo(a, b) {
    const ws = this.palavras.filter((w) => w.fim > a && w.ini < b).map((w) => w.texto)
    if (!ws.length) return this.falaPonto(a)
    return limpar(ws.length > 10 ? `${ws.slice(0, 4).join(' ')} … ${ws.slice(-4).join(' ')}` : ws.join(' '))
  }

  // ---------- comentar ----------

  abrirEditor(ed) {
    if (this.editor) this.salvarEditor()
    this.video.pause()
    this.editor = ed
    this.renderLista()
    this.renderMarcas()
  }

  fecharEditor() {
    const ed = this.editor
    // os prints colados neste editor e não salvos saem do disco
    const antes = (ed?.id && this.rev.comentarios.find((x) => x.id === ed.id)?.anexos) || []
    for (const a of ed?.anexos || []) if (!antes.includes(a)) this.apagarAnexo(a)
    this.editor = null
    this.renderLista()
    this.renderMarcas()
  }

  salvarEditor() {
    const ed = this.editor
    if (!ed) return
    const texto = ($('#editor-texto')?.value ?? ed.texto ?? '').trim()
    const anexos = ed.anexos || []
    const cs = this.rev.comentarios
    if (ed.id) {
      const c = cs.find((x) => x.id === ed.id)
      for (const a of c?.anexos || []) if (!anexos.includes(a) || (!texto && !anexos.length)) this.apagarAnexo(a)
      if (c && !texto && !anexos.length) cs.splice(cs.indexOf(c), 1)
      else if (c) {
        c.texto = texto
        if (anexos.length) c.anexos = anexos
        else delete c.anexos
      }
    } else if (texto || anexos.length) {
      const c = this.novoComentario(ed, texto)
      cs.push(c)
      this.sel = c.id
    }
    this.editor = null
    this.renderLista()
    this.renderMarcas()
    this.agendarSalvar()
  }

  /** O id do próximo comentário (reservado ao colar um print num comentário ainda não salvo: o arquivo leva o id). */
  proximoId() {
    this.reservado = Math.max(this.reservado || 0, ...this.rev.comentarios.map((c) => numero(c.id))) + 1
    return `c${this.reservado}`
  }

  novoComentario({ t, fim, novoId, anexos, geral }, texto) {
    const n = novoId ? numero(novoId) : Math.max(this.reservado || 0, ...this.rev.comentarios.map((c) => numero(c.id))) + 1
    if (geral)
      return { id: `c${n}`, geral: true, t: null, fim: null, palavra: null, fala: '', texto, criado_em: agora(), de: 'rodrigo', status: 'pendente', resposta: null, ...(anexos?.length ? { anexos } : {}) }
    const fala = fim != null ? this.falaIntervalo(t, fim) : this.falaPonto(t)
    // no trecho do final de uma saída, o comentário é dela (só aparece nela e é sobre o final dela)
    const daSaida = this.saidaAtual() && t >= this.fimCorpo() - 0.01 ? { saida: this.saidaId } : {}
    return {
      id: `c${n}`, t: r3(t), fim: fim == null ? null : r3(fim), palavra: this.palavraPerto(t)?.id ?? null, fala, texto,
      criado_em: agora(), de: 'rodrigo', status: 'pendente', resposta: null, ...(anexos?.length ? { anexos } : {}), ...daSaida,
    }
  }

  /** I: a entrada de um trecho; a caixa passa a mostrar o trecho da entrada até o cursor (solta, se estava presa). */
  marcarEntrada(calado = false) {
    this.nova.geral = false
    this.nova.preso = false
    this.nova.fim = null
    this.entrada = this.video.currentTime
    this.renderNova()
    this.renderMarcas()
    if (!calado) aviso(`Entrada em ${tempo(this.entrada)}. Agora O marca a saída.`)
  }

  /** O: a saída; o trecho fica preso na caixa, pronta para escrever. */
  marcarSaida() {
    if (this.entrada == null) return aviso('Marque a entrada com I antes.', 'erro')
    this.video.pause()
    Object.assign(this.nova, this.quandoNova(), { preso: true })
    this.entrada = null
    this.renderNova()
    this.renderMarcas()
    $('#nova-texto').focus()
  }

  async apagar(id) {
    const c = this.rev.comentarios.find((x) => x.id === id)
    if (!c) return
    const ok = await confirmar({ titulo: 'Apagar este comentário?', texto: c.texto || (c.anexos?.length ? 'O comentário e os prints dele.' : ''), ok: 'Apagar', perigo: true })
    if (!ok) return
    this.rev.comentarios.splice(this.rev.comentarios.indexOf(c), 1)
    for (const a of c.anexos || []) this.apagarAnexo(a)
    this.renderLista()
    this.renderMarcas()
    this.agendarSalvar()
  }

  selecionar(id, t) {
    this.sel = id
    if (t != null) this.buscar(t)
    this.renderLista()
    this.renderMarcas()
    $(`.item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  // ---------- gravar, copiar, aprovar ----------

  mostrarSalvo(estado) {
    const el = $('#salvo')
    if (!el) return
    el.className = `salvo salvo-${estado}`
    el.innerHTML = estado === 'erro' ? 'Erro ao salvar' : '' // grava sozinho: só o erro aparece
  }

  agendarSalvar() {
    this.sujo = true
    this.mostrarSalvo('salvando')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.salvar(), 600)
  }

  salvar(keepalive = false) {
    clearTimeout(this.timer)
    this.sujo = false
    const corpo = JSON.stringify(this.rev)
    const url = `/api/revisao/${encodeURIComponent(this.slug)}/v${this.v}`
    this.fila = this.fila
      .then(() => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive }))
      .then((r) => {
        if (!r.ok) throw new Error(r.status)
        if (!this.sujo) this.mostrarSalvo('salvo')
      })
      .catch(() => this.mostrarSalvo('erro'))
    return this.fila
  }

  /** O Aprovar do projeto vale para todas as saídas (o Claude exporta todas). */
  async marcarSaidas(valor) {
    if (!this.saidas.length) return
    await enviar('POST', `/api/projetos/${encodeURIComponent(this.slug)}/saidas-aprovadas`, { aprovado: valor }).catch(() => {})
    for (const x of this.saidas) x.aprovado = valor
  }

  async aprovar() {
    if (this.editor) this.salvarEditor()
    const texto = `Aprovado · ${this.slug} · v${this.v}`
    if (this.rev.aprovado) { // já aprovado: o clique oferece desfazer
      const ok = await confirmar({ titulo: 'Desaprovar o vídeo?', texto: 'Ele volta para Em edição. O final já exportado fica onde está.', ok: 'Desaprovar', perigo: true })
      if (!ok) return
      this.rev.aprovado = false
      await this.salvar()
      await this.marcarSaidas(false)
      this.renderVersoes()
      this.renderEstado()
      return aviso('Desaprovado: o vídeo voltou para Em edição')
    }
    const ok = await confirmar({ titulo: 'Aprovar o vídeo?', texto: this.saidas.length ? `O Claude exporta em 4K todas as saídas (${this.saidas.map((x) => x.destino).join(', ')}).` : 'O Claude exporta o vídeo final em 4K.', ok: 'Aprovar e copiar' })
    if (!ok) return
    this.rev.aprovado = true
    await this.salvar()
    await this.marcarSaidas(true)
    this.renderVersoes()
    this.renderEstado()
    await copiar(texto)
    aviso('Copiado — cole no chat do Claude Code')
  }

  /** O aviso de que o Claude está aplicando a revisão (`revisoes/trabalhando.json`, que o `revisao.py ler` põe e a
   *  versão nova tira): os blocos dele ganham o loader. Um aviso de mais de 3 h é esquecido (o Claude parou no meio). */
  async verTrabalho() {
    const d = await json(`/projetos/${encodeURIComponent(this.slug)}/revisoes/trabalhando.json`, null)
    const vivo = d && Date.now() - new Date(d.desde).getTime() < 3 * 3600e3 ? d : null
    if (JSON.stringify(vivo) === JSON.stringify(this.trabalho ?? null) || this.fechado) return
    this.trabalho = vivo
    this.renderBlocos()
    this.renderEstado()
  }

  /** O Claude responde no arquivo e entrega versões novas: a cada 4 s, traz as respostas e as versões. */
  async verDisco() {
    if (this.fechado || document.hidden) return
    this.verTrabalho()
    if (this.sujo) return
    const disco = await json(this.urlRevisao, null)
    if (this.fechado || this.sujo) return
    let mudou = false
    for (const d of disco?.comentarios || []) {
      const c = this.rev.comentarios.find((x) => x.id === d.id)
      if (c && (d.status !== c.status || d.resposta !== c.resposta)) {
        c.status = d.status
        c.resposta = d.resposta
        mudou = true
      }
    }
    // uma gravação que se perdeu (o arquivo foi regravado ao mesmo tempo por outro lado): grava de novo
    if (disco && this.rev.comentarios.some((c) => !disco.comentarios?.some((d) => d.id === c.id))) this.agendarSalvar()
    if (mudou) {
      if (!this.editor) this.renderLista()
      this.renderMarcas()
      this.renderEstado()
      aviso('O Claude respondeu a revisão')
    }
    const p = (await json('/api/projetos', null))?.find((x) => x.slug === this.slug)
    if (p && !this.fechado && p.versoes.join() !== this.proj.versoes.join()) {
      const nova = p.versoes.find((x) => !this.proj.versoes.includes(x))
      this.proj = p
      this.renderVersoes()
      this.renderEstado()
      if (nova && this.blocos) {
        this.versoesBloco = null
        await this.carregarVersoesBlocos()
        if (this.fechado) return
        this.renderBlocos()
        this.renderVersoes()
        const k = this.blocos.filter((b) => this.novidade(b)?.tipo === 'nova').length
        aviso(k ? `${k} ${k === 1 ? 'bloco ganhou versão nova' : 'blocos ganharam versão nova'}: veja o ✦ na linha do tempo` : 'Versão nova pronta')
      } else if (nova) aviso(`A v${nova} chegou`)
    }
  }

  // ---------- os prints (colar com ⌘V ou arrastar no comentário) ----------

  /** Envia as imagens e os vídeos ao servidor (revisoes/anexos/<comentário>-<n>.<ext>) e os prende à caixa do
   *  comentário novo (`alvo` "nova": prende o instante, como começar a escrever), ao comentário sendo editado
   *  ("editor"). */
  async anexar(arquivos, alvo) {
    const imagens = [...arquivos].filter((f) => f.type?.startsWith('image/') || f.type?.startsWith('video/'))
    if (!imagens.length) return aviso('Só imagens e vídeos entram como anexo.', 'erro')
    let cid
    if (alvo === 'nova') {
      this.prenderNova()
      cid = this.nova.novoId ||= this.proximoId()
    } else if (alvo === 'editor') {
      const ed = this.editor
      if (!ed) return
      ed.texto = $('#editor-texto')?.value ?? ed.texto
      cid = ed.id || (ed.novoId ||= this.proximoId())
    }
    let n = 0
    for (const f of imagens) {
      try {
        const r = await fetch(`/api/revisao/${encodeURIComponent(this.slug)}/v${this.v}/anexo?comentario=${cid}`, { method: 'POST', headers: { 'Content-Type': f.type }, body: f })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`)
        if (alvo === 'nova') this.nova.anexos.push(d.caminho)
        else if (this.editor) (this.editor.anexos ||= []).push(d.caminho)
        else this.apagarAnexo(d.caminho) // o editor fechou enquanto enviava
        n++
      } catch (x) {
        aviso(`O print não entrou: ${x.message}`, 'erro')
      }
    }
    if (alvo === 'nova') this.renderNovaAnexos()
    else if (this.editor) this.renderLista()
    if (n) aviso(n === 1 ? 'Anexado' : `${n} anexados`)
  }

  apagarAnexo(caminho) {
    fetch(`/api/revisao/${encodeURIComponent(this.slug)}/v${this.v}/anexo?caminho=${encodeURIComponent(caminho)}`, { method: 'DELETE' }).catch(() => {})
  }

  /** O × de uma miniatura: no editor, sai ao salvar; num comentário salvo, sai já. */
  tirarAnexo(dono, caminho) {
    if (dono === 'nova') {
      this.nova.anexos = this.nova.anexos.filter((a) => a !== caminho)
      this.renderNovaAnexos()
      return this.apagarAnexo(caminho)
    }
    if (dono === 'editor') {
      if (!this.editor) return
      this.editor.texto = $('#editor-texto')?.value ?? this.editor.texto
      this.editor.anexos = (this.editor.anexos || []).filter((a) => a !== caminho)
      const salvo = this.editor.id && this.rev.comentarios.find((x) => x.id === this.editor.id)?.anexos?.includes(caminho)
      if (!salvo) this.apagarAnexo(caminho)
      return this.renderLista()
    }
    {
      const c = this.rev.comentarios.find((x) => x.id === dono)
      if (!c) return
      c.anexos = (c.anexos || []).filter((a) => a !== caminho)
      if (!c.anexos.length) delete c.anexos
      if (!temConteudo(c)) this.rev.comentarios.splice(this.rev.comentarios.indexOf(c), 1)
      this.renderLista()
      this.renderMarcas()
    }
    this.apagarAnexo(caminho)
    this.agendarSalvar()
  }

  ampliar(caminho) {
    const midia = VIDEO.test(caminho)
      ? `<video class="anexo-grande" src="${this.urlAnexo(caminho)}" controls autoplay playsinline></video>`
      : `<img class="anexo-grande" src="${this.urlAnexo(caminho)}" alt="print">`
    janela(`<button class="botao-icone anexo-fechar" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button>${midia}`, { classe: 'janela-anexo' })
  }

  // ---------- eventos ----------

  ligar() {
    const v = this.video
    // volta ao instante onde o criador estava nesta versão (ao trocar de página e voltar, ou recarregar)
    const onde = preferencia(`posicao.${this.slug}.v${this.v}`, 0)
    v.addEventListener('loadedmetadata', () => onde > 0 && this.buscar(onde), { once: true })
    v.addEventListener('loadedmetadata', () => {
      if (isFinite(v.duration) && Math.abs(v.duration - this.dur) > 0.05) {
        this.dur = v.duration
        $('#t-total').textContent = tempo(this.dur)
        this.renderLinha()
      }
    })
    v.addEventListener('play', () => this.laco())
    for (const ev of ['pause', 'seeked', 'timeupdate']) v.addEventListener(ev, () => v.paused && this.atualizar())

    this.cliques = (e) => this.clique(e)
    this.tela.addEventListener('click', this.cliques)
    $('#barra-versao').addEventListener('click', this.cliques)
    this.trocaSaida = (e) => e.target.matches('[data-trocar-saida]') && this.trocarSaida(e.target.value)
    this.tela.addEventListener('change', this.trocaSaida) // o seletor fica no painel da direita
    this.teclas = (e) => this.tecla(e)
    window.addEventListener('keydown', this.teclas)
    this.redim = () => this.ajustar && this.renderLinha()
    window.addEventListener('resize', this.redim)
    this.saida = () => {
      this.guardarPosicao()
      if (this.sujo) this.salvar(true)
    }
    window.addEventListener('pagehide', this.saida)

    // a caixa do comentário novo: escrever prende o instante (e pausa); apagar tudo solta
    $('#nova-texto').addEventListener('input', (e) => {
      crescer(e.target)
      if (e.target.value.trim()) this.prenderNova()
      else if (!this.nova.anexos.length && this.nova.fim == null) this.soltarNova()
    })
    // o painel (aba, editor, réplica, rolagem) e o rascunho que ficou na caixa ao sair
    this.voltarPainel()
    const r = preferencia(`rascunho.${this.slug}.v${this.v}`, null)
    if (r) {
      const { texto, ...nova } = r
      Object.assign(this.nova, nova)
      $('#nova-texto').value = texto
      crescer($('#nova-texto'))
      this.rotuloNova = null
      this.renderNova()
    }
    // o botão de clipe
    this.tela.addEventListener('change', (e) => {
      const alvo = e.target.dataset?.anexar
      if (!alvo) return
      this.anexar(e.target.files, alvo)
      e.target.value = ''
    })
    // colar (⌘V) ou arrastar um print ou vídeo na caixa do comentário novo ou no comentário sendo editado
    const alvoDe = (el) => (el?.closest?.('.caixa-nova') ? 'nova' : el?.closest?.('.editor') ? 'editor' : null)
    this.tela.addEventListener('paste', (e) => {
      const alvo = alvoDe(e.target)
      const arquivos = [...(e.clipboardData?.files || [])]
      if (!alvo || !arquivos.some((f) => /^(image|video)\//.test(f.type))) return // texto: cola normal
      e.preventDefault()
      this.anexar(arquivos, alvo)
    })
    const comArquivo = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
    this.tela.addEventListener('dragover', (e) => {
      const alvo = alvoDe(e.target)
      if (!alvo || !comArquivo(e)) return
      e.preventDefault()
      e.target.closest('.caixa-nova, .editor').classList.add('soltando')
    })
    this.tela.addEventListener('dragleave', (e) => e.target.closest?.('.caixa-nova, .editor')?.classList.remove('soltando'))
    this.tela.addEventListener('drop', (e) => {
      const alvo = alvoDe(e.target)
      if (!alvo || !comArquivo(e)) return
      e.preventDefault()
      e.target.closest('.caixa-nova, .editor').classList.remove('soltando')
      this.anexar(e.dataTransfer.files, alvo)
    })
    // o seletor de versões fecha ao clicar fora
    this.foraMenu = (e) => this.menuVersoes && !e.target.closest?.('.seletor-versao') && this.alternarVersoes(false)
    document.addEventListener('click', this.foraMenu)

    // clicar/arrastar na linha do tempo busca; ⌘/Ctrl + rolagem aproxima
    const conteudo = $('#conteudo')
    // clicar busca; arrastar na régua percorre o vídeo; arrastar nas faixas marca um trecho (como I e O)
    conteudo.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.marca, .bloco-faixa, .bloco-novidade') || e.button !== 0) return
      e.preventDefault()
      const tDe = (ev) => Math.min(Math.max((ev.clientX - conteudo.getBoundingClientRect().left) / this.pxs, 0), this.dur)
      const naRegua = !!e.target.closest('#regua')
      const x0 = e.clientX
      const t0 = tDe(e)
      let trecho = false
      this.buscar(t0)
      conteudo.setPointerCapture(e.pointerId)
      const mover = (ev) => {
        if (!naRegua && !trecho && Math.abs(ev.clientX - x0) > 4) {
          trecho = true
          this.video.pause()
          this.buscar(t0)
          this.marcarEntrada(true)
        }
        this.buscar(tDe(ev))
        if (trecho) this.renderMarcas()
      }
      const soltar = () => {
        conteudo.removeEventListener('pointermove', mover)
        conteudo.removeEventListener('pointerup', soltar)
        if (trecho) {
          if (Math.abs(this.video.currentTime - this.entrada) < 0.05) return this.soltarNova()
          this.marcarSaida()
        }
      }
      conteudo.addEventListener('pointermove', mover)
      conteudo.addEventListener('pointerup', soltar)
    })
    const rolo = $('#rolo')
    rolo.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        this.zoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rolo.getBoundingClientRect().left)
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && rolo.scrollWidth > rolo.clientWidth) {
        e.preventDefault()
        rolo.scrollLeft += e.deltaY
      }
    }, { passive: false })
  }

  clique(e) {
    if (e.target === this.video) return this.alternar()
    const check = e.target.closest?.('[data-check]') // o check do bloco na linha do tempo (dentro do botão do bloco)
    if (check) return this.aprovarBloco(check.dataset.check)
    const b = e.target.closest('button, a, [data-ir]')
    const editor = e.target.closest('.editor')
    if (!b || (editor && !editor.contains(b))) return // dentro do campo de comentário, só os botões dele
    if (b.tagName === 'BUTTON') b.blur()
    if (b.dataset.versaoBloco) preferencia(`painel.${this.slug}.v${b.dataset.versaoBloco}`, null, { bloco: this.blocoSel, irAoBloco: true }) // lá, o bloco segue escolhido, desde o começo
    if (b.classList.contains('item-versao')) return setTimeout(() => this.alternarVersoes(false)) // a versão abre pelo endereço
    const d = b.dataset
    if (d.acao) return this.acao(d.acao)
    if (d.vel) {
      this.video.playbackRate = +d.vel
      for (const x of $$('[data-vel]')) x.classList.toggle('ativa', x === b)
      return
    }
    if (d.ampliar) return this.ampliar(d.ampliar)
    if (d.verMidia) return this.verMidia(d.verMidia)
    if (d.verClipe) {
      this.video.pause()
      return janela(`<button class="botao-icone anexo-fechar" data-fechar title="Fechar (Esc)">${ICONE.fechar}</button><video class="anexo-grande" src="${d.verClipe}" autoplay loop playsinline controls></video>`, { classe: 'janela-anexo' })
    }
    if (d.tirarAnexo) {
      const k = d.tirarAnexo.indexOf('|')
      return this.tirarAnexo(d.tirarAnexo.slice(0, k), d.tirarAnexo.slice(k + 1))
    }
    if (d.editar) {
      const c = this.rev.comentarios.find((x) => x.id === d.editar)
      return c && this.abrirEditor({ id: c.id, t: c.t, fim: c.fim, geral: c.geral, texto: c.texto, anexos: [...(c.anexos || [])] })
    }
    if (d.apagar) return this.apagar(d.apagar)
    if (d.aprovarBloco) return this.aprovarBloco(d.aprovarBloco)
    if (d.loopBloco) return this.alternarLoop(d.loopBloco)
    if (d.sairBloco != null) return this.escolherBloco(null)
    if (d.aprovarSaida) return this.aprovarSaida(d.aprovarSaida)
    if (d.novaSaida != null) return this.novaSaida()
    if (d.tirarSaida) return this.tirarSaida(d.tirarSaida)
    if (d.irVelho != null) return this.buscar(+d.irVelho) // um comentário de uma versão anterior: só vai ao ponto
    if (d.novidade) return this.abrirBloco(d.novidade)
    if (d.bloco) return this.abrirBloco(d.bloco)
    if (d.marca) return this.selecionar(d.marca, +d.ir)
    if (d.ir != null) {
      const item = b.closest('.item')
      if (window.getSelection()?.toString()) return // selecionando texto
      return this.selecionar(item?.dataset.id || null, +d.ir)
    }
  }

  acao(nome) {
    const a = {
      tocar: () => this.alternar(),
      'quadro-': () => this.passo(-QUADRO),
      'quadro+': () => this.passo(QUADRO),
      look: () => this.abrirLook(),
      musica: () => this.abrirMusica(),
      'corte-': () => this.irAoCorte(-1),
      'corte+': () => this.irAoCorte(1),
      ajustar: () => this.zoom(0),
      'alternar-tempo': () => this.alternarTempo(true),
      soltar: () => this.soltarNova(),
      'salvar-nova': () => this.salvarNova(),
      entrada: () => this.marcarEntrada(),
      saida: () => this.marcarSaida(),
      'zoom-': () => this.zoom(1 / 1.6),
      'zoom+': () => this.zoom(1.6),
      cancelar: () => this.fecharEditor(),
      'salvar-editor': () => this.salvarEditor(),
      aprovar: () => this.aprovar(),
      versoes: () => this.alternarVersoes(),
      'tela-cheia': () => this.telaCheia(),
    }[nome]
    a?.()
  }

  tecla(e) {
    if (modalAberto()) return
    const campo = e.target.closest?.('input, textarea, select, [contenteditable]')
    if (campo) {
      const enter = e.key === 'Enter' && !e.shiftKey && !e.isComposing
      if (campo.id === 'editor-texto' && enter) {
        e.preventDefault()
        this.salvarEditor()
        document.activeElement?.blur?.()
      } else if (campo.id === 'nova-texto' && enter) {
        e.preventDefault()
        this.salvarNova()
        campo.blur() // sai da caixa: o Espaço volta a tocar o vídeo
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (campo.id === 'editor-texto') this.fecharEditor()
        else {
          campo.blur()
          if (campo.id === 'nova-texto' && !campo.value.trim() && !this.nova.anexos.length) this.soltarNova()
        }
      }
      return
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && ['=', '+', '-', '_', '0'].includes(e.key)) {
      e.preventDefault() // ⌘+ ⌘− ⌘0: o zoom da linha do tempo, não o da página
      return this.zoom(e.key === '0' ? 0 : e.key === '-' || e.key === '_' ? 0.8 : 1.25)
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const f = {
      ' ': () => this.alternar(),
      ArrowLeft: () => (e.shiftKey ? this.irAoCorte(-1) : this.passo(-QUADRO)),
      ArrowRight: () => (e.shiftKey ? this.irAoCorte(1) : this.passo(QUADRO)),
      r: () => this.replano(),
      c: () => this.alternarTempo(true),
      i: () => this.marcarEntrada(),
      o: () => this.marcarSaida(),
      f: () => this.telaCheia(),
      Escape: () => {
        if ($('.video-caixa.tela-cheia-janela')) this.telaCheia()
        else if (this.menuVersoes) this.alternarVersoes(false)
        else if (this.editor) this.fecharEditor()
        else if (this.entrada != null || this.nova.preso) this.soltarNova()
        else if (this.sel) this.selecionar(null)
      },
    }[k]
    if (f) {
      e.preventDefault()
      f()
    }
  }

  /** O vídeo em tela cheia (o botão no canto ou F); de novo, ou Esc, volta. */
  telaCheia() {
    const caixa = $('.video-caixa')
    if (document.fullscreenElement) return document.exitFullscreen()
    if (caixa.classList.contains('tela-cheia-janela')) return caixa.classList.remove('tela-cheia-janela')
    // sem a tela cheia do navegador (recusada, ou um navegador embutido que não responde), o vídeo ocupa a janela
    const janelaInteira = () => !document.fullscreenElement && caixa.classList.add('tela-cheia-janela')
    caixa.requestFullscreen ? caixa.requestFullscreen().catch(janelaInteira) : janelaInteira()
    setTimeout(janelaInteira, 800)
  }

  /** Ao sair da página: o instante do vídeo, o rascunho da caixa (texto, instante preso, prints) e onde o painel estava
   *  (o bloco escolhido, o comentário sendo editado com o texto e a rolagem) desta versão. */
  guardarPosicao() {
    if (!this.video) return
    preferencia(`posicao.${this.slug}.v${this.v}`, 0, +this.video.currentTime.toFixed(3))
    const texto = $('#nova-texto')?.value || ''
    preferencia(`rascunho.${this.slug}.v${this.v}`, null, texto.trim() || this.nova.anexos.length ? { ...this.nova, texto } : null)
    const editor = this.editor ? { ...this.editor, texto: $('#editor-texto')?.value ?? this.editor.texto } : null
    preferencia(`painel.${this.slug}.v${this.v}`, null, { bloco: this.blocoSel || null, sel: this.sel, editor, rolagem: $('#lista')?.scrollTop || 0 })
  }

  /** Volta o painel para onde estava ao sair (guardarPosicao): o bloco, o editor aberto com o texto e a rolagem. */
  voltarPainel() {
    const p = preferencia(`painel.${this.slug}.v${this.v}`, null)
    if (!p) return
    this.sel = p.sel ?? null
    if (p.editor && (!p.editor.id || this.rev.comentarios.some((c) => c.id === p.editor.id))) this.editor = p.editor
    const bloco = this.blocos?.find((b) => b.id === p.bloco)
    if (bloco) {
      this.blocoSel = bloco.id
      this.carregarVersoesBlocos().then(() => !this.fechado && this.renderVersoes())
      if (p.irAoBloco) this.video.addEventListener('loadedmetadata', () => this.irAoBloco(bloco), { once: true })
    }
    this.renderLista()
    this.renderMarcas()
    requestAnimationFrame(() => $('#lista') && ($('#lista').scrollTop = p.rolagem || 0)) // depois do foco no campo aberto
  }

  fechar() {
    $('#barra-versao').removeEventListener('click', this.cliques)
    this.tela.removeEventListener('change', this.trocaSaida)
    this.guardarPosicao()
    this.fechado = true
    if (this.sujo) this.salvar(true)
    clearInterval(this.relogio)
    clearInterval(this.relogioRender)
    this.desligarMusica()
    clearTimeout(this.timer)
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.teclas)
    window.removeEventListener('resize', this.redim)
    window.removeEventListener('pagehide', this.saida)
    document.removeEventListener('click', this.foraMenu)
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
  }
}
