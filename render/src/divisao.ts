// do 18: frontend/src/presets/divisao.ts
import type { Estilo, ItemBanco } from './tipos'
import { comRepouso, type CardReceita, type Preset, type Propriedade, type Receita } from './presets'
import { ajustesEfetivos } from './ajustes'
import { topoDoAtor, type Geometria } from './ator'
import { LADO, QUADRO } from './quadro'

/** A divisão da tela num insert de tela dividida (SPEC §8.4), automática: o tipo vem do preset escolhido e as medidas,
 *  da proporção da 1ª mídia.
 *  - `area`: a mídia de ponta a ponta em cima, com a altura dela na largura toda (1:1 → 56%, 4:3 → 42%, 16:9 → 32%);
 *  - `card`: um card com a proporção da mídia (até 90% da largura), e a parte de cima com a altura dele mais margens;
 *  - `atras`: o insert na tela toda e o ator encolhido numa janela embaixo; o card fica no espaço livre acima dela.
 *  `f`: a fração do quadro que o insert ocupa em cima; `card`: o card em % da área do insert (centrado). */
export type TipoDivisao = 'area' | 'card' | 'atras'
export type Divisao = { modo: 'metade' | 'atras'; tipo: TipoDivisao; f: number; card?: { w: number; h: number } }

/** A janela do ator no "insert atrás": o ator encolhido a `escala`, apoiado embaixo e centrado; a janela começa em `y0`
 *  (% do quadro) e tem cantos redondos (`raio`, % da largura do ator encolhido). Igual em exportacao.py. */
const JANELA = { escala: 0.55, y0: 72, raio: 7 }
/** Onde fica o alto da cabeça do ator no "ator embaixo" (% do quadro): o ator encolhido começa em 100 − 55 = 45%, e a
 *  cabeça costuma estar a ~10% do topo do quadro dele. */
const TOPO_CABECA = 100 - JANELA.escala * 100 + JANELA.escala * 10
const MARGEM = 0.06 // em cima e embaixo do card, em fração do quadro
const W_H = 9 / 16 // largura ÷ altura do quadro em pé (deitado, as contas são as de `divisaoDeitada`)
/** Deitado: largura ÷ altura do quadro e da área do insert lado a lado (9:8). */
const QUADRO_DEITADO = 16 / 9
const AREA_LADO = QUADRO_DEITADO * LADO

/** Alguma mídia pode ocupar a área toda sem ser cortada? Na tela dividida, as horizontais (a área é larga); na tela
 *  cheia e no "ator embaixo", as em pé (9:16). Decidido mídia a mídia (receitaParaInsert): as que seriam cortadas ficam
 *  em card, as outras ocupam a área. */
export const telaTodaPermitida = (formato: string, atras: boolean, aspectos: number[]) =>
  QUADRO.deitado ? aspectos.some((a) => cabeDeitado(a, formato))
  : formato === 'dividida' && !atras ? aspectos.some((a) => a >= 0.8) : aspectos.some((a) => a < 0.8)

/** Deitado, a mídia ocupa a área sem ser cortada: na tela cheia, as horizontais (até o 3:2); lado a lado, só as de
 *  proporção perto da área (9:8). As outras vão num card centrado, inteiras (nada cortado). */
const cabeDeitado = (a: number, formato: string) => (formato === 'dividida' ? Math.abs(a / AREA_LADO - 1) < 0.1 : a >= 1.5)

/** A divisão lado a lado (deitado): o insert à esquerda, em `LADO` da largura e na altura toda; a mídia que não tem a
 *  proporção da área vai num card centrado, inteira, com margem (o "ator embaixo" não existe deitado). */
function divisaoDeitada(tipo: TipoDivisao, a: number, varios: boolean): Divisao {
  if (tipo === 'area' || varios) return { modo: 'metade', tipo: tipo === 'area' ? 'area' : 'card', f: LADO }
  let w = 90 // largura do card, % da área
  let h = (w * AREA_LADO) / a // altura do card, % da área
  if (h > 84) {
    h = 84
    w = (h * a) / AREA_LADO
  }
  return { modo: 'metade', tipo: 'card', f: LADO, card: { w, h } }
}

