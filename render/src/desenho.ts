/** O desenho da camada (o que o React do 18 desenhava), em TS puro: cada quadro descreve a árvore (`V`) e `desenhar`
 *  acerta o DOM por chave, como o React — o mesmo vídeo continua o mesmo elemento de um quadro para o outro (não
 *  carrega de novo). Mesmas classes, medidas e unidades de container do 18 (o Tailwind traduzido em index.html). */
import type { Estilo, ItemBanco, MidiaLigada } from './tipos'
import { cantosNoTempo, estadoCard, janela, matrizDosCantos, noTempo, zoomMidia, type Receita } from './presets'
import { areaDoInsert, type Divisao } from './divisao'
import { corteSimples, ESTILO_SIMPLES, estiloSimples, type PedidoNoTempo } from './inserts'
import { QUADRO } from './quadro'

/** Um elemento descrito: `chave` única entre os irmãos; `antes`/`depois` rodam ao criar e a cada quadro (os vídeos). */
export type V = {
  chave: string
  tag?: string
  classe?: string
  estilo?: Estilo
  atributos?: Record<string, string>
  texto?: string
  filhos?: (V | false | null | undefined)[]
  criar?: (el: HTMLElement) => void
  depois?: (el: HTMLElement) => void
}

const guardados = new WeakMap<Element, Map<string, HTMLElement>>()
const estilos = new WeakMap<Element, Estilo>()
const CHAVE = 'k'

/** Acerta os filhos de `pai` com a descrição: cria o que falta, atualiza o resto e tira o que sobrou (que fica guardado:
 *  um vídeo que volta à tela volta com o quadro carregado). */
export function desenhar(pai: HTMLElement, filhos: (V | false | null | undefined)[]) {
  let mapa = guardados.get(pai)
  if (!mapa) guardados.set(pai, (mapa = new Map()))
  const vs = filhos.filter((v): v is V => !!v)
  const els = vs.map((v) => {
    const tag = (v.tag ?? 'div').toUpperCase()
    let el = mapa.get(v.chave)
    if (!el || el.tagName !== tag) {
      el = document.createElement(tag)
      el.dataset[CHAVE] = v.chave
      mapa.set(v.chave, el)
      v.criar?.(el)
    }
    return el
  })
  // primeiro sai o que sobrou, e só depois o resto entra no lugar: mover um iframe recarrega a página dele
  const ficam = new Set(els)
  for (const el of [...pai.children]) if (!ficam.has(el as HTMLElement)) el.remove()
  vs.forEach((v, i) => {
    const el = els[i]
    if (pai.children[i] !== el) pai.insertBefore(el, pai.children[i] ?? null)
    if (el.className !== (v.classe ?? '')) el.className = v.classe ?? ''
    for (const [k, valor] of Object.entries(v.atributos ?? {})) if (el.getAttribute(k) !== valor) el.setAttribute(k, valor)
    aplicarEstilo(el, v.estilo ?? {})
    if (v.texto != null) {
      if (el.textContent !== v.texto) el.textContent = v.texto
    } else desenhar(el, v.filhos ?? [])
    v.depois?.(el)
  })
}

function aplicarEstilo(el: HTMLElement, novo: Estilo) {
  const antes = estilos.get(el) ?? {}
  const s = el.style as unknown as Record<string, string>
  for (const k of Object.keys(antes)) if (novo[k] == null) s[k] = ''
  for (const [k, v] of Object.entries(novo)) if (v != null && antes[k] !== v) s[k] = String(v)
  estilos.set(el, novo)
}

/** O relógio da exportação (s, no vídeo final): a chuva toca o loop nele. */
let relogio = 0
export const definirRelogio = (t: number) => void (relogio = t)

// ---------------------------------------------------------------- os fundos (do 18: frontend/src/inserts/Fundo.tsx)

/** Os fundos atrás dos inserts com moldura (SPEC §8.4): 3 claros e 2 escuros. A **chuva** é o fundo do Overview do design
 *  system da Asimov, que toca como vídeo (`render/fundos/aura/chuva.mp4`, um loop de 12 s gravado da cena ao vivo). */
