/** Os elementos da direção desenhados na camada (no 18 só eram marcados: SPEC §8.2, "ainda não são desenhados no vídeo
 *  final"): o texto grande do plano Full ator com lettering e os elementos Lettering, Palavra ManyChat, Caixinha de
 *  perguntas e Print sobreposto. O estilo é o medido nos quadros das referências do criador (a caixinha não aparece em
 *  nenhuma: é o sticker de pergunta dos Stories). Medidas em unidades do quadro (cqw/cqh), iguais em 720p, 1080p e 4K.
 *  Daqui saem também o que a legenda contorna (`zonasDosElementos`), onde ela some (`intervalosDeLettering`) e os sons. */
import { midia, type V } from './desenho'
import { bezier, limite01 } from './curvas'
import { eventoNoTempo, type Catalogo, type EventoSom } from './sons'
import type { Zona } from './legenda'
import type { ItemBanco } from './tipos'
import type { Rosto } from './ator'

/** Onde o elemento cai: sobre o ator em tela cheia, sobre um insert ou motion na tela toda, na tela dividida (o insert
 *  em cima até `f`) ou no "ator embaixo" (o insert na tela toda e a janela do ator a partir de `f`). `rosto`: o rosto do
 *  ator no trecho (`ator.rostoDoArquivo`), no ator em tela cheia. */
export type Lugar = { modo: 'ator' | 'cheia' | 'metade' | 'atras'; f: number; rosto: Rosto | null }
/** Um elemento no tempo do vídeo final (o plano Full ator com lettering entra como um, com o tipo do plano). `banco`: no
 *  print sobreposto, a mídia do banco (imagem ou vídeo) que vai no card; sem ela, uma etiqueta com o texto. */
export type Elemento = { id: string; tipo: string; inicio: number; fim: number; texto: string | null; descricao: string; banco: string | null; largura?: number; y?: number; lugar: Lugar }

/** O queixo e os olhos do ator (fração da altura): pela caixa do rosto medido (os olhos como em `ator.enquadrar`); sem
 *  medida, os das referências. */
const queixo = (l: Lugar) => (l.rosto ? l.rosto.cy + l.rosto.h / 2 : 0.45)
const olhos = (l: Lugar) => (l.rosto ? l.rosto.cy - 0.15 * l.rosto.h : 0.29)
const FONTE = "'SF Pro Display', system-ui, sans-serif"
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"
const W_H = 9 / 16 // largura ÷ altura do quadro
/** A entrada de todos: um "pop" rápido (escala e opacidade na curva de chegada); a saída é seca. */
const POP = { dur: 0.18, escala: 0.92, curva: bezier(0.16, 1, 0.3, 1) }
/** A altura das maiúsculas da SF Pro Display (em, medida no Chrome) e o tamanho de cada texto, pelas maiúsculas medidas
 *  nas referências (fração da altura do quadro): o Full ator com lettering ~5,75%, o lettering sobre insert ~4,5%, a
 *  palavra do ManyChat ~2,35%. */
const MAIUSCULA = 0.7046
const TAM = { grande: 5.75 / MAIUSCULA, insert: 4.5 / MAIUSCULA, manychat: 2.35 / MAIUSCULA }
/** A sombra dos letterings: escura e difusa, como a da legenda. */
const SOMBRA_TEXTO = '0 0.03em 0.16em rgba(0,0,0,0.55), 0 0 0.04em rgba(0,0,0,0.25)'
/** O insert atrás de um lettering: desfocado (cqw) e escurecido (fração), como no "Spec to Code" das referências. */
const DESFOQUE = { raio: 0.9, escurece: 0.22 }
/** A barra do ManyChat (frações do quadro, medidas no "Design" da referência 48). */
const BARRA = { w: 0.94, h: 0.076, y: 0.64, texto: 0.075 }
/** A digitação da palavra no ManyChat (s): começa logo depois do pop, uma letra a cada `letra` s (no máximo `max` s, e
 *  nunca mais que metade do elemento); no fim, o botão de enviar dá um toque (escala 0,9 → 1 em `toque` s). */
const DIGITAR = { atraso: 0.1, letra: 0.07, max: 1, toque: 0.22 }
/** Os sons (mesmos eventos dos presets): a digitação na palavra do ManyChat e um pop leve quando a caixinha ou o print
 *  aparecem. Lettering, sem som. */
