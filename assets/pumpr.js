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
      const bought = await api.emailHasPurchase(email);
      if (!bought) return { ok: false, error: "Aucun achat trouvé pour cet e-mail. Utilise l'adresse avec laquelle tu as acheté Pumpr." };
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

    async isAdmin() {
      const s = await api.session();
      if (!LIVE) return true; /* démo : admin ouvert, signalé par un bandeau */
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
      const row = Object.assign({ user_id: s.id, email: s.email, derniere_connexion: now }, p);
      const { error } = await sb.from("profils").upsert(row, { onConflict: "user_id" });
      return error ? { ok: false, error: FR(error.message) } : { ok: true };
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

    admin: {
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
