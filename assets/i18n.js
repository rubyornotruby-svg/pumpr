/* Pumpr · traduction de l'interface
   Le français est la langue source : chaque texte affiché en français est cherché
   dans le dictionnaire de la langue choisie (window.PUMPR_DICT) et remplacé.
   Usage : <script src="assets/i18n.js" data-langs="fr,en-US,en-GB,es,he,ar" data-picker="1"></script>
   puis le dictionnaire de la page. */
(() => {
  "use strict";
  const me = document.currentScript;
  const KEY = "pumpr-lang";
  const ALL = {
    "fr":    { name: "Français",       flag: "🇫🇷", html: "fr",    dict: "fr", num: "fr-FR" },
    "en-US": { name: "English (US)",   flag: "🇺🇸", html: "en-US", dict: "en", num: "en-US" },
    "en-GB": { name: "English (UK)",   flag: "🇬🇧", html: "en-GB", dict: "en", num: "en-GB" },
    "es":    { name: "Español",        flag: "🇪🇸", html: "es",    dict: "es", num: "es-ES" },
    "he":    { name: "עברית",          flag: "🇮🇱", html: "he",    dict: "he", num: "he-IL", rtl: true },
    "ar":    { name: "العربية",        flag: "🇸🇦", html: "ar",    dict: "ar", num: "ar-u-nu-latn", rtl: true }
  };
  const allowed = ((me && me.dataset.langs) || "fr,en-US,en-GB,es,he,ar").split(",").map(s => s.trim()).filter(l => ALL[l]);
  const wantPicker = !!(me && me.dataset.picker);

  const ls = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  };

  /* langue proche parmi celles autorisées sur cette page (ex. le desk : fr ou en) */
  function fit(code) {
    if (!code) return null;
    if (allowed.includes(code)) return code;
    const base = code.split("-")[0].toLowerCase();
    if (base === "en") return allowed.find(l => l.startsWith("en")) || null;
    const same = allowed.find(l => l.split("-")[0] === base);
    if (same) return same;
    return null;
  }
  function guess() {
    const navs = (navigator.languages || [navigator.language || "fr"]);
    for (const n of navs) {
      if (/^en-(GB|IE|AU|NZ)/i.test(n) && allowed.includes("en-GB")) return "en-GB";
      const f = fit(n.startsWith("en") ? "en-US" : n);
      if (f) return f;
    }
    return "fr";
  }
  const stored = ls.get();
  /* langue choisie sur le site mais absente ici (ex. espagnol sur le desk) : l'anglais */
  let lang = fit(stored) || (stored && stored !== "fr" ? fit("en-US") : null) || (stored ? "fr" : guess());
  if (!allowed.includes(lang)) lang = "fr";
  const info = ALL[lang];

  document.documentElement.lang = info.html;
  if (info.rtl) document.documentElement.dir = "rtl";

  /* nombres et dates : la locale suit la langue (le code du desk demande « fr-FR ») */
  if (lang !== "fr") {
    const swap = l => (l === "fr-FR" || l === "fr" || l === undefined) ? info.num : l;
    for (const C of ["NumberFormat", "DateTimeFormat", "RelativeTimeFormat", "PluralRules"]) {
      const Orig = Intl[C]; if (!Orig) continue;
      const W = function (l, o) { return new Orig(swap(l), o); };
      W.prototype = Orig.prototype; W.supportedLocalesOf = Orig.supportedLocalesOf;
      Intl[C] = W;
    }
    for (const [proto, fn] of [[Number.prototype, "toLocaleString"], [Date.prototype, "toLocaleDateString"], [Date.prototype, "toLocaleTimeString"], [Date.prototype, "toLocaleString"]]) {
      const o = proto[fn];
      proto[fn] = function (l, opt) { return o.call(this, swap(l), opt); };
    }
  }

  /* ---------- moteur ---------- */
  const norm = s => s.replace(/\s+/g, " ").trim();
  let D = {}, RX = [];
  function load() {
    const all = window.PUMPR_DICT || {};
    const d = info.dict;
    D = Object.assign({}, all[d] || {}, lang === "en-GB" ? (all["en-GB"] || {}) : {});
    RX = ((window.PUMPR_RX || {})[d] || []).concat(lang === "en-GB" ? ((window.PUMPR_RX || {})["en-GB"] || []) : []);
  }
  function tr(src) {
    const k = norm(src);
    if (!k) return null;
    if (Object.prototype.hasOwnProperty.call(D, k)) return D[k];
    for (const [re, rep] of RX) { if (re.test(k)) return k.replace(re, rep); }
    return null;
  }
  function out(src, t) {
    /* garde les espaces autour du fragment d'origine */
    const lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
    return lead + t + trail;
  }
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT|svg|SVG)$/;
  const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tip"];
  function textNode(n) {
    if (n.__pzOut !== undefined && n.data === n.__pzOut) return;
    const src = n.data;
    const t = tr(src);
    if (t === null) { n.__pzOut = undefined; return; }
    const v = out(src, t);
    const par = n.parentElement;
    if (par && par.tagName === "OPTION" && !par.hasAttribute("value")) par.setAttribute("value", src.trim());
    n.__pzSrc = src; n.__pzOut = v;
    if (n.data !== v) n.data = v;
  }
  function attrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const done = el.__pzA && el.__pzA[a];
      if (done !== undefined && cur === done) continue;
      const t = tr(cur);
      if (t === null) continue;
      (el.__pzA = el.__pzA || {})[a] = t;
      el.setAttribute(a, t);
    }
    if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit") && el.value) {
      const t = tr(el.value); if (t !== null) el.value = t;
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { const p = root.parentElement; if (p && !SKIP.test(p.tagName) && !p.closest("[data-no-i18n]")) textNode(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP.test(root.tagName) || (root.closest && root.closest("[data-no-i18n]"))) return;
    attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) { if (n.tagName === "TEXTAREA" && !n.hasAttribute("data-no-i18n")) attrs(n); return (SKIP.test(n.tagName) || n.hasAttribute("data-no-i18n")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }
  function head() {
    const t = tr(document.title); if (t !== null) document.title = t;
    document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]').forEach(m => { const v = tr(m.content); if (v !== null) m.content = v; });
  }
  let mo;
  function observe() {
    if (mo) return;
    mo = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") { const p = m.target.parentElement; if (p && !SKIP.test(p.tagName) && !p.closest("[data-no-i18n]")) textNode(m.target); }
        else if (m.type === "attributes") attrs(m.target);
        else m.addedNodes.forEach(walk);
      }
      if (document.title && tr(document.title) !== null) document.title = tr(document.title);
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function run() {
    load();
    if (lang === "fr") return;
    head(); walk(document.body); observe();
  }

  /* ---------- choix de la langue ---------- */
  const T = {
    title: { fr: "Choisis ta langue", "en-US": "Choose your language", "en-GB": "Choose your language", es: "Elige tu idioma", he: "בחר שפה", ar: "اختر لغتك" }
  };
  function css() {
    if (document.getElementById("pzLangCss")) return;
    const s = document.createElement("style"); s.id = "pzLangCss";
    s.textContent = `
.pz-lang{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(6,7,12,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:pzLangIn .35s ease}
@keyframes pzLangIn{from{opacity:0}}
.pz-lang .box{width:min(460px,100%);background:#0d1020;border:1px solid rgba(255,255,255,.12);border-radius:26px;padding:28px 24px 22px;box-shadow:0 40px 120px -30px rgba(139,92,246,.6)}
.pz-lang .lg{display:flex;align-items:center;gap:10px;justify-content:center;font:900 22px/1 var(--pz-display,system-ui);color:#f3f5fb;letter-spacing:-.03em}
.pz-lang .lg i{width:34px;height:34px;border-radius:10px;background:#c6ff3d;color:#06070c;display:grid;place-items:center;font-style:normal;transform:rotate(-6deg)}
.pz-lang h2{margin:18px 0 4px;text-align:center;font:800 20px/1.25 var(--pz-display,system-ui);color:#f3f5fb}
.pz-lang .sub{margin:0 0 18px;text-align:center;color:#8f97b0;font:500 13px/1.5 var(--pz-body,system-ui)}
.pz-lang .opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pz-lang button.o{display:flex;align-items:center;gap:10px;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#e7eaf4;font:700 15px/1.2 var(--pz-body,system-ui);cursor:pointer;text-align:start;transition:border-color .2s,background .2s}
.pz-lang button.o:hover,.pz-lang button.o:focus-visible{border-color:#c6ff3d;background:rgba(198,255,61,.08);outline:none}
.pz-lang button.o.on{border-color:#c6ff3d;background:rgba(198,255,61,.12);color:#c6ff3d}
.pz-lang button.o span{font-size:22px;line-height:1}
.pz-lang-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#e7eaf4;font:700 13px/1 var(--pz-body,system-ui);cursor:pointer}
.pz-lang-btn:hover{border-color:#c6ff3d}
.pz-lang-btn span{font-size:16px;line-height:1}
@media(max-width:380px){.pz-lang .opts{grid-template-columns:1fr}}
[dir=rtl] .pz-btn span[aria-hidden]{display:inline-block;transform:scaleX(-1)}`;
    document.head.appendChild(s);
  }
  function pick(code) {
    ls.set(code);
    if (code === lang) { close(); return; }
    location.reload();
  }
  let box;
  function close() { if (box) { box.remove(); box = null; } }
  function open(first) {
    css(); close();
    box = document.createElement("div");
    box.className = "pz-lang"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    const sub = allowed.map(l => T.title[l]).filter((v, i, a) => a.indexOf(v) === i && v !== T.title[lang]).slice(0, 3).join(" · ");
    box.innerHTML = `<div class="box"><div class="lg"><i>P</i>Pumpr</div><h2>${T.title[lang]}</h2><p class="sub">${sub}</p><div class="opts">${allowed.map(l => `<button type="button" class="o${l === lang ? " on" : ""}" data-l="${l}" lang="${ALL[l].html}"><span>${ALL[l].flag}</span>${ALL[l].name}</button>`).join("")}</div></div>`;
    box.addEventListener("click", e => {
      const b = e.target.closest("button[data-l]");
      if (b) pick(b.dataset.l);
      else if (e.target === box && !first) close();
    });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape" && box && !first) { close(); document.removeEventListener("keydown", esc); } });
    document.body.appendChild(box);
    setTimeout(() => { const b = box && box.querySelector("button.on") || box && box.querySelector("button"); b && b.focus(); }, 30);
  }
  /* bouton de langue réutilisable : <button data-lang-btn></button> */
  function buttons() {
    css();
    document.querySelectorAll("[data-lang-btn]").forEach(b => {
      if (b.__pz) return; b.__pz = 1;
      b.classList.add("pz-lang-btn"); b.type = "button"; b.setAttribute("data-no-i18n", "");
      b.innerHTML = `<span>${info.flag}</span>${lang.split("-")[0].toUpperCase()}${lang === "en-GB" ? "·UK" : lang === "en-US" ? "·US" : ""}`;
      b.setAttribute("aria-label", T.title[lang]);
      b.addEventListener("click", () => open(false));
    });
  }

  window.PumprLang = { lang, info, langs: allowed.map(l => Object.assign({ code: l }, ALL[l])), open: () => open(false), t: s => tr(s) ?? s, refresh: () => { buttons(); if (lang !== "fr") walk(document.body); } };

  function boot() {
    if (lang !== "fr") document.querySelectorAll("[data-if-foreign]").forEach(e => { e.hidden = false; });
    run(); buttons();
    if (wantPicker && !stored) open(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
