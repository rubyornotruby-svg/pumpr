/* Pumpr · accès au desk : connexion → vérification de l'achat → configuration → desk */
(() => {
  "use strict";
  const P = window.Pumpr;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  /* clés utilisées par le desk */
  const K = { set: "jarvis-user-settings-v1", risk: "jarvis-trading-risk-v2", fav: "jarvis-watch-favorites-v1", sel: "jarvis-trading-selected-v2" };
  const GROUPS = { "Crypto": ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT"], "Actions": ["AAPL", "NVDA", "MSFT", "TSLA"], "Indices": ["SPX", "NDX"], "Forex": ["EURUSD", "GBPUSD", "USDJPY"], "Matières premières": ["XAUUSD", "WTI", "NGAS"] };
  const MODS = [["stats", "Mes performances"], ["chart", "Graphique"], ["journal", "Journal de trades"], ["risk", "Calcul du risque"], ["calendar", "Calendrier de performance"], ["quotes", "Cours de tous les actifs"], ["news", "Actualités"], ["econ", "Calendrier économique"]];
  const ACCENTS = [["lime", "#c6ff3d", "Citron vert"], ["cyan", "#45d9f0", "Cyan"], ["violet", "#a68cff", "Violet"], ["pink", "#ff4fd8", "Rose"], ["blue", "#6f97ff", "Bleu"], ["green", "#3fe0a2", "Vert"]];
  const LEVELS = ["Débutant", "Intermédiaire", "Confirmé"];

  let me = null, profile = null, admin = false, started = false, adminMode = false;
  /* Admin sans compte acheteur (mode démo) : sa configuration reste dans ce navigateur */
  const AKEY = "pumpr-admin-profile";
  const saveProf = async p => {
    if (adminMode) { ls.set(AKEY, Object.assign({}, ls.get(AKEY, {}) || {}, p)); return { ok: true }; }
    return P.saveProfile(p);
  };

  /* ---------- squelette ---------- */
  document.body.classList.add("locked");
  const gate = document.createElement("div");
  gate.className = "gate pz"; gate.setAttribute("role", "main");
  gate.innerHTML = `<div class="g-top"><a class="pz-logo" href="../"><i>P</i>Pumpr</a><a href="../">← Retour au site</a></div><div class="g-mid" id="gMid"></div>`;
  document.body.appendChild(gate);
  if (P.mode === "demo") {
    const d = document.createElement("div"); d.className = "pz-demo"; d.id = "demoBadge";
    d.textContent = "Mode démo : comptes simulés dans ce navigateur, pas encore sécurisés.";
    document.body.appendChild(d);
  }
  const mid = $("#gMid");
  const view = html => { mid.innerHTML = html; const f = mid.querySelector("input,button"); if (f && matchMedia("(pointer:fine)").matches) setTimeout(() => f.focus(), 60); };
  const loading = t => view(`<div class="g-loading"><div class="g-spin"></div>${esc(t || "Chargement…")}</div>`);
  const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (label) btn.dataset.l = btn.dataset.l || btn.textContent; btn.textContent = on ? (label || "…") : (btn.dataset.l || btn.textContent); };

  /* ---------- connexion / création de compte ---------- */
  function authView(tab, msg) {
    tab = tab || "in";
    view(`<div class="pz-card g-card">
      <h1>${tab === "in" ? "Se connecter pour accéder au desk" : "Créer mon compte"}</h1>
      <p class="sub">${tab === "in" ? "Connecte-toi avec le compte lié à ton achat." : "Utilise la même adresse e-mail que pour ton achat. Sans achat, la création est refusée."}</p>
      <div class="g-tabs" role="tablist"><button type="button" role="tab" aria-selected="${tab === "in"}" data-tab="in">Connexion</button><button type="button" role="tab" aria-selected="${tab === "up"}" data-tab="up">Créer mon compte</button></div>
      <form class="g-form" id="authF" novalidate>
        <label class="pz-label">Adresse e-mail${tab === "up" ? " (celle de ton achat)" : ""}<input class="pz-field" id="aMail" type="email" autocomplete="email" required></label>
        <label class="pz-label">Mot de passe<input class="pz-field" id="aPw" type="password" autocomplete="${tab === "in" ? "current-password" : "new-password"}" minlength="8" required></label>
        ${tab === "up" ? `<label class="pz-label">Confirme le mot de passe<input class="pz-field" id="aPw2" type="password" autocomplete="new-password" minlength="8" required></label>
        <label class="g-check"><input type="checkbox" id="aCgu"><span>J'accepte les <a href="../mentions-legales.html#cgv" target="_blank" rel="noopener">conditions de vente et d'utilisation</a> et la <a href="../mentions-legales.html#confidentialite" target="_blank" rel="noopener">politique de confidentialité</a>. Je comprends que Pumpr n'est pas un conseil en investissement.</span></label>` : ""}
        <div class="${msg && msg.ok ? "pz-ok" : "pz-err"}" id="aErr" role="alert">${msg ? esc(msg.text) : ""}</div>
        <button class="pz-btn pz-btn-main" type="submit" id="aGo">${tab === "in" ? "Se connecter" : "Créer mon compte"}</button>
        ${tab === "in" ? `<button class="g-link" type="button" id="aForgot">Mot de passe oublié ?</button>` : ""}
      </form>
      <p class="pz-note" style="margin:20px 0 0">Pas encore acheté ? <a href="../" style="color:var(--pz-text)">Découvrir Pumpr</a>${P.mode === "demo" ? ` · <a href="../admin/" style="color:var(--pz-muted)">Accès administrateur</a>` : ""}</p>
      ${P.mode === "demo" ? `<div class="g-help"><b>Mode démo.</b> Pour tester : ajoute un e-mail acheteur dans <a href="../admin/">l'espace admin</a>, puis crée ton compte ici avec cet e-mail.</div>` : ""}
    </div>`);
    mid.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => authView(b.dataset.tab)));
    const err = $("#aErr"), go = $("#aGo");
    $("#authF").addEventListener("submit", async e => {
      e.preventDefault(); err.className = "pz-err"; err.textContent = "";
      const mail = $("#aMail").value, pw = $("#aPw").value;
      if (tab === "up" && pw !== $("#aPw2").value) { err.textContent = "Les deux mots de passe ne sont pas identiques."; return; }
      if (tab === "up" && !$("#aCgu").checked) { err.textContent = "Coche la case pour accepter les conditions."; return; }
      busy(go, true, tab === "in" ? "Connexion…" : "Vérification de l'achat…");
      try {
        const r = tab === "in" ? await P.signIn(mail, pw) : await P.signUp(mail, pw);
        if (!r.ok) { err.textContent = r.error; busy(go, false); return; }
        if (r.needsConfirm) { authView("in", { ok: true, text: "Compte créé. Ouvre l'e-mail de confirmation que tu viens de recevoir, puis connecte-toi." }); return; }
        route();
      } catch (x) { err.textContent = x.message || "Erreur de connexion."; busy(go, false); }
    });
    const fg = $("#aForgot");
    if (fg) fg.addEventListener("click", async () => {
      err.className = "pz-err"; err.textContent = "";
      const r = await P.resetPassword($("#aMail").value);
      if (r.ok) { err.className = "pz-ok"; err.textContent = "Si un compte existe, un lien pour changer ton mot de passe vient d'être envoyé."; }
      else err.textContent = r.error;
    });
  }

  function recoveryView() {
    view(`<div class="pz-card g-card"><h1>Nouveau mot de passe</h1><p class="sub">Choisis un nouveau mot de passe pour ton compte.</p>
      <form class="g-form" id="rcF"><label class="pz-label">Nouveau mot de passe<input class="pz-field" id="rcPw" type="password" autocomplete="new-password" minlength="8"></label>
      <div class="pz-err" id="rcErr" role="alert"></div><button class="pz-btn pz-btn-main" type="submit">Enregistrer</button></form></div>`);
    $("#rcF").addEventListener("submit", async e => {
      e.preventDefault(); const r = await P.updatePassword($("#rcPw").value);
      if (!r.ok) { $("#rcErr").textContent = r.error; return; }
      history.replaceState(null, "", location.pathname); route();
    });
  }

  function noAccessView() {
    view(`<div class="pz-card g-card"><div class="g-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
      <h1>Aucun achat associé</h1>
      <p class="sub">Le compte <b style="color:var(--pz-text)">${esc(me.email)}</b> n'a pas accès au desk : aucun achat n'est lié à cette adresse, ou l'accès a été retiré.</p>
      <div class="g-row"><a class="pz-btn pz-btn-main" href="../">Acheter Pumpr</a><button class="pz-btn" type="button" id="naOut">Changer de compte</button></div></div>`);
    $("#naOut").addEventListener("click", async () => { await P.signOut(); me = null; authView("in"); });
  }

  /* ---------- configuration du desk ---------- */
  function currentConfig() {
    const s = ls.get(K.set, {}) || {}, v3 = s.v3 || {}, r = ls.get(K.risk, {}) || {}, pc = (profile && profile.config) || {};
    return {
      nom: (profile && profile.nom) || s.name || "",
      niveau: pc.niveau || "",
      marches: pc.marches || ["Crypto"],
      cap: r.cap ?? pc.cap ?? 10000, pct: r.pct ?? pc.pct ?? 1, stop: r.stop ?? pc.stop ?? 2,
      accent: s.accent || pc.accent || "lime",
      order: v3.order || pc.order || MODS.map(m => m[0]),
      hidden: v3.hidden || pc.hidden || [],
      lite: v3.lite ?? pc.lite ?? true,
      favs: ls.get(K.fav, null) || pc.favs || []
    };
  }
  function applyLocal(c, first) {
    const s = ls.get(K.set, {}) || {};
    s.name = c.nom || ""; s.accent = c.accent || "lime";
    s.v3 = Object.assign({}, s.v3 || {}, { order: c.order, hidden: c.hidden, lite: !!c.lite });
    ls.set(K.set, s);
    ls.set(K.risk, Object.assign({}, ls.get(K.risk, {}) || {}, { cap: Number(c.cap) || 0, pct: Number(c.pct) || 0, stop: Number(c.stop) || 0 }));
    if (Array.isArray(c.favs)) ls.set(K.fav, c.favs);
    if (first) { const g = (c.marches || [])[0]; if (g && GROUPS[g]) ls.set(K.sel, GROUPS[g][0]); }
  }

  function wizard(editing) {
    const c = currentConfig();
    let step = 0;
    const TOTAL = 4;
    const draw = () => {
      const steps = [
        () => `<div class="wz-panel"><h1>${editing ? "Ma configuration" : "Configurons ton desk"}</h1><p class="sub" style="margin:0">${editing ? "Modifie ce que tu veux, ça s'applique tout de suite." : "Quatre questions rapides et ton desk est prêt."}</p>
          <label class="pz-label">Ton prénom ou pseudo<input class="pz-field" id="wNom" maxlength="30" value="${esc(c.nom)}" placeholder="Ex. Alex"></label>
          <div class="pz-label">Ton niveau en trading<div class="wz-chips" id="wLvl">${LEVELS.map(l => `<button type="button" aria-pressed="${c.niveau === l}" data-v="${l}">${l}</button>`).join("")}</div></div></div>`,
        () => `<div class="wz-panel"><h1>Qu'est-ce que tu trades ?</h1><p class="sub" style="margin:0">Ces marchés seront mis en favoris dans ta watchlist. Choisis-en au moins un.</p>
          <div class="wz-chips" id="wMk">${Object.keys(GROUPS).map(g => `<button type="button" aria-pressed="${c.marches.includes(g)}" data-v="${g}">${g}</button>`).join("")}</div></div>`,
        () => `<div class="wz-panel"><h1>Ta gestion du risque</h1><p class="sub" style="margin:0">Le calcul de position du desk partira de ces valeurs. Tu pourras les changer à tout moment.</p>
          <div class="wz-grid"><label class="pz-label">Capital ($)<input class="pz-field" id="wCap" type="number" min="0" step="any" value="${esc(c.cap)}"></label>
          <label class="pz-label">Risque par trade (%)<input class="pz-field" id="wPct" type="number" min="0" max="100" step="0.1" value="${esc(c.pct)}"></label>
          <label class="pz-label">Stop habituel (%)<input class="pz-field" id="wStop" type="number" min="0" step="0.1" value="${esc(c.stop)}"></label></div>
          <div class="wz-tip">Beaucoup de traders limitent leur risque à 1 ou 2 % du capital par trade.</div></div>`,
        () => `<div class="wz-panel"><h1>Ton style</h1>
          <div class="pz-label">Couleur du desk<div class="wz-sw" id="wAcc">${ACCENTS.map(a => `<button type="button" style="--c:${a[1]}" data-v="${a[0]}" aria-label="${a[2]}" aria-pressed="${c.accent === a[0]}"></button>`).join("")}</div></div>
          <div class="pz-label">Modules affichés et leur ordre<div class="wz-mods" id="wMods"></div></div>
          <label class="wz-mod" style="cursor:pointer"><span>Mode léger : site plus rapide, moins d'effets</span><input type="checkbox" id="wLite" ${c.lite ? "checked" : ""}></label></div>`
      ];
      view(`<div class="pz-card g-card wide"><div class="wz-step">ÉTAPE ${step + 1} / ${TOTAL}</div><div class="wz-prog"><b style="width:${(step + 1) / TOTAL * 100}%"></b></div>
        ${steps[step]()}<div class="pz-err" id="wErr" role="alert" style="margin-top:12px"></div>
        <div class="wz-nav">${step ? `<button class="pz-btn" type="button" id="wBack">← Retour</button>` : (editing ? `<button class="pz-btn" type="button" id="wCancel">Annuler</button>` : "<span></span>")}
        <button class="pz-btn pz-btn-main" type="button" id="wNext">${step === TOTAL - 1 ? (editing ? "Enregistrer" : "Ouvrir mon desk →") : "Suivant →"}</button></div></div>`);
      bind();
    };
    const pick = (box, multi, key) => box && box.addEventListener("click", e => {
      const b = e.target.closest("button[data-v]"); if (!b) return;
      if (multi) { b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); c[key] = Array.from(box.querySelectorAll('[aria-pressed="true"]')).map(x => x.dataset.v); }
      else { box.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); c[key] = b.dataset.v; }
    });
    const drawMods = () => {
      const box = $("#wMods"); if (!box) return;
      box.innerHTML = c.order.map((id, i) => { const m = MODS.find(x => x[0] === id); return m ? `<div class="wz-mod"><input type="checkbox" data-id="${id}" ${c.hidden.includes(id) ? "" : "checked"} aria-label="Afficher ${m[1]}"><span>${m[1]}</span><button type="button" data-up="${i}" aria-label="Monter" ${i ? "" : "disabled"}>↑</button><button type="button" data-dn="${i}" aria-label="Descendre" ${i === c.order.length - 1 ? "disabled" : ""}>↓</button></div>` : ""; }).join("");
    };
    const save = () => {
      if (step === 0) c.nom = $("#wNom").value.trim();
      if (step === 2) { c.cap = $("#wCap").value; c.pct = $("#wPct").value; c.stop = $("#wStop").value; }
      if (step === 3) c.lite = $("#wLite").checked;
    };
    const check = () => {
      if (step === 0 && !c.nom) return "Entre ton prénom ou un pseudo.";
      if (step === 1 && !c.marches.length) return "Choisis au moins un marché.";
      if (step === 2) { if (!(Number(c.cap) > 0)) return "Le capital doit être supérieur à 0."; if (!(Number(c.pct) > 0 && Number(c.pct) <= 100)) return "Le risque doit être entre 0 et 100 %."; if (!(Number(c.stop) > 0)) return "Le stop doit être supérieur à 0."; }
      if (step === 3 && c.hidden.length >= MODS.length) return "Garde au moins un module affiché.";
      return "";
    };
    function bind() {
      pick($("#wLvl"), false, "niveau"); pick($("#wMk"), true, "marches"); pick($("#wAcc"), false, "accent");
      drawMods();
      const mods = $("#wMods");
      if (mods) mods.addEventListener("click", e => {
        const u = e.target.closest("[data-up]"), d = e.target.closest("[data-dn]");
        const sw = (i, j) => { [c.order[i], c.order[j]] = [c.order[j], c.order[i]]; drawMods(); };
        if (u) sw(+u.dataset.up, +u.dataset.up - 1); if (d) sw(+d.dataset.dn, +d.dataset.dn + 1);
      });
      if (mods) mods.addEventListener("change", e => { const id = e.target.dataset.id; if (!id) return; c.hidden = e.target.checked ? c.hidden.filter(x => x !== id) : [...c.hidden, id]; });
      const back = $("#wBack"); if (back) back.addEventListener("click", () => { save(); step--; draw(); });
      const cancel = $("#wCancel"); if (cancel) cancel.addEventListener("click", () => { gate.classList.add("gone"); document.body.classList.remove("locked"); });
      $("#wNext").addEventListener("click", async () => {
        save(); const e = check(); if (e) { $("#wErr").textContent = e; return; }
        if (step < TOTAL - 1) { step++; draw(); return; }
        const btn = $("#wNext"); busy(btn, true, "Enregistrement…");
        const prevMk = ((profile && profile.config && profile.config.marches) || []).join("|");
        if (!editing || prevMk !== c.marches.join("|")) c.favs = c.marches.flatMap(g => GROUPS[g] || []);
        const config = { niveau: c.niveau, marches: c.marches, cap: Number(c.cap), pct: Number(c.pct), stop: Number(c.stop), accent: c.accent, order: c.order, hidden: c.hidden, lite: !!c.lite, favs: c.favs };
        const r = await saveProf({ nom: c.nom, config, configure: true });
        if (!r.ok) { $("#wErr").textContent = r.error; busy(btn, false); return; }
        profile = Object.assign({}, profile || {}, { nom: c.nom, config, configure: true });
        applyLocal(Object.assign({}, c, { favs: c.favs }), !editing);
        if (editing) { location.reload(); return; }
        openDesk();
      });
    }
    draw();
  }

  /* ---------- desk ---------- */
  function openDesk() {
    if (!started) { started = true; window.__pumprSyncReady = true; if (typeof window.startDesk === "function") window.startDesk(); mountAccount(); }
    gate.classList.add("gone"); document.body.classList.remove("locked"); filmBadge(); mountMobile(); mountGuide(); mountMenu();
    const db = $("#demoBadge"); if (db) setTimeout(() => db.remove(), matchMedia("(max-width:700px)").matches ? 3500 : 6000);
    if (!adminMode) P.touch().catch(() => {});
  }

  function mountAccount() {
    const top = document.querySelector(".top-r"); if (!top || $("#acctWrap")) return;
    const name = (profile && profile.nom) || me.email.split("@")[0];
    const w = document.createElement("div"); w.className = "acct"; w.id = "acctWrap";
    w.innerHTML = `<button class="btn acct-btn" type="button" id="acctBtn" aria-haspopup="menu" aria-expanded="false"><span class="acct-av">${esc(name.slice(0, 1).toUpperCase())}</span><span class="acct-name">${esc(name)}</span></button>
      <div class="acct-menu" id="acctMenu" role="menu"><div class="who"><b>${esc(name)}</b><small>${adminMode ? "Connecté en administrateur" : esc(me.email)}</small></div>
      <button type="button" role="menuitem" id="mCfg">Modifier ma configuration</button>
      <button type="button" role="menuitem" id="mFilm">${filming() ? "Quitter le mode tournage" : "Mode tournage (données de démo)"}</button>
      ${admin ? `<a role="menuitem" href="../admin/">Espace admin</a>` : ""}
      <a role="menuitem" href="../">Site Pumpr</a>
      <button type="button" role="menuitem" class="out" id="mOut">Se déconnecter</button></div>`;
    top.appendChild(w);
    const app = document.querySelector(".app");
    if (app && !$("#dFoot")) {
      const f = document.createElement("footer"); f.id = "dFoot"; f.className = "dfoot";
      f.innerHTML = `<p>Pumpr est un outil d'organisation et d'analyse, pas un conseil en investissement. Il ne passe aucun ordre. Le trading comporte un risque élevé de perte en capital.</p>
        <p>Cours crypto : Binance · Graphiques, actualités et calendrier économique : TradingView · Météo : Open-Meteo · <a href="../mentions-legales.html">Mentions légales</a> · <a href="../mentions-legales.html#cgv">CGV</a> · <a href="../mentions-legales.html#confidentialite">Confidentialité</a> · <a href="../retractation.html">Se rétracter du contrat</a></p>`;
      app.appendChild(f);
    }
    const btn = $("#acctBtn"), menu = $("#acctMenu");
    const set = on => { menu.classList.toggle("open", on); btn.setAttribute("aria-expanded", String(on)); };
    btn.addEventListener("click", e => { e.stopPropagation(); set(!menu.classList.contains("open")); });
    document.addEventListener("click", e => { if (!w.contains(e.target)) set(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") set(false); });
    $("#mCfg").addEventListener("click", () => { set(false); gate.classList.remove("gone"); document.body.classList.add("locked"); wizard(true); });
    $("#mFilm").addEventListener("click", () => { set(false); toggleFilming(); });
    $("#mOut").addEventListener("click", async () => { if (adminMode) P.lockDemoAdmin(); else await P.signOut(); location.reload(); });
  }

  /* ---------- téléphone : navigation du bas, bouton +, trades repliables ---------- */
  function mountMobile() {
    if ($("#mnav")) return;
    const ic = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const TABS = [
      ["stats", "Résumé", ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')],
      ["chart", "Graphique", ic('<path d="M7 4v16M7 8H5v6h2M17 4v16M17 6h2v8h-2M12 7v13M12 10h-2v5h2"/>')],
      ["journal", "Journal", ic('<path d="M4 4h12l4 4v12H4z"/><path d="M8 10h8M8 14h8M8 18h5"/>')],
      ["risk", "Risque", ic('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>')],
      ["watch", "Marchés", ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>')]
    ];
    const nav = document.createElement("nav"); nav.className = "mnav"; nav.id = "mnav"; nav.setAttribute("aria-label", "Sections du desk");
    nav.innerHTML = TABS.map(([id, label, svg]) => `<button type="button" data-go="${id}">${svg}<span>${label}</span></button>`).join("");
    const fab = document.createElement("button"); fab.className = "fab"; fab.type = "button"; fab.setAttribute("aria-label", "Ajouter un trade");
    fab.innerHTML = ic('<path d="M12 5v14M5 12h14"/>');
    document.body.append(nav, fab);
    fab.addEventListener("click", () => { const b = $("#addTop"); if (b) b.click(); });
    const sec = id => document.getElementById("m-" + id);
    const refresh = () => TABS.forEach(([id]) => { const s = sec(id), b = nav.querySelector(`[data-go="${id}"]`); if (b) b.hidden = !s || s.hidden; });
    refresh(); new MutationObserver(refresh).observe($("#work") || document.body, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
    nav.addEventListener("click", e => {
      const b = e.target.closest("[data-go]"); if (!b) return; const s = sec(b.dataset.go); if (!s) return;
      window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 12, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    const mark = () => {
      let cur = null;
      TABS.forEach(([id]) => { const s = sec(id); if (s && !s.hidden && s.getBoundingClientRect().top < innerHeight * 0.4) cur = id; });
      nav.querySelectorAll("[data-go]").forEach(b => b.setAttribute("aria-current", String(b.dataset.go === cur)));
    };
    addEventListener("scroll", mark, { passive: true }); mark();
    const jl = $("#jlist");
    if (jl) jl.addEventListener("click", e => {
      if (!matchMedia("(max-width:700px)").matches || e.target.closest("button,a,input")) return;
      const t = e.target.closest(".trade"); if (t) t.classList.toggle("open");
    });
  }

  /* ---------- menu ☰ : colonne latérale + modules en grand écran ---------- */
  const ICON = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const MODS_MENU = [
    ["stats", "Mes performances", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    ["chart", "Graphique", '<path d="M7 4v16M7 8H5v6h2M17 4v16M17 6h2v8h-2M12 7v13M12 10h-2v5h2"/>'],
    ["journal", "Journal de trades", '<path d="M4 4h12l4 4v12H4z"/><path d="M8 10h8M8 14h8M8 18h5"/>'],
    ["risk", "Calcul du risque", '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>'],
    ["calendar", "Calendrier de performance", '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ["watch", "Watchlist", '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'],
    ["quotes", "Cours de tous les actifs", '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],
    ["news", "Actualités", '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h3"/>'],
    ["econ", "Calendrier économique", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>']
  ];
  let focused = null;
  function closeFocus() {
    if (!focused) return;
    focused.classList.remove("focus"); const x = focused.querySelector(".fx-close"); if (x) x.remove();
    document.body.classList.remove("focusing"); focused = null;
    window.dispatchEvent(new Event("resize"));
  }
  function openFocus(id) {
    const s = document.getElementById("m-" + id); if (!s || s.hidden) return;
    closeFocus(); closeMenu();
    focused = s; s.classList.add("focus"); document.body.classList.add("focusing");
    const x = document.createElement("button"); x.type = "button"; x.className = "fx-close"; x.setAttribute("aria-label", "Fermer le grand écran");
    x.innerHTML = ICON('<path d="M6 6l12 12M18 6 6 18"/>'); x.addEventListener("click", closeFocus);
    s.appendChild(x); s.scrollTop = 0; x.focus();
    window.dispatchEvent(new Event("resize"));
  }
  function closeMenu() { const m = $("#sideMenu"); if (!m || !m.classList.contains("open")) return; m.classList.remove("open"); $("#sideScrim").classList.remove("open"); document.body.classList.remove("menu-open"); m.setAttribute("aria-hidden", "true"); const b = $("#menuBtn"); if (b) { b.setAttribute("aria-expanded", "false"); b.focus(); } }
  function openMenu() {
    const m = $("#sideMenu"); drawMenu(); m.classList.add("open"); $("#sideScrim").classList.add("open"); document.body.classList.add("menu-open"); m.setAttribute("aria-hidden", "false");
    $("#menuBtn").setAttribute("aria-expanded", "true"); const f = m.querySelector("button"); if (f) setTimeout(() => f.focus(), 60);
  }
  function drawMenu() {
    const m = $("#sideMenu");
    const vis = MODS_MENU.filter(([id]) => { const s = document.getElementById("m-" + id); return s && !s.hidden; });
    const name = (profile && profile.nom) || (me && me.email.split("@")[0]) || "";
    m.innerHTML = `<div class="sm-head"><span class="pz-logo"><i>P</i>Pumpr</span><button class="sm-x" type="button" aria-label="Fermer le menu">${ICON('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="sm-label">Ouvrir en grand écran</div>
      <div class="sm-list">${vis.map(([id, label, d]) => `<button type="button" class="sm-item" data-focus="${id}"><span class="sm-dot">${ICON(d)}</span><span>${label}</span><span class="sm-arrow" aria-hidden="true">⤢</span></button>`).join("")}</div>
      <div class="sm-label">Actions</div>
      <div class="sm-list">
        <button type="button" class="sm-item" data-act="add"><span class="sm-dot sm-main">${ICON('<path d="M12 5v14M5 12h14"/>')}</span><span>Ajouter un trade</span></button>
        <button type="button" class="sm-item" data-act="brief"><span class="sm-dot">${ICON('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')}</span><span>Point du jour</span></button>
        <button type="button" class="sm-item" data-act="set"><span class="sm-dot">${ICON('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')}</span><span>Réglages</span></button>
        <button type="button" class="sm-item" data-act="cfg"><span class="sm-dot">${ICON('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>')}</span><span>Modifier ma configuration</span></button>
        <button type="button" class="sm-item" data-act="film"><span class="sm-dot">${ICON('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>')}</span><span>${filming() ? "Quitter le mode tournage" : "Mode tournage"}</span></button>
      </div>
      <div class="sm-foot">
        <div class="sm-who"><b>${esc(name)}</b><small>${adminMode ? "Administrateur" : esc(me ? me.email : "")}</small></div>
        ${admin ? `<a href="../admin/">Espace admin</a>` : ""}<a href="../">Site Pumpr</a><button type="button" data-act="out">Se déconnecter</button>
      </div>`;
  }
  function mountMenu() {
    if ($("#menuBtn")) return;
    const top = document.querySelector(".top"), id = document.querySelector(".top .id"); if (!top || !id) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "ibtn menu-btn"; b.id = "menuBtn";
    b.setAttribute("aria-label", "Ouvrir le menu"); b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", "sideMenu");
    b.innerHTML = ICON('<path d="M4 7h16M4 12h16M4 17h16"/>');
    id.prepend(b);
    const scrim = document.createElement("div"); scrim.className = "side-scrim"; scrim.id = "sideScrim";
    const m = document.createElement("aside"); m.className = "side-menu pz"; m.id = "sideMenu"; m.setAttribute("aria-label", "Menu"); m.setAttribute("aria-hidden", "true");
    document.body.append(scrim, m);
    b.addEventListener("click", openMenu); scrim.addEventListener("click", closeMenu);
    m.addEventListener("click", async e => {
      if (e.target.closest(".sm-x")) return closeMenu();
      const f = e.target.closest("[data-focus]"); if (f) return openFocus(f.dataset.focus);
      const a = e.target.closest("[data-act]"); if (!a) return;
      const act = a.dataset.act; closeMenu(); closeFocus();
      if (act === "add") { const x = $("#addTop"); if (x) x.click(); }
      else if (act === "brief") { const x = $("#briefBtn"); if (x) x.click(); }
      else if (act === "set") { const x = $("#setBtn"); if (x) x.click(); }
      else if (act === "cfg") { const x = $("#mCfg"); if (x) x.click(); }
      else if (act === "film") toggleFilming();
      else if (act === "out") { if (adminMode) P.lockDemoAdmin(); else await P.signOut(); location.reload(); }
    });
    document.addEventListener("keydown", e => { if (e.key !== "Escape") return; if ($("#sideMenu").classList.contains("open")) closeMenu(); else if (focused && !document.querySelector(".drawer.open")) closeFocus(); });
  }

  /* ---------- première connexion guidée (simple) ---------- */
  const GKEY = "pumpr-guide-v1";
  function mountGuide() {
    if ($("#guide") || filming()) return;
    const st = ls.get(GKEY, {}) || {};
    if (st.done) return;
    const work = $("#work"); if (!work) return;
    const STEPS = [
      ["trade", "Ajoute ton premier trade", "Bouton « + Ajouter un trade » : actif, prix d'entrée, quantité. Le reste est facultatif."],
      ["risk", "Règle ton risque", "Dans « Calcul du risque », entre ton capital et ton risque par trade : Pumpr calcule ta taille de position."],
      ["fav", "Choisis tes marchés", "Dans la watchlist, touche l'étoile ☆ d'un actif pour le garder en favori."]
    ];
    const card = document.createElement("section");
    card.className = "card w12 guide"; card.id = "guide"; card.setAttribute("aria-label", "Bien démarrer");
    const draw = () => {
      const s = ls.get(GKEY, {}) || {};
      const n = STEPS.filter(x => s[x[0]]).length;
      card.innerHTML = `<div class="ch"><div><h2>Bien démarrer · ${n}/${STEPS.length}</h2><p>Trois gestes pour prendre le desk en main.</p></div><button class="btn btn-sm" type="button" id="gClose">${n === STEPS.length ? "Terminé" : "Masquer"}</button></div>
        <div class="cb"><ol class="gsteps">${STEPS.map(([k, t, d]) => `<li class="${s[k] ? "ok" : ""}"><i aria-hidden="true">${s[k] ? "✓" : STEPS.findIndex(x => x[0] === k) + 1}</i><div><b>${t}</b><span>${d}</span></div></li>`).join("")}</ol></div>`;
      $("#gClose").onclick = () => { ls.set(GKEY, Object.assign(ls.get(GKEY, {}) || {}, { done: true })); card.remove(); };
    };
    const tick = k => { const s = ls.get(GKEY, {}) || {}; if (s[k]) return; s[k] = true; ls.set(GKEY, s); draw(); };
    work.prepend(card); draw();
    const hasTrades = () => { const t = ls.get(JKEY, []); return Array.isArray(t) && t.length > 0; };
    if (hasTrades()) tick("trade");
    const jl = $("#jlist"); if (jl) new MutationObserver(() => { if (hasTrades()) tick("trade"); }).observe(jl, { childList: true });
    ["#rCap", "#rPct", "#rStop", "#rEntry"].forEach(id => { const el = $(id); if (el) el.addEventListener("input", () => tick("risk"), { once: true }); });
    const wl = $("#wl"); if (wl) wl.addEventListener("click", e => { if (e.target.closest("[data-fav]")) tick("fav"); });
  }

  /* ---------- mode tournage : données de démo pour filmer ---------- */
  const JKEY = "jarvis-trading-journal-v1", FKEY = "pumpr-film";
  const filming = () => !!ls.get(FKEY, null);
  function demoTrades() {
    const syms = [["BTC", 67000, 0.02], ["ETH", 3400, 0.4], ["SOL", 160, 6], ["XRP", 0.6, 1500], ["DOGE", 0.16, 6000], ["AVAX", 32, 30]];
    const setups = ["Tendance", "Cassure", "Rebond / support", "Retournement", "Range"];
    const emos = ["Calme", "Confiant", "Calme", "Hésitant", "FOMO", "Calme", "Stressé"];
    const notes = ["Entrée sur cassure confirmée, stop sous le support.", "Plan respecté, sortie au objectif.", "Entré trop tôt, pas attendu la confirmation.", "FOMO après une grosse bougie verte.", "Bon setup, gestion propre.", "Sortie partielle trop tôt."];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out = [], now = new Date();
    for (let i = 0; i < 26; i++) {
      const d = new Date(now); d.setDate(now.getDate() - Math.floor(i * 1.6) - 1);
      const [sym, px, qty] = syms[Math.floor(rnd() * syms.length)];
      const side = rnd() < 0.72 ? "long" : "short";
      const entry = +(px * (0.94 + rnd() * 0.12)).toPrecision(5);
      const win = rnd() < 0.6, move = (0.008 + rnd() * 0.035) * (win ? 1 : -1) * (side === "long" ? 1 : -1);
      const exit = +(entry * (1 + move)).toPrecision(5), stop = +(entry * (side === "long" ? 0.98 : 1.02)).toPrecision(5);
      const emo = emos[Math.floor(rnd() * emos.length)];
      out.push({ id: "demo" + i, date: new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10), symbol: sym, side, quantity: String(qty), entry: String(entry), exit: i === 0 ? "" : String(exit), fees: "0", stop: String(stop), setup: setups[Math.floor(rnd() * setups.length)], emotion: emo, plan: emo === "FOMO" || emo === "Stressé" ? "Non" : win ? "Oui" : "En partie", notes: notes[Math.floor(rnd() * notes.length)] });
    }
    return out;
  }
  function toggleFilming() {
    if (!filming()) {
      let backup = null; try { backup = localStorage.getItem(JKEY); } catch (e) {}
      ls.set(FKEY, { backup }); ls.set(JKEY, demoTrades());
    } else {
      const f = ls.get(FKEY, {}) || {};
      try { if (f.backup == null) localStorage.removeItem(JKEY); else localStorage.setItem(JKEY, f.backup); localStorage.removeItem(FKEY); } catch (e) {}
    }
    location.reload();
  }
  function filmBadge() {
    if (!filming() || $("#filmBadge")) return;
    const b = document.createElement("div"); b.id = "filmBadge"; b.className = "film-badge";
    b.innerHTML = `DONNÉES DE DÉMO <button type="button" aria-label="Quitter le mode tournage">✕</button>`;
    b.querySelector("button").addEventListener("click", toggleFilming);
    document.body.appendChild(b);
  }

  /* synchronisation des réglages du desk vers le compte (appelée par le desk) */
  let syncT = null;
  window.__pumprSync = () => {
    if (!window.__pumprSyncReady || !profile) return;
    clearTimeout(syncT);
    syncT = setTimeout(() => {
      const c = currentConfig();
      const config = Object.assign({}, profile.config || {}, { cap: Number(c.cap), pct: Number(c.pct), stop: Number(c.stop), accent: c.accent, order: c.order, hidden: c.hidden, lite: !!c.lite, favs: c.favs });
      const nom = (ls.get(K.set, {}) || {}).name || profile.nom;
      profile = Object.assign({}, profile, { nom, config });
      saveProf({ nom, config }).catch(() => {});
    }, 1500);
  };

  /* ---------- aiguillage ---------- */
  async function route() {
    loading("Vérification de ton accès…");
    try {
      me = await P.session();
      admin = await P.isAdmin();
      if (!me && admin && P.mode === "demo") {
        /* admin déverrouillé : accès direct au desk, sans compte acheteur */
        adminMode = true; me = { email: "admin", id: "admin" }; profile = ls.get(AKEY, null);
      } else {
        if (!me) return authView("in");
        if (!admin && !(await P.access())) return noAccessView();
        profile = await P.profile();
      }
      if (!profile || !profile.configure) return wizard(false);
      applyLocal(Object.assign(currentConfig(), profile.config || {}, { nom: profile.nom }), false);
      openDesk();
    } catch (e) {
      view(`<div class="pz-card g-card"><h1>Connexion impossible</h1><p class="sub">${esc(e.message || "Le service de connexion ne répond pas.")}</p><button class="pz-btn pz-btn-main" type="button" id="gRetry">Réessayer</button></div>`);
      $("#gRetry").addEventListener("click", route);
    }
  }
  loading();
  P.onRecovery(recoveryView).catch(() => {});
  if (/type=recovery/.test(location.hash)) recoveryView(); else route();
})();
