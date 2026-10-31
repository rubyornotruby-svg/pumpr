/* Pumpr · comptes, accès et réglages, partagés par le site de vente, le desk et l'admin.
   Deux modes :
   - "live" : Supabase (comptes réels, données protégées par les règles RLS du fichier supabase/schema.sql)
   - "demo" : tout est simulé dans ce navigateur (localStorage), pour tester le parcours sans serveur. */
(function () {
  "use strict";
  const CFG = window.PUMPR_CONFIG || {};
  const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4";
  const norm = e => String(e || "").trim().toLowerCase();
  const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(e));
  const DEFAULT_SITE = { prix: "", lien_achat: "", annonce: "", ventes_ouvertes: false };

  /* ---------------- mode démo ---------------- */
  const DKEY = "pumpr-demo-v1", SKEY = "pumpr-demo-session";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const db = () => Object.assign({ access: [], users: [], profiles: {}, site: Object.assign({}, DEFAULT_SITE) }, ls.get(DKEY, {}));
  const save = d => ls.set(DKEY, d);
  async function hash(email, pw) {
    const data = new TextEncoder().encode("pumpr|" + norm(email) + "|" + pw);
    try { const b = await crypto.subtle.digest("SHA-256", data); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join(""); }
    catch (e) { let h = 0; for (const c of data) h = (h * 31 + c) | 0; return "w" + h; }
  }

  /* ---------------- mode live ---------------- */
  let sb = null;
  function loadSdk() {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement("script"); s.src = SDK; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error("Impossible de charger le service de connexion. Vérifie ta connexion Internet."));
      document.head.appendChild(s);
    });
  }
  const FR = m => {
    m = String(m || "");
    if (/Invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
    if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton e-mail avec le lien reçu par mail.";
    if (/already registered|already exists/i.test(m)) return "Un compte existe déjà avec cet e-mail : connecte-toi.";
    if (/Password should be|weak/i.test(m)) return "Mot de passe trop faible : 8 caractères minimum.";
    if (/rate limit/i.test(m)) return "Trop de tentatives. Réessaie dans quelques minutes.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Pas de connexion au serveur. Vérifie ton Internet.";
    if (/PUMPR_PAS_ACHAT|Database error saving new user/i.test(m)) return "Aucun achat trouvé pour cet e-mail. Utilise l'adresse avec laquelle tu as acheté Pumpr.";
    if (/PUMPR_TROP/i.test(m)) return "Trop de demandes en peu de temps. Réessaie dans quelques minutes.";
    if (/PUMPR_EMAIL/i.test(m)) return "Adresse e-mail invalide.";
    return m || "Une erreur est survenue.";
  };

  let readyP = null;
  const api = {
    mode: LIVE ? "live" : "demo",
    okEmail, norm,
    ready() {
      if (!readyP) readyP = LIVE ? loadSdk().then(() => { sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey); }) : Promise.resolve();
      return readyP;
    },

    async session() {
      await api.ready();
      if (!LIVE) { const s = ls.get(SKEY, null); return s && db().users.some(u => u.email === s.email) ? s : null; }
      const { data } = await sb.auth.getSession();
      const u = data.session && data.session.user;
      return u ? { email: norm(u.email), id: u.id } : null;
    },

    async signIn(email, pw) {
      await api.ready(); email = norm(email);
      if (!okEmail(email)) return { ok: false, error: "Adresse e-mail invalide." };
      if (!pw) return { ok: false, error: "Entre ton mot de passe." };
      if (!LIVE) {
        const d = db(), u = d.users.find(x => x.email === email);
        if (!u || u.pw !== await hash(email, pw)) return { ok: false, error: "E-mail ou mot de passe incorrect." };
        ls.set(SKEY, { email, id: "demo-" + email }); return { ok: true };
      }
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      return error ? { ok: false, error: FR(error.message) } : { ok: true };
    },

    /* Création de compte : uniquement pour un e-mail qui a acheté. */
    async signUp(email, pw) {
      await api.ready(); email = norm(email);
      if (!okEmail(email)) return { ok: false, error: "Adresse e-mail invalide." };
      if (!pw || pw.length < 8) return { ok: false, error: "Mot de passe trop court : 8 caractères minimum." };
      /* démo : vérification ici · live : c'est le serveur qui refuse (règle 8c du fichier SQL) */
      if (!LIVE && !(await api.emailHasPurchase(email))) return { ok: false, error: "Aucun achat trouvé pour cet e-mail. Utilise l'adresse avec laquelle tu as acheté Pumpr." };
      if (!LIVE) {
        const d = db();
        if (d.users.some(u => u.email === email)) return { ok: false, error: "Un compte existe déjà avec cet e-mail : connecte-toi." };
        d.users.push({ email, pw: await hash(email, pw), cree_le: new Date().toISOString() }); save(d);
        ls.set(SKEY, { email, id: "demo-" + email }); return { ok: true };
      }
      const redirect = location.href.split("#")[0];
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } });
      if (error) return { ok: false, error: FR(error.message) };
      return { ok: true, needsConfirm: !data.session };
    },

    async resetPassword(email) {
      await api.ready(); email = norm(email);
      if (!okEmail(email)) return { ok: false, error: "Entre d'abord ton adresse e-mail." };
      if (!LIVE) return { ok: false, error: "En mode démo, il n'y a pas d'envoi d'e-mail. Crée un nouveau compte de test depuis l'admin." };
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
      return error ? { ok: false, error: FR(error.message) } : { ok: true };
    },

    /* Retour depuis le lien « mot de passe oublié » reçu par e-mail */
    async onRecovery(cb) {
      await api.ready(); if (!LIVE) return;
      if (/type=recovery/.test(location.hash)) cb();
      sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") cb(); });
    },
    async updatePassword(pw) {
      await api.ready();
      if (!pw || pw.length < 8) return { ok: false, error: "Mot de passe trop court : 8 caractères minimum." };
      if (!LIVE) return { ok: false, error: "Indisponible en mode démo." };
      const { error } = await sb.auth.updateUser({ password: pw });
      return error ? { ok: false, error: FR(error.message) } : { ok: true };
    },

    async signOut() { await api.ready(); if (!LIVE) { ls.del(SKEY); return; } await sb.auth.signOut(); },

    async emailHasPurchase(email) {
      email = norm(email);
      if (!LIVE) return db().access.some(a => a.email === email && a.actif);
      const { data, error } = await sb.rpc("email_a_achete", { e: email });
      return !error && data === true;
    },

    /* Accès de l'utilisateur connecté (null = pas d'achat ou accès retiré). */
    async access() {
      const s = await api.session(); if (!s) return null;
      if (!LIVE) return db().access.find(a => a.email === s.email && a.actif) || null;
      const { data } = await sb.from("acces").select("*").eq("email", s.email).maybeSingle();
      return data && data.actif ? data : null;
    },

    /* Mot de passe admin provisoire du mode démo (empreinte PBKDF2, le mot de passe n'est pas dans le code).
       Ce n'est qu'un frein pour les curieux : la vraie protection arrive avec Supabase. */
    async unlockDemoAdmin(pw) {
      if (LIVE) return false;
      try {
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw || ""), "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("pumpr-admin-demo-v1"), iterations: 250000 }, key, 256);
        const hex = Array.from(new Uint8Array(bits)).map(x => x.toString(16).padStart(2, "0")).join("");
        const ok = hex === "d9d78f8805f06b69b8b6ff1c7f2e4b7780e8b0a673b1dc02f618e7c00646cb59";
        if (ok) ls.set("pumpr-demo-admin", true);
        return ok;
      } catch (e) { return false; }
    },
    lockDemoAdmin() { ls.del("pumpr-demo-admin"); },

    async isAdmin() {
      const s = await api.session();
      if (!LIVE) return ls.get("pumpr-demo-admin", false) === true;
      if (!s) return false;
      const { data, error } = await sb.rpc("est_admin");
      return !error && data === true;
    },

    async profile() {
      const s = await api.session(); if (!s) return null;
      if (!LIVE) return db().profiles[s.email] || null;
      const { data } = await sb.from("profils").select("*").eq("user_id", s.id).maybeSingle();
      return data || null;
    },

    async saveProfile(p) {
      const s = await api.session(); if (!s) return { ok: false, error: "Session expirée, reconnecte-toi." };
      const now = new Date().toISOString();
      if (!LIVE) {
        const d = db(), cur = d.profiles[s.email] || { email: s.email, cree_le: now };
        d.profiles[s.email] = Object.assign(cur, p, { email: s.email, derniere_connexion: now }); save(d); return { ok: true };
      }
      /* seuls ces champs sont modifiables (règle 8d du fichier SQL) */
      const upd = { derniere_connexion: now }; ["nom", "config", "configure"].forEach(k => { if (k in p) upd[k] = p[k]; });
      const r1 = await sb.from("profils").update(upd).eq("user_id", s.id).select("user_id");
      if (r1.error) return { ok: false, error: FR(r1.error.message) };
      if (r1.data && r1.data.length) return { ok: true };
      const r2 = await sb.from("profils").insert(Object.assign({ user_id: s.id, email: s.email }, upd));
      return r2.error ? { ok: false, error: FR(r2.error.message) } : { ok: true };
    },

    async touch() {
      const s = await api.session(); if (!s) return;
      const now = new Date().toISOString();
      if (!LIVE) { const d = db(); if (d.profiles[s.email]) { d.profiles[s.email].derniere_connexion = now; save(d); } return; }
      await sb.from("profils").update({ derniere_connexion: now }).eq("user_id", s.id);
    },

    async site() {
      await api.ready();
      if (!LIVE) return Object.assign({}, DEFAULT_SITE, db().site);
      const { data } = await sb.from("reglages_site").select("*").eq("id", 1).maybeSingle();
      return Object.assign({}, DEFAULT_SITE, data || {});
    },

    /* Demande de rétractation (bouton obligatoire depuis le 19/06/2026) */
    async requestWithdrawal(v) {
      await api.ready();
      const email = norm(v.email);
      if (!okEmail(email)) return { ok: false, error: "Adresse e-mail invalide." };
      const row = { email, nom: String(v.nom || "").slice(0, 80), commande: String(v.commande || "").slice(0, 80), message: String(v.message || "").slice(0, 600) };
      if (!LIVE) {
        const d = db(); d.retractations = d.retractations || [];
        const r = Object.assign({ id: Date.now().toString(36), cree_le: new Date().toISOString(), statut: "nouvelle" }, row);
        d.retractations.push(r); save(d); return { ok: true, ref: r.id.toUpperCase(), date: r.cree_le };
      }
      const { data, error } = await sb.rpc("demander_retractation", { e: row.email, n: row.nom, c: row.commande, m: row.message });
      return error ? { ok: false, error: FR(error.message) } : { ok: true, ref: String(data).slice(0, 8).toUpperCase(), date: new Date().toISOString() };
    },

    admin: {
      async listWithdrawals() {
        if (!LIVE) return (db().retractations || []).slice().sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));
        const { data, error } = await sb.from("retractations").select("*").order("cree_le", { ascending: false });
        if (error) throw new Error(FR(error.message)); return data || [];
      },
      async setWithdrawal(id, statut) {
        if (!LIVE) { const d = db(), r = (d.retractations || []).find(x => x.id === id); if (r) { r.statut = statut; save(d); } return { ok: true }; }
        const { error } = await sb.from("retractations").update({ statut }).eq("id", id);
        return error ? { ok: false, error: FR(error.message) } : { ok: true };
      },
      async saveSite(v) {
        const clean = { prix: String(v.prix || "").slice(0, 40), lien_achat: String(v.lien_achat || "").trim(), annonce: String(v.annonce || "").slice(0, 160), ventes_ouvertes: !!v.ventes_ouvertes };
        if (clean.lien_achat && !/^https:\/\//i.test(clean.lien_achat)) return { ok: false, error: "Le lien d'achat doit commencer par https://" };
        if (!LIVE) { const d = db(); d.site = clean; save(d); return { ok: true }; }
        const { error } = await sb.from("reglages_site").update(clean).eq("id", 1);
        return error ? { ok: false, error: FR(error.message) } : { ok: true };
      },
      async listAccess() {
        if (!LIVE) return db().access.slice().sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));
        const { data, error } = await sb.from("acces").select("*").order("cree_le", { ascending: false });
        if (error) throw new Error(FR(error.message)); return data || [];
      },
      async grant(email, note, source) {
        email = norm(email);
        if (!okEmail(email)) return { ok: false, error: "Adresse e-mail invalide." };
        const row = { email, actif: true, note: String(note || "").slice(0, 120), source: source || "manuel" };
        if (!LIVE) {
          const d = db(), i = d.access.findIndex(a => a.email === email);
          if (i >= 0) Object.assign(d.access[i], row); else d.access.push(Object.assign(row, { cree_le: new Date().toISOString() }));
          save(d); return { ok: true };
        }
        const { error } = await sb.from("acces").upsert(row, { onConflict: "email" });
        return error ? { ok: false, error: FR(error.message) } : { ok: true };
      },
      async setActive(email, on) {
        email = norm(email);
        if (!LIVE) { const d = db(), a = d.access.find(x => x.email === email); if (a) { a.actif = !!on; save(d); } return { ok: true }; }
        const { error } = await sb.from("acces").update({ actif: !!on }).eq("email", email);
        return error ? { ok: false, error: FR(error.message) } : { ok: true };
      },
      async remove(email) {
        email = norm(email);
        if (!LIVE) { const d = db(); d.access = d.access.filter(a => a.email !== email); save(d); return { ok: true }; }
        const { error } = await sb.from("acces").delete().eq("email", email);
        return error ? { ok: false, error: FR(error.message) } : { ok: true };
      },
      async listProfiles() {
        if (!LIVE) { const d = db(); return d.users.map(u => Object.assign({ email: u.email, cree_le: u.cree_le }, d.profiles[u.email] || {})); }
        const { data, error } = await sb.from("profils").select("*").order("derniere_connexion", { ascending: false });
        if (error) throw new Error(FR(error.message)); return data || [];
      },
      demoReset() { if (!LIVE) { ls.del(DKEY); ls.del(SKEY); } }
    }
  };
  window.Pumpr = api;
})();

