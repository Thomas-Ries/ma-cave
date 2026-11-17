/* Ma Cave — notifications PUSH en arrière-plan (src/lib/push.js)
 * Web Push standard (VAPID) : l'abonnement vit dans le service worker, le
 * résumé d'apogées part vers la Pages Function (méta-page « Push (abonnements) »),
 * et le cron Cloudflare déclenche l'envoi chaque soir — même app fermée.
 * iOS : uniquement si la PWA est installée sur l'écran d'accueil (iOS ≥ 16.4).
 */
import { PUSH_VAPID_PUB } from "../config.js";
import { swNotifs } from "./notifs.js";

/* Clé publique VAPID (base64url) → Uint8Array pour pushManager.subscribe */
function b64ToU8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function pushSubActuelle() {
  const reg = await swNotifs();
  if (!reg || !reg.pushManager) return null;
  try { return await reg.pushManager.getSubscription(); } catch { return null; }
}

/* "on" = abonné · "pret" = permission ok mais pas d'abonnement ·
   "refuse" / "non-demandee" · "incompatible" = pas de Push dans ce navigateur */
export async function pushEtat() {
  if (typeof Notification === "undefined" || !("PushManager" in window)) return "incompatible";
  const sub = await pushSubActuelle();
  if (sub) return "on";
  return Notification.permission === "granted" ? "pret" : Notification.permission === "denied" ? "refuse" : "non-demandee";
}

async function envoi(body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch("/api/push-sub", { method: "POST", headers, body: JSON.stringify(body) });
  try { return await res.json(); } catch { return { ok: false, error: "Réponse illisible du serveur" }; }
}

/* Abonne CET appareil et enregistre l'abonnement + le résumé d'apogées côté serveur */
export async function pushActiver(token, profil, digest) {
  if (typeof Notification === "undefined" || !("PushManager" in window))
    throw new Error("ce navigateur ne sait pas recevoir de push — installe la PWA sur l'écran d'accueil");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("permission refusée (Réglages > Ma Cave > Notifications pour la réactiver)");
  const reg = await swNotifs();
  if (!reg) throw new Error("service worker indisponible — réouvre l'app installée");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(PUSH_VAPID_PUB) });
  const j = await envoi({ action: "sub", profil, sub: sub.toJSON(), digest }, token);
  if (!j.ok) { try { await sub.unsubscribe(); } catch {} throw new Error(j.error || "enregistrement refusé côté serveur"); }
  return true;
}

/* Désabonne : côté serveur d'abord (abonnement mort pour le cron), puis localement */
export async function pushDesactiver(token) {
  const sub = await pushSubActuelle();
  if (sub) {
    try { await envoi({ action: "off", endpoint: sub.endpoint }, token); } catch {}
    try { await sub.unsubscribe(); } catch {}
  }
  return true;
}

/* Rafraîchit le résumé d'apogées de CET appareil (appelé à chaque synchro BDD) */
export async function pushMajDigest(token, digest) {
  const sub = await pushSubActuelle();
  if (!sub) return false;
  const j = await envoi({ action: "digest", endpoint: sub.endpoint, digest }, token);
  return !!j.ok;
}
