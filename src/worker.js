/* Pumpr · accès fondateurs par code personnel, limité à 3 appareils par code (téléphone, ordinateur, tablette).
   - /desk/* n'est servi qu'avec un cookie valide ; sinon redirection vers /acces.html
   - /api/redeem vérifie un code (empreinte SHA-256) et lie l'appareil au code
   - KV « CODES » : clé use:<étiquette> → { first, devices: [{ t, at, ua }] } (visible dans le tableau de bord Cloudflare)
   Supprimer une clé use:<étiquette> remet les appareils de ce code à zéro. Ajouter une étiquette à REVOKED retire l'accès. */
import { CODES, REVOKED } from "./codes.js";

const MAX_DEVICES = 3;
const COOKIE = "pumpr_dev";
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const norm = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
const rnd = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return hex(a); };
const getCookie = req => { const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)")); return m ? decodeURIComponent(m[1]) : null; };
const readUse = async (env, label) => { try { return JSON.parse(await env.CODES.get("use:" + label)) || null; } catch (e) { return null; } };

async function desk(req, env, url) {
  if (!env.CODES) return new Response("Accès momentanément indisponible.", { status: 503 });
  const c = getCookie(req);
  if (c && c.includes(".")) {
    const i = c.indexOf("."), label = c.slice(0, i), tok = c.slice(i + 1);
    if (/^F\d{2,}$/.test(label) && !REVOKED.includes(label)) {
      const use = await readUse(env, label);
      if (use && (use.devices || []).some(d => d.t === tok)) {
        const res = await env.ASSETS.fetch(req);
        const out = new Response(res.body, res);
        out.headers.set("X-Robots-Tag", "noindex, nofollow");
        out.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
        return out;
      }
    }
  }
  if ((req.headers.get("accept") || "").includes("text/html"))
    return new Response(null, { status: 302, headers: { location: new URL("/acces.html", url).toString(), "cache-control": "no-store" } });
  return new Response("Accès réservé aux fondateurs.", { status: 401, headers: { "cache-control": "no-store" } });
}

async function redeem(req, env) {
  if (!env.CODES) return json({ error: "Accès momentanément indisponible, réessaie plus tard." }, 503);
  let body; try { body = await req.json(); } catch (e) { return json({ error: "Requête invalide." }, 400); }
  const code = norm(body && body.code);
  if (code.length < 10 || code.length > 20) return json({ error: "Code inconnu ou retiré." }, 403);
  const label = CODES[await sha256(code)];
  if (!label || REVOKED.includes(label)) return json({ error: "Code inconnu ou retiré." }, 403);

  const use = (await readUse(env, label)) || { first: new Date().toISOString(), devices: [] };
  const cur = getCookie(req);
  const curTok = cur && cur.startsWith(label + ".") ? cur.slice(label.length + 1) : null;
  let tok = curTok && use.devices.some(d => d.t === curTok) ? curTok : null;
  if (!tok) {
    if (use.devices.length >= MAX_DEVICES) return json({ error: "Ce code est déjà utilisé sur " + MAX_DEVICES + " appareils. Écris-moi si tu as changé d'appareil." }, 403);
    tok = rnd();
    use.devices.push({ t: tok, at: new Date().toISOString(), ua: (req.headers.get("user-agent") || "").slice(0, 90) });
    await env.CODES.put("use:" + label, JSON.stringify(use));
  }
  const cookie = `${COOKIE}=${encodeURIComponent(label + "." + tok)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  return json({ ok: true }, 200, { "set-cookie": cookie });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/redeem" && req.method === "POST") return redeem(req, env);
    if (url.pathname === "/desk" || url.pathname.startsWith("/desk/")) return desk(req, env, url);
    return json({ error: "Introuvable" }, 404);
  }
};
