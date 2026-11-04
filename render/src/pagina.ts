/** `/render/?projeto=<slug>`: só a camada dos inserts e motions (layout, entrada, fundo, card de comentário) e dos
 *  elementos da direção (`elementos.ts`), em fundo transparente, parada no instante que o render pede
 *  (`window.__render.ir(t)`). O ator e o áudio saem do bruto, pelo ffmpeg (SPEC §13). Do 18: frontend/src/paginas/Render.tsx (`RenderProjeto`), com as
 *  mesmas contas e o mesmo `window.__render`, mais `palavras` e `planos` (o app de revisão usa). */
import { carregar, itemBanco } from './dados'
import { montarSequencia } from './sequencia'
import { paraTempo, palavrasNaSaida } from './direcaoProjeto'
import { geometriaDoAtor, rostoDoArquivo } from './ator'
import { centroQueCentraliza, ehFullAtor, escalaFinal } from './movimento'
import { divisaoDe, lugarDoComentario, type Divisao } from './divisao'
import { chaveParada, pedidosNoTempo, receitaDoInsert } from './inserts'
import { blocosDaLegenda, paraExportar, semOsLetterings, zonasDaLegenda } from './legenda'
import { cortesDoVideo, sonsDasTransicoes } from './transicoes'
import { eventosDaReceita, type EventoSom } from './sons'
import { escolhasDeSom, eventosDoMotion, falaDoPlano, fundoDoMotion, marcasDaPagina, urlPaginaMotion } from './motions'
import { comentarioDe, cardComentario } from './comentario'
import { definirRelogio, desenhar, geometriaDoInsert, insertNoLugar, motionNoLugar, type Geometria, type V } from './desenho'
import { desenharElementos, intervalosDeLettering, sonsDosElementos, zonasDosElementos, type Elemento, type Lugar } from './elementos'

/** `divisao`: como a tela se divide no trecho (o ator: onde fica, e se a pessoa recortada sai por cima do insert).
 *  `assinatura`: tudo o que o trecho desenha (o render.py guarda a foto dele por ela). `geometria`: o insert parado que
 *  o ffmpeg desenha no lugar da foto (`desenho.geometriaDoInsert`). */
type Trecho = { ini: number; fim: number; dividida: boolean; divisao: (Divisao & { ator: unknown }) | null; assinatura?: string; geometria?: Geometria | null }
declare global {
  interface Window {
    /** O contrato com o render (o mesmo do 18, lido como em `backend/app/exportacao._trechos`):
     *  - `duracao` (s) do vídeo final; `trechos`: onde há camada para fotografar (inserts com mídia, motions e os pedaços
     *    dos elementos e dos planos Full ator com lettering que não caem em nenhum deles), cada um com a `assinatura`;
     *  - `ir(t)`: leva a página ao instante t e responde, depois de tudo pintado, com a chave do quadro quando ele fica
     *    igual aos seguintes (insert parado: o render reaproveita a foto) ou null; `ir(t, so)`, num trecho com
     *    `geometria`: só o fundo da área ('fundo') ou só a sombra do card k (as fotos paradas que o ffmpeg usa);
     *  - `sons()`: os sons de apoio (presets, motions, elementos e transições) no tempo do vídeo final, **sem** o fator de som do
     *    projeto (como no 18: o render multiplica o `ganho` por `fator_da_voz(nivel_voz.db)`, backend/app/sons.py);
     *  - `transicoes()`: as transições com efeito ({t, tipo, antes, depois, forca}); `legenda()`: {blocos} ou null (sem
     *    os blocos que um lettering já mostra);
     *  - `movimentos`: o zoom no ator nos planos de Full ator;
     *  - `palavras`: as palavras que tocam no vídeo final ({id, texto, ini, fim}, s da saída);
     *  - `planos`: os planos da direção no tempo da saída ({id, tipo, ini, fim, descricao, texto}). */
    __render?: {
      duracao: number
      trechos: Trecho[]
      ir: (t: number, so?: 'fundo' | number) => Promise<string | null>
      sons: () => Promise<EventoSom[]>
      transicoes: () => Promise<unknown[]>
      legenda: () => Promise<unknown>
      movimentos: { ini: number; fim: number; tipo: string; cx: number; cy: number }[]
      palavras: { id: string; texto: string; ini: number; fim: number }[]
      planos: { id: string; tipo: string; ini: number; fim: number; descricao: string; texto: string | null }[]
    }
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const doisQuadros = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

/** Espera tudo o que está na tela mostrar o instante novo: fontes, imagens e cada vídeo já no quadro pedido. */
async function pronto() {
  await document.fonts.ready
  const limite = Date.now() + 15_000
  const ok = () => [...document.querySelectorAll('video')].every((v) => v.error || (v.readyState >= 2 && !v.seeking))
  while (!ok() && Date.now() < limite) await esperar(5)
  // o quadro buscado já apresentado (desenho.ts); uma busca que cai no mesmo quadro pode não avisar: no máximo 300 ms
  const apresentado = Date.now() + 300
  while (document.querySelector('video[data-quadro="0"]') && Date.now() < apresentado) await esperar(5)
  await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => {}))))
  // motions: o iframe carregado e a cena já no instante pedido
  const motions = () => !document.querySelector('iframe[data-pronto="0"], iframe[data-pintando]')
  await doisQuadros()
  while (!motions() && Date.now() < limite) await esperar(10)
  await doisQuadros()
}

