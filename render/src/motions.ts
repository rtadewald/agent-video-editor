// do 18: frontend/src/motions/api.ts e motions/sons.ts (a fala do plano, o endereço da página e os sons), sem a API: a
// página de cada motion é montada no navegador por render/motion.html, a partir de biblioteca/motions/
import type { AjusteAtor } from './ator'
import { eventoNoTempo, INTENSIDADES, type Catalogo, type EventoSom, type Intensidade } from './sons'

/** `alto`: a tela dividida com o motion nos 70% de cima (1080×1344) e o ator na faixa de baixo (o motion contínuo). */
export type Formato = 'vertical' | 'dividida' | 'alto'
/** O motion de um plano: um preset (com os valores e o fundo) ou um vídeo do banco. */
/** `ator`: o ator pequeno por cima do motion em tela cheia (o "ator embaixo": `recortado`, `janela`, `canto`, `caixa`). */
export type MotionPlano = { nome: string; formato: Formato; usado_em?: string; legenda_y?: number; ator?: AjusteAtor } & (
  | { tipo: 'preset'; preset: string; valores: Record<string, string>; fundo: string; sons?: Record<string, { som: string | null; intensidade: Intensidade }> }
  | { tipo: 'video'; banco: string }
)
/** As palavras ditas no plano, em segundos desde o começo dele (a digitação dos presets acompanha a fala). */
export type Fala = { texto: string; ini: number; fim: number }[]
/** Os momentos de som que o preset declara (o JSON `preset` da página: rótulo e som padrão de cada um). */
export type SonsDoPreset = Record<string, { som: string | null; intensidade: Intensidade }>

/** A altura do palco de cada formato (px, na largura 1080) e a fração do quadro que o motion dividido ocupa em cima. */
export const PALCO_H: Record<Formato, number> = { vertical: 1920, dividida: 960, alto: 1344 }
export const fracaoDoMotion = (f: Formato) => (f === 'alto' ? 0.7 : 0.5)

/** O fundo atrás do motion: o do preset; um vídeo cobre o palco todo, sem fundo. */
export const fundoDoMotion = (m: MotionPlano) => (m.tipo === 'preset' ? m.fundo : undefined)

/** As palavras de saída que caem no plano, com o tempo relativo ao começo dele. */
export const falaDoPlano = (palavras: { texto: string; saida_ini: number; saida_fim: number }[], ini: number, fim: number): Fala =>
  palavras
    .filter((w) => w.saida_ini >= ini - 0.01 && w.saida_ini < fim)
    .map((w) => ({ texto: w.texto, ini: +(w.saida_ini - ini).toFixed(3), fim: +(w.saida_fim - ini).toFixed(3) }))

/** A página do motion de um plano (render/motion.html): `duracao` = a do plano agora; `fala` = as palavras dele. */
export const urlPaginaMotion = (m: MotionPlano, duracao: number, fala: Fala, exportacao = false) =>
  m.tipo === 'video'
    ? `/render/motion.html?video=${m.banco}&formato=${m.formato}&duracao=${duracao.toFixed(3)}${exportacao ? '&exportacao=1' : ''}`
    : `/render/motion.html?preset=${m.preset}&formato=${m.formato}&duracao=${duracao.toFixed(3)}&valores=${encodeURIComponent(JSON.stringify(m.valores ?? {}))}&fala=${encodeURIComponent(JSON.stringify(fala))}${exportacao ? '&exportacao=1' : ''}`

/** Os sons que o preset declara, do HTML dele (do 18: backend/app/motions.py, `sons_de`, com a validação de sons.py). */
export function sonsDoPreset(html: string): SonsDoPreset {
  const m = html.match(/<script[^>]*id=["']preset["'][^>]*>([\s\S]*?)<\/script>/)
  let info: { sons?: Record<string, { som?: unknown; intensidade?: unknown }> } = {}
  try {
    info = m ? JSON.parse(m[1]) : {}
  } catch {
    info = {}
  }
  const out: SonsDoPreset = {}
  for (const [k, v] of Object.entries(info?.sons ?? {})) {
    if (!v || typeof v !== 'object' || !/^[a-z0-9_]{1,30}$/.test(k)) continue
    const som = typeof v.som === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(v.som) ? v.som : null
    out[k] = { som, intensidade: typeof v.intensidade === 'string' && v.intensidade in INTENSIDADES ? (v.intensidade as Intensidade) : 'baixo' }
  }
  return out
}

export type EscolhaSom = { som: string | null; intensidade: Intensidade }
/** Uma marca da página: o momento, quando (s desde o começo do plano) e, opcional, por quanto tempo. */
export type Marca = { momento: string; t: number; dur?: number }
type ComSons = Window & { __sons?: () => Promise<Marca[]> }

/** O som de cada momento do motion de um plano: o do plano, ou o padrão do preset. */
export function escolhasDeSom(sons: SonsDoPreset | undefined, m: MotionPlano | undefined): Record<string, EscolhaSom> {
  if (!sons || m?.tipo !== 'preset') return {}
  return Object.fromEntries(
    Object.entries(sons).map(([k, v]) => {
      const x = m.sons?.[k]
      return [k, { som: x ? x.som : v.som, intensidade: x?.intensidade ?? v.intensidade }]
    }),
  )
}

export const eventosDoMotion = (marcas: Marca[], escolhas: Record<string, EscolhaSom>, cat: Catalogo | null): EventoSom[] =>
  !cat
    ? []
    : marcas.flatMap((mk) => {
        const e = escolhas[mk.momento]
        const ev = e ? eventoNoTempo({ ...e, atraso: 0 }, mk.t, cat, mk.dur) : null
        return ev ? [ev] : []
      })

/** As marcas de som de uma página de motion já aberta (espera a cena estar montada). */
export const marcasDe = (w: Window | null | undefined): Promise<Marca[]> => (w as ComSons | null)?.__sons?.().catch(() => []) ?? Promise.resolve([])

/** As marcas de som de uma página de motion, abrindo-a num iframe escondido (a exportação lê de todos os planos). */
export function marcasDaPagina(src: string, formato: Formato): Promise<Marca[]> {
  return new Promise((ok) => {
    const f = document.createElement('iframe')
    f.style.cssText = `position:fixed;left:-99999px;top:0;width:1080px;height:${PALCO_H[formato] ?? 960}px;visibility:hidden`
    const fim = (m: Marca[]) => {
      clearTimeout(limite)
      f.remove()
      ok(m)
    }
    const limite = window.setTimeout(() => fim([]), 15_000)
    f.onload = () => void marcasDe(f.contentWindow).then(fim)
    f.src = src
    document.body.appendChild(f)
  })
}
