/* Runtime dos motions (SPEC §8.5). O preset monta uma timeline do GSAP pausada (com `MOTION.duracao`, a do plano) e a
 * entrega com `motion.pronto(tl)`. Quem manda no tempo é o app: `window.__ir(t)` leva a cena ao instante t (s) — a
 * timeline, os vídeos com `data-inicio` (o instante da cena em que começam) e o que foi registrado em `motion.aCada` —
 * e resolve quando tudo está pintado. Se a timeline tiver outra duração, é esticada ou encolhida na proporção. */
(function () {
  var M = window.MOTION || {}
  var tl = null
  var esperando = []
  var aCada = []
  var depois = [] // o que desenha com os vídeos já no quadro (uma cena 3D com vídeos nas telas)
  var marcas = [] // os sons (SPEC §8.6): o momento, quando (s na timeline) e, opcional, por quanto tempo
  var norm = function (s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  }
  // a palavra falada e a digitada: iguais, ou quase (o transcritor ouve "cloud" no lugar de "claude"): até 2 letras de
  // diferença em palavras de 4 letras ou mais
  var parecidas = function (a, b) {
    if (a === b) return true
    if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 2) return false
    var ant = []
    for (var j = 0; j <= b.length; j++) ant.push(j)
    for (var i = 1; i <= a.length; i++) {
      var lin = [i]
      for (var k = 1; k <= b.length; k++) lin.push(Math.min(ant[k] + 1, lin[k - 1] + 1, ant[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)))
      ant = lin
    }
    return ant[b.length] <= 2
  }
  window.motion = {
    pronto: function (t) {
      tl = t
      tl.pause(0)
      aCada.forEach(function (f) { f(0) })
      esperando.splice(0).forEach(function (f) { f() })
    },
    /** Uma cubic-bezier (como no CSS) como ease do GSAP. As curvas dos presets foram ajustadas às referências: quase
     *  todas têm entrada curta e suave e chegada bem longa, perto de (0.25, 0.1, 0.1, 1) em 0,8 a 1 s. */
    curva: function (x1, y1, x2, y2) {
      var b = function (a1, a2, t) { return 3 * (1 - t) * (1 - t) * t * a1 + 3 * (1 - t) * t * t * a2 + t * t * t }
      return function (x) {
        if (x <= 0 || x >= 1) return x
        var lo = 0, hi = 1, t = x
        for (var k = 0; k < 30; k++) { // busca binária: o t em que a curva passa por x
          t = (lo + hi) / 2
          if (b(x1, x2, t) < x) lo = t
          else hi = t
        }
        return b(y1, y2, t)
      }
    },
    /** Marca um som de apoio: o `momento` (um dos declarados em `sons` no JSON do preset, com o som padrão) acontece em
     *  `t` s; com `dur`, o som dura isso (a digitação toca enquanto as letras aparecem). O app escolhe o som e toca. */
    som: function (momento, t, dur) {
      marcas.push({ momento: momento, t: t, dur: dur })
    },
    /** `f(t)` roda a cada instante pedido (t = tempo da cena, em s): para o que não é tween, como a digitação. */
    aCada: function (f) {
      aCada.push(f)
    },
    /** `f(t)` roda depois que os vídeos chegaram ao quadro de `t` (um vídeo como textura de uma cena 3D só pode ser
     *  desenhado aqui; em `aCada` ele ainda está no quadro anterior). */
    depois: function (f) {
      depois.push(f)
    },
    /** O instante (s) em que cada letra de `texto` aparece, a partir de `ini` e no máximo até `fim`. Se o texto é dito na
     *  fala do plano (as mesmas palavras, em sequência), cada palavra é digitada enquanto é falada. Senão, num ritmo de
     *  gente: `ritmo` s por letra (sem ele, o texto se espalha até `fim`), com pausas depois de vírgula e de ponto, como
     *  nas referências (a digitação vem em rajadas). Se não couber até `fim`, o ritmo aperta. */
    digitar: function (texto, ini, fim, ritmo) {
      var n = texto.length
      var tempos = []
      var palavras = texto.split(/(\s+)/) // mantém os espaços
      var digitadas = palavras.filter(function (p) { return norm(p) })
      var fala = (M.fala || []).map(function (w) { return { n: norm(w.texto), ini: w.ini, fim: w.fim } }).filter(function (w) { return w.n })
      var achou = -1
      for (var i = 0; digitadas.length && i + digitadas.length <= fala.length && achou < 0; i++) {
        var ok = true
        for (var j = 0; j < digitadas.length && ok; j++) ok = parecidas(fala[i + j].n, norm(digitadas[j]))
        if (ok) achou = i
      }
      if (achou < 0) {
        // o peso de cada letra: 1, e a pausa depois da pontuação (vírgula ~5 letras, ponto ~9)
        var pesos = []
        for (var k = 0; k < n; k++) {
          var antes = texto[k - 1]
          // e, depois de uma palavra a cada ~3 (sempre as mesmas: a exportação sai igual à prévia), uma pausa curta
          var palavra = texto.slice(0, k).split(/\s+/).length
          // (só pontuação seguida de espaço: dentro de um link, como "openrouter.ai", não pausa)
          var pont = texto[k] === ' ' ? texto[k - 1] : ''
          pesos.push(pont === ',' || pont === ';' || pont === ':' ? 6 : pont === '.' || pont === '!' || pont === '?' ? 10 : antes === ' ' && (palavra * 7) % 3 === 0 ? 4 : 1)
        }
        var total = pesos.reduce(function (a, b) { return a + b }, 0)
        var passo = ritmo ? Math.min(ritmo, (fim - ini) / Math.max(total, 1)) : (fim - ini) / Math.max(total, 1)
        var acc = 0
        for (var q = 0; q < n; q++) {
          tempos.push(ini + acc * passo)
          acc += pesos[q + 1] || 1
        }
        return tempos
      }
      var w = achou
      var ultimo = ini
      palavras.forEach(function (p) {
        if (!norm(p)) { // espaço (ou pontuação solta): logo depois da palavra anterior
          for (var a = 0; a < p.length; a++) tempos.push(ultimo)
          return
        }
        var f = fala[w++]
        var a0 = Math.max(ini, f.ini)
        var a1 = Math.max(a0, Math.min(fim, f.fim))
        for (var b = 0; b < p.length; b++) tempos.push(a0 + ((a1 - a0) * b) / p.length)
        ultimo = a1
      })
      return tempos
    },
  }
  function quadro() {
    return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r) }) })
  }
  function videosProntos(t) {
    var vs = Array.prototype.slice.call(document.querySelectorAll('video'))
    return Promise.all(vs.map(function (v) {
      var ini = parseFloat(v.getAttribute('data-inicio') || '0')
      var base = parseFloat(v.getAttribute('data-desde') || '0') // trechos: o início do trecho no arquivo
      v.muted = true
      v.pause()
      // no meio do quadro (24 fps): buscar na borda entre dois quadros fazia o vídeo repetir um e pular o outro (travado)
      var alvo = base + (Math.round(Math.max(0, t - ini) * 24) + 0.5) / 24
      if (v.duration) alvo = Math.min(alvo, v.duration - 0.01)
      return new Promise(function (r) {
        var ok = function () { r() }
        if (Math.abs(v.currentTime - alvo) > 0.001) {
          v.addEventListener('seeked', ok, { once: true })
          v.addEventListener('error', ok, { once: true })
          v.currentTime = alvo
          setTimeout(ok, 3000)
        } else if (v.readyState >= 2) r()
        else {
          v.addEventListener('loadeddata', ok, { once: true })
          v.addEventListener('error', ok, { once: true })
          setTimeout(ok, 3000)
        }
      })
    }))
  }
  /** As marcas de som no tempo do plano (a timeline esticada como em `__ir`), depois de a cena estar montada. */
  window.__sons = function () {
    var ler = function () {
      var escala = M.duracao && tl ? (tl.duration() || 1) / M.duracao : 1
      return marcas.map(function (m) { return { momento: m.momento, t: m.t / escala, dur: m.dur ? m.dur / escala : undefined } })
    }
    return new Promise(function (r) { tl ? r(ler()) : esperando.push(function () { r(ler()) }) })
  }
  window.__ir = function (t) {
    var feito = function () {
      if (!tl) return Promise.resolve()
      var dur = tl.duration() || 1
      var escala = M.duracao ? dur / M.duracao : 1 // a duração do plano manda
      tl.time(Math.max(0, Math.min(t * escala, dur)), false)
      aCada.forEach(function (f) { f(tl.time()) })
      var tt = tl.time()
      return Promise.all([document.fonts.ready, videosProntos(t)]).then(function () { depois.forEach(function (f) { f(tt) }) }).then(quadro)
    }
    // um motion que nunca chama motion.pronto (erro no código) não pode travar a prévia nem a exportação
    var limite = new Promise(function (r) { setTimeout(r, 8000) })
    return Promise.race([tl ? feito() : new Promise(function (r) { esperando.push(function () { feito().then(r) }) }), limite])
  }
})()
