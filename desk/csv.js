/* Pumpr · import de trades depuis un fichier CSV (Binance, Bybit ou tableur).
   Les lignes « ordres exécutés » (achat / vente) sont regroupées en trades :
   chaque vente ferme les achats précédents du même actif (premier entré, premier sorti).
   Les trades obtenus passent par l'import existant du journal (dédoublonnage par identifiant). */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const QUOTES = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "DAI", "EUR", "USD", "TRY", "BRL"];

  /* ---------- lecture du CSV ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const delim = [",", ";", "\t"].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(v => v.trim() !== "")) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(v => v.trim() !== "")) rows.push(row);
    return rows.map(r => r.map(v => v.trim()));
  }
  const num = v => {
    if (v == null) return NaN;
    let s = String(v).replace(/\s/g, "").replace(/[A-Za-z]+$/, "");
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
    return parseFloat(s);
  };
  const unit = v => (String(v || "").replace(/[\d.,\s-]/g, "").toUpperCase());
  function toISO(v) {
    const s = String(v || "").trim(); let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    if (/^\d{10,13}$/.test(s)) { const d = new Date(s.length === 10 ? +s * 1000 : +s); return d.toISOString().slice(0, 10); }
    const d = new Date(s); return isNaN(d) ? "" : d.toISOString().slice(0, 10);
  }
  const baseOf = pair => {
    let p = String(pair || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (const q of QUOTES) if (p.length > q.length && p.endsWith(q)) return { base: p.slice(0, -q.length), quote: q };
    return { base: p, quote: "" };
  };
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

  /* ---------- reconnaissance des colonnes ---------- */
  const FIELDS = [
    ["date", "Date", true, /date|time|heure|created|filled/i],
    ["pair", "Actif ou paire", true, /pair|symbol|market|actif|paire|contract|coin/i],
    ["side", "Sens (achat / vente)", true, /side|sens|direction|type|buy.?sell/i],
    ["price", "Prix (d'entrée)", true, /^price$|avg.?price|filled.?price|exec.*price|prix|entry/i],
    ["qty", "Quantité", true, /executed|filled|qty|quantity|quantit|amount|size|volume/i],
    ["exit", "Prix de sortie (si le fichier contient déjà des trades complets)", false, /exit|sortie|close.?price/i],
    ["fee", "Frais", false, /fee|frais|commission/i]
  ];
  function guess(headers) {
    const map = {}, used = new Set();
    FIELDS.forEach(([k, , , re]) => {
      let i = headers.findIndex((h, j) => !used.has(j) && re.test(h));
      if (k === "qty") { const ex = headers.findIndex((h, j) => !used.has(j) && /executed|filled.?qty|quantit/i.test(h)); if (ex >= 0) i = ex; }
      if (i >= 0) { map[k] = i; used.add(i); }
    });
    return map;
  }
  const sideOf = v => { const s = String(v || "").toLowerCase(); if (/buy|achat|long|bid/.test(s)) return "buy"; if (/sell|vente|short|ask/.test(s)) return "sell"; return ""; };

  /* ---------- conversion en trades ---------- */
  function build(rows, map, source) {
    const out = [], warn = [];
    const get = (r, k) => (map[k] == null ? "" : r[map[k]]);
    const data = rows.map((r, i) => ({ i, date: toISO(get(r, "date")), raw: get(r, "date"), pair: get(r, "pair"), side: sideOf(get(r, "side")), price: num(get(r, "price")), qty: num(get(r, "qty")), exit: num(get(r, "exit")), fee: num(get(r, "fee")), feeUnit: unit(get(r, "fee")) }))
      .filter(r => r.date && r.pair && r.price > 0 && r.qty > 0);
    const skipped = rows.length - data.length;
    if (skipped) warn.push(`${skipped} ligne(s) ignorée(s) : date, actif, prix ou quantité illisible.`);
    if (map.exit != null) {
      data.forEach(r => {
        const { base } = baseOf(r.pair);
        out.push({ id: "csv-" + hash(source + r.raw + r.pair + r.price + r.qty + r.exit), date: r.date, symbol: base, side: r.side === "sell" ? "short" : "long", quantity: String(r.qty), entry: String(r.price), exit: isNaN(r.exit) ? "" : String(r.exit), fees: isNaN(r.fee) ? 0 : r.fee, stop: "", setup: "", emotion: "", plan: "", notes: "Importé depuis " + source });
      });
      return { trades: out, warn };
    }
    const sorted = data.slice().sort((a, b) => String(a.raw).localeCompare(String(b.raw)) || a.i - b.i);
    const books = {}; let orphan = 0, foreignFee = false;
    sorted.forEach(r => {
      if (!r.side) return;
      const { base, quote } = baseOf(r.pair);
      const fee = !isNaN(r.fee) && (!r.feeUnit || r.feeUnit === quote) ? r.fee : 0;
      if (!isNaN(r.fee) && r.fee > 0 && r.feeUnit && r.feeUnit !== quote) foreignFee = true;
      const b = books[base] || (books[base] = { lots: [], quote });
      if (r.side === "buy") { b.lots.push({ qty: r.qty, price: r.price, fee, date: r.date }); return; }
      let left = r.qty, cost = 0, got = 0, buyFee = 0, d0 = r.date;
      while (left > 1e-12 && b.lots.length) {
        const l = b.lots[0], take = Math.min(left, l.qty);
        cost += take * l.price; buyFee += l.fee * (take / l.qty); got += take; d0 = d0 < l.date ? d0 : l.date;
        l.fee -= l.fee * (take / l.qty); l.qty -= take; left -= take;
        if (l.qty <= 1e-12) b.lots.shift();
      }
      if (left > 1e-12) orphan++;
      if (got > 0) {
        const entry = cost / got;
        out.push({ id: "csv-" + hash(source + base + r.raw + r.price + r.qty), date: r.date, symbol: base, side: "long", quantity: String(+got.toPrecision(10)), entry: String(+entry.toPrecision(10)), exit: String(r.price), fees: +(buyFee + fee * (got / r.qty)).toFixed(6), stop: "", setup: "", emotion: "", plan: "", notes: `Importé depuis ${source} · ouvert le ${d0}` });
      }
    });
    Object.entries(books).forEach(([base, b]) => {
      const q = b.lots.reduce((s, l) => s + l.qty, 0); if (q <= 1e-12) return;
      const cost = b.lots.reduce((s, l) => s + l.qty * l.price, 0), fee = b.lots.reduce((s, l) => s + l.fee, 0);
      out.push({ id: "csv-open-" + hash(source + base + q + cost), date: b.lots[0].date, symbol: base, side: "long", quantity: String(+q.toPrecision(10)), entry: String(+(cost / q).toPrecision(10)), exit: "", fees: +fee.toFixed(6), stop: "", setup: "", emotion: "", plan: "", notes: `Importé depuis ${source} · position encore ouverte` });
    });
    if (orphan) warn.push(`${orphan} vente(s) sans achat avant dans le fichier : exporte une période plus longue pour les compter.`);
    if (foreignFee) warn.push("Certains frais sont payés dans une autre crypto (ex. BNB) : ils ne sont pas comptés.");
    return { trades: out, warn };
  }

  /* ---------- fenêtre d'import ---------- */
  let rows = [], headers = [], map = {}, source = "CSV";
  function open() {
    let m = $("#csvModal");
    if (!m) {
      m = document.createElement("div"); m.id = "csvModal"; m.className = "csv-modal pz"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "csvT");
      document.body.appendChild(m);
      m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-csv-close]")) close(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && m.classList.contains("open")) close(); });
    }
    step1(); m.classList.add("open"); document.body.classList.add("csv-open");
  }
  function close() { const m = $("#csvModal"); if (m) m.classList.remove("open"); document.body.classList.remove("csv-open"); }
  const shell = (body, foot) => { $("#csvModal").innerHTML = `<div class="csv-box"><div class="csv-h"><div><h2 id="csvT">Importer des trades</h2><p>Depuis Binance, Bybit ou un tableur (fichier .csv)</p></div><button class="ibtn" type="button" data-csv-close aria-label="Fermer">✕</button></div><div class="csv-b">${body}</div><div class="csv-f">${foot}</div></div>`; };

  function step1(err) {
    shell(`<label class="csv-drop" id="csvDrop"><input type="file" id="csvFile" accept=".csv,text/csv,text/plain" hidden>
        <b>Choisis ton fichier CSV</b><span>ou glisse-le ici</span></label>
      ${err ? `<p class="csv-err" role="alert">${esc(err)}</p>` : ""}
      <details class="csv-help"><summary>Comment récupérer mon fichier ?</summary>
        <p><b>Binance</b> : Ordres → Historique des transactions (Trade History) → Exporter → format CSV.</p>
        <p><b>Bybit</b> : Ordres → Historique des transactions → Exporter.</p>
        <p><b>Tableur</b> : une ligne par ordre avec date, actif, sens (achat ou vente), prix et quantité. Ou une ligne par trade avec un prix d'entrée et un prix de sortie.</p>
        <p>Pumpr ne se connecte jamais à ton compte : le fichier est lu dans ton navigateur et n'est envoyé nulle part.</p></details>`,
      `<button class="btn" type="button" data-csv-close>Annuler</button>`);
    const inp = $("#csvFile"), drop = $("#csvDrop");
    const read = async f => {
      if (!f) return;
      if (f.size > 5e6) return step1("Fichier trop gros (5 Mo maximum).");
      if (/\.xlsx?$/i.test(f.name)) return step1("C'est un fichier Excel : exporte-le plutôt au format CSV.");
      const all = parseCSV(await f.text());
      if (all.length < 2) return step1("Ce fichier ne contient pas de lignes de trades.");
      headers = all[0]; rows = all.slice(1, 5001); map = guess(headers);
      source = /binance/i.test(f.name) || headers.some(h => /Date\(UTC\)/i.test(h)) ? "Binance" : /bybit/i.test(f.name) ? "Bybit" : "CSV";
      step2();
    };
    inp.addEventListener("change", () => read(inp.files[0]));
    ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("hover"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("hover"); }));
    drop.addEventListener("drop", e => read(e.dataTransfer.files[0]));
  }

  function step2() {
    const sel = (k, req) => `<select class="field" data-k="${k}">${req ? "" : '<option value="">— aucune —</option>'}${!req || map[k] == null ? (req ? '<option value="">— choisir —</option>' : "") : ""}${headers.map((h, i) => `<option value="${i}" ${map[k] === i ? "selected" : ""}>${esc(h || "Colonne " + (i + 1))}</option>`).join("")}</select>`;
    const missing = FIELDS.filter(f => f[2] && map[f[0]] == null);
    shell(`<p class="csv-lead">${rows.length} ligne(s) lue(s)${source !== "CSV" ? ` · format <b>${source}</b> reconnu` : ""}. Vérifie à quoi correspond chaque colonne.</p>
      <div class="csv-map">${FIELDS.map(([k, label, req]) => `<label><span>${label}${req ? "" : " · facultatif"}</span>${sel(k, req)}</label>`).join("")}</div>
      ${missing.length ? `<p class="csv-err" role="alert">À choisir : ${missing.map(f => f[1]).join(", ")}.</p>` : ""}
      <div id="csvPrev"></div>`,
      `<button class="btn" type="button" id="csvBack">← Autre fichier</button><button class="btn btn-main" type="button" id="csvGo" disabled>Importer</button>`);
    $("#csvModal").querySelectorAll("select[data-k]").forEach(s => s.addEventListener("change", () => { map[s.dataset.k] = s.value === "" ? undefined : +s.value; preview(); }));
    $("#csvBack").addEventListener("click", () => step1());
    preview();
  }

  let result = null;
  function preview() {
    const box = $("#csvPrev"), go = $("#csvGo");
    const ok = FIELDS.every(f => !f[2] || map[f[0]] != null);
    if (!ok) { box.innerHTML = ""; go.disabled = true; return; }
    result = build(rows, map, source);
    const t = result.trades, closed = t.filter(x => x.exit !== ""), open = t.length - closed.length;
    const pnl = closed.reduce((s, x) => s + (x.exit - x.entry) * x.quantity * (x.side === "short" ? -1 : 1) - (x.fees || 0), 0);
    const fmt = n => (n >= 0 ? "+" : "−") + new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
    box.innerHTML = `<div class="csv-sum"><div><span>Trades trouvés</span><b>${t.length}</b></div><div><span>Clôturés</span><b>${closed.length}</b></div><div><span>Encore ouverts</span><b>${open}</b></div><div><span>Résultat (devise de cotation)</span><b class="${pnl >= 0 ? "up" : "down"}">${fmt(pnl)}</b></div></div>
      ${result.warn.map(w => `<p class="csv-warn">${esc(w)}</p>`).join("")}
      ${t.length ? `<div class="csv-tbl"><table><thead><tr><th>Date</th><th>Actif</th><th>Qté</th><th>Entrée</th><th>Sortie</th></tr></thead><tbody>${t.slice(-8).reverse().map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.symbol)}</td><td>${esc(x.quantity)}</td><td>${esc(x.entry)}</td><td>${x.exit === "" ? "ouvert" : esc(x.exit)}</td></tr>`).join("")}</tbody></table>${t.length > 8 ? `<p class="csv-more">… et ${t.length - 8} autre(s)</p>` : ""}</div>` : `<p class="csv-err">Aucun trade n'a pu être reconstitué avec ces colonnes.</p>`}`;
    go.disabled = !t.length;
    go.onclick = () => commit(result.trades);
  }

  function commit(trades) {
    const inp = $("#importJ");
    try {
      const dt = new DataTransfer();
      dt.items.add(new File([JSON.stringify({ app: "pumpr", version: 1, trades })], "import.json", { type: "application/json" }));
      inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    } catch (e) {
      $("#csvPrev").insertAdjacentHTML("beforeend", `<p class="csv-err" role="alert">Ce navigateur bloque l'import. Essaie avec Chrome, Edge ou Safari à jour.</p>`);
    }
  }

  window.pumprCsvImport = open;
  /* bouton dans le pied du journal */
  const mount = () => {
    const j = $("#importJ"); if (!j || $("#csvBtn")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-sm btn-main"; b.id = "csvBtn"; b.textContent = "Importer un CSV";
    b.addEventListener("click", open);
    j.closest("label").before(b);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