/** O tipo de divisão do preset: o marcado nele ou, sem marca, "área" se o card ocupa a área toda, senão "card". */
export const tipoDoPreset = (p: Preset | null | undefined): TipoDivisao =>
  p?.divisao_tipo ?? (p && p.receita.cards.every((c) => c.repouso.w >= 99 && c.repouso.h >= 99) ? 'area' : 'card')

export function divisaoDe(
  x: { formato: string; midias: { banco: string }[]; enriquecimento?: { preset?: string | null; divisao?: string | null } },
  banco?: Map<string, ItemBanco> | null,
  presets?: Preset[] | null,
): Divisao | null {
  if (x.formato !== 'dividida') return null
  const preset = x.enriquecimento?.preset ? presets?.find((p) => p.id === x.enriquecimento?.preset) : null
  // "ator embaixo" pode ser ligado no próprio insert, por cima do tipo do preset
  // a forma escolhida no insert (ajuste rápido) manda: "tela toda" ocupa a área, "card" é card
  const forma = ajustesEfetivos(preset, (x.enriquecimento as { ajustes?: Record<string, string> } | undefined)?.ajustes, aspectosDe(x.midias, banco))?.forma
  const atras = !QUADRO.deitado && x.enriquecimento?.divisao === 'atras'
  const aspectos = aspectosDe(x.midias, banco)
  let base: TipoDivisao = forma === 'Tela toda' ? 'area' : forma === 'Card' ? 'card' : preset ? tipoDoPreset(preset) : 'card'
  // ocupar a área só quando a mídia cabe sem cortar: na tela dividida, as horizontais; no "ator embaixo", as em pé
  if (base === 'area' && !telaTodaPermitida('dividida', atras, aspectos)) base = 'card'
  // a área toma a proporção da 1ª mídia e as outras a preenchem: com proporções diferentes no mesmo insert (uma aula
  // 4:3 e outra 16:9), as seguintes perdiam as laterais ("bem cropado"). Aí cada mídia vai num card na proporção dela
  if (base === 'area' && !atras && aspectos.length > 1 && Math.max(...aspectos) / Math.min(...aspectos) > 1.12) base = 'card'
  const tipo = atras ? 'atras' : base
  // ator embaixo com um preset que ocupa a área: a mídia ocupa a tela toda, atrás da janela do ator
  if (tipo === 'atras' && base === 'area') return { modo: 'atras', tipo, f: 1 }
  const i = x.midias[0] && banco?.get(x.midias[0].banco)
  const a = i?.largura && i?.altura ? i.largura / i.altura : 16 / 9 // largura ÷ altura da mídia
  // vários cards (empilhados, em sequência, mosaico): a área fica fixa e cada card se ajusta à sua mídia (receitaParaInsert)
  const varios = !!preset && (preset.receita.repete || preset.receita.cards.length > 1)
  if (QUADRO.deitado) return divisaoDeitada(tipo, a, varios)
  if (varios && tipo !== 'area') return { modo: tipo === 'atras' ? 'atras' : 'metade', tipo, f: tipo === 'atras' ? JANELA.y0 / 100 : 0.56 }
  if (tipo === 'area') return { modo: 'metade', tipo, f: a < 1 ? 0.5 : Math.min(Math.max(W_H / a, 0.28), 0.5625) }
  const livre = tipo === 'atras' ? JANELA.y0 / 100 : 0.62 // a altura máxima da área do insert
  let cw = 0.9 // largura do card, fração do quadro
  let ch = (cw * W_H) / a // altura do card, fração do quadro
  if (ch > livre - 2 * MARGEM) {
    ch = livre - 2 * MARGEM
    cw = (ch * a) / W_H
  }
  const f = tipo === 'atras' ? livre : Math.min(Math.max(ch + 2 * MARGEM, 0.4), livre)
  return { modo: tipo === 'atras' ? 'atras' : 'metade', tipo, f, card: { w: cw * 100, h: (ch / f) * 100 } }
}

