// do 18: frontend/src/ator/ator.ts (só as contas; sem o desenho do ator, que é do ffmpeg, e com o rosto lido do arquivo
// sem o hook useRosto)
import type { Divisao } from './divisao'
import type { Sequencia } from './sequencia'
import { QUADRO } from './quadro'

/** O ator nas áreas que sobram quando um insert divide a tela (SPEC §8.7; docs/rosto.md, a P5). Tudo vira uma
 *  **geometria**: o quadro do ator (do tamanho do vídeo) com o canto de cima à esquerda em (`tx`, `ty`) e a escala `s`,
 *  em frações do quadro. A mesma conta vale para a prévia (CSS) e para a exportação (a página de render manda a
 *  geometria junto da divisão; `exportacao._ator` só aplica os números).
 *  - **Tela dividida** (`metade`): o ator inteiro embaixo do insert, enquadrado pelo rosto do plano — o centro do rosto
 *    no meio da largura, os olhos a 40% da altura da área, o topo da cabeça com folga, ampliado até 1,6× se preciso
 *    (sempre cobrindo a área). Ajuste manual: deslocamento e zoom (`dx`, `dy`, `zoom`).
 *  - **"Ator embaixo"** (`atras`, o insert na tela toda), em três modos: a **janela** (o ator encolhido, recortado numa
 *    janela de cantos redondos, com a cabeça saindo por cima), **recortado** (só a pessoa, sem o cenário, pela máscara do
 *    recorte do ator) e **canto** (o ator inteiro encolhido num canto, cantos redondos). Centro e tamanho arrastáveis
 *    no vídeo (`x`, `y`, `escala`). A **caixa** (REF-15·p42): uma caixa quase quadrada centrada embaixo, com o rosto e os
 *    ombros enquadrados dentro (`escala` = a largura da caixa). */
export type ModoAtor = 'janela' | 'recortado' | 'canto' | 'caixa'
/** `topo`: na janela, onde ela começa dentro do quadro do ator (fração; padrão `TOPO_JANELA`): mais baixo, só a cabeça sai. */
export type AjusteAtor = { modo?: ModoAtor; x?: number; y?: number; escala?: number; dx?: number; dy?: number; zoom?: number; topo?: number }
export type Rosto = { cx: number; cy: number; w: number; h: number }
/** `topo`: na janela, onde ela começa dentro do quadro do ator (fração); `raio`: o raio dos cantos (fração da largura
 *  do quadro do ator encolhido). */
export type Geometria = { modo: 'metade' | ModoAtor; s: number; tx: number; ty: number; topo?: number; raio?: number; caixa?: { x: number; y: number; w: number; h: number } }

export const NOME_MODO: Record<ModoAtor, string> = { janela: 'Janela', recortado: 'Recortado', canto: 'Canto', caixa: 'Caixa' }
/** As posições de fábrica de cada modo (centro e tamanho, frações do quadro). A janela é a de antes da P5: o ator a 55%,
 *  apoiado embaixo, com a janela começando em 72% do quadro. */
const PADRAO_MODO: Record<ModoAtor, { x: number; y: number; escala: number }> = {
  janela: { x: 0.5, y: 1 - 0.55 / 2, escala: 0.55 },
  recortado: { x: 0.5, y: 1 - 0.62 / 2, escala: 0.62 },
  canto: { x: 1 - 0.34 / 2 - 0.04, y: 1 - 0.34 / 2 - 0.035, escala: 0.34 },
  caixa: { x: 0.5, y: 0.82, escala: 0.41 }, // o centro e a largura da caixa
}
/** Na caixa: o rosto ocupa metade da altura dela e os olhos ficam a 45% do alto. */
const CAIXA = { rosto: 0.5, olhos: 0.45, raio: 0.09 }
const TOPO_JANELA = (0.72 - 0.45) / 0.55 // a janela começa a 49% do ator encolhido
const RAIO = 0.07
const REGRA = { olhos: 0.4, folga: 0.06, rosto: 0.3, zoomMax: 1.6 }
/** O zoom manual da tela dividida, um fator sobre o automático (igual em `inserts._LIMITES_ATOR`). */
export const ZOOM = { min: 1 / REGRA.zoomMax, max: REGRA.zoomMax }
const limite = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b)