export const FUNDOS: { id: string; nome: string; claro: boolean; amostra: string }[] = [
  { id: 'verde_claro', nome: 'Verde claro', claro: true, amostra: 'linear-gradient(180deg,#dfe8e1 0%,#a9c6b3 55%,#6f9c84 100%)' },
  { id: 'papel', nome: 'Papel', claro: true, amostra: 'radial-gradient(120% 90% at 50% 40%,#f1ecdd 0%,#e4dcc7 70%,#d6ccb3 100%)' },
  { id: 'nevoa', nome: 'Névoa azul', claro: true, amostra: 'linear-gradient(180deg,#d9d6e2 0%,#a9b2c7 45%,#8a97ad 75%,#c8ccd8 100%)' },
  { id: 'chuva', nome: 'Chuva', claro: false, amostra: 'radial-gradient(90% 70% at 50% 40%,#0c3b35 0%,#06201c 55%,#050505 100%)' },
  { id: 'gradiente', nome: 'Gradiente escuro', claro: false, amostra: 'radial-gradient(85% 70% at 50% 45%,#24423b 0%,#13201d 60%,#0b1412 100%)' },
]

// na exportação: parado no instante do relógio (o loop dá a volta)
function chuvaNoRelogio(v: HTMLVideoElement) {
  if (!v.duration) return
  v.pause()
  const alvo = relogio % v.duration
  if (Math.abs(v.currentTime - alvo) > 0.001) v.currentTime = alvo
}

export function fundo(id: string, chave = 'fundo'): V {
  const f = FUNDOS.find((x) => x.id === id) ?? FUNDOS[4]
  return {
    chave,
    classe: 'absolute inset-0 overflow-hidden',
    estilo: { background: f.id === 'chuva' ? '#050505' : f.amostra },
    filhos: [
      f.id === 'chuva' && {
        chave: 'chuva',
        tag: 'video',
        classe: 'absolute inset-0 size-full object-cover',
        atributos: { src: '/render/fundos/aura/chuva.mp4', preload: 'auto' },
        criar: (el) => {
          const v = el as HTMLVideoElement
          v.muted = v.loop = v.playsInline = true
          v.addEventListener('loadedmetadata', () => chuvaNoRelogio(v))
        },
        depois: (el) => chuvaNoRelogio(el as HTMLVideoElement),
      },
      // névoa: manchas desfocadas, como no fundo de referência
      f.id === 'nevoa' && {
        chave: 'n1',
        classe: 'absolute rounded-full',
        estilo: { top: '-10%', left: '-20%', height: '55%', width: '90%', background: '#eae6f0', opacity: 0.7, filter: 'blur(64px)' },
      },
      f.id === 'nevoa' && {
        chave: 'n2',
        classe: 'absolute rounded-full',
        estilo: { top: '40%', right: '-25%', height: '45%', width: '80%', background: '#6f7f99', opacity: 0.5, filter: 'blur(64px)' },
      },
    ],
  }
}

// ---------------------------------------------------------------- a mídia (do 18: inserts/InsertNoLugar.tsx, VideoNoTempo)

/** Um vídeo do banco parado no quadro do instante (um trecho toca o original do início ao fim dele). Uma mídia mais
 *  curta que o insert fica parada no último quadro. `topo`: cortada, mostra a parte de cima (mídias em pé). */