/** A receita pronta para o insert: cada card na proporção da sua mídia (`aspectos`, largura ÷ altura, por mídia).
 *  - um card só, com a divisão calculada (`d.card`): o card da divisão, centrado;
 *  - cards que ocupam a área toda: preenchem a área presos no topo (uma tela em pé nunca perde o topo), e a câmera lenta
 *    cresce a partir do canto superior esquerdo;
 *  - os outros: o card fica no lugar e no tamanho do preset, mas com a proporção da mídia, cabendo na caixa dele (e na
 *    área). Os guiados por cantos medidos ficam como estão. */
export function receitaParaInsert(r: Receita, d: Divisao | null, aspectos: number[], formato: string): Receita {
  // largura ÷ altura da área do insert (deitado, lado a lado: a área à esquerda, na altura toda)
  const areaAsp = QUADRO.deitado ? (formato === 'dividida' ? QUADRO_DEITADO * (d?.f ?? LADO) : QUADRO_DEITADO)
    : formato === 'dividida' ? W_H / (d?.f ?? 0.5) : W_H
  const cards = r.cards.map((c, k) => {
    if (c.quadros?.length) return c
    const cheio = c.repouso.w >= 99 && c.repouso.h >= 99
    const a0 = aspectos[c.midia ?? k] ?? aspectos[0]
    // na tela cheia, ocupar a tela só se a mídia é em pé (9:16); 1:1, 4:3, 16:9 viram um card centrado (90% da largura)
    // ocupando a área, só se a mídia cabe sem cortar (telaTodaPermitida); senão, um card centrado na proporção dela
    const cabe = !a0 ? true : QUADRO.deitado ? cabeDeitado(a0, formato) : formato === 'dividida' && d?.modo !== 'atras' ? a0 >= 0.8 : a0 < 0.8
    if (cheio && !cabe && a0) {
      let w = 90
      let h = (w * areaAsp) / a0
      if (h > 90) {
        h = 90
        w = (h * a0) / areaAsp
      }
      return { ...comRepouso(c, { cx: 50, cy: 50, w, h, raio: c.repouso.raio || 2.2, sombra: true }), ajuste: 'cover' as const }
    }
    if (cheio) {
      const z = c.continuo
      // o zoom contínuo cresce a partir do centro na horizontal; na vertical, preso pelo topo (a parte de cima da mídia em
      // pé continua à vista), a não ser que a receita tenha a própria deriva vertical (uma rolagem, por exemplo). Um zoom
      // que afasta (escala < 0) descobriria o fundo nas bordas, e a tela toda deixaria de ser toda: vira o mesmo zoom
      // lento aproximando, preso pelo topo (a câmera continua andando, sem abrir margens)
      const continuo = !z ? z : z.escala < 0 ? { ...z, escala: -z.escala, dx: 0, dy: (-z.escala * 100) / 2 } : { ...z, dy: z.dy || (z.escala * 100) / 2 }
      const cc = comRepouso(c, { cx: 50, cy: 50, w: 100, h: 100 })
      return { ...cc, ajuste: 'topo' as const, continuo, saida: saidaCobrindo(cc.saida) }
    }
    if (d?.card && r.cards.length === 1) return { ...comRepouso(c, { cx: 50, cy: 50, w: d.card.w, h: d.card.h }), ajuste: 'cover' as const }
    const a = aspectos[c.midia ?? k] ?? aspectos[0]
    if (!a) return c
    // a caixa do preset, sem passar de 96% da área
    // mídia em pé num card largo: a caixa cresce na altura (até 84% da área), para a mídia não ficar pequena
    const emPe = a < 0.9 && c.repouso.w > c.repouso.h
    // no "ator embaixo", o espaço acima da janela é largo e baixo: o card vai quase até as bordas e um pouco acima do meio
    const atras = d?.modo === 'atras'
    const desliza = deslizeTransbordando(c, a, areaAsp, atras)
    if (desliza) return desliza
    const bw = atras ? 96 : Math.min(c.repouso.w, 96)
    // deitado, na tela cheia, a caixa do preset (desenhada num quadro em pé: a altura de um card horizontal ali é ~35%)
    // não limita a altura: o card vai até 90% da largura ou da altura, o que vier antes
    const bh = QUADRO.deitado && formato !== 'dividida' ? 90 : emPe ? Math.max(Math.min(c.repouso.h, 96), 84) : Math.min(c.repouso.h, 96)
    let w = bw
    let h = (w * areaAsp) / a
    if (h > bh) {
      h = bh
      w = (h * a) / areaAsp
    }
    // a caixa maior continua dentro da área
    // em pé, o card é alto: fica centrado na área (no "ator embaixo" também), e a deriva vertical (o "flutuar") encolhe
    // na proporção da folga que sobrou, para ele não correr para fora do topo
    // com vários cards, o que encolhe na altura fica preso pela borda virada para o meio da área: o vão entre eles continua
    // o do desenho (em vez de crescer)
    // (só cards empilhados de verdade: longe do meio; numa sequência — um card substitui o outro no mesmo lugar, como no
    // "Empurra a próxima de baixo" — cada um fica centrado no seu lugar, senão o 1º descia até a costura)
    const empilhado = r.cards.length > 1 && !r.repete && Math.abs(c.repouso.cy - 50) > 10
    const junto = empilhado ? Math.sign(50 - c.repouso.cy) * Math.max(0, c.repouso.h - h) / 2 : 0
    const cy = emPe ? 50 : atras ? Math.max(h / 2 + 3, 44) : c.repouso.cy + junto
    const folga = emPe ? Math.max(0, 98 - h) / Math.max(1, 98 - Math.min(c.repouso.h, 96)) : 1
    const continuo = c.continuo && folga < 1 ? { ...c.continuo, dy: c.continuo.dy * folga } : c.continuo
    // um card desenhado maior que a área (passando da borda) e que encolheu para caber a mídia: fica no meio do pedaço
    // que aparecia na área (um card centrado que transbordava dos dois lados continua centrado; um que saía por um lado
    // continua daquele lado), sem passar das bordas
    const visivel = [Math.max(c.repouso.cx - c.repouso.w / 2, 0), Math.min(c.repouso.cx + c.repouso.w / 2, 100)]
    const meio = Math.min(Math.max((visivel[0] + visivel[1]) / 2, w / 2 + 2), 98 - w / 2)
    const cx = atras || emPe ? 50 : c.repouso.w > 96 ? meio : c.repouso.cx
    return { ...comRepouso(c, { w, h, cy, cx }), continuo, ajuste: 'cover' as const }
  })
  return { ...r, cards }
}