/** Os pedaços de [ini, fim) que não caem em nenhum dos intervalos `ocupados` (os elementos por cima de um insert ou
 *  motion já saem na foto dele; dois trechos no mesmo quadro sobreporiam a camada duas vezes). */
function semSobrepor(intervalos: { ini: number; fim: number }[], ocupados: { ini: number; fim: number }[]) {
  const juntos: { ini: number; fim: number }[] = []
  for (const x of [...intervalos].sort((a, b) => a.ini - b.ini)) {
    const u = juntos[juntos.length - 1]
    if (u && x.ini <= u.fim) u.fim = Math.max(u.fim, x.fim)
    else juntos.push({ ...x })
  }
  const occ = [...ocupados].sort((a, b) => a.ini - b.ini)
  return juntos.flatMap((x) => {
    const out: { ini: number; fim: number }[] = []
    let ini = x.ini
    for (const o of occ) {
      if (o.fim <= ini || o.ini >= x.fim) continue
      if (o.ini > ini) out.push({ ini, fim: o.ini })
      ini = Math.max(ini, o.fim)
    }
    if (ini < x.fim) out.push({ ini, fim: x.fim })
    return out.filter((p) => p.fim - p.ini > 1e-3)
  })
}

async function iniciar() {
  const slug = new URLSearchParams(location.search).get('projeto') ?? ''
  // a tela tem o tamanho do vídeo final e o conteúdo é desenhado como numa prévia de 540 px de largura, ampliado pelo
  // zoom (não pela densidade de pixels: com ela, o Chrome desenhava os vídeos com perspectiva 3D em baixa resolução)
  document.documentElement.style.zoom = String(window.innerWidth / 540)
  const raiz = document.getElementById('camada')!
  const d = await carregar(slug)
  const { edicao, banco, presets } = d
  const ins = edicao.inserts ?? {}
  const motions = edicao.motions ?? {}

  const seq = montarSequencia(edicao.timeline ?? { V1: [] }, d.palavras, edicao.velocidade ?? 1)
  // o rosto do ator (P5): a geometria do ator em cada trecho dividido vai junto da divisão, para o ffmpeg aplicar
  const rostoEm = rostoDoArquivo(d.rosto, seq, edicao.enquadramento?.x ?? 0.5)
  const saida = palavrasNaSaida(d.palavras, seq)
  const visiveis = paraTempo(edicao.direcao?.itens ?? [], d.palavras, saida, seq.duracao).visiveis
  const planos = visiveis.filter((i) => i.camada === 'plano')
  const elementos = visiveis.filter((i) => i.camada === 'elemento')
  // os motions: os planos de motion que já têm um motion escolhido
  const comMotion = planos
    .filter((pl) => motions[pl.id])
    .map((pl) => ({ plano: pl.id, ini: pl.inicio, fim: pl.fim, dividida: pl.tipo === 'tela_dividida_motion', fala: falaDoPlano(saida, pl.inicio, pl.fim) }))
  const lista = pedidosNoTempo(ins.pedidos ?? [], planos).filter((x) => x.midias.length)
  const fundoInserts = ins.fundo ?? 'gradiente'
  const cortes = cortesDoVideo(planos, d.transicoes, d.escolhas)

  const trechos: Trecho[] = [
    ...lista.map((x) => {
      const divisao = divisaoDe(x, banco, presets)
      const ator = geometriaDoAtor(divisao, x.enriquecimento?.ator, rostoEm?.(x.t.inicio, x.t.fim) ?? null)
      return { ini: x.t.inicio, fim: x.t.fim, dividida: x.formato === 'dividida', divisao: divisao && { ...divisao, ator } }
    }),
    ...comMotion.map((m) => {
      const divisao: Divisao | null = m.dividida ? { modo: 'metade', tipo: 'area', f: 0.5 } : null
      return { ini: m.ini, fim: m.fim, dividida: m.dividida, divisao: divisao && { ...divisao, ator: geometriaDoAtor(divisao, null, rostoEm?.(m.ini, m.fim) ?? null) } }
    }),
  ]
  // os elementos da direção e o texto dos planos Full ator com lettering (`elementos.ts`), cada um com o lugar onde cai
  // (pelo meio dele): o ator em tela cheia, o insert ou motion na tela toda ou a tela dividida
  const lugarEm = (ini: number, fim: number, t = (ini + fim) / 2): Lugar => {
    const x = lista.find((x) => t >= x.t.inicio && t < x.t.fim)
    if (x) {
      const d = divisaoDe(x, banco, presets)
      return { modo: d?.modo ?? 'cheia', f: d?.f ?? 1, rosto: null }
    }
    const m = comMotion.find((m) => t >= m.ini && t < m.fim)
    if (m) return { modo: m.dividida ? 'metade' : 'cheia', f: m.dividida ? 0.5 : 1, rosto: null }
    return { modo: 'ator', f: 1, rosto: rostoEm?.(ini, fim) ?? null }
  }
  // a caixinha fica a pergunta inteira, com as telas trocando embaixo: na tela dividida, a costura mais alta do trecho
  // (no meio dele, a de um card em pé descia a caixinha sobre o rosto quando a tela seguinte era um insert deitado)
  const caixinhaEm = (ini: number, fim: number): Lugar => {
    const ls = [0.05, 0.25, 0.5, 0.75, 0.95].map((k) => lugarEm(ini, fim, ini + (fim - ini) * k))
    const m = ls.filter((l) => l.modo === 'metade')
    return m.length === ls.length ? m.reduce((a, b) => (b.f < a.f ? b : a)) : lugarEm(ini, fim)
  }
  const originais = new Map((edicao.direcao?.itens ?? []).map((i) => [i.id, i]))
  const desenhaveis: Elemento[] = [...planos.filter((p) => p.tipo === 'full_ator_lettering'), ...elementos]
    .sort((a, b) => a.inicio - b.inicio)
    // a tarja do começo já está na tela no 1º quadro (o criador: "presente desde o primeiro instante")
    .map((e) => ({ id: e.id, tipo: e.tipo, inicio: e.tipo === 'tarja' && e.inicio < 1 ? 0 : e.inicio, fim: e.fim, texto: e.texto, descricao: e.descricao, banco: originais.get(e.id)?.banco ?? null, lugar: e.tipo === 'caixinha_perguntas' ? caixinhaEm(e.inicio, e.fim) : lugarEm(e.inicio, e.fim) }))
  // os pedaços deles fora dos inserts e motions entram para o render fotografar (os de dentro já saem na foto do trecho)
  // os inserts parados, sem elemento nem comentário por cima: o ffmpeg desenha (a geometria vai no lugar da foto)
  lista.forEach((x, i) => {
    if (x.tipo === 'comentario_insert_ator' || desenhaveis.some((e) => e.inicio < x.t.fim && e.fim > x.t.inicio)) return
    trechos[i].geometria = geometriaDoInsert(x, banco, receitaDoInsert(x, banco, presets), divisaoDe(x, banco, presets), fundoInserts)
  })
  trechos.push(...semSobrepor(desenhaveis.map((e) => ({ ini: e.inicio, fim: e.fim })), trechos).map((p) => ({ ...p, dividida: false, divisao: null })))

  // a assinatura de cada trecho: tudo o que ele desenha, com os tempos relativos ao começo dele (a foto guardada serve
  // num instante diferente do vídeo: os cortes podem mover o trecho). As mídias vão com o tamanho e a data do arquivo que
  // a página toca (HEAD), para a assinatura mudar quando a mídia muda
  const versoes = new Map<string, Promise<string>>()
  const versao = (url: string) => {
    if (!versoes.has(url))
      versoes.set(url, fetch(url, { method: 'HEAD' }).then((r) => (r.ok ? `${r.headers.get('content-length')}@${r.headers.get('last-modified')}` : 'ausente'), () => 'ausente'))
    return versoes.get(url)!
  }
  const midiaDe = async (id: string | null | undefined) => {
    const i = id ? banco.get(id) ?? (await itemBanco(id)) : null
    return i ? { ...i, versao: await versao(i.url) } : null
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000
  const assinatura = async ({ ini, fim }: { ini: number; fim: number }) => {
    const rel = (x: number) => r3(x - ini)
    const cai = (a: number, b: number) => a < fim && b > ini
    const daqui = await Promise.all(
      lista.filter((x) => cai(x.t.inicio, x.t.fim)).map(async (x) => {
        const divisao = divisaoDe(x, banco, presets)
        const comentario = x.tipo === 'comentario_insert_ator' ? comentarioDe(x, lugarDoComentario(x, divisao, geometriaDoAtor(divisao, x.enriquecimento?.ator, null))) : null
        return { t: [rel(x.t.inicio), rel(x.t.fim)], tipo: x.tipo, formato: x.formato, texto: x.texto, enriquecimento: x.enriquecimento ?? null,
                 midias: await Promise.all(x.midias.map((m) => midiaDe(m.banco))), receita: receitaDoInsert(x, banco, presets), divisao, comentario }
      }),
    )
    const mots = await Promise.all(
      comMotion.filter((m) => cai(m.ini, m.fim)).map(async (m) => {
        const mp = motions[m.plano]
        // as mídias do motion: o vídeo do banco, ou os campos de imagem do preset (um id do banco nos valores)
        const ids = mp.tipo === 'video' ? [mp.banco] : Object.values(mp.valores ?? {}).filter((v) => typeof v === 'string' && /^[0-9a-f]{10}$/.test(v))
        return { t: [rel(m.ini), rel(m.fim)], preset: mp.tipo === 'preset' ? mp.preset : null, formato: mp.formato, fundo: fundoDoMotion(mp) ?? null,
                 src: urlPaginaMotion(mp, m.fim - m.ini, m.fala, true), midias: await Promise.all(ids.map(midiaDe)) }
      }),
    )
    const elems = await Promise.all(
      desenhaveis.filter((e) => cai(e.inicio, e.fim)).map(async (e) => ({ t: [rel(e.inicio), rel(e.fim)], tipo: e.tipo, texto: e.texto, lugar: e.lugar, midia: await midiaDe(e.banco) })),
    )
    const fundo = daqui.length ? fundoInserts : null
    return JSON.stringify({
      dur: r3(fim - ini), inserts: daqui, motions: mots, elementos: elems, fundo,
      // a chuva toca o loop no relógio do vídeo final: aí o trecho depende do instante
      relogio: [fundo, ...mots.map((m) => m.fundo)].includes('chuva') ? r3(ini) : null,
      palavras: saida.filter((w) => w.saida_ini < fim && w.saida_fim > ini).map((w) => [w.texto, rel(w.saida_ini), rel(w.saida_fim)]),
    })
  }
  await Promise.all(trechos.map(async (t) => void (t.assinatura = await assinatura(t))))

  // o card do comentário até a palavra `comentario.ate` (inclusive): depois dela o plano segue sem o card, com o mesmo
  // insert e a mesma divisão (no sim sim sim, o "Sim" tira a pergunta da tela sem trocar o que está em cima)
  const fimDaPalavra = new Map(saida.map((w) => [w.id, w.saida_fim]))
  const semCard = (x: { comentario?: { ate?: string } }, tempo: number) => {
    const ate = x.comentario?.ate
    return ate != null && fimDaPalavra.has(ate) && tempo >= fimDaPalavra.get(ate)!
  }
  // a camada no instante `tempo` e a chave do quadro (parado: sem vídeo na tela, checado depois de pintar, e sem entrada
  // nem saída andando, nem um elemento mexendo; motion nunca é parado)
  const quadro = (tempo: number, so?: 'fundo' | number): string | null => {
    definirRelogio(tempo)
    const atual = lista.find((x) => tempo >= x.t.inicio && tempo < x.t.fim)
    const motion = comMotion.find((m) => tempo >= m.ini && tempo < m.fim)
    const el = desenharElementos(tempo, desenhaveis, banco)
    const elems = el.vs
    if (motion && motions[motion.plano]) {
      const mp = motions[motion.plano]
      const src = urlPaginaMotion(mp, motion.fim - motion.ini, motion.fala, true)
      // o palco escalado para a largura da área (a tela toda ou a metade de cima: as duas na largura do vídeo)
      const escala = raiz.clientWidth / 1080
      desenhar(raiz, [motionNoLugar({ src, formato: mp.formato, fundo: fundoDoMotion(mp), rel: tempo - motion.ini, escala }), ...elems])
      return null
    }
    if (!atual) {
      desenhar(raiz, elems)
      return el.chave || null
    }
    const divisao = divisaoDe(atual, banco, presets)
    const receita = receitaDoInsert(atual, banco, presets)
    const camada = (caixa: [number, number] | null): V[] => {
      const out = insertNoLugar({ pedido: atual, banco, tempo, fundo: fundoInserts, receita, divisao, caixa, so })
      if (so != null) return out
      if (atual.tipo === 'comentario_insert_ator' && !semCard(atual, tempo)) {
        // o card desvia do ator pela geometria dele (o rosto só muda o x: a altura é a mesma da prévia)
        const c = comentarioDe(atual, lugarDoComentario(atual, divisao, geometriaDoAtor(divisao, atual.enriquecimento?.ator, null)))
        out.push(cardComentario(c, c.texto ?? atual.texto ?? ''))
      }
      return [...out, ...elems]
    }
    desenhar(raiz, camada(null))
    // os cards guiados pelos cantos (`quadros`) precisam do tamanho da área em px para a matrix3d
    if (receita?.cards.some((c) => c.quadros?.length)) {
      const cena = raiz.querySelector<HTMLElement>('[data-k="cena"]')
      if (cena) desenhar(raiz, camada([cena.clientWidth, cena.clientHeight]))
    }
    const chave0 = chaveParada(atual, tempo - atual.t.inicio, presets)
    const chave = chave0 != null && semCard(atual, tempo) ? `${chave0}|sem-card` : chave0
    return chave == null || el.chave == null ? null : el.chave ? `${chave}|${el.chave}` : chave
  }

  window.__render = {
    duracao: seq.duracao,
    trechos,
    movimentos: planos.flatMap((pl) => {
      const tipo = ehFullAtor(pl.tipo) ? ins.ator_planos?.[pl.id] : undefined
      if (!tipo) return []
      const c = centroQueCentraliza(rostoEm?.(pl.inicio, pl.fim), escalaFinal(tipo, pl.fim - pl.inicio))
      return [{ ini: pl.inicio, fim: pl.fim, tipo, cx: c.x, cy: c.y }]
    }),
    sons: async () => {
      const cat = d.catalogo
      const dosInserts = lista.flatMap((x) => {
        const r = receitaDoInsert(x, banco, presets)
        return r ? eventosDaReceita(r, x.t.fim - x.t.inicio, cat).map((e) => ({ ...e, t: e.t + x.t.inicio })) : []
      })
      // os motions: as marcas de cada página (aberta escondida) com o som escolhido de cada momento
      const dosMotions = await Promise.all(
        comMotion.map(async (m) => {
          const mp = motions[m.plano]
          if (mp.tipo !== 'preset') return []
          const marcas = await marcasDaPagina(urlPaginaMotion(mp, m.fim - m.ini, m.fala, true), mp.formato)
          return eventosDoMotion(marcas, escolhasDeSom(d.sonsMotion[mp.preset], mp), cat)
            .filter((e) => e.t < m.fim - m.ini)
            .map((e) => ({ ...e, t: e.t + m.ini }))
        }),
      )
      return [...dosInserts, ...dosMotions.flat(), ...sonsDosElementos(desenhaveis, cat), ...sonsDasTransicoes(cortes, cat)]
    },
    // a legenda (SPEC §8.10): os blocos visíveis (a mesma conta da prévia, com a altura pelos inserts desta página e
    // desviando da barra do ManyChat, da caixinha e do print), sem o que um lettering já mostra, para o ASS
    legenda: async () => {
      // um motion pode dizer a altura da legenda enquanto está na tela (`legenda_y`, fração do quadro)
      const zonasMotion = comMotion.filter((m) => motions[m.plano]?.legenda_y != null)
        .map((m) => ({ ini: m.ini, fim: m.fim, divisao: null, card: null, y: Number(motions[m.plano].legenda_y) }))
      const zonas = [...zonasMotion, ...zonasDaLegenda(lista, banco, presets), ...zonasDosElementos(desenhaveis, banco)]
      if (!d.legenda.ligada) return null
      const blocos = semOsLetterings(blocosDaLegenda(saida, planos, d.legenda, d.palavras, zonas), saida, intervalosDeLettering(desenhaveis))
      return { blocos: paraExportar(blocos) }
    },
    // as transições com efeito (o som delas vai em `sons`), para o ffmpeg desenhar depois da montagem (SPEC §8.8)
    transicoes: async () => cortes.filter((c) => c.transicao && c.transicao.efeito.tipo !== 'seco').map((c) => ({ t: c.t, ...c.transicao!.efeito })),
    palavras: saida.map((w) => ({ id: w.id, texto: w.texto, ini: w.saida_ini, fim: w.saida_fim })),
    planos: planos.map((p) => ({ id: p.id, tipo: p.tipo, ini: p.inicio, fim: p.fim, descricao: p.descricao, texto: p.texto })),
    ir: async (t, so) => {
      const chave = quadro(t, so)
      await pronto()
      return document.querySelector('video') ? null : chave
    },
  }
}

void iniciar().catch((e) => {
  console.error(e)
  document.title = `erro: ${(e as Error).message}`
})
