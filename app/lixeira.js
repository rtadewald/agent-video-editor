// A Lixeira: tudo o que se apaga no app (projetos, carrosséis, mídias do banco, referências) num lugar só, em biblioteca/lixeira/.
// Daqui, restaurar (volta para onde estava) ou apagar de vez (um item, um tipo ou tudo).
import { ICONE, ajuda, aviso, confirmar, dataHora, enviar, esc, json, preferencia } from './comum.js'

const TIPOS = { projeto: 'Projetos', carrossel: 'Carrosséis', banco: 'Banco', referencia: 'Referências' }
const tamanho = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`)

export async function abrirLixeira(tela) {
  tela.className = 'pagina pagina-lixeira'
  let itens = await json('/api/lixeira', [])
  let filtro = preferencia('lixeira.tipo', '')

  const card = (x) => {
    const base = `/biblioteca/lixeira/${encodeURIComponent(x.entrada)}/`
    const mini = x.miniatura ? `<img loading="lazy" src="${base}${x.miniatura.split('/').map(encodeURIComponent).join('/')}" alt="">`
      : x.video ? `<video muted playsinline preload="metadata" src="${base}${x.video.split('/').map(encodeURIComponent).join('/')}#t=1.5"></video>` : ''
    return `<div class="card-lixo" data-entrada="${esc(x.entrada)}">
      <div class="mini mini-lixo">${mini}<span class="selo-tipo">${esc(TIPOS[x.tipo] || x.tipo)}</span></div>
      <h3 title="${esc(x.nome)}">${esc(x.nome)}</h3>
      <p class="sub">${dataHora(x.apagado_em)} · ${tamanho(x.bytes || 0)}${x.itens?.length > 1 ? ` · ${x.itens.length} pastas` : ''}</p>
      <div class="acoes-lixo">
        <button class="botao pequeno" data-restaurar title="Volta para onde estava">${ICONE.refazer} Restaurar</button>
        <button class="botao-icone pequeno botao-perigo-contorno" data-apagar-de-vez title="Apagar de vez (não dá para recuperar)" aria-label="Apagar de vez">${ICONE.lixo}</button></div></div>`
  }

  const desenhar = () => {
    const visiveis = itens.filter((x) => !filtro || x.tipo === filtro)
    const total = visiveis.reduce((a, x) => a + (x.bytes || 0), 0)
    const conta = (t) => itens.filter((x) => !t || x.tipo === t).length
    tela.innerHTML = `<div class="cabeca-secao"><span class="eyebrow">Lixeira · ${visiveis.length} ${visiveis.length === 1 ? 'item' : 'itens'} · ${tamanho(total)}</span>
        ${ajuda('Tudo o que você apaga no app (projetos, mídias do banco, referências) vem para cá, inteiro. Restaurar devolve para onde estava; Apagar de vez libera o espaço e não tem volta.')}
        <div class="filtro-produtos">${['', ...Object.keys(TIPOS)].map((t) => `<button class="pilula pequena${filtro === t ? ' ativa' : ''}" data-tipo="${t}">${t ? TIPOS[t] : 'Tudo'} <span class="conta">${conta(t)}</span></button>`).join('')}</div>
        ${visiveis.length ? `<button class="botao pequeno botao-perigo-contorno" data-esvaziar>${ICONE.lixo} Esvaziar${filtro ? ` ${TIPOS[filtro]}` : ''}</button>` : ''}</div>
      ${visiveis.length ? `<div class="grade grade-lixo">${visiveis.map(card).join('')}</div>` : '<p class="vazio">A lixeira está vazia.</p>'}`
  }
  desenhar()

  const tirar = (entradas) => {
    itens = itens.filter((x) => !entradas.includes(x.entrada))
    desenhar()
  }
  const cliques = async (e) => {
    const t = e.target.closest('[data-tipo]')
    if (t) {
      filtro = preferencia('lixeira.tipo', '', t.dataset.tipo)
      return desenhar()
    }
    const c = e.target.closest('[data-entrada]')
    const x = c && itens.find((i) => i.entrada === c.dataset.entrada)
    if (x && e.target.closest('[data-restaurar]')) {
      try {
        await enviar('POST', `/api/lixeira/${encodeURIComponent(x.entrada)}/restaurar`)
        aviso(`“${x.nome}” voltou para ${TIPOS[x.tipo] || 'onde estava'}`)
        tirar([x.entrada])
      } catch (err) {
        aviso(err.message, 'erro')
      }
      return
    }
    if (x && e.target.closest('[data-apagar-de-vez]')) {
      if (!(await confirmar({ titulo: `Apagar “${x.nome}” de vez?`, texto: `Libera ${tamanho(x.bytes || 0)}. Não dá para recuperar.`, ok: 'Apagar de vez', perigo: true }))) return
      try {
        await enviar('DELETE', `/api/lixeira/${encodeURIComponent(x.entrada)}`)
        aviso(`“${x.nome}” apagado de vez`)
        tirar([x.entrada])
      } catch (err) {
        aviso(err.message, 'erro')
      }
      return
    }
    if (e.target.closest('[data-esvaziar]')) {
      const alvo = itens.filter((i) => !filtro || i.tipo === filtro)
      const bytes = alvo.reduce((a, i) => a + (i.bytes || 0), 0)
      if (!(await confirmar({ titulo: `Esvaziar ${filtro ? TIPOS[filtro] : 'a lixeira'} (${alvo.length} ${alvo.length === 1 ? 'item' : 'itens'})?`,
        texto: `Libera ${tamanho(bytes)}. Tudo é apagado de vez: não dá para recuperar.`, ok: 'Apagar de vez', perigo: true }))) return
      try {
        const r = await enviar('POST', '/api/lixeira/esvaziar', { tipo: filtro || null })
        aviso(`Lixeira esvaziada · ${r.apagados} ${r.apagados === 1 ? 'item' : 'itens'}`)
        tirar(alvo.map((i) => i.entrada))
      } catch (err) {
        aviso(err.message, 'erro')
      }
    }
  }
  tela.addEventListener('click', cliques)
  return () => tela.removeEventListener('click', cliques)
}