/** Um card desenhado maior que a área que DESLIZA na horizontal (o "Cresce e desliza": cresce preso por um lado,
 *  transbordando pelo outro, e desliza revelando o resto): o transbordo é o efeito, então o card não encolhe para caber
 *  — fica com a largura do desenho (só limitado pela altura, numa mídia alta), preso pela borda do desenho, a entrada
 *  cresce a partir dela e o deslize anda `DESLIZE` (o da referência) sem passar do que transborda, qualquer que seja a
 *  proporção da mídia. `null`: não é esse caso. */
const DESLIZE = 23 // % da área (o da referência)
function deslizeTransbordando(c: CardReceita, a: number, areaAsp: number, atras: boolean): CardReceita | null {
  const dx = c.saida?.para.dx ?? 0
  if (atras || c.repouso.w <= 100 || Math.abs(dx) < 5 || (c.saida?.para.escala ?? 1) > 1.05) return null
  let w = c.repouso.w
  let h = (w * areaAsp) / a
  const hMax = Math.min(c.repouso.h, 96)
  if (h > hMax) {
    h = hMax
    w = (h * a) / areaAsp
  }
  if (w <= 100) return null // a mídia alta não transborda mais: o card comum
  // preso pela borda oposta ao deslize (desliza para a esquerda: preso à esquerda e revela a direita)
  const esq = dx < 0
  const borda = esq ? c.repouso.cx - c.repouso.w / 2 : c.repouso.cx + c.repouso.w / 2
  const cx = esq ? borda + w / 2 : borda - w / 2
  // o deslize anda o que a referência anda (medido no Cresce e desliza: ~23% da tela, devagar e reto até o corte), sem
  // passar do que transborda: nunca abre margem do lado que estava para fora
  const sobra = esq ? cx + w / 2 - 100 : -(cx - w / 2)
  const deslize = (esq ? -1 : 1) * Math.max(Math.min(c.deslize ?? DESLIZE, sobra), 0)
  const e = c.entrada
  // a entrada que cresce: começa no mesmo lado preso (o centro desloca metade do que falta crescer)
  const entrada = e && e.de.escala < 0.98 ? { ...e, de: { ...e.de, dx: ((esq ? -1 : 1) * (w / 2) * (1 - e.de.escala)) } } : e
  return { ...c, repouso: { ...c.repouso, w, h, cx }, entrada, saida: c.saida && { ...c.saida, para: { ...c.saida.para, dx: deslize } }, ajuste: 'cover' as const }
}

