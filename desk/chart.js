/* Pumpr · graphique crypto maison (TradingView Lightweight Charts, licence Apache 2.0)
   Historique : API publique Binance (klines) · direct : flux WebSocket Binance (kline).
   Les trades du journal sont dessinés sur le graphique. Couleurs réglables dans Réglages → Graphique. */
(() => {
  "use strict";
  const LIB = "https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js";
  const REST = "https://data-api.binance.vision/api/v3/klines";
  const WS = "wss://data-stream.binance.vision/ws/";
  const CKEY = "pumpr-chart-v1", JKEY = "jarvis-trading-journal-v1", DKEY = "pumpr-draw-v1";
  const TFS = [["1m", "1 min", 60], ["5m", "5 min", 300], ["15m", "15 min", 900], ["1h", "1 h", 3600], ["4h", "4 h", 14400], ["1d", "1 jour", 86400]];
  const PRESETS = [["Pumpr", "#c6ff3d", "#ff4fd8"], ["Classique", "#26a69a", "#ef5350"], ["Vert / rouge", "#3fe0a2", "#ff5d73"], ["Bleu / orange", "#45d9f0", "#ff9a3d"], ["Blanc / gris", "#eef1f8", "#5d6580"]];
  const IND = [
    ["g", "Moyennes mobiles"], ["ma20", "MM 20", "#c6ff3d", "simple"], ["ma50", "MM 50", "#8b5cf6", "simple"], ["ma200", "MM 200", "#eef1f8", "simple"], ["ema9", "EMA 9", "#45d9f0", "exponentielle"], ["ema21", "EMA 21", "#ffc94d", "exponentielle"],
    ["g", "Volatilité et volume"], ["bb", "Bandes de Bollinger", "#ff4fd8", "20, 2"], ["vwap", "VWAP", "#ff9a3d", "prix moyen pondéré"], ["vol", "Volume", "#5d6580", ""],
    ["g", "Sous le graphique"], ["rsi", "RSI", "#c3b0ff", "14"], ["macd", "MACD", "#45d9f0", "12, 26, 9"]
  ];
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const cfg = () => Object.assign({ up: "#c6ff3d", down: "#ff4fd8", line: "#c6ff3d", style: "c", tf: "1h", ind: { ma20: true, vol: true }, trades: true }, ls.get(CKEY, {}) || {});
  const save = p => ls.set(CKEY, Object.assign(cfg(), p));
  const rgba = (hex, a) => { const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");


  /* ---------- outils de dessin ---------- */
  const IC = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const DTOOLS = [
    ["cur", "Curseur · sélectionner et déplacer", IC('<path d="M5 3l14 7-6 2-2 6z"/>')],
    ["h", "Ligne horizontale", IC('<path d="M3 12h18"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>')],
    ["trend", "Ligne de tendance", IC('<path d="M4 19 20 5"/><circle cx="4" cy="19" r="2" fill="currentColor"/><circle cx="20" cy="5" r="2" fill="currentColor"/>')],
    ["rect", "Rectangle (zone)", IC('<rect x="4" y="6" width="16" height="12" rx="1.5"/>')],
    ["fib", "Retracement de Fibonacci", IC('<path d="M4 5h16M4 9.5h16M4 13h16M4 19h16" /><path d="M4 5v14" stroke-dasharray="2 2"/>')],
    ["text", "Texte", IC('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>')],
    ["erase", "Gomme · clique sur un dessin pour l'effacer", IC('<path d="M16 3l5 5-11 11H5l-2-2z"/><path d="M9 9l6 6"/>')]
  ];
  const DCOL = ["#c6ff3d", "#ff4fd8", "#45d9f0", "#ffc94d", "#eef1f8"];
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const TOOLBAR = `<div class="pc-tools" role="toolbar" aria-label="Outils de dessin">${DTOOLS.map(([k, t, i]) => `<button type="button" data-tool="${k}" title="${t}" aria-label="${t}" aria-pressed="${k === "cur"}">${i}</button>`).join("")}<span class="pc-tsep"></span><button type="button" class="pc-tcol" title="Couleur du dessin" aria-label="Couleur du dessin"><i></i></button><button type="button" class="pc-tclr" title="Tout effacer" aria-label="Tout effacer">${IC('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}</button></div>`;

  /* ---------- indicateurs ---------- */
  const sma = (d, n) => d.map((x, i) => i < n - 1 ? null : { time: x.time, value: d.slice(i - n + 1, i + 1).reduce((s, y) => s + y.close, 0) / n }).filter(Boolean);
  const emaArr = (vals, n) => { const k = 2 / (n + 1); let e = null; return vals.map((v, i) => { e = e == null ? v : v * k + e * (1 - k); return i < n - 1 ? null : e; }); };
  const ema = (d, n) => emaArr(d.map(x => x.close), n).map((v, i) => v == null ? null : { time: d[i].time, value: v }).filter(Boolean);
  function bollinger(d, n = 20, m = 2) { const up = [], lo = [], mid = []; d.forEach((x, i) => { if (i < n - 1) return; const w = d.slice(i - n + 1, i + 1).map(y => y.close), a = w.reduce((s, y) => s + y, 0) / n, sd = Math.sqrt(w.reduce((s, y) => s + (y - a) ** 2, 0) / n); mid.push({ time: x.time, value: a }); up.push({ time: x.time, value: a + m * sd }); lo.push({ time: x.time, value: a - m * sd }); }); return { up, lo, mid }; }
  function vwap(d) { let pv = 0, v = 0, day = null; return d.map(x => { const dd = Math.floor(x.time / 86400); if (dd !== day) { day = dd; pv = 0; v = 0; } pv += (x.high + x.low + x.close) / 3 * x.volume; v += x.volume; return { time: x.time, value: v ? pv / v : x.close }; }); }
  function rsi(d, n = 14) { const out = []; let g = 0, l = 0; for (let i = 1; i < d.length; i++) { const ch = d[i].close - d[i - 1].close, up = Math.max(ch, 0), dn = Math.max(-ch, 0); if (i <= n) { g += up / n; l += dn / n; if (i < n) continue; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } out.push({ time: d[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) }); } return out; }
  function macd(d, upC, dnC) { const c = d.map(x => x.close), e12 = emaArr(c, 12), e26 = emaArr(c, 26); const valid = c.map((_, i) => [e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null, i]).filter(x => x[0] != null); const sig = emaArr(valid.map(x => x[0]), 9); const line = [], signal = [], hist = []; valid.forEach(([v, i], k) => { const t = d[i].time; line.push({ time: t, value: v }); if (sig[k] != null) { signal.push({ time: t, value: sig[k] }); hist.push({ time: t, value: v - sig[k], color: v - sig[k] >= 0 ? rgba(upC, .55) : rgba(dnC, .55) }); } }); return { line, signal, hist }; }

  /* ---------- chargement de la bibliothèque ---------- */
  let libP = null;
  const loadLib = () => libP || (libP = new Promise((res, rej) => {
    if (window.LightweightCharts) return res();
    const s = document.createElement("script"); s.src = LIB; s.async = true; s.onload = () => res(); s.onerror = () => { libP = null; rej(new Error("lib")); }; document.head.appendChild(s);
  }));

  /* ---------- état ---------- */
  let st = null; /* { box, sym, chart, series, data, ws, timer, ... } */

  function unmount() {
    if (!st) return;
    try { st.ws && st.ws.close(); } catch (e) {}
    clearInterval(st.timer); clearTimeout(st.retry); cancelAnimationFrame(st.raf); if (st.onKey) document.removeEventListener("keydown", st.onKey);
    try { st.ro && st.ro.disconnect(); } catch (e) {}
    try { st.chart && st.chart.remove(); } catch (e) {}
    st.dead = true; st = null; sub("");
  }

  const sub = t => { const p = document.querySelector("#m-chart .ch p"); if (p) { if (!p.dataset.orig) p.dataset.orig = p.textContent; p.textContent = t || p.dataset.orig; } };
  async function mount(box, sym) {
    unmount(); sub("Cours Binance en direct · tes trades dessus");
    const me = st = { box, sym, data: [] };
    const c = cfg();
    box.innerHTML = `<div class="pc">
      <div class="pc-bar">
        <div class="pc-seg" data-g="tf" role="group" aria-label="Unité de temps">${TFS.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${c.tf === k}">${l}</button>`).join("")}</div>
        <div class="pc-cd" title="Temps avant la clôture de la bougie"><span>Clôture</span><b class="pc-cdv">--:--</b><i><s></s></i></div>
        <span class="pc-sp"></span>
        <div class="pc-seg" data-g="st" role="group" aria-label="Style"><button type="button" data-v="c" aria-pressed="${c.style === "c"}">Bougies</button><button type="button" data-v="l" aria-pressed="${c.style === "l"}">Courbe</button></div>
        <div class="pc-ind"><button type="button" class="pc-btn pc-indb" aria-expanded="false">Indicateurs <em></em></button>
          <div class="pc-menu" hidden>${IND.map(x => x[0] === "g" ? `<div class="pc-g">${x[1]}</div>` : `<label><input type="checkbox" data-ind="${x[0]}" ${c.ind[x[0]] ? "checked" : ""}><i style="background:${x[2]}"></i>${x[1]}<small>${x[3]}</small></label>`).join("")}</div></div>
        <button type="button" class="pc-btn pc-mk" aria-pressed="${c.trades}">Mes trades</button>
      </div>
      <div class="pc-area"><div class="pc-legend"></div><div class="pc-chart"></div><canvas class="pc-draw"></canvas>${TOOLBAR}<div class="pc-msg">Chargement du graphique…</div></div>
      <div class="pc-foot">Cours Binance en direct · <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a></div>
    </div>`;
    const q = s => box.querySelector(s);
    try { await loadLib(); } catch (e) { if (st === me) q(".pc-msg").textContent = "Le graphique n'a pas pu se charger. Vérifie ta connexion, puis recharge la page."; return; }
    if (st !== me) return;
    q(".pc-msg").hidden = true;
    const L = window.LightweightCharts;
    const nf = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    const fmtP = p => { const d = p >= 1000 ? 2 : p >= 1 ? 3 : p >= 0.01 ? 5 : 8; return p.toLocaleString("fr-FR", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }); };
    const chart = me.chart = L.createChart(q(".pc-chart"), {
      autoSize: true,
      layout: { background: { type: "solid", color: "#0a0c14" }, textColor: "#8d95ad", fontFamily: "DM Mono, ui-monospace, monospace", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,255,255,.04)" }, horzLines: { color: "rgba(255,255,255,.05)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,.08)" },
      timeScale: { borderColor: "rgba(255,255,255,.08)", timeVisible: true, secondsVisible: false, rightOffset: 5 },
      crosshair: { mode: 0, vertLine: { color: rgba(c.up, .35), labelBackgroundColor: "#1a1f30" }, horzLine: { color: rgba(c.up, .35), labelBackgroundColor: "#1a1f30" } },
      localization: { locale: "fr-FR", priceFormatter: fmtP }
    });
    const candles = chart.addCandlestickSeries({});
    const area = chart.addAreaSeries({ lineWidth: 2 });
    const ov = (color, extra) => chart.addLineSeries(Object.assign({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false }, extra || {}));
    const S = me.S = {
      ma20: [ov("#c6ff3d")], ma50: [ov("#8b5cf6")], ma200: [ov("#eef1f8")], ema9: [ov("#45d9f0")], ema21: [ov("#ffc94d")],
      bb: [ov("rgba(255,79,216,.8)"), ov("rgba(255,79,216,.8)"), ov("rgba(255,79,216,.45)", { lineStyle: 2 })],
      vwap: [ov("#ff9a3d", { lineWidth: 2 })],
      vol: [chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false, visible: false })],
      rsi: [ov("#c3b0ff", { priceScaleId: "rsi", lineWidth: 2, lastValueVisible: true, priceFormat: { type: "price", precision: 1, minMove: 0.1 } })],
      macd: [chart.addHistogramSeries({ priceScaleId: "macd", priceLineVisible: false, lastValueVisible: false, visible: false }), ov("#45d9f0", { priceScaleId: "macd" }), ov("#ffc94d", { priceScaleId: "macd" })]
    };
    S.rsi[0].createPriceLine({ price: 70, color: "rgba(255,255,255,.25)", lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
    S.rsi[0].createPriceLine({ price: 30, color: "rgba(255,255,255,.25)", lineStyle: 2, lineWidth: 1, axisLabelVisible: false });

    const colors = () => { const k = cfg(); candles.applyOptions({ upColor: k.up, downColor: k.down, borderUpColor: k.up, borderDownColor: k.down, wickUpColor: rgba(k.up, .75), wickDownColor: rgba(k.down, .75), priceLineColor: rgba(k.up, .6) }); area.applyOptions({ lineColor: k.line, topColor: rgba(k.line, .22), bottomColor: rgba(k.line, 0), priceLineColor: rgba(k.line, .6) }); };
    me.recolor = () => { colors(); fill(); markers(); };
    const layoutPanes = () => {
      const on = cfg().ind, below = ["rsi", "macd"].filter(k => on[k]), share = 0.2;
      const mainBottom = below.length ? below.length * share + 0.03 : 0.04;
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.06, bottom: mainBottom } });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 1 - mainBottom - 0.16, bottom: mainBottom }, visible: false });
      below.forEach((k, i) => chart.priceScale(k).applyOptions({ scaleMargins: { top: 1 - share * (below.length - i) + 0.015, bottom: share * (below.length - i - 1) + 0.01 }, borderColor: "rgba(255,255,255,.08)" }));
    };
    const applyInd = () => { const on = cfg().ind; Object.entries(S).forEach(([k, arr]) => arr.forEach(s => s.applyOptions({ visible: !!on[k] }))); layoutPanes(); q(".pc-indb em").textContent = Object.values(on).filter(Boolean).length || ""; };
    const volColor = x => x.close >= x.open ? rgba(cfg().up, .28) : rgba(cfg().down, .28);
    function fill() {
      const d = me.data, k = cfg(); if (!d.length) return;
      S.ma20[0].setData(sma(d, 20)); S.ma50[0].setData(sma(d, 50)); S.ma200[0].setData(sma(d, 200)); S.ema9[0].setData(ema(d, 9)); S.ema21[0].setData(ema(d, 21));
      const b = bollinger(d); S.bb[0].setData(b.up); S.bb[1].setData(b.lo); S.bb[2].setData(b.mid);
      S.vwap[0].setData(vwap(d)); S.vol[0].setData(d.map(x => ({ time: x.time, value: x.volume, color: volColor(x) })));
      S.rsi[0].setData(rsi(d)); const m = macd(d, k.up, k.down); S.macd[0].setData(m.hist); S.macd[1].setData(m.line); S.macd[2].setData(m.signal);
    }
    const applyStyle = () => { const s = cfg().style; candles.applyOptions({ visible: s === "c" }); area.applyOptions({ visible: s === "l" }); markers(); };

    /* trades du journal sur le graphique (date du trade → première bougie de ce jour) */
    function markers() {
      const k = cfg(), d = me.data; const target = k.style === "c" ? candles : area, other = k.style === "c" ? area : candles; other.setMarkers([]);
      if (!k.trades || !d.length) return target.setMarkers([]);
      const list = (ls.get(JKEY, []) || []).filter(t => String(t.symbol || "").toUpperCase().replace(/USDT?$/, "") === me.sym);
      const t0 = d[0].time, out = [];
      list.forEach(t => {
        const day = Date.parse(String(t.date) + "T00:00:00Z") / 1000; if (!(day >= t0 - 86400)) return;
        const bar = d.find(x => x.time >= day) || null; if (!bar || bar.time > day + 86400) return;
        const ex = t.exit === "" || t.exit == null ? null : +t.exit, pnl = ex == null ? null : (ex - +t.entry) * +t.quantity * (t.side === "short" ? -1 : 1) - (+t.fees || 0);
        out.push({ time: bar.time, position: t.side === "short" ? "aboveBar" : "belowBar", shape: t.side === "short" ? "arrowDown" : "arrowUp",
          color: pnl == null ? "#eef1f8" : pnl >= 0 ? "#3fe0a2" : "#ff5d73",
          text: (t.side === "short" ? "Short " : "Long ") + (pnl == null ? "ouvert" : (pnl >= 0 ? "+" : "−") + Math.abs(pnl).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " $") });
      });
      target.setMarkers(out.sort((a, b) => a.time - b.time));
    }
    me.markers = markers;

    const legend = b => { if (!b) return; q(".pc-legend").innerHTML = `O <b>${fmtP(b.open)}</b> &nbsp;H <b>${fmtP(b.high)}</b> &nbsp;B <b>${fmtP(b.low)}</b> &nbsp;F <b class="${b.close >= b.open ? "up" : "down"}">${fmtP(b.close)}</b>`; };
    chart.subscribeCrosshairMove(p => { const b = p && p.seriesData && p.seriesData.get(candles); legend(b && b.open != null ? b : me.data.at(-1)); });

    const stepOf = tf => (TFS.find(x => x[0] === tf) || TFS[3])[2];
    const countdown = () => { const step = stepOf(cfg().tf), now = Date.now() / 1000, end = Math.floor(now / step) * step + step, left = Math.max(0, Math.ceil(end - now)); const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60; q(".pc-cdv").textContent = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; q(".pc-cd s").style.width = ((1 - left / step) * 100).toFixed(1) + "%"; };
    me.timer = setInterval(countdown, 1000);

    async function load() {
      const tf = cfg().tf, pair = me.sym + "USDT";
      try { me.ws && me.ws.close(); } catch (e) {}
      q(".pc-msg").hidden = false; q(".pc-msg").textContent = "Chargement des cours…";
      try {
        const r = await fetch(`${REST}?symbol=${pair}&interval=${tf}&limit=600`); if (!r.ok) throw new Error(r.status);
        const raw = await r.json(); if (st !== me) return;
        me.data = raw.map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
      } catch (e) { if (st === me) q(".pc-msg").textContent = "Cours indisponibles pour le moment. Nouvel essai dans quelques secondes…"; me.retry = setTimeout(() => st === me && load(), 8000); return; }
      q(".pc-msg").hidden = true;
      candles.setData(me.data); area.setData(me.data.map(x => ({ time: x.time, value: x.close })));
      colors(); fill(); applyInd(); applyStyle(); legend(me.data.at(-1)); countdown();
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, me.data.length - 160), to: me.data.length + 4 });
      live(pair.toLowerCase(), tf);
    }
    function live(pair, tf) {
      if (document.hidden) return;
      let ws; try { ws = me.ws = new WebSocket(`${WS}${pair}@kline_${tf}`); } catch (e) { return; }
      ws.onmessage = ev => {
        if (st !== me) return; let k; try { k = JSON.parse(ev.data).k; } catch (e) { return; } if (!k) return;
        const bar = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }, d = me.data, last = d.at(-1);
        if (!last || bar.time > last.time) d.push(bar); else if (bar.time === last.time) d[d.length - 1] = bar; else return;
        candles.update(bar); area.update({ time: bar.time, value: bar.close }); S.vol[0].update({ time: bar.time, value: bar.volume, color: volColor(bar) });
        legend(bar); if (k.x) fill();
      };
      ws.onclose = () => { if (st === me && !document.hidden) me.retry = setTimeout(() => st === me && live(pair, tf), 3000); };
    }
    me.resume = () => { if (!me.ws || me.ws.readyState > 1) load(); };


    /* ---------- dessins (enregistrés par crypto, en temps + prix) ---------- */
    const dcv = q(".pc-draw"), dx = dcv.getContext("2d"), areaEl = q(".pc-area");
    const allD = () => ls.get(DKEY, {}) || {};
    let shapes = (allD()[me.sym] || []).slice(), tool = "cur", sel = -1, draft = null, drag = null, colI = 0, dirty = true;
    const saveD = () => { const a = allD(); a[me.sym] = shapes; ls.set(DKEY, a); dirty = true; };
    const step = () => stepOf(cfg().tf);
    const ser = () => cfg().style === "c" ? candles : area;
    const xOf = t => { const d = me.data; if (!d.length) return null; const lg = (t - d[0].time) / step(); return chart.timeScale().logicalToCoordinate(lg); };
    const tOf = x => { const d = me.data; if (!d.length) return null; const lg = chart.timeScale().coordinateToLogical(x); return lg == null ? null : d[0].time + lg * step(); };
    const yOf = p => ser().priceToCoordinate(p);
    const pOf = y => ser().coordinateToPrice(y);
    const pt = e => { const r = areaEl.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; return { x, y, t: tOf(x), p: pOf(y) }; };
    const setTool = k => { tool = k; draft = null; areaEl.classList.toggle("drawing", k !== "cur"); areaEl.dataset.tool = k; q(".pc-tools").querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === k))); dirty = true; };
    const col = () => DCOL[colI % DCOL.length];
    q(".pc-tcol i").style.background = col();
    const width = () => areaEl.clientWidth - (chart.priceScale("right").width() || 0);
    const near = (px, py, ax, ay, bx, by) => { const l2 = (bx - ax) ** 2 + (by - ay) ** 2; let k = l2 ? ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2 : 0; k = Math.max(0, Math.min(1, k)); return Math.hypot(px - (ax + k * (bx - ax)), py - (ay + k * (by - ay))); };
    function geo(s) {
      const a = { x: xOf(s.a.t), y: yOf(s.a.p) }, b = s.b ? { x: xOf(s.b.t), y: yOf(s.b.p) } : null;
      return { a, b };
    }
    function hit(x, y) {
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i], g = geo(s); if (g.a.y == null) continue;
        if (s.k === "h" && Math.abs(y - g.a.y) < 7) return i;
        if (!g.b || g.a.x == null || g.b.x == null) { if (s.k === "text" && g.a.x != null && x >= g.a.x - 4 && x <= g.a.x + (s.w || 80) && Math.abs(y - g.a.y) < 14) return i; continue; }
        if (s.k === "trend" && near(x, y, g.a.x, g.a.y, g.b.x, g.b.y) < 7) return i;
        if (s.k === "rect") { const x1 = Math.min(g.a.x, g.b.x), x2 = Math.max(g.a.x, g.b.x), y1 = Math.min(g.a.y, g.b.y), y2 = Math.max(g.a.y, g.b.y); if (x >= x1 - 5 && x <= x2 + 5 && y >= y1 - 5 && y <= y2 + 5) return i; }
        if (s.k === "fib") { const x1 = Math.min(g.a.x, g.b.x); if (x >= x1 - 5 && FIB.some(f => Math.abs(y - (g.b.y + (g.a.y - g.b.y) * f)) < 6)) return i; }
      }
      return -1;
    }
    function paint() {
      const D = Math.min(devicePixelRatio || 1, 2), w = areaEl.clientWidth, h = areaEl.clientHeight;
      if (dcv.width !== Math.round(w * D) || dcv.height !== Math.round(h * D)) { dcv.width = Math.round(w * D); dcv.height = Math.round(h * D); dcv.style.width = w + "px"; dcv.style.height = h + "px"; }
      dx.setTransform(D, 0, 0, D, 0, 0); dx.clearRect(0, 0, w, h);
      const W = width(); dx.save(); dx.beginPath(); dx.rect(0, 0, W, h); dx.clip();
      const list = draft ? shapes.concat([draft]) : shapes;
      list.forEach((s, i) => {
        const g = geo(s), c = s.c || "#c6ff3d", on = i === sel; if (g.a.y == null) return;
        dx.strokeStyle = c; dx.fillStyle = c; dx.lineWidth = on ? 2.5 : 1.6; dx.setLineDash([]); dx.font = "600 11px DM Mono, ui-monospace, monospace";
        const handle = (x, y) => { if (!on || x == null) return; dx.save(); dx.fillStyle = "#0a0c14"; dx.beginPath(); dx.arc(x, y, 4.5, 0, 7); dx.fill(); dx.stroke(); dx.restore(); };
        if (s.k === "h") { dx.beginPath(); dx.moveTo(0, g.a.y); dx.lineTo(W, g.a.y); dx.stroke(); const lb = fmtP(s.a.p); const tw = dx.measureText(lb).width + 10; dx.fillStyle = c; dx.fillRect(W - tw - 2, g.a.y - 9, tw, 18); dx.fillStyle = "#06070c"; dx.fillText(lb, W - tw + 3, g.a.y + 4); return; }
        if (s.k === "text") { if (g.a.x == null) return; dx.font = "700 13px Manrope, system-ui, sans-serif"; const tw = dx.measureText(s.txt).width; s.w = tw + 12; dx.fillStyle = "rgba(10,12,20,.85)"; dx.fillRect(g.a.x - 6, g.a.y - 12, tw + 12, 24); dx.strokeStyle = c; dx.strokeRect(g.a.x - 6, g.a.y - 12, tw + 12, 24); dx.fillStyle = c; dx.fillText(s.txt, g.a.x, g.a.y + 5); return; }
        if (!g.b || g.a.x == null || g.b.x == null || g.b.y == null) return;
        if (s.k === "trend") { dx.beginPath(); dx.moveTo(g.a.x, g.a.y); dx.lineTo(g.b.x, g.b.y); dx.stroke(); }
        if (s.k === "rect") { dx.globalAlpha = .13; dx.fillRect(Math.min(g.a.x, g.b.x), Math.min(g.a.y, g.b.y), Math.abs(g.b.x - g.a.x), Math.abs(g.b.y - g.a.y)); dx.globalAlpha = 1; dx.strokeRect(Math.min(g.a.x, g.b.x), Math.min(g.a.y, g.b.y), Math.abs(g.b.x - g.a.x), Math.abs(g.b.y - g.a.y)); }
        if (s.k === "fib") {
          const x1 = Math.min(g.a.x, g.b.x);
          FIB.forEach(f => { const y = g.b.y + (g.a.y - g.b.y) * f, pr = s.b.p + (s.a.p - s.b.p) * f; dx.globalAlpha = f === 0.5 || f === 0.618 ? 1 : .7; dx.beginPath(); dx.moveTo(x1, y); dx.lineTo(W, y); dx.stroke(); dx.fillText(`${f} · ${fmtP(pr)}`, x1 + 4, y - 4); });
          dx.globalAlpha = .07; dx.fillRect(x1, Math.min(g.a.y, g.b.y), W - x1, Math.abs(g.a.y - g.b.y)); dx.globalAlpha = 1;
          dx.setLineDash([4, 4]); dx.beginPath(); dx.moveTo(g.a.x, g.a.y); dx.lineTo(g.b.x, g.b.y); dx.stroke(); dx.setLineDash([]);
        }
        handle(g.a.x, g.a.y); handle(g.b.x, g.b.y);
      });
      dx.restore();
    }
    const loop = () => { if (st !== me) return; paint(); me.raf = requestAnimationFrame(loop); };
    me.raf = requestAnimationFrame(loop);
    me.reloadDraw = () => { shapes = (allD()[me.sym] || []).slice(); sel = -1; };

    /* souris et doigt */
    const commit = s => { shapes.push(s); saveD(); sel = shapes.length - 1; setTool("cur"); };
    function textInput(p) {
      const inp = document.createElement("input"); inp.className = "pc-tin"; inp.maxLength = 40; inp.placeholder = "Ta note…"; inp.style.left = p.x + "px"; inp.style.top = (p.y - 14) + "px";
      areaEl.appendChild(inp); setTimeout(() => inp.focus(), 60); setTimeout(() => inp.focus(), 220);
      let fin = false; const done = ok => { if (fin) return; fin = true; const v = inp.value.trim(); inp.remove(); if (ok && v) commit({ k: "text", a: { t: p.t, p: p.p }, txt: v, c: col() }); else setTool("cur"); };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") done(true); else if (e.key === "Escape") done(false); e.stopPropagation(); });
      setTimeout(() => inp.addEventListener("blur", () => done(true)), 400);
    }
    dcv.addEventListener("pointerdown", e => {
      if (tool === "cur") return; e.preventDefault(); const p = pt(e); if (p.t == null || p.p == null) return;
      if (tool === "erase") { const i = hit(p.x, p.y); if (i >= 0) { shapes.splice(i, 1); sel = -1; saveD(); } return; }
      if (tool === "h") return commit({ k: "h", a: { t: p.t, p: p.p }, c: col() });
      if (tool === "text") { textInput(p); return; }
      if (draft) { draft.b = { t: p.t, p: p.p }; const d = draft; draft = null; return commit(d); }
      draft = { k: tool, a: { t: p.t, p: p.p }, b: { t: p.t, p: p.p }, c: col() }; draft.x0 = p.x; draft.y0 = p.y;
      try { dcv.setPointerCapture(e.pointerId); } catch (x) {}
    });
    dcv.addEventListener("pointermove", e => { if (!draft) return; const p = pt(e); if (p.t != null && p.p != null) draft.b = { t: p.t, p: p.p }; });
    dcv.addEventListener("pointerup", e => { if (!draft) return; const p = pt(e); if (Math.hypot(p.x - draft.x0, p.y - draft.y0) < 6) return; /* clic simple : on attend le 2e point */ const d = draft; draft = null; delete d.x0; delete d.y0; commit(d); });
    /* sélection et déplacement (mode curseur) : interception avant le graphique */
    areaEl.addEventListener("pointerdown", e => {
      if (tool !== "cur" || e.target.closest(".pc-tools,.pc-tin")) return; const p = pt(e); const i = hit(p.x, p.y);
      sel = i; if (i < 0) return;
      e.stopPropagation(); e.preventDefault();
      const s = shapes[i]; drag = { i, p0: p, a: Object.assign({}, s.a), b: s.b ? Object.assign({}, s.b) : null, id: e.pointerId };
      try { areaEl.setPointerCapture(e.pointerId); } catch (x) {}
    }, true);
    areaEl.addEventListener("pointermove", e => {
      if (tool !== "cur" || e.target.closest(".pc-tools")) return; const p = pt(e);
      if (!drag) { areaEl.classList.toggle("over", hit(p.x, p.y) >= 0); return; }
      e.stopPropagation(); if (p.t == null || p.p == null || drag.p0.t == null) return;
      const dt = p.t - drag.p0.t, dp = p.p - drag.p0.p, s = shapes[drag.i];
      s.a = { t: drag.a.t + (s.k === "h" ? 0 : dt), p: drag.a.p + dp }; if (drag.b) s.b = { t: drag.b.t + dt, p: drag.b.p + dp };
    }, true);
    const endDrag = () => { if (drag) { drag = null; saveD(); } };
    areaEl.addEventListener("pointerup", endDrag, true); areaEl.addEventListener("pointercancel", endDrag, true);
    q(".pc-tools").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tool) return setTool(tool === b.dataset.tool && b.dataset.tool !== "cur" ? "cur" : b.dataset.tool);
      if (b.classList.contains("pc-tcol")) { colI++; q(".pc-tcol i").style.background = col(); if (sel >= 0 && shapes[sel]) { shapes[sel].c = col(); saveD(); } return; }
      if (b.classList.contains("pc-tclr")) { if (!shapes.length) return; if (b.dataset.sure) { shapes = []; sel = -1; saveD(); delete b.dataset.sure; b.classList.remove("sure"); } else { b.dataset.sure = 1; b.classList.add("sure"); setTimeout(() => { delete b.dataset.sure; b.classList.remove("sure"); }, 2500); } }
    });
    me.onKey = e => {
      if (st !== me || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel >= 0) { shapes.splice(sel, 1); sel = -1; saveD(); e.preventDefault(); }
      else if (e.key === "Escape" && (tool !== "cur" || draft)) { setTool("cur"); }
    };
    document.addEventListener("keydown", me.onKey);

    /* commandes */
    box.querySelector(".pc-bar").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const g = b.closest("[data-g]");
      if (g) { g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); if (g.dataset.g === "tf") { save({ tf: b.dataset.v }); load(); } else { save({ style: b.dataset.v }); applyStyle(); } return; }
      if (b.classList.contains("pc-mk")) { const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); save({ trades: on }); markers(); return; }
      if (b.classList.contains("pc-indb")) { e.stopPropagation(); const m = q(".pc-menu"); m.hidden = !m.hidden; b.setAttribute("aria-expanded", String(!m.hidden)); }
    });
    q(".pc-menu").addEventListener("change", e => { const k = e.target.dataset.ind; if (!k) return; const ind = Object.assign({}, cfg().ind, { [k]: e.target.checked }); save({ ind }); applyInd(); });
    document.addEventListener("click", e => { if (st !== me) return; const m = q(".pc-menu"); if (m && !m.hidden && !e.target.closest(".pc-ind")) { m.hidden = true; q(".pc-indb").setAttribute("aria-expanded", "false"); } });
    load();
  }

  document.addEventListener("visibilitychange", () => { if (!st) return; if (document.hidden) { try { st.ws && st.ws.close(); } catch (e) {} } else if (st.resume) st.resume(); });
  window.addEventListener("storage", e => { if (st && e.key === JKEY && st.markers) st.markers(); });

  /* ---------- Réglages → Graphique ---------- */
  function mountSettings() {
    const db = document.querySelector("#dSet .db"); if (!db || document.getElementById("pcSet")) return;
    const sec = document.createElement("div"); sec.className = "sec"; sec.id = "pcSet";
    const draw = () => {
      const c = cfg();
      sec.innerHTML = `<h3>Graphique crypto</h3>
        <div class="pc-pre">${PRESETS.map(([n, u, d]) => `<button type="button" data-pre="${n}" aria-pressed="${c.up === u && c.down === d}" title="${esc(n)}"><i style="background:${u}"></i><i style="background:${d}"></i><span>${esc(n)}</span></button>`).join("")}</div>
        <div class="pc-cols">
          <label>Bougie en hausse<input type="color" data-c="up" value="${c.up}"></label>
          <label>Bougie en baisse<input type="color" data-c="down" value="${c.down}"></label>
          <label>Courbe<input type="color" data-c="line" value="${c.line}"></label>
        </div>
        <div class="line"><span>Style par défaut</span><div class="pc-seg pc-seg-sm" role="group" aria-label="Style par défaut"><button type="button" data-sty="c" aria-pressed="${c.style === "c"}">Bougies</button><button type="button" data-sty="l" aria-pressed="${c.style === "l"}">Courbe</button></div></div>`;
    };
    const apply = p => { save(p); draw(); if (st && st.recolor) { st.recolor(); } if (p.style && st && st.box) { st.box.querySelectorAll('[data-g="st"] button').forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === p.style))); } };
    sec.addEventListener("click", e => {
      const p = e.target.closest("[data-pre]"); if (p) { const x = PRESETS.find(z => z[0] === p.dataset.pre); apply({ up: x[1], down: x[2], line: x[1] }); return; }
      const s = e.target.closest("[data-sty]"); if (s) { apply({ style: s.dataset.sty }); if (st && st.box) { const b = st.box.querySelector(`[data-g="st"] [data-v="${s.dataset.sty}"]`); if (b) b.click(); } }
    });
    sec.addEventListener("input", e => { const k = e.target.dataset.c; if (!k) return; save({ [k]: e.target.value }); if (st && st.recolor) st.recolor(); });
    sec.addEventListener("change", e => { if (e.target.dataset.c) draw(); });
    draw();
    const mods = [...db.querySelectorAll(".sec")].find(x => /Modules/.test(x.textContent));
    db.insertBefore(sec, mods || null);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountSettings); else mountSettings();

  window.PumprChart = { mount, unmount };
})();
