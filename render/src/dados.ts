/** Os dados da página, lidos dos arquivos (no 18 vinham da API): o edicao.json e a transcrição do projeto, o rosto
 *  medido, e da biblioteca os presets, as transições, os sons, os motions e as mídias do banco que o projeto usa. */
import type { ItemBanco, ItemDirecaoProjeto, Palavra, PedidoInsert, Timeline } from './tipos'
import type { Preset } from './presets'
import type { ArquivoRosto } from './ator'
import type { Movimento } from './movimento'
import type { Legenda } from './legenda'
import type { Biblioteca, Escolhas } from './transicoes'
import { INTENSIDADES, type Catalogo } from './sons'
import { sonsDoPreset, type MotionPlano, type SonsDoPreset } from './motions'

/** O edicao.json (contrato em .claude/skills/editor/edicao.md: os campos do projeto.json do 18). */
export type Edicao = {
  id: string
  fontes: { id: string; papel: string }[]
  enquadramento?: { x?: number }
  velocidade?: number
  timeline?: Timeline
  cortes?: { mantidas: [string, string][] }
  direcao?: { itens?: ItemDirecaoProjeto[] }
  inserts?: { pedidos?: PedidoInsert[]; fundo?: string | null; ator_planos?: Record<string, Movimento> }
  motions?: Record<string, MotionPlano>
  transicoes?: Record<string, unknown>
  legenda?: Partial<Legenda>
  /** As saídas do projeto (corpo + final): a falada traz os cortes dela (o corpo e o final, já em clipes). */
  saidas?: { id: string; final?: { tipo: string; manter?: [string, string][] }; V1?: Timeline['V1'] }[]
}

export type Dados = {
  edicao: Edicao
  /** Todas as palavras da transcrição, com `mantida` (as que os cortes deixaram). */
  palavras: Palavra[]
  rosto: ArquivoRosto | null
  presets: Preset[]
  transicoes: Biblioteca
  escolhas: Escolhas
  legenda: Legenda
  catalogo: Catalogo
  banco: Map<string, ItemBanco>
  /** Os sons declarados por cada preset de motion usado no projeto. */
  sonsMotion: Record<string, SonsDoPreset>
}

