(() => {
  // src/curvas.ts
  var solvers = /* @__PURE__ */ new Map();
  function bezier(x1, y1, x2, y2) {
    const chave = `${x1},${y1},${x2},${y2}`;
    let f = solvers.get(chave);
    if (!f) solvers.set(chave, f = montar(x1, y1, x2, y2));
    return f;
  }
  var limite01 = (v) => Math.max(0, Math.min(1, v));
  function montar(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const x = (s) => ((ax * s + bx) * s + cx) * s;
    const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
    const y = (s) => ((ay * s + by) * s + cy) * s;
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let s = t;
      for (let i = 0; i < 8; i++) {
        const d = dx(s);
        if (Math.abs(d) < 1e-6) break;
        s -= (x(s) - t) / d;
      }
      s = Math.min(1, Math.max(0, s));
      for (let i = 0, a = 0, b = 1; i < 20 && Math.abs(x(s) - t) > 1e-5; i++) {
        if (x(s) < t) a = s;
        else b = s;
        s = (a + b) / 2;
      }
      return y(s);
    };
  }

  // src/presets.ts
  var limite = limite01;
  var NEUTRO = { dx: 0, dy: 0, escala: 1, altura: 1, rot: 0, rx: 0, ry: 0, opacidade: 1, desfoque: 0 };
  function noTempo(r, dur) {
    const k = Math.min(1, dur / Math.max(r.duracao_ref, 0.01));
    if (k >= 0.999) return r;
    const mov = (m, f) => m && f < 0.999 ? {
      ...m,
      duracao: m.duracao * f,
      atraso: Object.fromEntries(Object.entries(m.atraso ?? {}).map(([p, v]) => [p, v * f])),
      dur: Object.fromEntries(Object.entries(m.dur ?? {}).map(([p, v]) => [p, v * f]))
    } : m;
    return {
      ...r,
      cards: r.cards.map((c) => {
        const sai = c.sai_antes_do_fim * k;
        const vida = Math.max(c.fim_frac != null ? c.fim_frac * dur : dur - sai, 0.05) - c.inicio_frac * dur;
        const soma = (c.entrada?.duracao ?? 0) + (c.saida?.duracao ?? 0);
        const f = soma > vida ? vida / soma : 1;
        return { ...c, sai_antes_do_fim: sai, entrada: mov(c.entrada, f), saida: mov(c.saida, f) };
      })
    };
  }
  function comRepouso(c, rep) {
    const novo = { ...c.repouso, ...rep };
    const s = c.saida;
    if (!s || s.para.escala <= 1.05 || novo.w === c.repouso.w && novo.h === c.repouso.h) return { ...c, repouso: novo };
    const kx = novo.w / Math.max(c.repouso.w, 0.01);
    const ky = novo.h / Math.max(c.repouso.h, 0.01);
    return { ...c, repouso: novo, saida: { ...s, para: { ...s.para, dx: s.para.dx * kx, dy: s.para.dy * ky } } };
  }
  function janela(c, dur) {
    const ini = c.inicio_frac * dur;
    const fim = Math.max(c.fim_frac != null ? Math.min(c.fim_frac * dur + (c.fim_mais ?? 0), dur) : dur - c.sai_antes_do_fim, ini + 0.05);
    return { ini, fim };
  }
  function progresso(m, k, t) {
    const atraso = m.atraso?.[k] ?? 0;
    const d = m.dur?.[k] ?? m.duracao - atraso;
    const curva = m.curvas[k] ?? m.curvas.pos ?? [0.16, 1, 0.3, 1];
    return bezier(...curva)(limite((t - atraso) / Math.max(d, 0.01)));
  }
  var mistura = (a, b, p) => a + (b - a) * p;
  function estadoCard(c, rel, dur) {
    const { ini, fim } = janela(c, dur);
    if (rel < ini || rel > fim) return null;
    let e = { ...NEUTRO };
    if (c.entrada && rel < ini + c.entrada.duracao) {
      const t = rel - ini;
      const de = c.entrada.de;
      const pp = progresso(c.entrada, "pos", t);
      const pr = progresso(c.entrada, "rot", t);
      e = {
        dx: mistura(de.dx, 0, pp),
        dy: mistura(de.dy, 0, pp),
        escala: mistura(de.escala, 1, progresso(c.entrada, "escala", t)),
        altura: mistura(de.altura ?? 1, 1, progresso(c.entrada, "escala", t)),
        rot: mistura(de.rot, 0, pr),
        rx: mistura(de.rx, 0, pr),
        ry: mistura(de.ry, 0, pr),
        opacidade: limite(mistura(de.opacidade, 1, progresso(c.entrada, "opacidade", t))),
        desfoque: Math.max(0, mistura(de.desfoque, 0, progresso(c.entrada, "desfoque", t)))
      };
    }
    if (c.saida && rel > fim - c.saida.duracao) {
      const t = rel - (fim - c.saida.duracao);
      const pa = c.saida.para;
      const pp = progresso(c.saida, "pos", t);
      const pr = progresso(c.saida, "rot", t);
      e = {
        dx: e.dx + mistura(0, pa.dx, pp),
        dy: e.dy + mistura(0, pa.dy, pp),
        escala: e.escala * mistura(1, pa.escala, progresso(c.saida, "escala", t)),
        altura: (e.altura ?? 1) * mistura(1, pa.altura ?? 1, progresso(c.saida, "escala", t)),
        rot: e.rot + mistura(0, pa.rot, pr),
        rx: e.rx + mistura(0, pa.rx, pr),
        ry: e.ry + mistura(0, pa.ry, pr),
        opacidade: e.opacidade * limite(mistura(1, pa.opacidade, progresso(c.saida, "opacidade", t))),
        desfoque: e.desfoque + Math.max(0, mistura(0, pa.desfoque, progresso(c.saida, "desfoque", t)))
      };
    }
    const z = c.continuo;
    if (z) {
      const t = rel - ini;
      e = { ...e, escala: e.escala * Math.pow(1 + z.escala, t), dx: e.dx + z.dx * t, dy: e.dy + z.dy * t, rot: e.rot + (z.rot ?? 0) * t };
    }
    return e;
  }
  var temContinuo = (c) => !!c.continuo && (c.continuo.escala !== 0 || c.continuo.dx !== 0 || c.continuo.dy !== 0 || !!c.continuo.rot);
  function zoomMidia(c, rel, dur) {
    const z = c.zoom;
    if (!z) return 1;
    const t = rel - janela(c, dur).ini - z.inicio;
    return mistura(1, z.escala, bezier(...z.curva)(limite(t / Math.max(z.duracao, 0.01))));
  }
  function cantosNoTempo(qs, f) {
    if (qs.length === 1 || f <= qs[0].f) return qs[0].q;
    if (f >= qs[qs.length - 1].f) return qs[qs.length - 1].q;
    let i = 0;
    while (qs[i + 1].f < f) i++;
    const a = qs[Math.max(i - 1, 0)], b = qs[i], c = qs[i + 1], d = qs[Math.min(i + 2, qs.length - 1)];
    const t = (f - b.f) / Math.max(c.f - b.f, 1e-6);
    const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    return b.q.map((_, k) => [cr(a.q[k][0], b.q[k][0], c.q[k][0], d.q[k][0]), cr(a.q[k][1], b.q[k][1], c.q[k][1], d.q[k][1])]);
  }
  function matrizDosCantos(w, h, q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
    const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
    const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
    return `matrix3d(${m.map((v) => +v.toFixed(8)).join(",")})`;
  }
  function mexendo(r0, rel, dur) {
    const r = noTempo(r0, dur);
    return r.cards.some((c) => {
      const { ini, fim } = janela(c, dur);
      const z = c.zoom;
      return !!c.quadros && rel >= ini && rel <= fim || temContinuo(c) && rel >= ini && rel <= fim || z && rel >= ini + z.inicio && rel < ini + z.inicio + z.duracao || c.entrada && rel >= ini && rel < ini + c.entrada.duracao || c.saida && rel > fim - c.saida.duracao && rel <= fim;
    });
  }
  var nMidias = (r) => Math.max(...r.cards.map((c, k) => (c.midia ?? k) + 1));
  function paraMidias(r, n) {
    if (!r.repete && n >= 1 && n < nMidias(r)) return { ...r, cards: r.cards.map((c, k) => ({ ...c, midia: (c.midia ?? k) % n })) };
    if (!r.repete || n < 1) return r;
    const fixos = r.cards.slice(0, -1);
    const molde = r.cards[r.cards.length - 1];
    const seq = r.cards.some((c) => c.fim_frac != null && c.fim_frac < 1);
    const fimDe = (_c, k) => k === n - 1 ? 1 : (k + 1) / n;
    const mais = (c, k) => k < n - 1 && c.saida ? c.saida.duracao : 0;
    const ultimoSai = (k) => k < n - 1 || !!r.sai_ultimo;
    const comoMedida = n === r.cards.length;
    const cards2 = fixos.map((c, k) => seq && !comoMedida ? { ...c, fim_frac: fimDe(c, k), fim_mais: mais(c, k), saida: ultimoSai(k) ? c.saida : null } : c);
    for (let k = fixos.length; k < n; k++)
      cards2.push({
        ...molde,
        midia: k,
        inicio_frac: k === 0 || comoMedida ? molde.inicio_frac : k / n,
        fim_frac: seq ? fimDe(molde, k) : molde.fim_frac,
        fim_mais: seq ? mais(molde, k) : molde.fim_mais,
        saida: seq && !ultimoSai(k) ? null : molde.saida,
        repouso: { ...molde.repouso, z: molde.repouso.z + k }
      });
    return { ...r, cards: n < fixos.length ? cards2.slice(0, n) : cards2 };
  }
  var chaveProporcao = (a) => a < 0.8 ? "pe" : a <= 1.2 ? "quadrada" : "deitada";
  var chaveMidias = (n) => n <= 1 ? "1" : n === 2 ? "2" : "2+";
  function usosDe(p) {
    if (p.usos) return p.usos;
    const telas = p.formatos ?? ["dividida", "vertical"];
    return {
      telas: telas.includes("dividida") ? [...telas, "atras"] : telas,
      midias: p.receita.repete ? ["2", "2+"] : [chaveMidias(nMidias(p.receita))]
    };
  }
  var serve = (p, _formato, n, tela, aspectos) => {
    const u = usosDe(p);
    const cabe = p.receita.repete ? n >= 1 : n >= 1 && n <= nMidias(p.receita);
    const props = !aspectos || !u.proporcoes || aspectos.every((a) => u.proporcoes.includes(chaveProporcao(a)));
    return cabe && props && u.midias.includes(chaveMidias(n)) && (!tela || u.telas.includes(tela));
  };
  function paraFormato(r, formato) {
    if (r.formato === formato) return r;
    const k = formato === "dividida" ? 2 : 0.5;
    const y = (v) => formato === "dividida" ? (v - 25) * 2 : v / 2 + 25;
    const mov = (m) => {
      if (!m) return m;
      const chave = "de" in m ? "de" : "para";
      const e = m[chave];
      return { ...m, [chave]: { ...e, dy: e.dy * k } };
    };
    return {
      ...r,
      formato,
      cards: r.cards.map((c) => ({
        ...c,
        repouso: { ...c.repouso, cy: y(c.repouso.cy), h: c.repouso.h * k },
        entrada: mov(c.entrada),
        saida: mov(c.saida),
        continuo: c.continuo ? { ...c.continuo, dy: c.continuo.dy * k } : c.continuo
      }))
    };
  }
  var noFormato = (p, formato, n) => {
    const r = n ? paraMidias(p.receita, n) : p.receita;
    const q = r === p.receita ? p : { ...p, receita: r };
    return q.formato === formato || formato !== "vertical" && formato !== "dividida" ? q : { ...q, receita: paraFormato(q.receita, formato), adaptado: true };
  };

  // src/sons.ts
  var INTENSIDADES = { baixo: 0.25, medio: 0.5 };
  function eventoNoTempo(s, quando, cat, dur, abrange) {
    const info = s.som ? cat.sons.find((x) => x.id === s.som) : null;
    if (!info) return null;
    const ganho = cat.intensidades[s.intensidade] ?? 0.3;
    if (abrange && abrange > 0.05) {
      const golpe = quando + s.atraso;
      const vel = Math.min(Math.max(info.ataque / abrange, VEL[0]), VEL[1]);
      let t2 = golpe - Math.min(info.ataque / vel, abrange);
      let desde = Math.max(info.ataque - abrange * vel, 0);
      if (t2 < 0) {
        desde -= t2 * vel;
        t2 = 0;
      }
      const rabo = (info.duracao - info.ataque) / vel;
      const corte = rabo > RABO ? { dur: +(golpe - t2 + RABO).toFixed(4) } : {};
      return { t: t2, som: info.id, ganho, desde, ...corte, ...Math.abs(vel - 1) > 0.01 ? { vel: +vel.toFixed(4) } : {} };
    }
    const t = quando + s.atraso - (dur ? 0 : info.ataque);
    return { t: Math.max(t, 0), som: info.id, ganho, desde: Math.max(-t, 0), ...dur ? { dur } : {} };
  }
  var RABO = 0.15;
  var VEL = [0.65, 1.6];
  function paradoAos(curva, alvo = 0.95) {
    if (!curva) return 1;
    const f = bezier(...curva);
    for (let k = 1; k <= 100; k++) if (f(k / 100) >= alvo) return k / 100;
    return 1;
  }
  function eventosDaReceita(receita, dur, cat) {
    if (!cat || !receita.sons?.length) return [];
    const r = noTempo(receita, dur);
    const cards2 = r.cards.map((c) => ({ c, ...janela(c, dur) })).sort((a, b) => a.ini - b.ini);
    const quando = { entrada: [], troca: [], saida: [], mergulho: [], zoom: [] };
    const temMergulho = (r.sons ?? []).some((s) => s.momento === "mergulho");
    cards2.forEach(({ c, ini, fim }, k) => {
      quando.entrada.push([ini + (c.entrada?.atraso?.pos ?? 0)]);
      if (k > 0 && ini > cards2[0].ini + 0.02) quando.troca.push([ini]);
      if (c.saida) {
        if (c.saida.para.escala > 1.05 && temMergulho) {
          const atraso = c.saida.atraso?.escala ?? 0;
          const d = c.saida.dur?.escala ?? c.saida.duracao - atraso;
          const visto = d * paradoAos(c.saida.curvas.escala ?? c.saida.curvas.pos);
          quando.mergulho.push([fim - c.saida.duracao + atraso + visto, visto]);
        } else quando.saida.push([fim - c.saida.duracao]);
      }
      if (c.zoom) {
        const visto = c.zoom.duracao * paradoAos(c.zoom.curva);
        quando.zoom.push([ini + c.zoom.inicio + visto, visto]);
      }
    });
    const out = [];
    for (const s of r.sons ?? [])
      for (const [q, abrange] of quando[s.momento] ?? []) {
        const e = eventoNoTempo(s, q, cat, void 0, abrange);
        if (e && e.t < dur && !out.some((o) => o.som === e.som && Math.abs(o.t - e.t) < 0.04)) out.push(e);
      }
    return out.sort((a, b) => a.t - b.t);
  }

  // src/motions.ts
  var fundoDoMotion = (m) => m.tipo === "preset" ? m.fundo : void 0;
  var falaDoPlano = (palavras, ini, fim) => palavras.filter((w) => w.saida_ini >= ini - 0.01 && w.saida_ini < fim).map((w) => ({ texto: w.texto, ini: +(w.saida_ini - ini).toFixed(3), fim: +(w.saida_fim - ini).toFixed(3) }));
  var urlPaginaMotion = (m, duracao, fala, exportacao = false) => m.tipo === "video" ? `/render/motion.html?video=${m.banco}&formato=${m.formato}&duracao=${duracao.toFixed(3)}${exportacao ? "&exportacao=1" : ""}` : `/render/motion.html?preset=${m.preset}&formato=${m.formato}&duracao=${duracao.toFixed(3)}&valores=${encodeURIComponent(JSON.stringify(m.valores ?? {}))}&fala=${encodeURIComponent(JSON.stringify(fala))}${exportacao ? "&exportacao=1" : ""}`;
  function sonsDoPreset(html) {
    const m = html.match(/<script[^>]*id=["']preset["'][^>]*>([\s\S]*?)<\/script>/);
    let info = {};
    try {
      info = m ? JSON.parse(m[1]) : {};
    } catch {
      info = {};
    }
    const out = {};
    for (const [k, v] of Object.entries(info?.sons ?? {})) {
      if (!v || typeof v !== "object" || !/^[a-z0-9_]{1,30}$/.test(k)) continue;
      const som = typeof v.som === "string" && /^[a-z0-9][a-z0-9-]{0,60}$/.test(v.som) ? v.som : null;
      out[k] = { som, intensidade: typeof v.intensidade === "string" && v.intensidade in INTENSIDADES ? v.intensidade : "baixo" };
    }
    return out;
  }
  function escolhasDeSom(sons, m) {
    if (!sons || m?.tipo !== "preset") return {};
    return Object.fromEntries(
      Object.entries(sons).map(([k, v]) => {
        const x = m.sons?.[k];
        return [k, { som: x ? x.som : v.som, intensidade: x?.intensidade ?? v.intensidade }];
      })
    );
  }
  var eventosDoMotion = (marcas, escolhas, cat) => !cat ? [] : marcas.flatMap((mk) => {
    const e = escolhas[mk.momento];
    const ev = e ? eventoNoTempo({ ...e, atraso: 0 }, mk.t, cat, mk.dur) : null;
    return ev ? [ev] : [];
  });
  var marcasDe = (w) => w?.__sons?.().catch(() => []) ?? Promise.resolve([]);
  function marcasDaPagina(src, formato) {
    return new Promise((ok) => {
      const f = document.createElement("iframe");
      f.style.cssText = `position:fixed;left:-99999px;top:0;width:1080px;height:${formato === "vertical" ? 1920 : 960}px;visibility:hidden`;
      const fim = (m) => {
        clearTimeout(limite3);
        f.remove();
        ok(m);
      };
      const limite3 = window.setTimeout(() => fim([]), 15e3);
      f.onload = () => void marcasDe(f.contentWindow).then(fim);
      f.src = src;
      document.body.appendChild(f);
    });
  }

  // src/dados.ts
  var json = (url) => fetch(url).then((r) => r.ok ? r.json() : Promise.reject(new Error(`${url}: ${r.status}`)));
  var lista = (pasta) => json(`/api/lista?pasta=${encodeURIComponent(pasta)}`).catch(() => []);
  function comMantidas(palavras, mantidas) {
    const pos = new Map(palavras.map((p, i) => [p.id, i]));
    const fica = palavras.map(() => false);
    for (const [ini, fim] of mantidas) for (let i = pos.get(ini) ?? 0; i <= (pos.get(fim) ?? -1); i++) fica[i] = true;
    return palavras.map((p, i) => ({ ...p, mantida: fica[i] }));
  }
  function escolhasDe(t) {
    const out = {};
    for (const [k, v] of Object.entries(t ?? {})) {
      if (typeof v === "string") out[k] = { id: v };
      else if (v && typeof v === "object" && typeof v.id === "string") {
        const e = v;
        out[k] = { id: e.id, ...typeof e.par === "string" ? { par: e.par } : {} };
      }
    }
    return out;
  }
  var legendaDe = (lg) => ({
    ligada: lg?.ligada ?? true,
    modo: lg?.modo === "frase" ? "frase" : "palavra",
    ajustes: lg?.ajustes && typeof lg.ajustes === "object" ? lg.ajustes : {}
  });
  var HERDADOS = ["tipo", "formato", "largura", "altura", "descricao", "palavras", "descricao_ia", "origem", "ia", "arquivo", "proxy", "cortes"];
  async function itemBanco(id) {
    try {
      let i = await json(`/biblioteca/banco/${id}/item.json`);
      if (i.pai) {
        const pai = await json(`/biblioteca/banco/${i.pai}/item.json`);
        i = { ...Object.fromEntries(HERDADOS.map((k) => [k, pai[k]])), ...i, duracao: Math.round((i.fim - i.inicio) * 1e3) / 1e3 };
      }
      const base = `/biblioteca/banco/${i.pai || id}`;
      const tipo = i.tipo === "imagem" ? "imagem" : "video";
      const temExportacao = tipo === "video" && (await lista(base.slice(1))).includes("exportacao.mp4");
      const url = temExportacao ? `${base}/exportacao.mp4` : `${base}/${i.arquivo}`;
      return { ...i, tipo, url };
    } catch {
      return null;
    }
  }
  async function carregar(slug) {
    const pasta = `/projetos/${slug}`;
    const edicao = await json(`${pasta}/edicao.json`);
    const idSaida = new URLSearchParams(location.search).get("saida");
    const saida = idSaida ? edicao.saidas?.find((x) => x.id === idSaida) : null;
    if (saida?.V1 && edicao.cortes) {
      edicao.timeline = { ...edicao.timeline ?? {}, V1: saida.V1 };
      edicao.cortes = { ...edicao.cortes, mantidas: [...edicao.cortes.mantidas, ...saida.final?.manter ?? []] };
    }
    const daqui = (x) => !x?.saida || x.saida === idSaida;
    if (edicao.direcao?.itens) edicao.direcao.itens = edicao.direcao.itens.filter(daqui);
    if (edicao.inserts?.pedidos) edicao.inserts.pedidos = edicao.inserts.pedidos.filter(daqui);
    if (edicao.legenda?.ajustes) edicao.legenda.ajustes = Object.fromEntries(Object.entries(edicao.legenda.ajustes).filter(([, v]) => daqui(v)));
    const bruto = edicao.fontes.find((f) => f.papel === "bruto");
    const [transcricao, rosto, presets, transicoes, catalogo] = await Promise.all([
      json(`${pasta}/transcricao.json`).catch(() => ({ palavras: [] })),
      bruto ? json(`${pasta}/midia/rosto/${bruto.id}.json`).catch(() => null) : null,
      lista("biblioteca/presets").then((l) => Promise.all(l.filter((a) => /^[0-9a-f]{10}\.json$/.test(a)).map((a) => json(`/biblioteca/presets/${a}`)))),
      lista("biblioteca/transicoes").then(async (l) => ({
        transicoes: await Promise.all(l.filter((a) => a.endsWith(".json") && a !== "ordem.json" && a !== "pares.json").map((a) => json(`/biblioteca/transicoes/${a}`))),
        pares: await json("/biblioteca/transicoes/pares.json").catch(() => ({})),
        ordem: await json("/biblioteca/transicoes/ordem.json").catch(() => ({}))
      })),
      json("/biblioteca/sons/catalogo.json").then((sons) => ({ sons, intensidades: INTENSIDADES }))
    ]);
    const ids = [.../* @__PURE__ */ new Set([
      ...(edicao.inserts?.pedidos ?? []).flatMap((x) => x.midias.map((m) => m.banco)),
      ...(edicao.direcao?.itens ?? []).flatMap((i) => i.camada === "elemento" && i.banco ? [i.banco] : [])
    ])];
    const banco = /* @__PURE__ */ new Map();
    for (const [id, item] of await Promise.all(ids.map(async (id2) => [id2, await itemBanco(id2)]))) if (item) banco.set(id, item);
    const presetsMotion = [...new Set(Object.values(edicao.motions ?? {}).flatMap((m) => m.tipo === "preset" ? [m.preset] : []))];
    const sonsMotion = Object.fromEntries(
      await Promise.all(presetsMotion.map(async (id) => [id, sonsDoPreset(await fetch(`/biblioteca/motions/presets/${id}.html`).then((r) => r.ok ? r.text() : ""))]))
    );
    const palavras = edicao.cortes ? comMantidas(transcricao.palavras, edicao.cortes.mantidas) : [];
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
      sonsMotion
    };
  }

  // src/sequencia.ts
  function montarSequencia(timeline, palavras, vel = 1) {
    let acc = 0;
    const clipes = [...timeline.V1].sort((a, b) => (a.ordem ?? a.inicio) - (b.ordem ?? b.inicio)).map((c) => {
      const saida_ini = acc;
      acc += (c.fim - c.inicio) / vel;
      return { ...c, saida_ini, saida_fim: acc };
    });
    const porId = new Map(palavras.map((p) => [p.id, p]));
    const fonteParaSaida = (t) => {
      const c = clipes.find((c2) => t >= c2.inicio && t < c2.fim);
      return c ? c.saida_ini + (t - c.inicio) / vel : null;
    };
    const saidaParaFonte = (s) => {
      const c = clipes.find((c2) => s < c2.saida_fim) ?? clipes[clipes.length - 1];
      return c ? c.inicio + Math.min(Math.max((s - c.saida_ini) * vel, 0), c.fim - c.inicio) : 0;
    };
    const palavraNaSaida = (p) => {
      const c = clipes.find((c2) => p.inicio < c2.fim && p.fim > c2.inicio);
      if (!c) return null;
      return { ini: c.saida_ini + (Math.max(p.inicio, c.inicio) - c.inicio) / vel, fim: c.saida_ini + (Math.min(p.fim, c.fim) - c.inicio) / vel };
    };
    const intervalo = (a) => {
      const ini = porId.get(a.palavra_ini);
      const fim = porId.get(a.palavra_fim);
      const s0 = ini && palavraNaSaida(ini);
      const s1 = fim && palavraNaSaida(fim);
      return s0 && s1 ? { ini: s0.ini, fim: s1.fim } : null;
    };
    return { vel, clipes, duracao: acc, fonteParaSaida, saidaParaFonte, intervalo, palavraNaSaida };
  }

  // src/direcaoProjeto.ts
  function palavrasNaSaida(palavras, seq) {
    const out = [];
    for (const w of palavras) {
      if (w.mantida === false) continue;
      const s = seq.palavraNaSaida(w);
      const c = s && seq.clipes.find((c2) => s.ini >= c2.saida_ini - 1e-3 && s.ini < c2.saida_fim);
      if (s && c) out.push({ ...w, saida_ini: s.ini, saida_fim: s.fim, clipe_ini: c.saida_ini, clipe_fim: c.saida_fim });
    }
    return out.sort((a, b) => a.saida_ini - b.saida_ini);
  }
  function paraTempo(itens, palavras, saida, duracao) {
    const ordem = new Map(palavras.map((w, k) => [w.id, k]));
    const naSaida = new Map(saida.map((w) => [w.id, w]));
    const resolver = (ini, fim, lado) => {
      const a = ordem.get(ini) ?? 0;
      const b = ordem.get(fim) ?? a;
      const dentro = saida.filter((w2) => (ordem.get(w2.id) ?? -1) >= a && (ordem.get(w2.id) ?? -1) <= b);
      const alvo = naSaida.get(lado === "ini" ? ini : fim);
      if (alvo) return { w: alvo, exato: true };
      const w = lado === "ini" ? dentro[0] : dentro[dentro.length - 1];
      return w ? { w, exato: false } : null;
    };
    const visiveis = [];
    const orfaos = [];
    for (const i of itens) {
      const a = resolver(i.palavra_ini, i.palavra_fim, "ini");
      const b = resolver(i.palavra_ini, i.palavra_fim, "fim");
      if (!a || !b) {
        orfaos.push(i);
        continue;
      }
      const inicio = Math.max(a.w.clipe_ini, a.w.saida_ini + (a.exato ? i.off_ini : 0));
      const fim = Math.min(b.w.clipe_fim, b.w.saida_fim + (b.exato ? i.off_fim : 0));
      visiveis.push({ id: i.id, camada: i.camada, tipo: i.tipo, conteudo: i.conteudo, inicio, fim, descricao: i.descricao, texto: i.texto });
    }
    const planos = visiveis.filter((i) => i.camada === "plano").sort((x, y) => x.inicio - y.inicio);
    planos.forEach((p, k) => {
      p.inicio = k === 0 ? 0 : Math.max(p.inicio, planos[k - 1].inicio + 0.05);
    });
    planos.forEach((p, k) => p.fim = k + 1 < planos.length ? planos[k + 1].inicio : duracao);
    for (const e of visiveis) {
      if (e.camada === "elemento") {
        e.inicio = Math.max(0, e.inicio);
        e.fim = Math.min(duracao, Math.max(e.fim, e.inicio + 0.05));
      }
    }
    return { visiveis, orfaos };
  }

  // src/ator.ts
  var PADRAO_MODO = {
    janela: { x: 0.5, y: 1 - 0.55 / 2, escala: 0.55 },
    recortado: { x: 0.5, y: 1 - 0.62 / 2, escala: 0.62 },
    canto: { x: 1 - 0.34 / 2 - 0.04, y: 1 - 0.34 / 2 - 0.035, escala: 0.34 },
    caixa: { x: 0.5, y: 0.82, escala: 0.41 }
    // o centro e a largura da caixa
  };
  var CAIXA = { rosto: 0.5, olhos: 0.45, raio: 0.09 };
  var TOPO_JANELA = (0.72 - 0.45) / 0.55;
  var RAIO = 0.07;
  var REGRA = { olhos: 0.4, folga: 0.06, rosto: 0.3, zoomMax: 1.6 };
  var ZOOM = { min: 1 / REGRA.zoomMax, max: REGRA.zoomMax };
  var limite2 = (v, a, b) => Math.min(Math.max(v, a), b);
  function enquadrar(f, r) {
    if (!r || r.h <= 0) return { s: 1, tx: 0, ty: f / 2 };
    const area = 1 - f;
    const s = limite2(REGRA.rosto * area / r.h, 1, REGRA.zoomMax);
    const olhos2 = r.cy - 0.15 * r.h;
    const tx = limite2(0.5 - s * r.cx, 1 - s, 0);
    let ty = f + REGRA.olhos * area - s * olhos2;
    ty = Math.max(ty, f + REGRA.folga * area - s * (r.cy - 0.6 * r.h));
    return { s, tx, ty: limite2(ty, 1 - s, f) };
  }
  function metadeSemDeslocamento(d, aj, rosto) {
    const auto = enquadrar(d.f, rosto);
    const s = limite2(auto.s * (aj?.zoom ?? 1), 1, REGRA.zoomMax);
    const cx = 0.5;
    const cy = d.f + (1 - d.f) / 2;
    return { auto, s, tx: cx - (cx - auto.tx) * s / auto.s, ty: cy - (cy - auto.ty) * s / auto.s };
  }
  function geometriaDoAtor(d, aj, rosto) {
    if (!d) return null;
    if (d.modo === "metade") {
      const m = metadeSemDeslocamento(d, aj, rosto);
      return { modo: "metade", s: m.s, tx: limite2(m.tx + (aj?.dx ?? 0), 1 - m.s, 0), ty: limite2(m.ty + (aj?.dy ?? 0), 1 - m.s, d.f) };
    }
    const modo = aj?.modo ?? "janela";
    const p = PADRAO_MODO[modo];
    if (modo === "caixa") return caixaDoAtor(aj, rosto);
    const s = aj?.escala ?? p.escala;
    const xAuto = modo !== "canto" && rosto ? limite2(0.5 - s * (rosto.cx - 0.5), s / 2, 1 - s / 2) : p.x;
    const x = aj?.x ?? xAuto;
    const y = aj?.y ?? (modo === "canto" ? p.y : 1 - s / 2);
    return { modo, s, tx: x - s / 2, ty: y - s / 2, topo: modo === "janela" ? TOPO_JANELA : void 0, raio: modo === "recortado" ? void 0 : RAIO };
  }
  function caixaDoAtor(aj, rosto) {
    const p = PADRAO_MODO.caixa;
    const w = aj?.escala ?? p.escala;
    const h = w * (9 / 16) * 1.03;
    const x = (aj?.x ?? p.x) - w / 2;
    const y = (aj?.y ?? p.y) - h / 2;
    let s = rosto && rosto.h > 0 ? CAIXA.rosto * h / rosto.h : 0.62;
    s = Math.max(s, w, h);
    const olhos2 = rosto ? rosto.cy - 0.15 * rosto.h : 0.3;
    const tx = limite2(x + w / 2 - s * (rosto?.cx ?? 0.5), x + w - s, x);
    const ty = limite2(y + CAIXA.olhos * h - s * olhos2, y + h - s, y);
    return { modo: "caixa", s, tx, ty, caixa: { x, y, w, h }, raio: CAIXA.raio };
  }
  var topoDoAtor = (g) => g.caixa ? g.caixa.y : g.ty + (g.modo === "canto" ? 0 : 0.1 * g.s);
  var mediana = (xs) => {
    const o = [...xs].sort((a, b) => a - b);
    return o.length ? o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2 : 0;
  };
  var JANELA_ROSTO = 2;
  function rostoDoArquivo(arq, seq, ex = 0.5) {
    if (!arq?.amostras?.length || !seq) return null;
    const a = arq.amostras;
    const L = arq.largura ?? 0;
    const A = arq.altura ?? 0;
    const rw = L > A && A > 0 ? A * 9 / 16 / L : 1;
    const noRecorte = (r) => rw >= 1 ? r : { ...r, cx: (r.cx - (1 - rw) * ex) / rw, w: r.w / rw };
    return (ini, fim) => {
      if (fim - ini < JANELA_ROSTO) {
        const meio = (ini + fim) / 2;
        ini = Math.max(0, meio - JANELA_ROSTO / 2);
        fim = ini + JANELA_ROSTO;
      }
      const pts = [];
      for (let t = ini; t < fim; t += 0.2) {
        const tb = seq.saidaParaFonte(t);
        const i = limite2(Math.round(tb * arq.por_segundo), 0, a.length - 1);
        const m = a[i] && Math.abs(a[i].t - tb) < 1 ? a[i] : a.reduce((x, y) => Math.abs(y.t - tb) < Math.abs(x.t - tb) ? y : x);
        pts.push(m);
      }
      const boas = pts.filter((x) => x.conf > 0);
      const us = boas.length ? boas : pts;
      if (!us.length) return null;
      return noRecorte({ cx: mediana(us.map((x) => x.cx)), cy: mediana(us.map((x) => x.cy)), w: mediana(us.map((x) => x.w)), h: mediana(us.map((x) => x.h)) });
    };
  }

  // src/movimento.ts
  var ZOOM_LENTO = { porSegundo: 0.03, maximo: 0.15 };
  var ZOOM_SECO = 0.18;
  var ehFullAtor = (tipo) => tipo.startsWith("full_ator");
  function escalaDoMovimento(m, rel, dur) {
    if (m === "zoom_seco") return 1 + ZOOM_SECO;
    const a = Math.min(ZOOM_LENTO.porSegundo * dur, ZOOM_LENTO.maximo);
    const u = Math.min(Math.max(rel / Math.max(dur, 0.01), 0), 1);
    return 1 + a * (0.5 * u + 0.5 * u * u * (3 - 2 * u));
  }
  var centroDoMovimento = (r) => r ? { x: r.cx, y: r.cy } : { x: 0.5, y: 0.4 };
  function centroQueCentraliza(r, escala) {
    const c = centroDoMovimento(r);
    if (!r || escala <= 1) return c;
    return { x: Math.min(Math.max((0.5 - escala * r.cx) / (1 - escala), 0), 1), y: c.y };
  }
  var escalaFinal = (m, dur) => escalaDoMovimento(m, dur, dur);

  // src/ajustes.ts
  var escalaTempo = (m, k) => m ? {
    ...m,
    duracao: m.duracao * k,
    atraso: Object.fromEntries(Object.entries(m.atraso ?? {}).map(([p, v]) => [p, v * k])),
    dur: Object.fromEntries(Object.entries(m.dur ?? {}).map(([p, v]) => [p, v * k]))
  } : m;
  var cards = (r, f) => ({ ...r, cards: r.cards.map(f) });
  var estado = (m) => "de" in m ? m.de : m.para;
  var comEstado = (m, e) => "de" in m ? { ...m, de: { ...m.de, ...e } } : { ...m, para: { ...m.para, ...e } };
  var cheio = (c) => c.repouso.w >= 99 && c.repouso.h >= 99;
  var deslizaTransbordando = (c) => c.repouso.w > 100 && Math.abs(c.saida?.para.dx ?? 0) >= 5 && (c.saida?.para.escala ?? 1) <= 1.05;
  var AJUSTES = [
    {
      id: "entrada",
      nome: "Entrada",
      opcoes: ["Lenta", "Normal", "R\xE1pida"],
      fase: "antes",
      aplicar: (r, i) => cards(r, (c) => ({ ...c, entrada: escalaTempo(c.entrada, i === 0 ? 1.4 : 0.7) }))
    },
    {
      id: "saida",
      nome: "Sa\xEDda",
      opcoes: ["Lenta", "Normal", "R\xE1pida"],
      fase: "antes",
      aplicar: (r, i) => cards(r, (c) => ({ ...c, saida: escalaTempo(c.saida, i === 0 ? 1.4 : 0.7) }))
    },
    {
      // num card que transborda e desliza (o "Cresce e desliza"): até onde ele anda — pouco, como na referência, ou até a
      // outra borda do card chegar à borda da tela
      id: "deslize",
      nome: "At\xE9 onde desliza",
      opcoes: ["Pouco", "Como na refer\xEAncia", "At\xE9 a borda"],
      fase: "antes",
      aplicar: (r, i) => cards(r, (c) => deslizaTransbordando(c) ? { ...c, deslize: i === 0 ? 12 : 1e3 } : c)
    },
    {
      id: "zoom",
      nome: "Zoom",
      opcoes: ["Menos", "Normal", "Mais"],
      fase: "antes",
      aplicar: (r, i) => {
        const k = i === 0 ? 0.6 : 1.5;
        return cards(r, (c) => ({
          ...c,
          zoom: c.zoom ? { ...c.zoom, escala: 1 + (c.zoom.escala - 1) * k } : c.zoom,
          saida: c.saida && estado(c.saida).escala > 1.05 ? comEstado(c.saida, { escala: 1 + (estado(c.saida).escala - 1) * k }) : c.saida
        }));
      }
    },
    {
      id: "zona",
      nome: "Mergulha em",
      opcoes: ["Topo \xE0 esquerda", "Topo", "Topo \xE0 direita", "Esquerda", "Centro", "Direita", "Base \xE0 esquerda", "Base", "Base \xE0 direita"],
      fase: "depois",
      // depois de o card ganhar o tamanho da mídia: o ponto é sobre o card final,
      grade: true,
      // a zona para onde o zoom de saída (o mergulho) vai: o ponto da imagem que fica parado enquanto o card cresce
      padrao: (r) => {
        const c = r.cards.find((x) => x.saida && estado(x.saida).escala > 1.05);
        if (!c?.saida) return 4;
        const e = estado(c.saida);
        const px = 0.5 - e.dx / ((e.escala - 1) * c.repouso.w);
        const py = 0.5 - e.dy / ((e.escala - 1) * c.repouso.h);
        const q = (v) => v < 0.36 ? 0 : v > 0.64 ? 2 : 1;
        return q(py) * 3 + q(px);
      },
      aplicar: (r, i) => {
        const px = [0.2, 0.5, 0.8][i % 3];
        const py = [0.2, 0.5, 0.8][Math.floor(i / 3)];
        return cards(r, (c) => {
          if (!c.saida || estado(c.saida).escala <= 1.05) return c;
          const s = estado(c.saida).escala;
          return { ...c, saida: comEstado(c.saida, { dx: -(s - 1) * (px - 0.5) * c.repouso.w, dy: -(s - 1) * (py - 0.5) * c.repouso.h }) };
        });
      }
    },
    {
      id: "forma",
      nome: "Forma",
      opcoes: ["Card", "Tela toda"],
      fase: "antes",
      padrao: (r) => r.cards.every(cheio) ? 1 : 0,
      // tela toda: a mídia ocupa a área (na tela cheia, só as em pé; ver receitaParaInsert); card: centrado, com cantos e sombra
      aplicar: (r, i) => cards(r, (c) => comRepouso(c, i === 1 ? { cx: 50, cy: 50, w: 100, h: 100, raio: 0, sombra: false } : { cx: 50, cy: 50, w: 88, h: 70, raio: 2.2, sombra: true }))
    },
    {
      id: "camera",
      nome: "Zoom lento",
      opcoes: ["Parado", "Leve", "Mais"],
      fase: "antes",
      padrao: (r) => r.cards.some((c) => c.continuo && (c.continuo.escala || c.continuo.dx || c.continuo.dy)) ? 1 : 0,
      // um zoom in linear e contínuo, a partir do centro de cada card (a câmera da composição inteira)
      aplicar: (r, i) => cards(r, (c) => {
        if (i === 0) return { ...c, continuo: null };
        const z = 0.015 * (i === 2 ? 2 : 1);
        return { ...c, continuo: { escala: z, dx: z * (c.repouso.cx - 50), dy: z * (c.repouso.cy - 50), rot: 0 } };
      })
    },
    {
      id: "desfoque",
      nome: "Desfoque na entrada",
      opcoes: ["Sem", "Normal", "Mais"],
      fase: "antes",
      aplicar: (r, i) => cards(r, (c) => ({ ...c, entrada: c.entrada ? comEstado(c.entrada, { desfoque: i === 0 ? 0 : Math.max(estado(c.entrada).desfoque * 1.8, 12) }) : c.entrada }))
    },
    {
      id: "tamanho",
      nome: "Tamanho do card",
      opcoes: ["Menor", "Normal", "Maior"],
      fase: "depois",
      aplicar: (r, i) => {
        const k = i === 0 ? 0.86 : 1.12;
        return cards(r, (c) => c.repouso.w >= 99 && c.repouso.h >= 99 ? c : comRepouso(c, { w: c.repouso.w * k, h: c.repouso.h * k }));
      }
    },
    {
      id: "som",
      nome: "Som",
      opcoes: ["Sem", "Baixo", "M\xE9dio"],
      fase: "antes",
      // os sons do preset (SPEC §8.6): neste insert, sem som, ou todos mais baixos ou mais altos
      padrao: (r) => {
        const ss = (r.sons ?? []).filter((s) => s.som);
        return !ss.length ? 0 : ss.every((s) => s.intensidade === "medio") ? 2 : 1;
      },
      aplicar: (r, i) => ({ ...r, sons: (r.sons ?? []).map((s) => i === 0 ? { ...s, som: null } : { ...s, intensidade: i === 1 ? "baixo" : "medio" }) })
    },
    {
      id: "proximo",
      nome: "Quando o pr\xF3ximo entra",
      opcoes: ["Antes", "Normal", "Depois"],
      fase: "depois",
      // numa sequência, o anterior sai quando o próximo entra (termina na fração em que ele começa): a saída vai junto, para
      // não ficar um vão vazio (Depois) nem o próximo por cima do anterior parado (Antes)
      aplicar: (r, i) => {
        const k = i === 0 ? 0.75 : 1.25;
        const novo = (j) => j === 0 ? r.cards[0].inicio_frac : Math.min(r.cards[j].inicio_frac * k, 0.9);
        return cards(r, (c, j) => {
          const prox = r.cards[j + 1];
          const passa = prox && c.fim_frac != null && Math.abs(c.fim_frac - prox.inicio_frac) < 0.02;
          return { ...c, inicio_frac: novo(j), ...passa ? { fim_frac: novo(j + 1) } : {} };
        });
      }
    }
  ];
  function ajustesEfetivos(p, ajustes, aspectos) {
    if (!p?.tela_toda_em_pe || ajustes?.forma || !aspectos.length || !aspectos.every((a) => a < 0.8)) return ajustes;
    return { ...ajustes ?? {}, forma: "Tela toda" };
  }
  var padraoDe = (a, r) => a.padrao ? a.padrao(r) : 1;
  function livres(r, ajustes) {
    const y = Number(ajustes.y ?? 0);
    const k = Number(ajustes.largura ?? 1);
    if (!y && k === 1) return r;
    return cards(r, (c) => cheio(c) ? c : comRepouso(c, { cy: c.repouso.cy + y, w: c.repouso.w * k, h: c.repouso.h * k }));
  }
  function comAjustes(r, ajustes, fase) {
    if (!ajustes) return r;
    if (fase === "depois") r = livres(r, ajustes);
    return AJUSTES.filter((a) => a.fase === fase && ajustes[a.id] != null).reduce((rr, a) => {
      const i = a.opcoes.indexOf(ajustes[a.id]);
      return i >= 0 && i !== padraoDe(a, rr) ? a.aplicar(rr, i) : rr;
    }, r);
  }

  // src/divisao.ts
  var JANELA = { escala: 0.55, y0: 72, raio: 7 };
  var TOPO_CABECA = 100 - JANELA.escala * 100 + JANELA.escala * 10;
  var MARGEM = 0.06;
  var W_H = 9 / 16;
  var telaTodaPermitida = (formato, atras, aspectos) => formato === "dividida" && !atras ? aspectos.some((a) => a >= 0.8) : aspectos.some((a) => a < 0.8);
  var tipoDoPreset = (p) => p?.divisao_tipo ?? (p && p.receita.cards.every((c) => c.repouso.w >= 99 && c.repouso.h >= 99) ? "area" : "card");
  function divisaoDe(x, banco, presets) {
    if (x.formato !== "dividida") return null;
    const preset = x.enriquecimento?.preset ? presets?.find((p) => p.id === x.enriquecimento?.preset) : null;
    const forma = ajustesEfetivos(preset, x.enriquecimento?.ajustes, aspectosDe(x.midias, banco))?.forma;
    const atras = x.enriquecimento?.divisao === "atras";
    const aspectos = aspectosDe(x.midias, banco);
    let base = forma === "Tela toda" ? "area" : forma === "Card" ? "card" : preset ? tipoDoPreset(preset) : "card";
    if (base === "area" && !telaTodaPermitida("dividida", atras, aspectos)) base = "card";
    if (base === "area" && !atras && aspectos.length > 1 && Math.max(...aspectos) / Math.min(...aspectos) > 1.12) base = "card";
    const tipo = atras ? "atras" : base;
    if (tipo === "atras" && base === "area") return { modo: "atras", tipo, f: 1 };
    const i = x.midias[0] && banco?.get(x.midias[0].banco);
    const a = i?.largura && i?.altura ? i.largura / i.altura : 16 / 9;
    const varios = !!preset && (preset.receita.repete || preset.receita.cards.length > 1);
    if (varios && tipo !== "area") return { modo: tipo === "atras" ? "atras" : "metade", tipo, f: tipo === "atras" ? JANELA.y0 / 100 : 0.56 };
    if (tipo === "area") return { modo: "metade", tipo, f: a < 1 ? 0.5 : Math.min(Math.max(W_H / a, 0.28), 0.5625) };
    const livre = tipo === "atras" ? JANELA.y0 / 100 : 0.62;
    let cw = 0.9;
    let ch = cw * W_H / a;
    if (ch > livre - 2 * MARGEM) {
      ch = livre - 2 * MARGEM;
      cw = ch * a / W_H;
    }
    const f = tipo === "atras" ? livre : Math.min(Math.max(ch + 2 * MARGEM, 0.4), livre);
    return { modo: tipo === "atras" ? "atras" : "metade", tipo, f, card: { w: cw * 100, h: ch / f * 100 } };
  }
  function receitaParaInsert(r, d, aspectos, formato) {
    const areaAsp = formato === "dividida" ? W_H / (d?.f ?? 0.5) : W_H;
    const cards2 = r.cards.map((c, k) => {
      if (c.quadros?.length) return c;
      const cheio2 = c.repouso.w >= 99 && c.repouso.h >= 99;
      const a0 = aspectos[c.midia ?? k] ?? aspectos[0];
      const cabe = a0 ? formato === "dividida" && d?.modo !== "atras" ? a0 >= 0.8 : a0 < 0.8 : true;
      if (cheio2 && !cabe && a0) {
        let w2 = 90;
        let h2 = w2 * areaAsp / a0;
        if (h2 > 90) {
          h2 = 90;
          w2 = h2 * a0 / areaAsp;
        }
        return { ...comRepouso(c, { cx: 50, cy: 50, w: w2, h: h2, raio: c.repouso.raio || 2.2, sombra: true }), ajuste: "cover" };
      }
      if (cheio2) {
        const z = c.continuo;
        const continuo2 = !z ? z : z.escala < 0 ? { ...z, escala: -z.escala, dx: 0, dy: -z.escala * 100 / 2 } : { ...z, dy: z.dy || z.escala * 100 / 2 };
        const cc = comRepouso(c, { cx: 50, cy: 50, w: 100, h: 100 });
        return { ...cc, ajuste: "topo", continuo: continuo2, saida: saidaCobrindo(cc.saida) };
      }
      if (d?.card && r.cards.length === 1) return { ...comRepouso(c, { cx: 50, cy: 50, w: d.card.w, h: d.card.h }), ajuste: "cover" };
      const a = aspectos[c.midia ?? k] ?? aspectos[0];
      if (!a) return c;
      const emPe = a < 0.9 && c.repouso.w > c.repouso.h;
      const atras = d?.modo === "atras";
      const desliza = deslizeTransbordando(c, a, areaAsp, atras);
      if (desliza) return desliza;
      const bw = atras ? 96 : Math.min(c.repouso.w, 96);
      const bh = emPe ? Math.max(Math.min(c.repouso.h, 96), 84) : Math.min(c.repouso.h, 96);
      let w = bw;
      let h = w * areaAsp / a;
      if (h > bh) {
        h = bh;
        w = h * a / areaAsp;
      }
      const empilhado = r.cards.length > 1 && !r.repete && Math.abs(c.repouso.cy - 50) > 10;
      const junto = empilhado ? Math.sign(50 - c.repouso.cy) * Math.max(0, c.repouso.h - h) / 2 : 0;
      const cy = emPe ? 50 : atras ? Math.max(h / 2 + 3, 44) : c.repouso.cy + junto;
      const folga = emPe ? Math.max(0, 98 - h) / Math.max(1, 98 - Math.min(c.repouso.h, 96)) : 1;
      const continuo = c.continuo && folga < 1 ? { ...c.continuo, dy: c.continuo.dy * folga } : c.continuo;
      const visivel = [Math.max(c.repouso.cx - c.repouso.w / 2, 0), Math.min(c.repouso.cx + c.repouso.w / 2, 100)];
      const meio = Math.min(Math.max((visivel[0] + visivel[1]) / 2, w / 2 + 2), 98 - w / 2);
      const cx = atras || emPe ? 50 : c.repouso.w > 96 ? meio : c.repouso.cx;
      return { ...comRepouso(c, { w, h, cy, cx }), continuo, ajuste: "cover" };
    });
    return { ...r, cards: cards2 };
  }
  var DESLIZE = 23;
  function deslizeTransbordando(c, a, areaAsp, atras) {
    const dx = c.saida?.para.dx ?? 0;
    if (atras || c.repouso.w <= 100 || Math.abs(dx) < 5 || (c.saida?.para.escala ?? 1) > 1.05) return null;
    let w = c.repouso.w;
    let h = w * areaAsp / a;
    const hMax = Math.min(c.repouso.h, 96);
    if (h > hMax) {
      h = hMax;
      w = h * a / areaAsp;
    }
    if (w <= 100) return null;
    const esq = dx < 0;
    const borda = esq ? c.repouso.cx - c.repouso.w / 2 : c.repouso.cx + c.repouso.w / 2;
    const cx = esq ? borda + w / 2 : borda - w / 2;
    const sobra = esq ? cx + w / 2 - 100 : -(cx - w / 2);
    const deslize = (esq ? -1 : 1) * Math.max(Math.min(c.deslize ?? DESLIZE, sobra), 0);
    const e = c.entrada;
    const entrada = e && e.de.escala < 0.98 ? { ...e, de: { ...e.de, dx: (esq ? -1 : 1) * (w / 2) * (1 - e.de.escala) } } : e;
    return { ...c, repouso: { ...c.repouso, w, h, cx }, entrada, saida: c.saida && { ...c.saida, para: { ...c.saida.para, dx: deslize } }, ajuste: "cover" };
  }
  function saidaCobrindo(s) {
    if (!s || s.para.opacidade < 0.99) return s;
    const { dx, dy, escala } = s.para;
    if (escala > 1.05) {
      const m = 50 * (escala - 1);
      return { ...s, para: { ...s.para, dx: Math.min(Math.max(dx, -m), m), dy: Math.min(Math.max(dy, -m), m) } };
    }
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (escala < 0.999 || d < 0.5 || d > 25) return s;
    const comoPos = (o) => {
      const resto = Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => k !== "escala"));
      return o?.pos != null ? { ...resto, escala: o.pos } : resto;
    };
    return { ...s, para: { ...s.para, escala: Math.max(escala, 1 + 2 * d / 100) }, curvas: comoPos(s.curvas), atraso: comoPos(s.atraso), dur: comoPos(s.dur) };
  }
  var aspectosDe = (midias, banco) => midias.map((m) => {
    const i = banco?.get(m.banco);
    return i?.largura && i?.altura ? i.largura / i.altura : 16 / 9;
  });
  var areaDoInsert = (d) => !d ? { inset: 0 } : { left: 0, right: 0, top: 0, height: `${d.f * 100}%` };
  function posicaoDoComentario(d, g, h = 0) {
    if (!d) return { x: 50, y: 50 };
    const cabeca = g && g.modo !== "metade" ? topoDoAtor(g) * 100 : TOPO_CABECA;
    if (d.modo === "atras") return { x: 50, y: Math.min(cabeca - Math.max(6, h * 100 / 2 + 1.5), d.card ? (d.f / 2 + d.card.h / 100 * (d.f / 2)) * 100 : 100) };
    return { x: 50, y: d.f * 100 };
  }
  var lugarDoComentario = (x, d, g) => posicaoDoComentario(d, g, alturaDoComentario(x.comentario?.texto ?? x.texto ?? "", x.comentario?.escala ?? 1));
  function noQuadro(c, texto) {
    const w = Math.min(75 * c.escala, 96) / 2 + 3;
    const h = alturaDoComentario(texto, c.escala) * 100 / 2 + 3;
    const lim = (v, m) => m >= 50 ? 50 : +Math.min(Math.max(v, m), 100 - m).toFixed(1);
    return { x: lim(c.x, w), y: lim(c.y, h) };
  }
  function alturaDoComentario(texto, escala) {
    const largura = Math.min(75 * escala, 96) - escala * (2 * 3.2 + 8.2 + 2.6);
    const porLinha = Math.max(largura / (3.6 * escala * 0.52), 1);
    const linhas = Math.max(1, Math.ceil(texto.length / porLinha));
    const cqw = escala * (2 * 2.6 + 2 * 2.9 * 1.3 + 0.4 + 1.2) + linhas * 3.6 * escala * 1.3;
    return cqw / 100 * (9 / 16);
  }

  // src/inserts.ts
  function chaveParada(x, rel, presets) {
    const pr = presetDe(x, presets);
    const dur = Math.max(x.t.fim - x.t.inicio, 0.01);
    if (pr) return mexendo(pr.receita, rel, dur) ? null : `${x.id}:p${pr.receita.cards.map((c) => rel >= c.inicio_frac * (x.t.fim - x.t.inicio) ? 1 : 0).join("")}`;
    const { k, ini, durM } = corteSimples(x.midias.length, rel, dur);
    return rel - ini >= Math.min(SURGIR.duracao, durM) ? `${x.id}:${k + 1}` : null;
  }
  function receitaDoInsert(x, banco, presets) {
    const preset = presetDe(x, presets);
    if (!preset) return null;
    const aspectos = aspectosDe(x.midias, banco);
    const aj = ajustesEfetivos(preset, x.enriquecimento?.ajustes, aspectos);
    return comAjustes(receitaParaInsert(comAjustes(preset.receita, aj, "antes"), divisaoDe(x, banco, presets), aspectos, x.formato), aj, "depois");
  }
  function presetDe(x, presets) {
    const id = x.enriquecimento?.preset;
    const p = id ? presets?.find((y) => y.id === id) : null;
    return p && serve(p, x.formato, x.midias.length) ? noFormato(p, x.formato, x.midias.length) : null;
  }
  var pedidosNoTempo = (pedidos, planos) => {
    const tempos = new Map(planos.map((i) => [i.id, { inicio: i.inicio, fim: i.fim }]));
    return pedidos.map((x) => ({ ...x, t: tempos.get(x.plano) ?? { inicio: x.inicio, fim: x.inicio + x.duracao } })).sort((a, b) => a.t.inicio - b.t.inicio);
  };
  var ESTILO_SIMPLES = { vertical: { layout: "card" }, dividida: { layout: "metade" } };
  var SURGIR = { curva: [0.16, 1, 0.3, 1], duracao: 0.75, escala: 94 };
  function corteSimples(n, rel, dur) {
    const parte = dur / Math.max(n, 1);
    const k = Math.max(Math.min(Math.floor(rel / parte), n - 1), 0);
    return n === 2 ? { k, ini: k * parte, durM: parte } : { k, ini: 0, durM: dur };
  }
  function estiloSimples(rel, durM) {
    const d = Math.min(SURGIR.duracao, durM);
    const p = bezier(...SURGIR.curva)(limite01(rel / Math.max(d, 0.01)));
    const s0 = SURGIR.escala / 100;
    return { transform: `scale(${s0 + (1 - s0) * p})`, opacity: limite01(p) };
  }

  // src/comentario.ts
  var COMENTARIO_PADRAO = { texto: null, avatar: 0, usuario: "usuario.do.ig", tempo: "4 sem", traducao: true, x: 50, y: 50, escala: 1 };
  var comentarioDe = (x, auto) => ({
    ...COMENTARIO_PADRAO,
    ...auto ?? {},
    ...x.comentario ?? {}
  });
  var FONTE_IG = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Helvetica Neue", system-ui, sans-serif';
  function cardComentario(c, texto) {
    const pos = noQuadro(c, texto);
    const u = (v) => `${v * c.escala}cqw`;
    return {
      chave: "comentario",
      classe: "pointer-events-none absolute inset-0 z-10",
      estilo: { containerType: "size" },
      filhos: [
        {
          chave: "card",
          classe: "absolute flex centrado items-start bg-white text-black sombra-comentario select-none",
          estilo: { left: `${pos.x}%`, top: `${pos.y}%`, fontFamily: FONTE_IG, gap: u(2.6), padding: `${u(2.6)} ${u(3.2)}`, borderRadius: u(3), width: `${Math.min(75 * c.escala, 96)}%` },
          filhos: [
            // 5 fotos de perfil de pessoas que não existem (rostos gerados por IA), em render/avatares/
            {
              chave: "avatar",
              tag: "img",
              classe: "rounded-full object-cover shrink-0",
              atributos: { src: `/render/avatares/${c.avatar % 5 + 1}.jpg`, alt: "", draggable: "false" },
              estilo: { filter: "blur(2.5px)", width: u(8.2), height: u(8.2) }
            },
            {
              chave: "corpo",
              classe: "min-w-0 flex-1",
              estilo: { lineHeight: 1.3 },
              filhos: [
                {
                  chave: "usuario",
                  classe: "flex items-baseline",
                  estilo: { gap: u(1.6), fontSize: u(2.9), filter: `blur(${u(0.55)})` },
                  filhos: [
                    { chave: "nome", tag: "span", classe: "font-semibold cor-262626", texto: c.usuario },
                    { chave: "tempo", tag: "span", classe: "cor-737373", texto: c.tempo }
                  ]
                },
                { chave: "texto", tag: "p", classe: "cor-000 quebra-qualquer", estilo: { fontSize: u(3.6), marginTop: u(0.4) }, texto },
                {
                  chave: "acoes",
                  classe: "flex font-semibold cor-737373",
                  estilo: { gap: u(4), fontSize: u(2.9), marginTop: u(1.2) },
                  filhos: [{ chave: "responder", tag: "span", texto: "Responder" }, c.traducao && { chave: "traducao", tag: "span", texto: "Ver tradu\xE7\xE3o" }]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  // src/legenda.ts
  var ajusteNoModo = (aj, modo) => aj?.modo && aj.modo !== modo ? void 0 : aj;
  var ESTILO = {
    fonte: "'SF Pro Display', system-ui, sans-serif",
    peso: 700,
    tamanho: 56 / 1920,
    espaco: "-0.01em",
    sombra: { y: 3 / 1920, blur: 12 / 1920, cor: "rgba(0,0,0,0.67)" },
    margem: 0.06
  };
  var ALTURA_POR_PLANO = {
    full_ator: 0.554,
    full_ator_zoom: 0.554,
    full_ator_lettering: 0.524,
    tela_dividida_insert: 0.453,
    tela_dividida_motion: 0.476,
    insert_tela_cheia: 0.428,
    motion_tela_cheia: 0.504,
    comentario_insert_ator: 0.409
  };
  var ALTURA_PADRAO = 0.554;
  var ANTECIPA = 0.17;
  var SEGURA = 0.3;
  var MINIMO = 0.12;
  var SOBRA = 0.07;
  var FRASE = { palavras: 3, letras: 18, pausa: 0.3 };
  var ALTURA_DEITADA = 0.76;
  var MEIA = ESTILO.tamanho * 1.15 / 2;
  var FOLGA = 0.015;
  var limpar = (t) => t.replace(/[,;:]+$/, "");
  function zonasDaLegenda(pedidos, banco, presets) {
    return pedidos.map((x) => {
      const divisao = x.midias.length > 0 ? divisaoDe(x, banco, presets) : null;
      const ator = geometriaDoAtor(divisao, x.enriquecimento?.ator, null);
      let card = null;
      if (x.tipo === "comentario_insert_ator") {
        const c = comentarioDe(x, lugarDoComentario(x, divisao, ator));
        const texto = c.texto ?? x.texto ?? "";
        card = { y: noQuadro(c, texto).y / 100, h: alturaDoComentario(texto, c.escala) };
      }
      const as = x.formato !== "dividida" && x.midias.length ? aspectosDe(x.midias, banco) : [];
      const deitada = as.length > 0 && as.every((a) => a >= 1.2);
      return { ini: x.t.inicio, fim: x.t.fim, divisao, ator, card, deitada, y: x.legenda_y ?? void 0 };
    });
  }
  function alturaDaLegenda(tipo, z) {
    if (typeof z?.y === "number") return z.y;
    if (z?.y === "abaixo" && z.divisao?.modo === "metade") {
      const y2 = z.divisao.f + MEIA + FOLGA + 4e-3;
      return z.card ? desviar(y2, z.card) : y2;
    }
    let y = ALTURA_POR_PLANO[tipo ?? ""] ?? ALTURA_PADRAO;
    const d = z?.divisao;
    if (d?.modo === "metade") y = Math.min(Math.max(d.f, 0.3), 0.7);
    else if (d?.modo === "atras") {
      const g = z?.ator ?? { modo: "janela", s: 0.55, tx: 0.225, ty: 0.45 };
      y = g.modo === "canto" || g.modo === "caixa" ? topoDoAtor(g) - MEIA - FOLGA : g.ty + ALTURA_POR_PLANO.full_ator * g.s;
    } else if (tipo === "tela_dividida_motion") y = 0.5;
    else if (tipo === "insert_tela_cheia" && z?.deitada) y = ALTURA_DEITADA;
    return z?.card ? desviar(y, z.card) : y;
  }
  function desviar(y, c) {
    if (!(y + MEIA + FOLGA > c.y - c.h / 2 && y - MEIA - FOLGA < c.y + c.h / 2)) return y;
    const acima = c.y - c.h / 2 - FOLGA - MEIA;
    const abaixo = c.y + c.h / 2 + FOLGA + MEIA;
    return acima >= 0.08 ? acima : abaixo <= 0.92 ? abaixo : y;
  }
  function ajustesNoVideo(ajustes, palavras, saida) {
    const ordem = new Map(palavras.map((w, k) => [w.id, k]));
    const ficou = new Set(saida.map((w) => w.id));
    const naOrdem = [...saida].sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
    const valem = {};
    const orfaos = [];
    const pendentes = [];
    for (const [id, aj] of Object.entries(ajustes)) {
      if (ficou.has(id) && (aj.fim == null || ficou.has(aj.fim))) {
        valem[id] = aj;
        continue;
      }
      const a = ordem.get(id);
      pendentes.push([id, aj, a ?? -1, aj.fim != null ? ordem.get(aj.fim) ?? a ?? -1 : a ?? -1]);
    }
    for (const [id, aj, a, b] of pendentes) {
      const dentro = a < 0 ? [] : naOrdem.filter((w) => (ordem.get(w.id) ?? -1) >= a && (ordem.get(w.id) ?? -1) <= b);
      const novo = dentro[0]?.id;
      if (novo && !valem[novo] && (novo === id || !ajustes[novo])) {
        valem[novo] = aj.fim != null ? { ...aj, fim: dentro[dentro.length - 1].id } : aj;
        continue;
      }
      const proxima = naOrdem.find((w) => (ordem.get(w.id) ?? -1) > b && !valem[w.id] && !ajustes[w.id]);
      const fala = a < 0 ? "" : palavras.slice(a, Math.max(a, b) + 1).map((w) => w.texto).join(" ");
      orfaos.push({ id, ajuste: aj, fala, reatar: proxima?.id ?? null });
    }
    return { valem, orfaos };
  }
  function blocosDaLegenda(saida, planos, lg, palavras, zonas = []) {
    const ws = [...saida].sort((a, b) => a.saida_ini - b.saida_ini);
    const pos = new Map(ws.map((w, i) => [w.id, i]));
    const valem = ajustesNoVideo(lg.ajustes, palavras ?? ws, ws).valem;
    const ajustes = {};
    for (const [id, aj] of Object.entries(valem)) if (ajusteNoModo(aj, lg.modo)) ajustes[id] = aj;
    const brutos = [];
    for (let i = 0; i < ws.length; ) {
      const aj = ajustes[ws[i].id];
      let j = i;
      const fimManual = aj?.fim != null ? pos.get(aj.fim) : void 0;
      if (fimManual != null && fimManual >= i) j = fimManual;
      else if (aj?.texto != null) j = i;
      else if (lg.modo === "frase") {
        let letras = ws[i].texto.length;
        while (j + 1 < ws.length && j - i + 1 < FRASE.palavras && !ajustes[ws[j + 1].id] && !/[.!?,;:…]$/.test(ws[j].texto) && ws[j + 1].saida_ini - ws[j].saida_fim < FRASE.pausa && letras + 1 + ws[j + 1].texto.length <= FRASE.letras) {
          j++;
          letras += 1 + ws[j].texto.length;
        }
      }
      const grupo = ws.slice(i, j + 1);
      const auto = grupo.map((w) => limpar(w.texto)).join(" ");
      const texto = aj?.texto ?? auto;
      const ant = brutos[brutos.length - 1];
      const ini = Math.max(ws[i].saida_ini - ANTECIPA, 0, ant ? Math.min(ant.ini + MINIMO, ws[i].saida_ini) : 0);
      brutos.push({
        id: ws[i].id,
        palavras: grupo.map((w) => w.id),
        texto,
        ini,
        ajustado: !!aj,
        oculto: !texto.trim(),
        fala: ws[i].saida_ini,
        fimFala: ws[j].saida_fim
      });
      i = j + 1;
    }
    const ps = [...planos].sort((a, b) => a.inicio - b.inicio);
    return brutos.map(({ fala, fimFala, ...b }, k) => {
      const prox = brutos[k + 1];
      let fim = prox && prox.fala - fimFala < SEGURA ? prox.ini : fimFala - ANTECIPA + SOBRA;
      fim = Math.max(fim, b.ini + 0.05);
      if (prox) fim = Math.min(fim, prox.ini);
      const plano = ps.find((p) => p.inicio <= fala + 1e-3 && fala < p.fim);
      const zona = zonas.find((z) => z.ini <= fala + 1e-3 && fala < z.fim) ?? null;
      let y = alturaDaLegenda(plano?.tipo, zona);
      for (const z of zonas) if (z !== zona && z.card && z.ini < fim && b.ini < z.fim) y = desviar(y, z.card);
      return { ...b, fim, y };
    });
  }
  function semOsLetterings(bs, saida, letterings) {
    if (!letterings.length) return bs;
    const ls = [...letterings].sort((x, y) => x.ini - y.ini);
    const meio = new Map(saida.map((w) => [w.id, (w.saida_ini + w.saida_fim) / 2]));
    const dentro = (t) => t != null && ls.some((l) => l.ini <= t && t < l.fim);
    const ficam = bs.flatMap((b, i) => b.palavras.every((id) => dentro(meio.get(id))) ? [] : [{ b, i, ini: b.ini }]);
    ficam.forEach((x, k) => {
      for (const l of ls) if (x.ini >= l.ini && x.ini < l.fim) x.ini = l.fim;
      const ant = ficam[k - 1];
      if (ant && (x.ini !== x.b.ini || ant.ini !== ant.b.ini)) x.ini = Math.max(x.ini, ant.ini + MINIMO);
    });
    return ficam.flatMap((x, k) => {
      const { b, ini } = x;
      const prox = ficam[k + 1];
      const colado = bs[x.i + 1] && b.fim >= bs[x.i + 1].ini - 1e-6;
      let fim = colado && prox ? prox.ini : ini !== b.ini ? Math.max(b.fim, ini + MINIMO) : b.fim;
      if (prox) fim = Math.min(fim, prox.ini);
      for (const l of ls) if (ini < l.ini && fim > l.ini) fim = l.ini;
      return fim - ini >= 0.05 ? [{ ...b, ini, fim }] : [];
    });
  }
  var paraExportar = (bs) => bs.filter((b) => !b.oculto).map((b) => ({ ini: b.ini, fim: b.fim, texto: b.texto, y: b.y }));

  // src/transicoes.ts
  var familia = (c) => c.startsWith("full_ator") ? "ator" : c.startsWith("tela_dividida") || c === "comentario_insert_ator" ? "dividida" : "cheia";
  var chavePar = (de, para) => `${de}>${para}`;
  var ordemDoPar = (b, de, para) => b.ordem[`familia:${familia(de)}>${familia(para)}`] ?? b.ordem[chavePar(de, para)];
  function padraoDoPar(b, de, para) {
    const o = ordemDoPar(b, de, para);
    const id = o && o.favoritas > 0 ? o.ids[0] : null;
    return id && b.transicoes.some((t) => t.id === id) ? id : "corte-seco";
  }
  function cortesDoVideo(planos, b, escolhas) {
    if (!b) return [];
    const ps = [...planos].sort((x, y) => x.inicio - y.inicio);
    const out = [];
    for (let k = 1; k < ps.length; k++) {
      const a = ps[k - 1];
      const p = ps[k];
      const e = escolhas[p.id];
      const manual = !!e && (!e.par || e.par === chavePar(a.tipo, p.tipo));
      const id = manual ? e.id : padraoDoPar(b, a.tipo, p.tipo);
      out.push({ t: p.inicio, plano: p.id, de: a.tipo, para: p.tipo, transicao: b.transicoes.find((x) => x.id === id) ?? null, manual });
    }
    return out;
  }
  function sonsDasTransicoes(cortes, cat) {
    if (!cat) return [];
    return cortes.flatMap((c) => {
      const s = c.transicao?.som;
      const e = s ? eventoNoTempo(s, c.t, cat) : null;
      return e ? [{ ...e, grupo: "transicoes" }] : [];
    });
  }

  // src/desenho.ts
  var guardados = /* @__PURE__ */ new WeakMap();
  var estilos = /* @__PURE__ */ new WeakMap();
  var CHAVE = "k";
  function desenhar(pai, filhos) {
    let mapa = guardados.get(pai);
    if (!mapa) guardados.set(pai, mapa = /* @__PURE__ */ new Map());
    const vs = filhos.filter((v) => !!v);
    const els = vs.map((v) => {
      const tag = (v.tag ?? "div").toUpperCase();
      let el = mapa.get(v.chave);
      if (!el || el.tagName !== tag) {
        el = document.createElement(tag);
        el.dataset[CHAVE] = v.chave;
        mapa.set(v.chave, el);
        v.criar?.(el);
      }
      return el;
    });
    const ficam = new Set(els);
    for (const el of [...pai.children]) if (!ficam.has(el)) el.remove();
    vs.forEach((v, i) => {
      const el = els[i];
      if (pai.children[i] !== el) pai.insertBefore(el, pai.children[i] ?? null);
      if (el.className !== (v.classe ?? "")) el.className = v.classe ?? "";
      for (const [k, valor] of Object.entries(v.atributos ?? {})) if (el.getAttribute(k) !== valor) el.setAttribute(k, valor);
      aplicarEstilo(el, v.estilo ?? {});
      if (v.texto != null) {
        if (el.textContent !== v.texto) el.textContent = v.texto;
      } else desenhar(el, v.filhos ?? []);
      v.depois?.(el);
    });
  }
  function aplicarEstilo(el, novo) {
    const antes = estilos.get(el) ?? {};
    const s = el.style;
    for (const k of Object.keys(antes)) if (novo[k] == null) s[k] = "";
    for (const [k, v] of Object.entries(novo)) if (v != null && antes[k] !== v) s[k] = String(v);
    estilos.set(el, novo);
  }
  var relogio = 0;
  var definirRelogio = (t) => void (relogio = t);
  var FUNDOS = [
    { id: "verde_claro", nome: "Verde claro", claro: true, amostra: "linear-gradient(180deg,#dfe8e1 0%,#a9c6b3 55%,#6f9c84 100%)" },
    { id: "papel", nome: "Papel", claro: true, amostra: "radial-gradient(120% 90% at 50% 40%,#f1ecdd 0%,#e4dcc7 70%,#d6ccb3 100%)" },
    { id: "nevoa", nome: "N\xE9voa azul", claro: true, amostra: "linear-gradient(180deg,#d9d6e2 0%,#a9b2c7 45%,#8a97ad 75%,#c8ccd8 100%)" },
    { id: "chuva", nome: "Chuva", claro: false, amostra: "radial-gradient(90% 70% at 50% 40%,#0c3b35 0%,#06201c 55%,#050505 100%)" },
    { id: "gradiente", nome: "Gradiente escuro", claro: false, amostra: "radial-gradient(85% 70% at 50% 45%,#24423b 0%,#13201d 60%,#0b1412 100%)" }
  ];
  function chuvaNoRelogio(v) {
    if (!v.duration) return;
    v.pause();
    const alvo = relogio % v.duration;
    if (Math.abs(v.currentTime - alvo) > 1e-3) v.currentTime = alvo;
  }
  function fundo(id, chave = "fundo") {
    const f = FUNDOS.find((x) => x.id === id) ?? FUNDOS[4];
    return {
      chave,
      classe: "absolute inset-0 overflow-hidden",
      estilo: { background: f.id === "chuva" ? "#050505" : f.amostra },
      filhos: [
        f.id === "chuva" && {
          chave: "chuva",
          tag: "video",
          classe: "absolute inset-0 size-full object-cover",
          atributos: { src: "/render/fundos/aura/chuva.mp4", preload: "auto" },
          criar: (el) => {
            const v = el;
            v.muted = v.loop = v.playsInline = true;
            v.addEventListener("loadedmetadata", () => chuvaNoRelogio(v));
          },
          depois: (el) => chuvaNoRelogio(el)
        },
        // névoa: manchas desfocadas, como no fundo de referência
        f.id === "nevoa" && {
          chave: "n1",
          classe: "absolute rounded-full",
          estilo: { top: "-10%", left: "-20%", height: "55%", width: "90%", background: "#eae6f0", opacity: 0.7, filter: "blur(64px)" }
        },
        f.id === "nevoa" && {
          chave: "n2",
          classe: "absolute rounded-full",
          estilo: { top: "40%", right: "-25%", height: "45%", width: "80%", background: "#6f7f99", opacity: 0.5, filter: "blur(64px)" }
        }
      ]
    };
  }
  function videoNoTempo(m, item, rel, topo) {
    const alvo = Math.min((item.inicio ?? 0) + rel, item.fim ?? Infinity);
    return {
      chave: `m:${m.id}`,
      tag: "video",
      classe: `size-full object-cover${topo ? " object-top" : ""}`,
      atributos: { src: item.url, preload: "auto" },
      criar: (el) => {
        const v = el;
        v.muted = v.playsInline = true;
      },
      depois: (el) => {
        const v = el;
        const fim = Math.min(item.fim ?? Infinity, Number.isFinite(v.duration) ? v.duration : Infinity);
        const destino = Math.min((Math.floor(Math.min(alvo, fim) * 24 + 1e-6) + 0.5) / 24, fim - 1e-3);
        if (Math.abs(v.currentTime - destino) > 1e-3) {
          v.dataset.quadro = "0";
          v.requestVideoFrameCallback?.(() => v.dataset.quadro = "1");
          v.currentTime = destino;
        }
        if (!v.paused) v.pause();
      }
    };
  }
  function midia(m, banco, rel, topo) {
    if (!m) return null;
    const item = banco.get(m.banco);
    if (item?.tipo === "video") return videoNoTempo(m, item, rel, topo);
    return {
      chave: `m:${m.id}`,
      tag: "img",
      classe: `size-full object-cover${topo ? " object-top" : ""}`,
      atributos: { src: item?.url ?? "", alt: "" }
    };
  }
  var SOMBRA = "sombra-card";
  function cenaPreset(p) {
    const r = noTempo(p.receita, p.dur);
    const cards2 = r.cards.map((c, k) => {
      const e = estadoCard(c, p.rel, p.dur);
      if (!e || e.opacidade <= 1e-3) return null;
      const rep = c.repouso;
      const ini = janela(c, p.dur).ini;
      const conteudo = () => p.midia(c.midia ?? k, Math.max(p.rel - ini, 0), c.ajuste === "topo");
      if (c.quadros?.length) {
        const tam = p.caixa;
        if (!tam) return null;
        const { fim } = janela(c, p.dur);
        const q = cantosNoTempo(c.quadros, (p.rel - ini) / Math.max(fim - ini, 0.01)).map(([x, y]) => [x / 100 * tam[0], y / 100 * tam[1]]);
        const w = rep.w / 100 * tam[0], h = rep.h / 100 * tam[1];
        return {
          chave: `c${k}`,
          classe: "absolute top-0 left-0 origin-top-left",
          estilo: { width: `${w}px`, height: `${h}px`, zIndex: rep.z, opacity: e.opacidade, transform: matrizDosCantos(w, h, q), filter: rep.desfoque ? `blur(${(rep.desfoque / 10.8).toFixed(3)}cqw)` : void 0 },
          filhos: [{ chave: "moldura", classe: "size-full overflow-hidden", estilo: { borderRadius: `${rep.raio * rep.w / 100}cqw` }, filhos: [conteudo()] }]
        };
      }
      const giro3d = rep.rx + e.rx || rep.ry + e.ry ? `perspective(138.9cqw) rotateX(${rep.rx + e.rx}deg) rotateY(${rep.ry + e.ry}deg) ` : "";
      return {
        chave: `c${k}`,
        classe: "absolute",
        estilo: {
          left: `${rep.cx - rep.w / 2}%`,
          top: `${rep.cy - rep.h * (e.altura ?? 1) / 2}%`,
          width: `${rep.w}%`,
          height: `${rep.h * (e.altura ?? 1)}%`,
          zIndex: rep.z,
          opacity: e.opacidade,
          transform: `translate(${e.dx}cqw, ${e.dy}cqh) ${giro3d}rotate(${rep.rot + e.rot}deg) scale(${e.escala})`,
          filter: e.desfoque + (rep.desfoque ?? 0) > 0.05 ? `blur(${((e.desfoque + (rep.desfoque ?? 0)) / 10.8).toFixed(3)}cqw)` : void 0
        },
        filhos: [
          {
            chave: "moldura",
            classe: `size-full overflow-hidden${rep.sombra ? ` ${SOMBRA}` : ""}${c.ajuste === "contain" ? " bg-black" : ""}`,
            estilo: { borderRadius: `${rep.raio * rep.w / 100}cqw` },
            filhos: [
              c.zoom ? { chave: "zoom", classe: "size-full", estilo: { transform: `scale(${zoomMidia(c, p.rel, p.dur)})`, transformOrigin: `${c.zoom.ox}% ${c.zoom.oy}%` }, filhos: [conteudo()] } : conteudo()
            ]
          }
        ]
      };
    });
    return {
      chave: "cena",
      classe: `pointer-events-none absolute isolate overflow-hidden ${p.classe ?? ""}${r.fundo === "nenhum" && !p.semFundo ? " bg-black" : ""}`,
      estilo: { containerType: "size" },
      // `semFundo`: quem usa já desenha o fundo, maior que a cena (o "ator embaixo": a tela toda)
      filhos: [r.fundo === "proprio" && !p.semFundo && fundo(p.fundo), ...cards2]
    };
  }
  function insertNoLugar(p) {
    const { pedido, banco, divisao } = p;
    const area = areaDoInsert(divisao);
    const n = pedido.midias.length;
    const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01);
    let rel = Math.max(p.tempo - pedido.t.inicio, 0);
    if (!n) return [];
    const atras = divisao?.modo === "atras" && { chave: "atras", classe: "pointer-events-none absolute inset-0", filhos: [fundo(p.fundo)] };
    if (p.receita) {
      let receita = p.receita;
      if (p.so === "fundo") receita = { ...receita, cards: [] };
      else if (p.so != null) {
        const c = receita.cards[p.so];
        receita = { ...receita, fundo: "proprio", cards: [c] };
        rel = c.inicio_frac * dur;
      }
      const sombra = typeof p.so === "number";
      return [
        atras,
        {
          chave: "area",
          classe: "pointer-events-none absolute",
          estilo: area,
          filhos: [
            cenaPreset({
              receita,
              rel,
              dur,
              fundo: p.fundo,
              classe: "inset-0",
              semFundo: divisao?.modo === "atras" || sombra,
              caixa: p.caixa,
              midia: (k2, relM, topo) => sombra ? null : midia(pedido.midias[k2], banco, relM, topo)
            })
          ]
        }
      ].filter(Boolean);
    }
    const emCard = ESTILO_SIMPLES[pedido.formato].layout === "card";
    const { k, ini, durM } = corteSimples(n, rel, dur);
    const anim = estiloSimples(rel - ini, durM);
    return [
      atras,
      {
        chave: "area",
        classe: `pointer-events-none absolute overflow-hidden${emCard ? "" : " bg-black"}`,
        estilo: area,
        filhos: [
          emCard && fundo(p.fundo),
          {
            chave: `moldura${k}`,
            classe: `absolute ${emCard ? "inset-8p" : "inset-0"}`,
            estilo: anim,
            filhos: [{ chave: "card", classe: `size-full overflow-hidden${emCard ? ` ${SOMBRA} rounded-18` : ""}`, filhos: [midia(pedido.midias[k], banco, rel - ini)] }]
          }
        ]
      }
    ].filter(Boolean);
  }
  function geometriaDoInsert(pedido, banco, receita, divisao, fundoId) {
    if (!receita || !pedido.midias.length || divisao?.modo === "atras") return null;
    const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01);
    const r = noTempo(receita, dur);
    const cards2 = [];
    for (const [k, c] of r.cards.entries()) {
      const rep = c.repouso;
      if (c.quadros?.length || c.entrada || c.saida || c.zoom || rep.rot || rep.rx || rep.ry || rep.desfoque || c.continuo?.rot) return null;
      const item = banco.get(pedido.midias[c.midia ?? k]?.banco ?? "");
      if (!item) return null;
      const z = c.continuo;
      cards2.push({
        k,
        ...janela(c, dur),
        cx: rep.cx,
        cy: rep.cy,
        w: rep.w,
        h: rep.h,
        raio: rep.raio * rep.w / 100,
        sombra: !!rep.sombra,
        topo: c.ajuste === "topo",
        continuo: z && (z.escala || z.dx || z.dy) ? { escala: z.escala, dx: z.dx, dy: z.dy } : null,
        midia: { tipo: item.tipo, url: item.url, inicio: item.inicio ?? 0, fim: item.fim ?? null }
      });
    }
    cards2.sort((a, b) => r.cards[a.k].repouso.z - r.cards[b.k].repouso.z || a.k - b.k);
    const f = FUNDOS.find((x) => x.id === fundoId) ?? FUNDOS[4];
    return { area: { y: 0, h: divisao ? divisao.f : 1 }, fundo: r.fundo === "proprio" ? f.id : null, cards: cards2 };
  }
  var PALCO = { vertical: { w: 1080, h: 1920 }, dividida: { w: 1080, h: 960 } };
  var pinturas = 0;
  function pintar(f, rel) {
    const ir = f.contentWindow?.__ir;
    if (!ir) return;
    const n = String(++pinturas);
    f.dataset.pintando = n;
    void ir(rel).finally(() => {
      if (f.dataset.pintando === n) delete f.dataset.pintando;
    });
  }
  function motionNoLugar(p) {
    const palco = PALCO[p.formato];
    return {
      chave: "motion",
      classe: `pointer-events-none overflow-hidden absolute ${p.formato === "vertical" ? "inset-0" : "inset-x-0 top-0 h-1-2"}`,
      filhos: [
        p.fundo ? fundo(p.fundo) : null,
        p.escala > 0 && {
          chave: `iframe:${p.src}`,
          tag: "iframe",
          classe: "absolute top-0 left-0 origin-top-left border-0",
          atributos: { title: "motion" },
          estilo: { width: `${palco.w}px`, height: `${palco.h}px`, transform: `scale(${p.escala})` },
          criar: (el) => {
            const f = el;
            f.dataset.pronto = "0";
            f.addEventListener("load", () => {
              f.dataset.pronto = "1";
              pintar(f, Number(f.dataset.rel ?? 0));
            });
            f.src = p.src;
          },
          depois: (el) => {
            const f = el;
            if (!f.contentWindow?.__ir || f.contentDocument?.readyState !== "complete") f.dataset.pronto = "0";
            if (f.dataset.rel === String(p.rel) && f.dataset.pronto === "1") return;
            f.dataset.rel = String(p.rel);
            if (f.dataset.pronto === "1") pintar(f, p.rel);
          }
        }
      ]
    };
  }

  // src/elementos.ts
  var queixo = (l) => l.rosto ? l.rosto.cy + l.rosto.h / 2 : 0.45;
  var olhos = (l) => l.rosto ? l.rosto.cy - 0.15 * l.rosto.h : 0.29;
  var FONTE = "'SF Pro Display', system-ui, sans-serif";
  var MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
  var W_H2 = 9 / 16;
  var POP = { dur: 0.18, escala: 0.92, curva: bezier(0.16, 1, 0.3, 1) };
  var MAIUSCULA = 0.7046;
  var TAM = { grande: 5.75 / MAIUSCULA, insert: 4.5 / MAIUSCULA, manychat: 2.35 / MAIUSCULA };
  var SOMBRA_TEXTO = "0 0.03em 0.16em rgba(0,0,0,0.55), 0 0 0.04em rgba(0,0,0,0.25)";
  var DESFOQUE = { raio: 0.9, escurece: 0.22 };
  var BARRA = { w: 0.94, h: 0.076, y: 0.64, texto: 0.075 };
  var DIGITAR = { atraso: 0.1, letra: 0.07, max: 1, toque: 0.22 };
  var SONS = { digitacao: ["typing-ios-01", "Digita\xE7\xE3o"], pop: ["ui-pop-02", "Pop"] };
  var AVIAO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" d="M3 11 22 2 13 21 11 13Z"/></svg>')}`;
  var ctx = null;
  function emEm(texto, peso, familia2 = FONTE) {
    ctx ??= document.createElement("canvas").getContext("2d");
    ctx.font = `${peso} 100px ${familia2}`;
    return ctx.measureText(texto).width / 100;
  }
  var caberEm = (texto, base, max, peso = 700) => Math.min(base, max * 100 * W_H2 / Math.max(emEm(texto, peso), 0.01));
  function lettering(texto, base) {
    const um = caberEm(texto, base, 0.86);
    const ps = texto.trim().split(/\s+/);
    let melhor = { tam: um, texto };
    if (um >= 0.75 * base || ps.length < 2) return melhor;
    for (let k = 1; k < ps.length; k++) {
      const a = ps.slice(0, k).join(" "), b = ps.slice(k).join(" ");
      const tam = Math.min(caberEm(a, base, 0.86), caberEm(b, base, 0.86));
      if (tam > melhor.tam) melhor = { tam, texto: `${a}
${b}` };
    }
    return melhor;
  }
  function quebrar(texto, tam, largura, peso) {
    const cabe = (s) => emEm(s, peso) * tam <= largura * 100 * W_H2;
    const linhas = [];
    for (const p of texto.trim().split(/\s+/)) {
      const u = linhas[linhas.length - 1];
      if (u != null && cabe(`${u} ${p}`)) linhas[linhas.length - 1] = `${u} ${p}`;
      else linhas.push(p);
    }
    return linhas;
  }
  var CAIXINHA = { w: 0.8, cabecalho: 1.9, pergunta: 2.9, pad: 2.2, padCab: 1.4, y: 0.32 };
  function medidasCaixinha(e) {
    const linhas = quebrar(e.texto ?? "", CAIXINHA.pergunta, CAIXINHA.w - 0.1, 600);
    const h = (2 * CAIXINHA.padCab + CAIXINHA.cabecalho * 1.2 + 2 * CAIXINHA.pad + linhas.length * CAIXINHA.pergunta * 1.25) / 100;
    const l = e.lugar;
    const y = l.modo === "metade" ? Math.max(Math.min(l.f, l.f + 0.05 - h / 2), h / 2 + 0.03) : l.modo === "ator" ? Math.min(CAIXINHA.y, Math.max(olhos(l) - 0.03 - h / 2, h / 2 + 0.05)) : CAIXINHA.y;
    return { linhas, h, y };
  }
  function medidasPrint(e, item) {
    let w = e.largura ?? 0.5, h = 0;
    if (item) {
      const a = item.largura && item.altura ? item.largura / item.altura : 16 / 9;
      h = w * W_H2 / a;
      if (h > 0.3) {
        h = 0.3;
        w = h * a / W_H2;
      }
    } else h = 0.055;
    const { modo, f } = e.lugar;
    const meio = e.y !== void 0 ? e.y : modo === "metade" ? f : modo === "atras" ? Math.min(f, 0.72) - h / 2 - 0.02 : modo === "ator" ? queixo(e.lugar) + 0.04 + h / 2 : 0.66;
    return { w, h, y: Math.min(Math.max(meio, h / 2 + 0.03), 0.97 - h / 2) };
  }
  var yBarra = (l) => l.modo === "metade" ? l.f : BARRA.y;
  function digitacao(e) {
    const n = [...e.texto ?? ""].length;
    return { ini: DIGITAR.atraso, dur: Math.max(Math.min(n * DIGITAR.letra, DIGITAR.max, (e.fim - e.inicio) / 2 - DIGITAR.atraso), 0.05), n };
  }
  var pop = (rel) => {
    const p = POP.curva(limite01(rel / POP.dur));
    return { escala: POP.escala + (1 - POP.escala) * p, opacidade: p };
  };
  var centrado = (y, rel) => {
    const p = pop(rel);
    return { left: "50%", top: `${y * 100}%`, transform: `translate(-50%, -50%) scale(${p.escala})`, opacity: p.opacidade };
  };
  function letteringNoAtor(e, rel) {
    const { tam, texto } = lettering(e.texto ?? "", TAM.grande);
    const y = Math.min(Math.max(queixo(e.lugar) + 0.08, 0.5), 0.6);
    return { chave: e.id, classe: "absolute", estilo: { ...centrado(y, rel), ...estiloLettering(tam) }, texto };
  }
  function letteringNoInsert(e, rel) {
    const { modo, f } = e.lugar;
    const y = modo === "metade" ? f / 2 : modo === "atras" ? Math.min(f, 0.72) / 2 : 0.3;
    const { tam, texto } = lettering(e.texto ?? "", TAM.insert);
    const p = pop(rel).opacidade;
    return {
      chave: e.id,
      classe: "absolute inset-0",
      filhos: [
        {
          chave: "desfoque",
          classe: "absolute",
          estilo: { ...modo === "metade" ? { left: 0, right: 0, top: 0, height: `${f * 100}%` } : { inset: 0 }, backdropFilter: `blur(${(DESFOQUE.raio * p).toFixed(3)}cqw) brightness(${1 - DESFOQUE.escurece * p})` }
        },
        { chave: "texto", classe: "absolute", estilo: { ...centrado(y, rel), ...estiloLettering(tam) }, texto }
      ]
    };
  }
  var estiloLettering = (tam) => ({
    fontFamily: FONTE,
    fontWeight: 700,
    fontSize: `${tam.toFixed(3)}cqh`,
    lineHeight: 1.08,
    color: "#fff",
    textAlign: "center",
    whiteSpace: "pre",
    textShadow: SOMBRA_TEXTO
  });
  function manychat(e, rel) {
    const d = digitacao(e);
    const letras = [...(e.texto ?? "").toUpperCase()];
    const n = rel < d.ini ? 0 : Math.min(letras.length, Math.floor((rel - d.ini) / d.dur * letras.length) + 1);
    const digitando = rel < d.ini + d.dur;
    const toque = rel - d.ini - d.dur;
    const escala = toque < 0 ? 1 : 0.9 + 0.1 * POP.curva(limite01(toque / DIGITAR.toque));
    const botao = BARRA.h * 0.9 * 100;
    return {
      chave: e.id,
      classe: "absolute",
      estilo: {
        ...centrado(yBarra(e.lugar), rel),
        width: `${BARRA.w * 100}cqw`,
        height: `${BARRA.h * 100}cqh`,
        borderRadius: "9999px",
        background: "linear-gradient(180deg, #fbfbfb 0%, #f3f3f3 55%, #e8e8e8 100%)",
        boxShadow: "0 0.5cqh 1.6cqh rgba(0,0,0,0.28), 0 0.1cqh 0.3cqh rgba(0,0,0,0.2), inset 0 -0.15cqh 0.3cqh rgba(0,0,0,0.06)"
      },
      filhos: [
        {
          chave: "palavra",
          classe: "absolute flex",
          // centrada na barra (entre a borda e o botão de enviar), em negrito
          estilo: { left: `${(BARRA.texto - (1 - BARRA.w) / 2) * 100}cqw`, right: `${BARRA.h * 100}cqh`, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", fontFamily: FONTE, fontWeight: 700, letterSpacing: "0.04em", fontSize: `${(TAM.manychat * 1.25).toFixed(3)}cqh`, color: "#151515", whiteSpace: "pre" },
          filhos: [
            { chave: "texto", tag: "span", texto: letras.slice(0, n).join("") },
            digitando && { chave: "cursor", tag: "span", estilo: { width: "0.3cqw", height: "1.15em", marginLeft: "0.2cqw", background: "#2a2a2a", borderRadius: "0.2cqw" } }
          ]
        },
        {
          chave: "botao",
          classe: "absolute rounded-full flex",
          estilo: {
            right: `${(BARRA.h * 100 - botao) / 2}cqh`,
            top: "50%",
            width: `${botao}cqh`,
            height: `${botao}cqh`,
            transform: `translateY(-50%) scale(${escala})`,
            background: "#151515",
            alignItems: "center",
            justifyContent: "center"
          },
          filhos: [{ chave: "aviao", tag: "img", atributos: { src: AVIAO, alt: "" }, estilo: { width: "48%", height: "48%", transform: "translate(-6%, 6%)" } }]
        }
      ]
    };
  }
  function caixinha(e, rel) {
    const m = medidasCaixinha(e);
    return {
      chave: e.id,
      classe: "absolute overflow-hidden bg-white",
      estilo: { ...centrado(m.y, rel), width: `${CAIXINHA.w * 100}cqw`, borderRadius: "3.4cqw", boxShadow: "0 1cqh 3cqh rgba(0,0,0,0.3), 0 0.2cqh 0.6cqh rgba(0,0,0,0.18)", fontFamily: FONTE, textAlign: "center" },
      filhos: [
        {
          chave: "cabecalho",
          estilo: { padding: `${CAIXINHA.padCab}cqh 4cqw`, background: "linear-gradient(90deg, #f58529 0%, #dd2a7b 45%, #8134af 78%, #515bd4 100%)", color: "#fff", fontWeight: 500, fontSize: `${CAIXINHA.cabecalho}cqh`, lineHeight: 1.2 },
          texto: "Fa\xE7a uma pergunta"
        },
        {
          chave: "pergunta",
          estilo: { padding: `${CAIXINHA.pad}cqh 5cqw`, color: "#000", fontWeight: 600, fontSize: `${CAIXINHA.pergunta}cqh`, lineHeight: 1.25, whiteSpace: "pre" },
          texto: m.linhas.join("\n")
        }
      ]
    };
  }
  function print(e, rel, banco) {
    const item = e.banco ? banco.get(e.banco) : void 0;
    const m = medidasPrint(e, item);
    if (item)
      return {
        chave: e.id,
        classe: "absolute overflow-hidden sombra-card",
        // `entrada: 'seco'`: aparece inteiro de uma vez, sem o pop (o som continua)
        estilo: { ...centrado(m.y, e.entrada === "seco" ? POP.dur : rel), width: `${m.w * 100}cqw`, height: `${m.h * 100}cqh`, borderRadius: "2.2cqw", background: "#111" },
        filhos: [midia({ id: e.id, banco: item.id }, banco, Math.max(rel, 0))]
      };
    const texto = e.texto;
    if (!texto) return null;
    return {
      chave: e.id,
      classe: "absolute",
      estilo: {
        ...centrado(m.y, rel),
        padding: "1.2cqh 3.2cqw",
        borderRadius: "1.8cqw",
        background: "rgba(14,14,14,0.62)",
        boxShadow: "0 0.6cqh 2cqh rgba(0,0,0,0.3), inset 0 0 0 0.12cqw rgba(255,255,255,0.14)",
        fontFamily: MONO,
        fontWeight: 500,
        fontSize: `${caberEm(texto, 2.6, 0.84, 500).toFixed(3)}cqh`,
        lineHeight: 1.2,
        color: "#fff",
        whiteSpace: "pre"
      },
      texto
    };
  }
  var TARJA = { y: 0.13, x: 0.04, larguraMax: 0.84, letra: 3.4, peso: 800 };
  function linhasDaTarja(texto) {
    const cabe = (s) => caberEm(s, TARJA.letra, TARJA.larguraMax - 2 * 0.026 - 0.02, TARJA.peso);
    if (texto.includes("\n")) return { texto, tam: Math.min(...texto.split("\n").map(cabe)), n: texto.split("\n").length };
    const ps = texto.trim().split(/\s+/);
    let melhor = { texto, tam: cabe(texto), n: 1, sobra: Infinity };
    for (let k = 1; k < ps.length; k++) {
      const a = ps.slice(0, k).join(" "), b = ps.slice(k).join(" ");
      const tam = Math.min(cabe(a), cabe(b));
      const sobra = Math.abs(emEm(a, TARJA.peso) - emEm(b, TARJA.peso));
      if (melhor.n === 1 || tam > melhor.tam + 0.01 || tam > melhor.tam - 0.01 && sobra < melhor.sobra) melhor = { texto: `${a}
${b}`, tam, n: 2, sobra };
    }
    return melhor;
  }
  var medidasTarja = (e) => {
    const l = linhasDaTarja(e.texto ?? "");
    const h = (l.n * l.tam * 1.12 + 2.4) / 100;
    return { y: TARJA.y + h / 2, h };
  };
  function tarja(e) {
    if (!e.texto) return null;
    const l = linhasDaTarja(e.texto);
    return {
      chave: e.id,
      classe: "absolute",
      estilo: {
        left: `${TARJA.x * 100}cqw`,
        top: `${TARJA.y * 100}cqh`,
        padding: "1.1cqh 2.6cqw 1.3cqh",
        borderRadius: "2.2cqw",
        background: "rgba(255,255,255,0.94)",
        boxShadow: "0 0.5cqh 1.6cqh rgba(0,0,0,0.22)",
        fontFamily: "'SF Pro Display', system-ui, sans-serif, 'Apple Color Emoji'",
        fontWeight: TARJA.peso,
        fontSize: `${l.tam.toFixed(3)}cqh`,
        lineHeight: 1.12,
        letterSpacing: "-0.01em",
        color: "#111",
        whiteSpace: "pre"
      },
      texto: l.texto
    };
  }
  function desenharElementos(t, elementos, banco) {
    const agora = elementos.filter((e) => e.inicio <= t && t < e.fim);
    if (!agora.length) return { vs: [], chave: "" };
    let parado = true;
    const filhos = agora.map((e) => {
      const rel = t - e.inicio;
      const d = e.tipo === "palavra_manychat" ? digitacao(e) : null;
      if (e.tipo !== "tarja" && rel < (d ? d.ini + d.dur + DIGITAR.toque : POP.dur)) parado = false;
      if (e.tipo === "full_ator_lettering" || e.tipo === "lettering" && e.lugar.modo === "ator") return letteringNoAtor(e, rel);
      if (e.tipo === "lettering") return letteringNoInsert(e, rel);
      if (e.tipo === "palavra_manychat") return manychat(e, rel);
      if (e.tipo === "caixinha_perguntas") return caixinha(e, rel);
      if (e.tipo === "print_sobreposto") return print(e, rel, banco);
      if (e.tipo === "tarja") return tarja(e);
      return null;
    });
    const vs = [{ chave: "elementos", classe: "pointer-events-none absolute inset-0 select-none", estilo: { containerType: "size", zIndex: 20 }, filhos }];
    return { vs, chave: parado ? `e:${agora.map((e) => e.id).join(",")}` : null };
  }
  var intervalosDeLettering = (elementos) => elementos.filter((e) => (e.tipo === "full_ator_lettering" || e.tipo === "lettering") && e.texto).map((e) => ({ ini: e.inicio, fim: e.fim }));
  function zonasDosElementos(elementos, banco) {
    return elementos.flatMap((e) => {
      const card = e.tipo === "palavra_manychat" ? { y: yBarra(e.lugar), h: BARRA.h } : e.tipo === "caixinha_perguntas" ? medidasCaixinha(e) : e.tipo === "print_sobreposto" ? medidasPrint(e, e.banco ? banco.get(e.banco) : void 0) : e.tipo === "tarja" ? medidasTarja(e) : null;
      return card ? [{ ini: e.inicio, fim: e.fim, divisao: null, ator: null, card: { y: card.y, h: card.h } }] : [];
    });
  }
  function sonsDosElementos(elementos, cat) {
    if (!cat) return [];
    const som = ([id, familia2]) => (cat.sons.find((s) => s.id === id) ?? cat.sons.find((s) => s.familia === familia2))?.id ?? null;
    return elementos.flatMap((e) => {
      if (e.tipo === "palavra_manychat" && e.texto) {
        const d = digitacao(e);
        const ev = eventoNoTempo({ som: som(SONS.digitacao), intensidade: "baixo", atraso: 0 }, e.inicio + d.ini, cat, +d.dur.toFixed(3));
        return ev ? [ev] : [];
      }
      if (e.tipo === "caixinha_perguntas" || e.tipo === "print_sobreposto" && (e.banco || e.texto)) {
        const ev = eventoNoTempo({ som: som(SONS.pop), intensidade: "baixo", atraso: 0 }, e.inicio, cat);
        return ev ? [ev] : [];
      }
      return [];
    });
  }

  // src/pagina.ts
  var esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  var doisQuadros = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  async function pronto() {
    await document.fonts.ready;
    const limite3 = Date.now() + 15e3;
    const ok = () => [...document.querySelectorAll("video")].every((v) => v.error || v.readyState >= 2 && !v.seeking);
    while (!ok() && Date.now() < limite3) await esperar(5);
    const apresentado = Date.now() + 300;
    while (document.querySelector('video[data-quadro="0"]') && Date.now() < apresentado) await esperar(5);
    await Promise.all([...document.images].map((i) => i.complete ? null : i.decode().catch(() => {
    })));
    const motions = () => !document.querySelector('iframe[data-pronto="0"], iframe[data-pintando]');
    await doisQuadros();
    while (!motions() && Date.now() < limite3) await esperar(10);
    await doisQuadros();
  }
  function semSobrepor(intervalos, ocupados) {
    const juntos = [];
    for (const x of [...intervalos].sort((a, b) => a.ini - b.ini)) {
      const u = juntos[juntos.length - 1];
      if (u && x.ini <= u.fim) u.fim = Math.max(u.fim, x.fim);
      else juntos.push({ ...x });
    }
    const occ = [...ocupados].sort((a, b) => a.ini - b.ini);
    return juntos.flatMap((x) => {
      const out = [];
      let ini = x.ini;
      for (const o of occ) {
        if (o.fim <= ini || o.ini >= x.fim) continue;
        if (o.ini > ini) out.push({ ini, fim: o.ini });
        ini = Math.max(ini, o.fim);
      }
      if (ini < x.fim) out.push({ ini, fim: x.fim });
      return out.filter((p) => p.fim - p.ini > 1e-3);
    });
  }
  async function iniciar() {
    const slug = new URLSearchParams(location.search).get("projeto") ?? "";
    document.documentElement.style.zoom = String(window.innerWidth / 540);
    const raiz = document.getElementById("camada");
    const d = await carregar(slug);
    const { edicao, banco, presets } = d;
    const ins = edicao.inserts ?? {};
    const motions = edicao.motions ?? {};
    const seq = montarSequencia(edicao.timeline ?? { V1: [] }, d.palavras, edicao.velocidade ?? 1);
    const rostoEm = rostoDoArquivo(d.rosto, seq, edicao.enquadramento?.x ?? 0.5);
    const saida = palavrasNaSaida(d.palavras, seq);
    const visiveis = paraTempo(edicao.direcao?.itens ?? [], d.palavras, saida, seq.duracao).visiveis;
    const planos = visiveis.filter((i) => i.camada === "plano");
    const elementos = visiveis.filter((i) => i.camada === "elemento");
    const comMotion = planos.filter((pl) => motions[pl.id]).map((pl) => ({ plano: pl.id, ini: pl.inicio, fim: pl.fim, dividida: pl.tipo === "tela_dividida_motion", fala: falaDoPlano(saida, pl.inicio, pl.fim) }));
    const lista2 = pedidosNoTempo(ins.pedidos ?? [], planos).filter((x) => x.midias.length);
    const fundoInserts = ins.fundo ?? "gradiente";
    const cortes = cortesDoVideo(planos, d.transicoes, d.escolhas);
    const trechos = [
      ...lista2.map((x) => {
        const divisao = divisaoDe(x, banco, presets);
        const ator = geometriaDoAtor(divisao, x.enriquecimento?.ator, rostoEm?.(x.t.inicio, x.t.fim) ?? null);
        return { ini: x.t.inicio, fim: x.t.fim, dividida: x.formato === "dividida", divisao: divisao && { ...divisao, ator } };
      }),
      ...comMotion.map((m) => {
        const divisao = m.dividida ? { modo: "metade", tipo: "area", f: 0.5 } : null;
        return { ini: m.ini, fim: m.fim, dividida: m.dividida, divisao: divisao && { ...divisao, ator: geometriaDoAtor(divisao, null, rostoEm?.(m.ini, m.fim) ?? null) } };
      })
    ];
    const lugarEm = (ini, fim, t = (ini + fim) / 2) => {
      const x = lista2.find((x2) => t >= x2.t.inicio && t < x2.t.fim);
      if (x) {
        const d2 = divisaoDe(x, banco, presets);
        return { modo: d2?.modo ?? "cheia", f: d2?.f ?? 1, rosto: null };
      }
      const m = comMotion.find((m2) => t >= m2.ini && t < m2.fim);
      if (m) return { modo: m.dividida ? "metade" : "cheia", f: m.dividida ? 0.5 : 1, rosto: null };
      return { modo: "ator", f: 1, rosto: rostoEm?.(ini, fim) ?? null };
    };
    const caixinhaEm = (ini, fim) => {
      const ls = [0.05, 0.25, 0.5, 0.75, 0.95].map((k) => lugarEm(ini, fim, ini + (fim - ini) * k));
      const m = ls.filter((l) => l.modo === "metade");
      return m.length === ls.length ? m.reduce((a, b) => b.f < a.f ? b : a) : lugarEm(ini, fim);
    };
    const originais = new Map((edicao.direcao?.itens ?? []).map((i) => [i.id, i]));
    const desenhaveis = [...planos.filter((p) => p.tipo === "full_ator_lettering"), ...elementos].sort((a, b) => a.inicio - b.inicio).map((e) => ({ id: e.id, tipo: e.tipo, inicio: e.tipo === "tarja" && e.inicio < 1 ? 0 : e.inicio, fim: e.fim, texto: e.texto, descricao: e.descricao, banco: originais.get(e.id)?.banco ?? null, largura: originais.get(e.id)?.largura, y: originais.get(e.id)?.y, entrada: originais.get(e.id)?.entrada, lugar: e.tipo === "caixinha_perguntas" ? caixinhaEm(e.inicio, e.fim) : lugarEm(e.inicio, e.fim) }));
    lista2.forEach((x, i) => {
      if (x.tipo === "comentario_insert_ator" || desenhaveis.some((e) => e.inicio < x.t.fim && e.fim > x.t.inicio)) return;
      trechos[i].geometria = geometriaDoInsert(x, banco, receitaDoInsert(x, banco, presets), divisaoDe(x, banco, presets), fundoInserts);
    });
    trechos.push(...semSobrepor(desenhaveis.map((e) => ({ ini: e.inicio, fim: e.fim })), trechos).map((p) => ({ ...p, dividida: false, divisao: null })));
    const versoes = /* @__PURE__ */ new Map();
    const versao = (url) => {
      if (!versoes.has(url))
        versoes.set(url, fetch(url, { method: "HEAD" }).then((r) => r.ok ? `${r.headers.get("content-length")}@${r.headers.get("last-modified")}` : "ausente", () => "ausente"));
      return versoes.get(url);
    };
    const midiaDe = async (id) => {
      const i = id ? banco.get(id) ?? await itemBanco(id) : null;
      return i ? { ...i, versao: await versao(i.url) } : null;
    };
    const r3 = (x) => Math.round(x * 1e3) / 1e3;
    const assinatura = async ({ ini, fim }) => {
      const rel = (x) => r3(x - ini);
      const cai = (a, b) => a < fim && b > ini;
      const daqui = await Promise.all(
        lista2.filter((x) => cai(x.t.inicio, x.t.fim)).map(async (x) => {
          const divisao = divisaoDe(x, banco, presets);
          const comentario = x.tipo === "comentario_insert_ator" ? comentarioDe(x, lugarDoComentario(x, divisao, geometriaDoAtor(divisao, x.enriquecimento?.ator, null))) : null;
          return {
            t: [rel(x.t.inicio), rel(x.t.fim)],
            tipo: x.tipo,
            formato: x.formato,
            texto: x.texto,
            enriquecimento: x.enriquecimento ?? null,
            midias: await Promise.all(x.midias.map((m) => midiaDe(m.banco))),
            receita: receitaDoInsert(x, banco, presets),
            divisao,
            comentario
          };
        })
      );
      const mots = await Promise.all(
        comMotion.filter((m) => cai(m.ini, m.fim)).map(async (m) => {
          const mp = motions[m.plano];
          const ids = mp.tipo === "video" ? [mp.banco] : Object.values(mp.valores ?? {}).filter((v) => typeof v === "string" && /^[0-9a-f]{10}$/.test(v));
          return {
            t: [rel(m.ini), rel(m.fim)],
            preset: mp.tipo === "preset" ? mp.preset : null,
            formato: mp.formato,
            fundo: fundoDoMotion(mp) ?? null,
            src: urlPaginaMotion(mp, m.fim - m.ini, m.fala, true),
            midias: await Promise.all(ids.map(midiaDe))
          };
        })
      );
      const elems = await Promise.all(
        desenhaveis.filter((e) => cai(e.inicio, e.fim)).map(async (e) => ({ t: [rel(e.inicio), rel(e.fim)], tipo: e.tipo, texto: e.texto, lugar: e.lugar, midia: await midiaDe(e.banco) }))
      );
      const fundo2 = daqui.length ? fundoInserts : null;
      return JSON.stringify({
        dur: r3(fim - ini),
        inserts: daqui,
        motions: mots,
        elementos: elems,
        fundo: fundo2,
        // a chuva toca o loop no relógio do vídeo final: aí o trecho depende do instante
        relogio: [fundo2, ...mots.map((m) => m.fundo)].includes("chuva") ? r3(ini) : null,
        palavras: saida.filter((w) => w.saida_ini < fim && w.saida_fim > ini).map((w) => [w.texto, rel(w.saida_ini), rel(w.saida_fim)])
      });
    };
    await Promise.all(trechos.map(async (t) => void (t.assinatura = await assinatura(t))));
    const fimDaPalavra = new Map(saida.map((w) => [w.id, w.saida_fim]));
    const semCard = (x, tempo) => {
      const ate = x.comentario?.ate;
      return ate != null && fimDaPalavra.has(ate) && tempo >= fimDaPalavra.get(ate);
    };
    const quadro = (tempo, so) => {
      definirRelogio(tempo);
      const atual = lista2.find((x) => tempo >= x.t.inicio && tempo < x.t.fim);
      const motion = comMotion.find((m) => tempo >= m.ini && tempo < m.fim);
      const el = desenharElementos(tempo, desenhaveis, banco);
      const elems = el.vs;
      if (motion && motions[motion.plano]) {
        const mp = motions[motion.plano];
        const src = urlPaginaMotion(mp, motion.fim - motion.ini, motion.fala, true);
        const escala = raiz.clientWidth / 1080;
        desenhar(raiz, [motionNoLugar({ src, formato: mp.formato, fundo: fundoDoMotion(mp), rel: tempo - motion.ini, escala }), ...elems]);
        return null;
      }
      if (!atual) {
        desenhar(raiz, elems);
        return el.chave || null;
      }
      const divisao = divisaoDe(atual, banco, presets);
      const receita = receitaDoInsert(atual, banco, presets);
      const camada = (caixa) => {
        const out = insertNoLugar({ pedido: atual, banco, tempo, fundo: fundoInserts, receita, divisao, caixa, so });
        if (so != null) return out;
        if (atual.tipo === "comentario_insert_ator" && !semCard(atual, tempo)) {
          const c = comentarioDe(atual, lugarDoComentario(atual, divisao, geometriaDoAtor(divisao, atual.enriquecimento?.ator, null)));
          out.push(cardComentario(c, c.texto ?? atual.texto ?? ""));
        }
        return [...out, ...elems];
      };
      desenhar(raiz, camada(null));
      if (receita?.cards.some((c) => c.quadros?.length)) {
        const cena = raiz.querySelector('[data-k="cena"]');
        if (cena) desenhar(raiz, camada([cena.clientWidth, cena.clientHeight]));
      }
      const chave0 = chaveParada(atual, tempo - atual.t.inicio, presets);
      const chave = chave0 != null && semCard(atual, tempo) ? `${chave0}|sem-card` : chave0;
      return chave == null || el.chave == null ? null : el.chave ? `${chave}|${el.chave}` : chave;
    };
    window.__render = {
      duracao: seq.duracao,
      trechos,
      movimentos: planos.flatMap((pl) => {
        const tipo = ehFullAtor(pl.tipo) ? ins.ator_planos?.[pl.id] : void 0;
        if (!tipo) return [];
        const c = centroQueCentraliza(rostoEm?.(pl.inicio, pl.fim), escalaFinal(tipo, pl.fim - pl.inicio));
        return [{ ini: pl.inicio, fim: pl.fim, tipo, cx: c.x, cy: c.y }];
      }),
      sons: async () => {
        const cat = d.catalogo;
        const dosInserts = lista2.flatMap((x) => {
          const r = receitaDoInsert(x, banco, presets);
          return r ? eventosDaReceita(r, x.t.fim - x.t.inicio, cat).map((e) => ({ ...e, t: e.t + x.t.inicio })) : [];
        });
        const dosMotions = await Promise.all(
          comMotion.map(async (m) => {
            const mp = motions[m.plano];
            if (mp.tipo !== "preset") return [];
            const marcas = await marcasDaPagina(urlPaginaMotion(mp, m.fim - m.ini, m.fala, true), mp.formato);
            return eventosDoMotion(marcas, escolhasDeSom(d.sonsMotion[mp.preset], mp), cat).filter((e) => e.t < m.fim - m.ini).map((e) => ({ ...e, t: e.t + m.ini }));
          })
        );
        return [...dosInserts, ...dosMotions.flat(), ...sonsDosElementos(desenhaveis, cat), ...sonsDasTransicoes(cortes, cat)];
      },
      // a legenda (SPEC §8.10): os blocos visíveis (a mesma conta da prévia, com a altura pelos inserts desta página e
      // desviando da barra do ManyChat, da caixinha e do print), sem o que um lettering já mostra, para o ASS
      legenda: async () => {
        const zonasMotion = comMotion.filter((m) => motions[m.plano]?.legenda_y != null).map((m) => ({ ini: m.ini, fim: m.fim, divisao: null, card: null, y: Number(motions[m.plano].legenda_y) }));
        const zonas = [...zonasMotion, ...zonasDaLegenda(lista2, banco, presets), ...zonasDosElementos(desenhaveis, banco)];
        if (!d.legenda.ligada) return null;
        const blocos = semOsLetterings(blocosDaLegenda(saida, planos, d.legenda, d.palavras, zonas), saida, intervalosDeLettering(desenhaveis));
        return { blocos: paraExportar(blocos) };
      },
      // as transições com efeito (o som delas vai em `sons`), para o ffmpeg desenhar depois da montagem (SPEC §8.8)
      transicoes: async () => cortes.filter((c) => c.transicao && c.transicao.efeito.tipo !== "seco").map((c) => ({ t: c.t, ...c.transicao.efeito })),
      palavras: saida.map((w) => ({ id: w.id, texto: w.texto, ini: w.saida_ini, fim: w.saida_fim })),
      planos: planos.map((p) => ({ id: p.id, tipo: p.tipo, ini: p.inicio, fim: p.fim, descricao: p.descricao, texto: p.texto })),
      ir: async (t, so) => {
        const chave = quadro(t, so);
        await pronto();
        return document.querySelector("video") ? null : chave;
      }
    };
  }
  void iniciar().catch((e) => {
    console.error(e);
    document.title = `erro: ${e.message}`;
  });
})();