/** A saída de um card que ocupa a área toda, sem descobrir o fundo (a tela toda continua toda):
 *  - um mergulho (a saída que amplia) fica com o ponto que não se mexe dentro do card: com ele fora (o "Base à esquerda"
 *    medido num card largo), a borda do lado oposto entrava na tela durante o zoom;
 *  - uma saída que só desliza um pouco (até 1/4 da área, sem sumir nem mudar de tamanho: no desenho, um card maior que a
 *    tela correndo de lado) amplia junto, na mesma curva, o bastante para continuar cobrindo — a câmera corre e aproxima.
 *  As que somem, encolhem ou saem de cena mostram o fundo de propósito e ficam como estão. */
function saidaCobrindo(s: CardReceita['saida']): CardReceita['saida'] {
  if (!s || s.para.opacidade < 0.99) return s
  const { dx, dy, escala } = s.para
  if (escala > 1.05) {
    const m = 50 * (escala - 1) // o deslocamento que leva o ponto parado à borda do card
    return { ...s, para: { ...s.para, dx: Math.min(Math.max(dx, -m), m), dy: Math.min(Math.max(dy, -m), m) } }
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy))
  if (escala < 0.999 || d < 0.5 || d > 25) return s
  // a escala anda junto com a posição (mesma curva, atraso e duração): a cada instante, o tanto que ampliou cobre o que andou
  const comoPos = <T,>(o: Partial<Record<Propriedade, T>> | undefined): Partial<Record<Propriedade, T>> => {
    const resto = Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => k !== 'escala')) as Partial<Record<Propriedade, T>>
    return o?.pos != null ? { ...resto, escala: o.pos } : resto
  }
  return { ...s, para: { ...s.para, escala: Math.max(escala, 1 + (2 * d) / 100) }, curvas: comoPos(s.curvas), atraso: comoPos(s.atraso), dur: comoPos(s.dur) }
}

/** As proporções (largura ÷ altura) das mídias do insert, pelo banco; sem as dimensões, 16:9. */
export const aspectosDe = (midias: { banco: string }[], banco?: Map<string, ItemBanco> | null) =>
  midias.map((m) => {
    const i = banco?.get(m.banco)
    return i?.largura && i?.altura ? i.largura / i.altura : 16 / 9
  })