const SONS = { digitacao: ['typing-ios-01', 'Digitação'], pop: ['ui-pop-02', 'Pop'] } as const
/** O avião de papel do botão de enviar (branco). */
const AVIAO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" d="M3 11 22 2 13 21 11 13Z"/></svg>')}`

// ---------------------------------------------------------------- medir texto

let ctx: CanvasRenderingContext2D | null = null
/** A largura do texto em em (a fonte do sistema: a SF da Apple, instalada no Mac). */
function emEm(texto: string, peso: number, familia = FONTE) {
  ctx ??= document.createElement('canvas').getContext('2d')!
  ctx.font = `${peso} 100px ${familia}`
  return ctx.measureText(texto).width / 100
}
/** O maior tamanho (cqh) até `base` em que o texto cabe em `max` da largura do quadro. */
const caberEm = (texto: string, base: number, max: number, peso = 700) => Math.min(base, (max * 100 * W_H) / Math.max(emEm(texto, peso), 0.01))

/** Um lettering no tamanho `base`, encolhido para caber em 86% da largura; se encolheria abaixo de 3/4 dele, vai em duas
 *  linhas equilibradas. */
function lettering(texto: string, base: number) {
  const um = caberEm(texto, base, 0.86)
  const ps = texto.trim().split(/\s+/)
  let melhor = { tam: um, texto }
  if (um >= 0.75 * base || ps.length < 2) return melhor
  for (let k = 1; k < ps.length; k++) {
    const a = ps.slice(0, k).join(' '), b = ps.slice(k).join(' ')
    const tam = Math.min(caberEm(a, base, 0.86), caberEm(b, base, 0.86))
    if (tam > melhor.tam) melhor = { tam, texto: `${a}\n${b}` }
  }
  return melhor
}

/** As linhas do texto num tamanho (cqh) e numa largura (fração do quadro), quebradas nas palavras. */
function quebrar(texto: string, tam: number, largura: number, peso: number) {
  const cabe = (s: string) => emEm(s, peso) * tam <= largura * 100 * W_H
  const linhas: string[] = []
  for (const p of texto.trim().split(/\s+/)) {
    const u = linhas[linhas.length - 1]
    if (u != null && cabe(`${u} ${p}`)) linhas[linhas.length - 1] = `${u} ${p}`
    else linhas.push(p)
  }
  return linhas
}

// ---------------------------------------------------------------- onde cada um fica

/** A caixinha de perguntas: o card (frações do quadro), o tamanho das letras (cqh) e as linhas da pergunta. A ~32% da
 *  altura; sobre o ator, subindo até ficar acima dos olhos (como os stickers dos Stories, que não cobrem o rosto); na
 *  tela dividida, na costura, como o card do comentário (no meio da metade de cima, ela tapava o insert atrás), sem
 *  descer mais que 5% abaixo dela (a caixinha de três linhas cobria a cabeça do ator). */
const CAIXINHA = { w: 0.8, cabecalho: 1.9, pergunta: 2.9, pad: 2.2, padCab: 1.4, y: 0.32 }
function medidasCaixinha(e: Elemento) {
  const linhas = quebrar(e.texto ?? '', CAIXINHA.pergunta, CAIXINHA.w - 0.1, 600)
  const h = (2 * CAIXINHA.padCab + CAIXINHA.cabecalho * 1.2 + 2 * CAIXINHA.pad + linhas.length * CAIXINHA.pergunta * 1.25) / 100
  const l = e.lugar
  const y = l.modo === 'metade' ? Math.max(Math.min(l.f, l.f + 0.05 - h / 2), h / 2 + 0.03) : l.modo === 'ator' ? Math.min(CAIXINHA.y, Math.max(olhos(l) - 0.03 - h / 2, h / 2 + 0.05)) : CAIXINHA.y
  return { linhas, h, y }
}

/** O print: o card da mídia (meia largura, na proporção dela, até 30% da altura) ou a etiqueta do texto. No ator, sobre
 *  o peito (logo abaixo do queixo); na tela dividida, na costura; no "ator embaixo", logo acima da janela. */
