// do 18: frontend/src/api.ts (só os tipos que a página de render usa) e inserts/enriquecimento.ts (Curva)
import type { AjusteAtor } from './ator'

export type Curva = [number, number, number, number]

export type Palavra = { id: string; texto: string; inicio: number; fim: number; mantida?: boolean }
/** Itens das trilhas ficam presos a palavras (SPEC §9); o tempo na saída é sempre calculado. */
export type Ancora = { palavra_ini: string; palavra_fim: string }
export type Clipe = Ancora & { id: string; fonte: string; inicio: number; fim: number; ordem?: number; auto?: { inicio: number; fim: number } }
export type Timeline = { V1: Clipe[] }

export type ItemDirecaoProjeto = {
  id: string
  camada: 'plano' | 'elemento'
  tipo: string
  conteudo: 'insert' | 'motion' | null
  palavra_ini: string
  palavra_fim: string
  off_ini: number
  off_fim: number
  texto: string | null
  descricao: string
  /** No print sobreposto: a mídia do banco (imagem ou vídeo) que vai no card (`elementos.ts`). */
  banco?: string | null
  /** No print sobreposto: a largura do card (fração do quadro); sem ela, meia largura. */
  largura?: number
  /** No print sobreposto na tela dividida: logo abaixo da costura, sem cobrir o insert. */
  abaixo?: boolean
}
export type ItemRef = {
  id: string
  camada: 'plano' | 'elemento'
  tipo: string
  conteudo: 'insert' | 'motion' | null
  inicio: number
  fim: number
  descricao: string
  texto: string | null
}

/** Uma mídia do banco (`biblioteca/banco/<id>/item.json`; um trecho já com o que herda do original). */
export type ItemBanco = {
  id: string
  tipo: 'video' | 'imagem'
  largura: number | null
  altura: number | null
  duracao: number
  arquivo: string
  proxy?: string | null
  /** Trecho de um vídeo: o original (pai) e o início e fim nele. */
  pai?: string
  inicio?: number
  fim?: number
  /** O endereço do arquivo da exportação (o `exportacao.mp4`, quadro-chave a cada 6 quadros; senão o original). */
  url: string
}

export type MidiaLigada = { id: string; banco: string }
export type PedidoInsert = {
  id: string
  legenda_y?: number | 'abaixo'
  plano: string
  tipo: string
  formato: 'vertical' | 'dividida'
  descricao: string
  texto: string | null
  fala: string
  inicio: number
  duracao: number
  midias: MidiaLigada[]
  enriquecimento?: Partial<Record<'layout' | 'entrada' | 'entrada_2' | 'saida' | 'saida_2' | 'entre' | 'movimento', string> & { corte: number; preset: string; divisao: string; ajustes: Record<string, string>; ator: AjusteAtor }>
  comentario?: Partial<{ texto: string | null; avatar: number; usuario: string; tempo: string; traducao: boolean; x: number; y: number; escala: number; ate: string }>
}

/** Um estilo CSS como objeto (o `React.CSSProperties` do 18). */
export type Estilo = Record<string, string | number | undefined>