function videoNoTempo(m: MidiaLigada, item: ItemBanco, rel: number, topo?: boolean): V {
  const alvo = Math.min((item.inicio ?? 0) + rel, item.fim ?? Infinity)
  return {
    chave: `m:${m.id}`,
    tag: 'video',
    classe: `size-full object-cover${topo ? ' object-top' : ''}`,
    atributos: { src: item.url, preload: 'auto' },
    criar: (el) => {
      const v = el as HTMLVideoElement
      v.muted = v.playsInline = true
    },
    depois: (el) => {
      const v = el as HTMLVideoElement
      const fim = Math.min(item.fim ?? Infinity, Number.isFinite(v.duration) ? v.duration : Infinity)
      // no meio do quadro (grade de 24 fps): um instante na fronteira de dois quadros às vezes mostra o anterior (um
      // repetido e um pulado); fora de 24 fps o meio fica a ≥ 0,8 ms de qualquer fronteira (25, 30, 60 fps)
      const destino = Math.min((Math.floor(Math.min(alvo, fim) * 24 + 1e-6) + 0.5) / 24, fim - 0.001)
      if (Math.abs(v.currentTime - destino) > 0.001) {
        // a foto só sai com o quadro novo já apresentado (sem isso, às vezes sai o anterior: um quadro repetido e um pulado)
        v.dataset.quadro = '0'
        v.requestVideoFrameCallback?.(() => (v.dataset.quadro = '1'))
        v.currentTime = destino
      }
      if (!v.paused) v.pause()
    },
  }
}

/** Uma mídia do banco no instante (vídeo parado no quadro, ou imagem); também a do print sobreposto (`elementos.ts`). */
export function midia(m: MidiaLigada | undefined, banco: Map<string, ItemBanco>, rel: number, topo?: boolean): V | null {
  if (!m) return null
  const item = banco.get(m.banco)
  if (item?.tipo === 'video') return videoNoTempo(m, item, rel, topo)
  return {
    chave: `m:${m.id}`,
    tag: 'img',
    classe: `size-full object-cover${topo ? ' object-top' : ''}`,
    atributos: { src: item?.url ?? '', alt: '' },
  }
}

// ---------------------------------------------------------------- um preset tocando (do 18: presets/CenaPreset.tsx)

const SOMBRA = 'sombra-card'

/** Cada card na pose do instante, com a sua mídia dentro. As medidas são % da área do insert (a tela toda ou a metade de
 *  cima), em unidades de container. `caixa`: o tamanho da área em px, para os cards guiados pelos cantos (`quadros`). */
function cenaPreset(p: {
  receita: Receita
  rel: number
  dur: number
  fundo: string
  midia: (k: number, rel: number, topo: boolean) => V | null
  classe?: string
  semFundo?: boolean
  caixa: [number, number] | null
}): V {
  const r = noTempo(p.receita, p.dur)
  const cards: (V | null)[] = r.cards.map((c, k) => {
    const e = estadoCard(c, p.rel, p.dur)
    if (!e || e.opacidade <= 0.001) return null
    const rep = c.repouso
    const ini = janela(c, p.dur).ini
    const conteudo = () => p.midia(c.midia ?? k, Math.max(p.rel - ini, 0), c.ajuste === 'topo')
    if (c.quadros?.length) {
      const tam = p.caixa
      if (!tam) return null
      const { fim } = janela(c, p.dur)
      const q = cantosNoTempo(c.quadros, (p.rel - ini) / Math.max(fim - ini, 0.01)).map(([x, y]) => [(x / 100) * tam[0], (y / 100) * tam[1]] as [number, number])
      const w = (rep.w / 100) * tam[0], h = (rep.h / 100) * tam[1]
      return {
        chave: `c${k}`,
        classe: 'absolute top-0 left-0 origin-top-left',
        estilo: { width: `${w}px`, height: `${h}px`, zIndex: rep.z, opacity: e.opacidade, transform: matrizDosCantos(w, h, q), filter: rep.desfoque ? `blur(${(rep.desfoque / 10.8).toFixed(3)}cqw)` : undefined },
        filhos: [{ chave: 'moldura', classe: 'size-full overflow-hidden', estilo: { borderRadius: `${(rep.raio * rep.w) / 100}cqw` }, filhos: [conteudo()] }],
      }
    }
    const giro3d = rep.rx + e.rx || rep.ry + e.ry ? `perspective(138.9cqw) rotateX(${rep.rx + e.rx}deg) rotateY(${rep.ry + e.ry}deg) ` : ''
    return {
      chave: `c${k}`,
      classe: 'absolute',
      estilo: {
        left: `${rep.cx - rep.w / 2}%`,
        top: `${rep.cy - (rep.h * (e.altura ?? 1)) / 2}%`,
        width: `${rep.w}%`,
        height: `${rep.h * (e.altura ?? 1)}%`,
        zIndex: rep.z,
        opacity: e.opacidade,
        transform: `translate(${e.dx}cqw, ${e.dy}cqh) ${giro3d}rotate(${rep.rot + e.rot}deg) scale(${e.escala})`,
        filter: e.desfoque + (rep.desfoque ?? 0) > 0.05 ? `blur(${((e.desfoque + (rep.desfoque ?? 0)) / 10.8).toFixed(3)}cqw)` : undefined,
      },
      filhos: [
        {
          chave: 'moldura',
          classe: `size-full overflow-hidden${rep.sombra ? ` ${SOMBRA}` : ''}${c.ajuste === 'contain' ? ' bg-black' : ''}`,
          estilo: { borderRadius: `${(rep.raio * rep.w) / 100}cqw` },
          filhos: [
            c.zoom
              ? { chave: 'zoom', classe: 'size-full', estilo: { transform: `scale(${zoomMidia(c, p.rel, p.dur)})`, transformOrigin: `${c.zoom.ox}% ${c.zoom.oy}%` }, filhos: [conteudo()] }
              : conteudo(),
          ],
        },
      ],
    }
  })
  return {
    chave: 'cena',
    classe: `pointer-events-none absolute isolate overflow-hidden ${p.classe ?? ''}${r.fundo === 'nenhum' && !p.semFundo ? ' bg-black' : ''}`,
    estilo: { containerType: 'size' },
    // `semFundo`: quem usa já desenha o fundo, maior que a cena (o "ator embaixo": a tela toda)
    filhos: [r.fundo === 'proprio' && !p.semFundo && fundo(p.fundo), ...cards],
  }
}