function medidasPrint(e: Elemento, item: ItemBanco | undefined) {
  let w = e.largura ?? 0.5, h = 0
  if (item) {
    const a = item.largura && item.altura ? item.largura / item.altura : 16 / 9
    h = (w * W_H) / a
    if (h > 0.3) {
      h = 0.3
      w = (h * a) / W_H
    }
  } else h = 0.055 // a etiqueta: uma linha de 2,6 cqh com o respiro
  const { modo, f } = e.lugar
  const meio = e.y !== undefined ? e.y : modo === 'metade' ? f : modo === 'atras' ? Math.min(f, 0.72) - h / 2 - 0.02 : modo === 'ator' ? queixo(e.lugar) + 0.04 + h / 2 : 0.66
  return { w, h, y: Math.min(Math.max(meio, h / 2 + 0.03), 0.97 - h / 2) }
}

/** A barra do ManyChat: no ator e na tela toda, a altura medida; na tela dividida, na costura. */
const yBarra = (l: Lugar) => (l.modo === 'metade' ? l.f : BARRA.y)

/** A digitação da palavra do ManyChat: quando começa e quanto dura (s desde o começo do elemento). */
function digitacao(e: Elemento) {
  const n = [...(e.texto ?? '')].length
  return { ini: DIGITAR.atraso, dur: Math.max(Math.min(n * DIGITAR.letra, DIGITAR.max, (e.fim - e.inicio) / 2 - DIGITAR.atraso), 0.05), n }
}

// ---------------------------------------------------------------- o desenho

const pop = (rel: number) => {
  const p = POP.curva(limite01(rel / POP.dur))
  return { escala: POP.escala + (1 - POP.escala) * p, opacidade: p }
}
const centrado = (y: number, rel: number) => {
  const p = pop(rel)
  return { left: '50%', top: `${y * 100}%`, transform: `translate(-50%, -50%) scale(${p.escala})`, opacity: p.opacidade }
}

/** O texto grande do Full ator com lettering (e um lettering sobre o ator): branco, centrado logo abaixo do rosto. */
function letteringNoAtor(e: Elemento, rel: number): V {
  const { tam, texto } = lettering(e.texto ?? '', TAM.grande)
  const y = Math.min(Math.max(queixo(e.lugar) + 0.08, 0.5), 0.6)
  return { chave: e.id, classe: 'absolute', estilo: { ...centrado(y, rel), ...estiloLettering(tam) }, texto }
}

/** O lettering sobre um insert ou motion: branco, no meio da área do insert (na tela dividida, no meio da metade de cima;
 *  na tela toda, a ~30% da altura), com o insert desfocado e escurecido atrás enquanto ele está na tela (como o "Spec to
 *  Code" das referências: o texto legível sobre qualquer conteúdo). */
function letteringNoInsert(e: Elemento, rel: number): V {
  const { modo, f } = e.lugar
  const y = modo === 'metade' ? f / 2 : modo === 'atras' ? Math.min(f, 0.72) / 2 : 0.3
  const { tam, texto } = lettering(e.texto ?? '', TAM.insert)
  const p = pop(rel).opacidade
  return {
    chave: e.id,
    classe: 'absolute inset-0',
    filhos: [
      {
        chave: 'desfoque',
        classe: 'absolute',
        estilo: { ...(modo === 'metade' ? { left: 0, right: 0, top: 0, height: `${f * 100}%` } : { inset: 0 }), backdropFilter: `blur(${(DESFOQUE.raio * p).toFixed(3)}cqw) brightness(${1 - DESFOQUE.escurece * p})` },
      },
      { chave: 'texto', classe: 'absolute', estilo: { ...centrado(y, rel), ...estiloLettering(tam) }, texto },
    ],
  }
}

const estiloLettering = (tam: number) => ({
  fontFamily: FONTE,
  fontWeight: 700,
  fontSize: `${tam.toFixed(3)}cqh`,
  lineHeight: 1.08,
  color: '#fff',
  textAlign: 'center',
  whiteSpace: 'pre',
  textShadow: SOMBRA_TEXTO,
})

/** A palavra ManyChat: a barra de comentário em pílula com a palavra sendo digitada e o botão de enviar, que dá um
 *  toque quando a digitação acaba. */