/** O enquadramento automático da tela dividida: o ator cobre a área de baixo (de `f` a 1) e o rosto fica bem posto. */
function enquadrar(f: number, r: Rosto | null): { s: number; tx: number; ty: number } {
  if (!r || r.h <= 0) return { s: 1, tx: 0, ty: f / 2 } // sem rosto medido: como antes (o ator desce metade do insert)
  const area = 1 - f
  const s = limite((REGRA.rosto * area) / r.h, 1, REGRA.zoomMax)
  const olhos = r.cy - 0.15 * r.h // os olhos, um pouco acima do centro da caixa do rosto
  const tx = limite(0.5 - s * r.cx, 1 - s, 0)
  let ty = f + REGRA.olhos * area - s * olhos
  ty = Math.max(ty, f + REGRA.folga * area - s * (r.cy - 0.6 * r.h)) // o topo da cabeça (com o cabelo) não encosta
  return { s, tx, ty: limite(ty, 1 - s, f) }
}

/** Deitado, lado a lado: o ator cobre a área da direita (de `f` a 1 na largura, a altura toda), o centro do rosto no
 *  meio dela, os olhos a 40% da altura e o rosto com ~28% da altura, ampliado até 1,6× se preciso. */
const LADO_ROSTO = 0.28
function enquadrarLado(f: number, r: Rosto | null): { s: number; tx: number; ty: number } {
  const meio = f + (1 - f) / 2
  if (!r || r.h <= 0) return { s: 1, tx: f / 2, ty: 0 } // sem rosto medido: o meio do vídeo no meio da área
  const s = limite(LADO_ROSTO / r.h, 1, REGRA.zoomMax)
  const olhos = r.cy - 0.15 * r.h
  const tx = limite(meio - s * r.cx, 1 - s, f)
  let ty = REGRA.olhos - s * olhos
  ty = Math.max(ty, REGRA.folga - s * (r.cy - 0.6 * r.h))
  return { s, tx, ty: limite(ty, 1 - s, 0) }
}

/** A tela dividida antes do deslocamento manual: a escala (o automático vezes o zoom, de 1 — cobrir a área — a 1,6×; o
 *  zoom pode ficar abaixo de 1 para voltar de um automático ampliado) e onde o canto do ator fica sem `dx`/`dy`. */
function metadeSemDeslocamento(d: Divisao, aj: AjusteAtor | null | undefined, rosto: Rosto | null) {
  const auto = QUADRO.deitado ? enquadrarLado(d.f, rosto) : enquadrar(d.f, rosto)
  const s = limite(auto.s * (aj?.zoom ?? 1), 1, REGRA.zoomMax)
  // o zoom manual cresce em volta do centro da área
  const cx = QUADRO.deitado ? d.f + (1 - d.f) / 2 : 0.5
  const cy = QUADRO.deitado ? 0.5 : d.f + (1 - d.f) / 2
  return { auto, s, tx: cx - ((cx - auto.tx) * s) / auto.s, ty: cy - ((cy - auto.ty) * s) / auto.s }
}

/** A geometria do ator num insert dividido (`null`: o ator como foi gravado). */
export function geometriaDoAtor(d: Divisao | null, aj: AjusteAtor | null | undefined, rosto: Rosto | null): Geometria | null {
  if (!d) return null
  if (d.modo === 'metade') {
    const m = metadeSemDeslocamento(d, aj, rosto)
    // o ator sempre cobre a área dele: embaixo (de f a 1 na altura) ou, deitado, à direita (de f a 1 na largura)
    const [xMax, yMax] = QUADRO.deitado ? [d.f, 0] : [0, d.f]
    return { modo: 'metade', s: m.s, tx: limite(m.tx + (aj?.dx ?? 0), 1 - m.s, xMax), ty: limite(m.ty + (aj?.dy ?? 0), 1 - m.s, yMax) }
  }
  const modo = aj?.modo ?? 'janela'
  const p = PADRAO_MODO[modo]
  if (modo === 'caixa') return caixaDoAtor(aj, rosto)
  const s = aj?.escala ?? p.escala
  // sem posição escolhida, o rosto no meio da largura (na janela e no recortado); o canto fica no canto
  const xAuto = modo !== 'canto' && rosto ? limite(0.5 - s * (rosto.cx - 0.5), s / 2, 1 - s / 2) : p.x
  const x = aj?.x ?? xAuto
  const y = aj?.y ?? (modo === 'canto' ? p.y : 1 - s / 2)
  return { modo, s, tx: x - s / 2, ty: y - s / 2, topo: modo === 'janela' ? aj?.topo ?? TOPO_JANELA : undefined, raio: modo === 'recortado' ? undefined : RAIO }
}