// ---------------------------------------------------------------- o insert no lugar (do 18: inserts/InsertNoLugar.tsx)

/** As mídias do insert do momento, no lugar: com preset, a cena dele (layout, entrada e saída de cada mídia); sem
 *  preset, o estilo simples do formato (`inserts.ESTILO_SIMPLES`). `caixa`: o tamanho da área em px (ou null antes de
 *  medir), para os cards guiados pelos cantos. `so` (o insert que o ffmpeg desenha, `geometriaDoInsert`): só o fundo da
 *  área, ou só a sombra do card k parado no 1º instante dele (sem a mídia nem o fundo). */
export function insertNoLugar(p: {
  pedido: PedidoNoTempo
  banco: Map<string, ItemBanco>
  tempo: number
  fundo: string
  receita: Receita | null
  divisao: Divisao | null
  caixa: [number, number] | null
  so?: 'fundo' | number
}): V[] {
  const { pedido, banco, divisao } = p
  const area = areaDoInsert(divisao)
  const n = pedido.midias.length
  const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01)
  let rel = Math.max(p.tempo - pedido.t.inicio, 0)
  // sem mídia, a exportação mostra o ator limpo
  if (!n) return []
  // no "ator embaixo" o insert vai na tela toda: o fundo cobre também o espaço em volta da janela do ator
  const atras: V | false = divisao?.modo === 'atras' && { chave: 'atras', classe: 'pointer-events-none absolute inset-0', filhos: [fundo(p.fundo)] }
  if (p.receita) {
    let receita = p.receita
    if (p.so === 'fundo') receita = { ...receita, cards: [] }
    else if (p.so != null) {
      const c = receita.cards[p.so]
      receita = { ...receita, fundo: 'proprio', cards: [c] }
      rel = c.inicio_frac * dur
    }
    const sombra = typeof p.so === 'number'
    return [
      atras,
      {
        chave: 'area',
        classe: 'pointer-events-none absolute',
        estilo: area,
        filhos: [
          cenaPreset({
            receita,
            rel,
            dur,
            fundo: p.fundo,
            classe: 'inset-0',
            semFundo: divisao?.modo === 'atras' || sombra,
            caixa: p.caixa,
            midia: (k, relM, topo) => (sombra ? null : midia(pedido.midias[k], banco, relM, topo)),
          }),
        ],
      },
    ].filter(Boolean) as V[]
  }

  // sem preset: o estilo simples do formato (card com fundo na tela cheia, a mídia ocupando a metade de cima na dividida),
  // cada mídia em sequência, com a entrada "Surgir"
  const emCard = ESTILO_SIMPLES[pedido.formato].layout === 'card'
  const { k, ini, durM } = corteSimples(n, rel, dur)
  const anim = estiloSimples(rel - ini, durM)
  return [
    atras,
    {
      chave: 'area',
      classe: `pointer-events-none absolute overflow-hidden${emCard ? '' : ' bg-black'}`,
      estilo: area,
      filhos: [
        emCard && fundo(p.fundo),
        {
          chave: `moldura${k}`,
          classe: `absolute ${emCard ? 'inset-8p' : 'inset-0'}`,
          estilo: anim,
          filhos: [{ chave: 'card', classe: `size-full overflow-hidden${emCard ? ` ${SOMBRA} rounded-18` : ''}`, filhos: [midia(pedido.midias[k], banco, rel - ini)] }],
        },
      ],
    },
  ].filter(Boolean) as V[]
}