function manychat(e: Elemento, rel: number): V {
  const d = digitacao(e)
  const letras = [...(e.texto ?? '').toUpperCase()] // em caixa alta (revisão do criador: a palavra mais destacada)
  const n = rel < d.ini ? 0 : Math.min(letras.length, Math.floor(((rel - d.ini) / d.dur) * letras.length) + 1)
  const digitando = rel < d.ini + d.dur
  const toque = rel - d.ini - d.dur
  const escala = toque < 0 ? 1 : 0.9 + 0.1 * POP.curva(limite01(toque / DIGITAR.toque))
  const botao = BARRA.h * 0.9 * 100 // cqh
  return {
    chave: e.id,
    classe: 'absolute',
    estilo: {
      ...centrado(yBarra(e.lugar), rel),
      width: `${BARRA.w * 100}cqw`,
      height: `${BARRA.h * 100}cqh`,
      borderRadius: '9999px',
      background: 'linear-gradient(180deg, #fbfbfb 0%, #f3f3f3 55%, #e8e8e8 100%)',
      boxShadow: '0 0.5cqh 1.6cqh rgba(0,0,0,0.28), 0 0.1cqh 0.3cqh rgba(0,0,0,0.2), inset 0 -0.15cqh 0.3cqh rgba(0,0,0,0.06)',
    },
    filhos: [
      {
        chave: 'palavra',
        classe: 'absolute flex',
        // centrada na barra (entre a borda e o botão de enviar), em negrito
        estilo: { left: `${(BARRA.texto - (1 - BARRA.w) / 2) * 100}cqw`, right: `${BARRA.h * 100}cqh`, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', fontFamily: FONTE, fontWeight: 700, letterSpacing: '0.04em', fontSize: `${(TAM.manychat * 1.25).toFixed(3)}cqh`, color: '#151515', whiteSpace: 'pre' },
        filhos: [
          { chave: 'texto', tag: 'span', texto: letras.slice(0, n).join('') },
          digitando && { chave: 'cursor', tag: 'span', estilo: { width: '0.3cqw', height: '1.15em', marginLeft: '0.2cqw', background: '#2a2a2a', borderRadius: '0.2cqw' } },
        ],
      },
      {
        chave: 'botao',
        classe: 'absolute rounded-full flex',
        estilo: {
          right: `${(BARRA.h * 100 - botao) / 2}cqh`,
          top: '50%',
          width: `${botao}cqh`,
          height: `${botao}cqh`,
          transform: `translateY(-50%) scale(${escala})`,
          background: '#151515',
          alignItems: 'center',
          justifyContent: 'center',
        },
        filhos: [{ chave: 'aviao', tag: 'img', atributos: { src: AVIAO, alt: '' }, estilo: { width: '48%', height: '48%', transform: 'translate(-6%, 6%)' } }],
      },
    ],
  }
}

/** A caixinha de perguntas: o sticker de pergunta dos Stories (card branco, o cabeçalho no degradê do Instagram e a
 *  pergunta em preto). */
function caixinha(e: Elemento, rel: number): V {
  const m = medidasCaixinha(e)
  return {
    chave: e.id,
    classe: 'absolute overflow-hidden bg-white',
    estilo: { ...centrado(m.y, rel), width: `${CAIXINHA.w * 100}cqw`, borderRadius: '3.4cqw', boxShadow: '0 1cqh 3cqh rgba(0,0,0,0.3), 0 0.2cqh 0.6cqh rgba(0,0,0,0.18)', fontFamily: FONTE, textAlign: 'center' },
    filhos: [
      {
        chave: 'cabecalho',
        estilo: { padding: `${CAIXINHA.padCab}cqh 4cqw`, background: 'linear-gradient(90deg, #f58529 0%, #dd2a7b 45%, #8134af 78%, #515bd4 100%)', color: '#fff', fontWeight: 500, fontSize: `${CAIXINHA.cabecalho}cqh`, lineHeight: 1.2 },
        texto: 'Faça uma pergunta',
      },
      {
        chave: 'pergunta',
        estilo: { padding: `${CAIXINHA.pad}cqh 5cqw`, color: '#000', fontWeight: 600, fontSize: `${CAIXINHA.pergunta}cqh`, lineHeight: 1.25, whiteSpace: 'pre' },
        texto: m.linhas.join('\n'),
      },
    ],
  }
}

/** O print sobreposto: a mídia do banco num card arredondado com sombra; sem mídia, uma etiqueta escura translúcida com
 *  o texto em fonte mono (como o "/find_skills" das referências); sem os dois, nada (a `descricao` é só a marcação). */
function print(e: Elemento, rel: number, banco: Map<string, ItemBanco>): V | null {
  const item = e.banco ? banco.get(e.banco) : undefined
  const m = medidasPrint(e, item)
  if (item)
    return {
      chave: e.id,
      classe: 'absolute overflow-hidden sombra-card',
      estilo: { ...centrado(m.y, rel), width: `${m.w * 100}cqw`, height: `${m.h * 100}cqh`, borderRadius: '2.2cqw', background: '#111' },
      filhos: [midia({ id: e.id, banco: item.id }, banco, Math.max(rel, 0))],
    }
  const texto = e.texto
  if (!texto) return null
  return {
    chave: e.id,
    classe: 'absolute',
    estilo: {
      ...centrado(m.y, rel),
      padding: '1.2cqh 3.2cqw',
      borderRadius: '1.8cqw',
      background: 'rgba(14,14,14,0.62)',
      boxShadow: '0 0.6cqh 2cqh rgba(0,0,0,0.3), inset 0 0 0 0.12cqw rgba(255,255,255,0.14)',
      fontFamily: MONO,
      fontWeight: 500,
      fontSize: `${caberEm(texto, 2.6, 0.84, 500).toFixed(3)}cqh`,
      lineHeight: 1.2,
      color: '#fff',
      whiteSpace: 'pre',
    },
    texto,
  }
}

/** A tarja: o texto do post em cima do vídeo, nos primeiros segundos, como o sticker de texto do Instagram (caixa branca,
 *  texto preto em negrito, emojis coloridos), alinhada à esquerda no alto do quadro, abaixo da barra do Instagram
 *  (progressao · 2026-11-03: "uma tarja estilo isso", o print do post "As interfaces… são BIZARRAS 🤯🤯🤯"). */
const TARJA = { y: 0.13, x: 0.04, larguraMax: 0.84, letra: 3.4, peso: 800 }
/** O texto da tarja em duas linhas equilibradas (o criador: "de preferência em 2 linhas"), no maior tamanho até
 *  `letra` em que a linha mais longa cabe; uma quebra escrita no texto manda. */
function linhasDaTarja(texto: string) {
  // a linha cabe na caixa sem o respiro dela (2,6 cqw de cada lado) e com folga para a medida do canvas
  const cabe = (s: string) => caberEm(s, TARJA.letra, TARJA.larguraMax - 2 * 0.026 - 0.02, TARJA.peso)
  if (texto.includes('\n')) return { texto, tam: Math.min(...texto.split('\n').map(cabe)), n: texto.split('\n').length }
  const ps = texto.trim().split(/\s+/)
  let melhor = { texto, tam: cabe(texto), n: 1, sobra: Infinity }
  for (let k = 1; k < ps.length; k++) {
    const a = ps.slice(0, k).join(' '), b = ps.slice(k).join(' ')
    const tam = Math.min(cabe(a), cabe(b))
    const sobra = Math.abs(emEm(a, TARJA.peso) - emEm(b, TARJA.peso)) // as duas linhas do mesmo tamanho, de preferência
    if (melhor.n === 1 || tam > melhor.tam + 0.01 || (tam > melhor.tam - 0.01 && sobra < melhor.sobra)) melhor = { texto: `${a}\n${b}`, tam, n: 2, sobra }
  }
  return melhor
}
const medidasTarja = (e: Elemento) => {
  const l = linhasDaTarja(e.texto ?? '')
  const h = (l.n * l.tam * 1.12 + 2.4) / 100
  return { y: TARJA.y + h / 2, h }
}

function tarja(e: Elemento): V | null {
  if (!e.texto) return null
  const l = linhasDaTarja(e.texto)
  return {
    chave: e.id,
    classe: 'absolute',
    estilo: {
      left: `${TARJA.x * 100}cqw`,
      top: `${TARJA.y * 100}cqh`,
      padding: '1.1cqh 2.6cqw 1.3cqh',
      borderRadius: '2.2cqw',
      background: 'rgba(255,255,255,0.94)',
      boxShadow: '0 0.5cqh 1.6cqh rgba(0,0,0,0.22)',
      fontFamily: "'SF Pro Display', system-ui, sans-serif, 'Apple Color Emoji'",
      fontWeight: TARJA.peso,
      fontSize: `${l.tam.toFixed(3)}cqh`,
      lineHeight: 1.12,
      letterSpacing: '-0.01em',
      color: '#111',
      whiteSpace: 'pre',
    },
    texto: l.texto,
  }
}

/** Os elementos na tela no instante `t` (dentro do contêiner do quadro, acima dos inserts, motions e do card do
 *  comentário) e a chave deles: '' sem nenhum, null se algum está mexendo (o pop, a digitação, o toque), senão os ids
 *  (parados: o render reaproveita a foto). */
export function desenharElementos(t: number, elementos: Elemento[], banco: Map<string, ItemBanco>): { vs: V[]; chave: string | null } {
  const agora = elementos.filter((e) => e.inicio <= t && t < e.fim)
  if (!agora.length) return { vs: [], chave: '' }
  let parado = true
  const filhos = agora.map((e) => {
    const rel = t - e.inicio
    const d = e.tipo === 'palavra_manychat' ? digitacao(e) : null
    if (e.tipo !== 'tarja' && rel < (d ? d.ini + d.dur + DIGITAR.toque : POP.dur)) parado = false
    if (e.tipo === 'full_ator_lettering' || (e.tipo === 'lettering' && e.lugar.modo === 'ator')) return letteringNoAtor(e, rel)
    if (e.tipo === 'lettering') return letteringNoInsert(e, rel)
    if (e.tipo === 'palavra_manychat') return manychat(e, rel)
    if (e.tipo === 'caixinha_perguntas') return caixinha(e, rel)
    if (e.tipo === 'print_sobreposto') return print(e, rel, banco)
    if (e.tipo === 'tarja') return tarja(e)
    return null
  })
  const vs: V[] = [{ chave: 'elementos', classe: 'pointer-events-none absolute inset-0 select-none', estilo: { containerType: 'size', zIndex: 20 }, filhos }]
  return { vs, chave: parado ? `e:${agora.map((e) => e.id).join(',')}` : null }
}

// ---------------------------------------------------------------- a legenda e os sons

/** Onde um lettering mostra a fala: a legenda dessas palavras some (nas referências as duas nunca aparecem juntas). */
export const intervalosDeLettering = (elementos: Elemento[]) =>
  elementos.filter((e) => (e.tipo === 'full_ator_lettering' || e.tipo === 'lettering') && e.texto).map((e) => ({ ini: e.inicio, fim: e.fim }))

/** O que a legenda contorna (como o card do comentário): a barra do ManyChat, a caixinha e o print. */
export function zonasDosElementos(elementos: Elemento[], banco: Map<string, ItemBanco>): Zona[] {
  return elementos.flatMap((e) => {
    const card =
      e.tipo === 'palavra_manychat' ? { y: yBarra(e.lugar), h: BARRA.h }
      : e.tipo === 'caixinha_perguntas' ? medidasCaixinha(e)
      : e.tipo === 'print_sobreposto' ? medidasPrint(e, e.banco ? banco.get(e.banco) : undefined)
      : e.tipo === 'tarja' ? medidasTarja(e)
      : null
    return card ? [{ ini: e.inicio, fim: e.fim, divisao: null, ator: null, card: { y: card.y, h: card.h } }] : []
  })
}

/** Os sons dos elementos no tempo do vídeo final: a digitação no ManyChat (com a duração dela) e o pop da caixinha e do
 *  print quando aparecem. */
export function sonsDosElementos(elementos: Elemento[], cat: Catalogo | null): EventoSom[] {
  if (!cat) return []
  const som = ([id, familia]: readonly [string, string]) => (cat.sons.find((s) => s.id === id) ?? cat.sons.find((s) => s.familia === familia))?.id ?? null
  return elementos.flatMap((e) => {
    if (e.tipo === 'palavra_manychat' && e.texto) {
      const d = digitacao(e)
      const ev = eventoNoTempo({ som: som(SONS.digitacao), intensidade: 'baixo', atraso: 0 }, e.inicio + d.ini, cat, +d.dur.toFixed(3))
      return ev ? [ev] : []
    }
    if (e.tipo === 'caixinha_perguntas' || (e.tipo === 'print_sobreposto' && (e.banco || e.texto))) {
      const ev = eventoNoTempo({ som: som(SONS.pop), intensidade: 'baixo', atraso: 0 }, e.inicio, cat)
      return ev ? [ev] : []
    }
    return []
  })
}