/** A área do insert no quadro (estilo CSS em %). */
export const areaDoInsert = (d: Divisao | null): Estilo =>
  !d ? { inset: 0 } : QUADRO.deitado ? { left: 0, top: 0, bottom: 0, width: `${d.f * 100}%` } : { left: 0, right: 0, top: 0, height: `${d.f * 100}%` }

/** Onde a caixinha do comentário fica sozinha (centro, % do quadro): na costura do insert com o ator. `g`: a geometria
 *  do ator (`ator.geometriaDoAtor`, a P5), para desviar dele no modo e na posição em que estiver; `h`: a altura do card
 *  (fração do quadro, `alturaDoComentario`), para a borda de baixo dele, e não só o centro, ficar acima do ator. */
function posicaoDoComentario(d: Divisao | null, g?: Geometria | null, h = 0): { x: number; y: number } {
  if (!d) return { x: 50, y: 50 }
  if (QUADRO.deitado) return { x: d.f * 50, y: 50 } // lado a lado: no meio do insert
  // no "ator embaixo", acima da cabeça (que sai da janela, ou do recortado; no canto, acima da caixa), ou na borda de
  // baixo do card se ela estiver mais acima. Na exportação, o ator vai por cima do card: aqui ele não cobre o texto
  const cabeca = g && g.modo !== 'metade' ? topoDoAtor(g) * 100 : TOPO_CABECA
  if (d.modo === 'atras') return { x: 50, y: Math.min(cabeca - Math.max(6, (h * 100) / 2 + 1.5), d.card ? (d.f / 2 + (d.card.h / 100) * (d.f / 2)) * 100 : 100) }
  return { x: 50, y: d.f * 100 }
}

/** O lugar automático do card do comentário de um insert (`posicaoDoComentario` com a altura do card dele: o texto e o
 *  tamanho escolhidos). */
export const lugarDoComentario = (x: { texto?: string | null; comentario?: { texto?: string | null; escala?: number } }, d: Divisao | null, g?: Geometria | null) =>
  posicaoDoComentario(d, g, alturaDoComentario(x.comentario?.texto ?? x.texto ?? '', x.comentario?.escala ?? 1))

/** O centro do card do comentário que cabe no quadro (% dele, 9:16): o card inteiro à vista, com a alça do canto, por
 *  mais que o arraste ou o tamanho passem da borda — crescer encostado na borda empurra o card para dentro. A prévia, a
 *  exportação e a legenda (que desvia dele) usam esta posição. */
export function noQuadro(c: { x: number; y: number; escala: number }, texto: string) {
  // meia largura e meia altura, com uma folga para a alça (que passa um pouco do canto)
  const w = Math.min(75 * c.escala, 96) / 2 + 3
  const h = (alturaDoComentario(texto, c.escala) * 100) / 2 + 3
  // (maior que o quadro com a folga, como no tamanho máximo: no meio)
  const lim = (v: number, m: number) => (m >= 50 ? 50 : +Math.min(Math.max(v, m), 100 - m).toFixed(1))
  return { x: lim(c.x, w), y: lim(c.y, h) }
}

/** A altura do card do comentário (`ComentarioIG`), em fração do quadro 9:16: as margens, o usuário, as linhas do
 *  texto (a SF a ~0,52em por letra) e "Responder". Uma estimativa: o card só existe desenhado no navegador. */
export function alturaDoComentario(texto: string, escala: number) {
  const largura = Math.min(75 * escala, 96) - escala * (2 * 3.2 + 8.2 + 2.6) // a do texto, em % da largura do quadro
  const porLinha = Math.max(largura / (3.6 * escala * 0.52), 1)
  const linhas = Math.max(1, Math.ceil(texto.length / porLinha))
  const cqw = escala * (2 * 2.6 + 2 * 2.9 * 1.3 + 0.4 + 1.2) + linhas * 3.6 * escala * 1.3
  return (cqw / 100) * (9 / 16)
}