/** Um insert que o render desenha pelo ffmpeg, sem fotografar (`exportacao.camada_do_insert`): os cards só ficam
 *  parados no lugar, no máximo com o zoom lento contínuo (a câmera), sem entrada, saída, zoom na mídia, giro, desfoque
 *  nem cantos medidos. As medidas são as que `cenaPreset` usa: a área (fração do quadro) e cada card em % dela (`raio`
 *  em % da largura da área), com a janela de tempo (s desde o começo do insert), o contínuo (por segundo) e a mídia
 *  (o arquivo que a página toca). `fundo`: o id do fundo da área (null: preto, a receita sem fundo). Os cards vêm na
 *  ordem em que são pintados. null: o insert anima de verdade e vai para a foto. */
export type Geometria = {
  /** frações do quadro; deitado, lado a lado, a área vai à esquerda (`x`, `w`) */
  area: { x?: number; w?: number; y: number; h: number }
  fundo: string | null
  cards: {
    k: number
    ini: number
    fim: number
    cx: number
    cy: number
    w: number
    h: number
    raio: number
    sombra: boolean
    topo: boolean
    continuo: { escala: number; dx: number; dy: number } | null
    midia: { tipo: 'video' | 'imagem'; url: string; inicio: number; fim: number | null }
  }[]
}
export function geometriaDoInsert(pedido: PedidoNoTempo, banco: Map<string, ItemBanco>, receita: Receita | null, divisao: Divisao | null, fundoId: string): Geometria | null {
  if (!receita || !pedido.midias.length || divisao?.modo === 'atras') return null
  const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01)
  const r = noTempo(receita, dur)
  const cards: Geometria['cards'] = []
  for (const [k, c] of r.cards.entries()) {
    const rep = c.repouso
    if (c.quadros?.length || c.entrada || c.saida || c.zoom || rep.rot || rep.rx || rep.ry || rep.desfoque || c.continuo?.rot) return null
    const item = banco.get(pedido.midias[c.midia ?? k]?.banco ?? '')
    if (!item) return null
    const z = c.continuo
    cards.push({
      k, ...janela(c, dur), cx: rep.cx, cy: rep.cy, w: rep.w, h: rep.h, raio: (rep.raio * rep.w) / 100, sombra: !!rep.sombra, topo: c.ajuste === 'topo',
      continuo: z && (z.escala || z.dx || z.dy) ? { escala: z.escala, dx: z.dx, dy: z.dy } : null,
      midia: { tipo: item.tipo, url: item.url, inicio: item.inicio ?? 0, fim: item.fim ?? null },
    })
  }
  // a ordem de pintura: o z-index de cada card e, no empate, a ordem deles
  cards.sort((a, b) => r.cards[a.k].repouso.z - r.cards[b.k].repouso.z || a.k - b.k)
  const f = FUNDOS.find((x) => x.id === fundoId) ?? FUNDOS[4]
  const area = !divisao ? { y: 0, h: 1 } : QUADRO.deitado ? { x: 0, w: divisao.f, y: 0, h: 1 } : { y: 0, h: divisao.f }
  return { area, fundo: r.fundo === 'proprio' ? f.id : null, cards }
}