/** A caixa: quase quadrada (no quadro 9:16), centrada em (`x`, `y`), o ator ampliado pelo rosto e sempre cobrindo a caixa. */
function caixaDoAtor(aj: AjusteAtor | null | undefined, rosto: Rosto | null): Geometria {
  const p = PADRAO_MODO.caixa
  const w = aj?.escala ?? p.escala
  const h = w * (9 / 16) * 1.03 // em pixels, um pouco mais alta que larga
  const x = (aj?.x ?? p.x) - w / 2
  const y = (aj?.y ?? p.y) - h / 2
  let s = rosto && rosto.h > 0 ? (CAIXA.rosto * h) / rosto.h : 0.62
  s = Math.max(s, w, h) // cobre a caixa
  const olhos = rosto ? rosto.cy - 0.15 * rosto.h : 0.3
  const tx = limite(x + w / 2 - s * (rosto?.cx ?? 0.5), x + w - s, x)
  const ty = limite(y + CAIXA.olhos * h - s * olhos, y + h - s, y)
  return { modo: 'caixa', s, tx, ty, caixa: { x, y, w, h }, raio: CAIXA.raio }
}

/** Onde fica o alto da cabeça do ator no "ator embaixo" (fração do quadro): na janela e no recortado, a ~10% do topo do
 *  quadro do ator encolhido; no canto, o topo da caixa. O card do comentário e a legenda desviam por aqui. */
export const topoDoAtor = (g: Geometria) => (g.caixa ? g.caixa.y : g.ty + (g.modo === 'canto' ? 0 : 0.1 * g.s))

// ---------------------------------------------------------------- o rosto medido (rosto.py)

type Amostra = { t: number; cx: number; cy: number; w: number; h: number; conf: number }
export type ArquivoRosto = { por_segundo: number; largura?: number; altura?: number; amostras: Amostra[] }
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : 0
}
export type RostoEm = (ini: number, fim: number) => Rosto | null
/** A menor janela (s) em que se mede o rosto de um plano (mvi-0718-cta-lp v2 c5). */
const JANELA_ROSTO = 2

/** O rosto típico num trecho do vídeo final (a mediana das medidas), do arquivo `midia/rosto/<bruto>.json` já lido
 *  (do 18: o miolo de `useRosto`). Devolve a função (ini, fim no tempo da saída) → rosto; `null` sem medida (o vídeo
 *  não tem rosto nenhum, ou o arquivo não carregou: o enquadramento de antes).
 *  Num bruto horizontal (projeto de antes do enquadramento), a medida é do proxy 16:9 e a saída é o recorte 9:16 em
 *  `enquadramento.x`: o centro e a largura do rosto são levados para esse recorte. */
export function rostoDoArquivo(arq: ArquivoRosto | null, seq: Sequencia | null, ex = 0.5): RostoEm | null {
  if (!arq?.amostras?.length || !seq) return null
  const a = arq.amostras
  // a medida num quadro deitado: o recorte 9:16 tem `rw` da largura e começa em (1 − rw)·ex
  const L = arq.largura ?? 0
  const A = arq.altura ?? 0
  const rw = L > A && A > 0 && !QUADRO.deitado ? (A * 9) / 16 / L : 1 // deitado: o quadro é o próprio 16:9
  const noRecorte = (r: Rosto): Rosto => (rw >= 1 ? r : { ...r, cx: (r.cx - (1 - rw) * ex) / rw, w: r.w / rw })
  return (ini: number, fim: number) => {
    // num plano curto (o "do GPT," de 0,6 s entre dois divididos), poucas amostras: um movimento da cabeça mudava o
    // enquadramento e o ator "pulava". A mediana usa no mínimo JANELA_ROSTO s em volta do meio do plano
    if (fim - ini < JANELA_ROSTO) {
      const meio = (ini + fim) / 2
      ini = Math.max(0, meio - JANELA_ROSTO / 2)
      fim = ini + JANELA_ROSTO
    }
    const pts: Amostra[] = []
    for (let t = ini; t < fim; t += 0.2) {
      const tb = seq.saidaParaFonte(t)
      const i = limite(Math.round(tb * arq.por_segundo), 0, a.length - 1)
      // a amostra mais perto daquele instante (o arquivo tem uma a cada 1/por_segundo s, a partir do zero)
      const m = a[i] && Math.abs(a[i].t - tb) < 1 ? a[i] : a.reduce((x, y) => (Math.abs(y.t - tb) < Math.abs(x.t - tb) ? y : x))
      pts.push(m)
    }
    const boas = pts.filter((x) => x.conf > 0)
    const us = boas.length ? boas : pts
    if (!us.length) return null
    return noRecorte({ cx: mediana(us.map((x) => x.cx)), cy: mediana(us.map((x) => x.cy)), w: mediana(us.map((x) => x.w)), h: mediana(us.map((x) => x.h)) })
  }
}