const json = <T>(url: string): Promise<T> =>
  fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${url}: ${r.status}`))))
const lista = (pasta: string) => json<string[]>(`/api/lista?pasta=${encodeURIComponent(pasta)}`).catch(() => [] as string[])

/** Quais palavras os cortes mantêm (do 18: backend/app/cortes.py, `mantidas_por_indice`). */
function comMantidas(palavras: Palavra[], mantidas: [string, string][]): Palavra[] {
  const pos = new Map(palavras.map((p, i) => [p.id, i]))
  const fica = palavras.map(() => false)
  for (const [ini, fim] of mantidas) for (let i = pos.get(ini) ?? 0; i <= (pos.get(fim) ?? -1); i++) fica[i] = true
  return palavras.map((p, i) => ({ ...p, mantida: fica[i] }))
}

/** A escolha de transição guardada (do 18: backend/app/transicoes.py, `_escolha`/`do_projeto`). */
function escolhasDe(t: Record<string, unknown> | undefined): Escolhas {
  const out: Escolhas = {}
  for (const [k, v] of Object.entries(t ?? {})) {
    if (typeof v === 'string') out[k] = { id: v }
    else if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
      const e = v as { id: string; par?: unknown }
      out[k] = { id: e.id, ...(typeof e.par === 'string' ? { par: e.par } : {}) }
    }
  }
  return out
}

/** A legenda do projeto com os padrões (do 18: backend/app/legenda.py, `do_projeto`). */
const legendaDe = (lg: Partial<Legenda> | undefined): Legenda => ({
  ligada: lg?.ligada ?? true,
  modo: lg?.modo === 'frase' ? 'frase' : 'palavra',
  ajustes: lg?.ajustes && typeof lg.ajustes === 'object' ? lg.ajustes : {},
})

/** O que um trecho herda do original (do 18: backend/app/banco.py, HERDADOS). */
const HERDADOS = ['tipo', 'formato', 'largura', 'altura', 'descricao', 'palavras', 'descricao_ia', 'origem', 'ia', 'arquivo', 'proxy', 'cortes']

/** Uma mídia do banco, com o endereço que a exportação toca: o `exportacao.mp4` (quadro-chave a cada 6 quadros, feito
 *  pelo render.py) quando existe, senão o original; imagem, a original. Um trecho herda do original e toca o arquivo dele. */
export async function itemBanco(id: string): Promise<ItemBanco | null> {
  try {
    let i = await json<Record<string, unknown>>(`/biblioteca/banco/${id}/item.json`)
    if (i.pai) {
      const pai = await json<Record<string, unknown>>(`/biblioteca/banco/${i.pai}/item.json`)
      i = { ...Object.fromEntries(HERDADOS.map((k) => [k, pai[k]])), ...i, duracao: Math.round(((i.fim as number) - (i.inicio as number)) * 1000) / 1000 }
    }
    const base = `/biblioteca/banco/${(i.pai as string) || id}`
    const tipo = (i.tipo as string) === 'imagem' ? 'imagem' : 'video'
    const temExportacao = tipo === 'video' && (await lista(base.slice(1))).includes('exportacao.mp4')
    const url = temExportacao ? `${base}/exportacao.mp4` : `${base}/${i.arquivo}`
    return { ...(i as unknown as ItemBanco), tipo, url }
  } catch {
    return null // mídia apagada do banco: a página mostra o que houver
  }
}

export async function carregar(slug: string): Promise<Dados> {
  const pasta = `/projetos/${slug}`
  const edicao = await json<Edicao>(`${pasta}/edicao.json`)
  // `&saida=<id>`: uma saída falada (o corpo + o final dela): os cortes e as palavras mantidas passam a ser os dela
  const idSaida = new URLSearchParams(location.search).get('saida')
  const saida = idSaida ? edicao.saidas?.find((x) => x.id === idSaida) : null
  if (saida?.V1 && edicao.cortes) {
    edicao.timeline = { ...(edicao.timeline ?? {}), V1: saida.V1 }
    edicao.cortes = { ...edicao.cortes, mantidas: [...edicao.cortes.mantidas, ...(saida.final?.manter ?? [])] }
  }
  // a direção do final de uma saída: um item (ou ajuste de legenda) com `saida` só entra no render dela
  const daqui = (x: unknown) => !(x as { saida?: string })?.saida || (x as { saida?: string }).saida === idSaida
  if (edicao.direcao?.itens) edicao.direcao.itens = edicao.direcao.itens.filter(daqui)
  if (edicao.inserts?.pedidos) edicao.inserts.pedidos = edicao.inserts.pedidos.filter(daqui)
  if (edicao.legenda?.ajustes) edicao.legenda.ajustes = Object.fromEntries(Object.entries(edicao.legenda.ajustes).filter(([, v]) => daqui(v))) as typeof edicao.legenda.ajustes
  const bruto = edicao.fontes.find((f) => f.papel === 'bruto')
  const [transcricao, rosto, presets, transicoes, catalogo] = await Promise.all([
    json<{ palavras: Palavra[] }>(`${pasta}/transcricao.json`).catch(() => ({ palavras: [] })),
    bruto ? json<ArquivoRosto>(`${pasta}/midia/rosto/${bruto.id}.json`).catch(() => null) : null,
    lista('biblioteca/presets').then((l) => Promise.all(l.filter((a) => /^[0-9a-f]{10}\.json$/.test(a)).map((a) => json<Preset>(`/biblioteca/presets/${a}`)))),
    lista('biblioteca/transicoes').then(async (l) => ({
      transicoes: await Promise.all(l.filter((a) => a.endsWith('.json') && a !== 'ordem.json' && a !== 'pares.json').map((a) => json<Biblioteca['transicoes'][number]>(`/biblioteca/transicoes/${a}`))),
      pares: await json<Biblioteca['pares']>('/biblioteca/transicoes/pares.json').catch(() => ({})),
      ordem: await json<Biblioteca['ordem']>('/biblioteca/transicoes/ordem.json').catch(() => ({})),
    })),
    json<Catalogo['sons']>('/biblioteca/sons/catalogo.json').then((sons) => ({ sons, intensidades: INTENSIDADES })),
  ])
  // as mídias que o projeto usa (as dos inserts e as dos prints sobrepostos)
  const ids = [...new Set([
    ...(edicao.inserts?.pedidos ?? []).flatMap((x) => x.midias.map((m) => m.banco)),
    ...(edicao.direcao?.itens ?? []).flatMap((i) => (i.camada === 'elemento' && i.banco ? [i.banco] : [])),
  ])]
  const banco = new Map<string, ItemBanco>()
  for (const [id, item] of await Promise.all(ids.map(async (id) => [id, await itemBanco(id)] as const))) if (item) banco.set(id, item)
  // os sons de cada preset de motion usado
  const presetsMotion = [...new Set(Object.values(edicao.motions ?? {}).flatMap((m) => (m.tipo === 'preset' ? [m.preset] : [])))]
  const sonsMotion = Object.fromEntries(
    await Promise.all(presetsMotion.map(async (id) => [id, sonsDoPreset(await fetch(`/biblioteca/motions/presets/${id}.html`).then((r) => (r.ok ? r.text() : '')))] as const)),
  )
  const palavras = edicao.cortes ? comMantidas(transcricao.palavras, edicao.cortes.mantidas) : []
  return {
    edicao,
    palavras,
    rosto,
    presets,
    transicoes,
    escolhas: escolhasDe(edicao.transicoes),
    legenda: legendaDe(edicao.legenda),
    catalogo,
    banco,
    sonsMotion,
  }
}