/* Bouton « œil » pour voir le mot de passe (tous les champs mot de passe, même ajoutés plus tard) */
(() => {
  "use strict";
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const SHUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const T = s => (window.PumprLang ? window.PumprLang.t(s) : s);
  function css() {
    if (document.getElementById("pzPwCss")) return;
    const st = document.createElement("style"); st.id = "pzPwCss";
    st.textContent = ".pz-pw{position:relative;display:block}.pz-pw>input{width:100%;padding-inline-end:46px!important}.pz-pw-b{position:absolute;inset-inline-end:6px;top:50%;transform:translateY(-50%);width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:#8f97b0;cursor:pointer;padding:0}.pz-pw-b:hover,.pz-pw-b:focus-visible{color:#eef1f8;background:rgba(255,255,255,.06);outline:none}.pz-pw-b[aria-pressed=true]{color:var(--pz-lime,#c6ff3d)}.pz-pw-b svg{width:19px;height:19px}";
    document.head.appendChild(st);
  }
  function wrap(inp) {
    if (inp.dataset.pw || inp.closest(".pz-pw")) return;
    inp.dataset.pw = "1"; css();
    const box = document.createElement("span"); box.className = "pz-pw";
    inp.parentNode.insertBefore(box, inp); box.appendChild(inp);
    const b = document.createElement("button"); b.type = "button"; b.className = "pz-pw-b"; b.tabIndex = 0;
    const set = on => { inp.type = on ? "text" : "password"; b.setAttribute("aria-pressed", String(on)); b.innerHTML = on ? SHUT : EYE; b.setAttribute("aria-label", T(on ? "Masquer le mot de passe" : "Afficher le mot de passe")); b.title = b.getAttribute("aria-label"); };
    b.addEventListener("mousedown", e => e.preventDefault()); /* garde le curseur dans le champ */
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); set(inp.type === "password"); inp.focus(); });
    /* on recache le mot de passe à l'envoi du formulaire (pas d'enregistrement en clair par le navigateur) */
    const f = inp.form; if (f && !f.dataset.pwHide) { f.dataset.pwHide = "1"; f.addEventListener("submit", () => f.querySelectorAll(".pz-pw>input").forEach(i => { i.type = "password"; }), true); }
    set(false); box.appendChild(b);
  }
  const scan = root => { if (root && root.querySelectorAll) { if (root.matches && root.matches('input[type="password"]')) wrap(root); root.querySelectorAll('input[type="password"]').forEach(wrap); } };
  const start = () => { scan(document.body); new MutationObserver(l => l.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