// ---------------------------------------------------------------- um motion tocando (do 18: motions/MotionNoLugar.tsx)

const PALCO = { vertical: { w: 1080, h: 1920 }, dividida: { w: 1080, h: 960 }, alto: { w: 1080, h: 1344 } }
type Janela = Window & { __ir?: (t: number) => Promise<void> }
let pinturas = 0

/** Leva a cena do iframe ao instante `rel`; enquanto pinta, o iframe fica marcado (a página espera antes da foto). */
function pintar(f: HTMLIFrameElement, rel: number) {
  const ir = (f.contentWindow as Janela | null)?.__ir
  if (!ir) return
  const n = String(++pinturas)
  f.dataset.pintando = n
  void ir(rel).finally(() => {
    if (f.dataset.pintando === n) delete f.dataset.pintando
  })
}

/** Um motion tocando (SPEC §8.5): a página dele num iframe do tamanho do palco, escalada para caber na área do plano (a
 *  tela toda ou a metade de cima), com o fundo escolhido atrás. A cada instante, `__ir(rel)` leva a cena até lá.
 *  `escala`: a largura da área ÷ a do palco (0 antes de medir: sem iframe ainda). Deitado, os dois formatos tocam no
 *  palco da dividida (1080×960, que os presets já sabem desenhar): na tela cheia, centrado na altura toda, com o fundo
 *  no quadro inteiro (`x`: o deslocamento do palco, px); lado a lado, ocupando a área do insert, à esquerda. */
export function motionNoLugar(p: { src: string; formato: 'vertical' | 'dividida' | 'alto'; rel: number; fundo?: string; escala: number; x?: number }): V {
  const palco = PALCO[QUADRO.deitado ? 'dividida' : p.formato]
  const lugar = p.formato === 'vertical' ? 'inset-0' : QUADRO.deitado ? 'top-0 left-0' : 'inset-x-0 top-0 h-1-2'
  return {
    chave: 'motion',
    classe: `pointer-events-none overflow-hidden absolute ${lugar}`,
    estilo: p.formato === 'dividida' && QUADRO.deitado ? { bottom: 0, width: `${palco.w * p.escala}px` } : p.formato === 'alto' ? { height: '70%', bottom: 'auto' } : undefined,
    filhos: [
      p.fundo ? fundo(p.fundo) : null,
      p.escala > 0 && {
        chave: `iframe:${p.src}`,
        tag: 'iframe',
        classe: 'absolute top-0 left-0 origin-top-left border-0',
        atributos: { title: 'motion' },
        estilo: { width: `${palco.w}px`, height: `${palco.h}px`, transform: `${p.x ? `translateX(${p.x}px) ` : ''}scale(${p.escala})` },
        criar: (el) => {
          const f = el as HTMLIFrameElement
          f.dataset.pronto = '0'
          f.addEventListener('load', () => {
            f.dataset.pronto = '1'
            pintar(f, Number(f.dataset.rel ?? 0))
          })
          f.src = p.src
        },
        depois: (el) => {
          const f = el as HTMLIFrameElement
          // um iframe que saiu da tela e voltou carrega a página de novo: pronto só quando o `load` chegar
          if (!(f.contentWindow as Janela | null)?.__ir || f.contentDocument?.readyState !== 'complete') f.dataset.pronto = '0'
          if (f.dataset.rel === String(p.rel) && f.dataset.pronto === '1') return
          f.dataset.rel = String(p.rel)
          if (f.dataset.pronto === '1') pintar(f, p.rel)
        },
      },
    ],
  }
}
