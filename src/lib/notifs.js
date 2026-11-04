/* Ma Cave — notifications via le service worker (src/lib/notifs.js)
 * Toutes les notifications passent par le SW (/sw.js) : elles s'affichent même
 * si la page est en arrière-plan, et les rappels manqués sont rattrapés.
 * Repli automatique sur new Notification() si le SW n'est pas disponible.
 */

let regP = null;

export async function swNotifs() {
  if (!("serviceWorker" in navigator)) return null;
  if (!regP) regP = navigator.serviceWorker.register("/sw.js").catch(() => null);
  const reg = await regP;
  if (!reg) return null;
  try { await navigator.serviceWorker.ready; } catch {}
  return reg;
}

/* Notification immédiate (remplace new Notification) */
export async function notifie(titre, corps, tag) {
  const reg = await swNotifs();
  if (reg && reg.active) {
    reg.active.postMessage({ type: "planifie", id: "n-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), delayMs: 0, titre, corps, tag });
    return true;
  }
  try { new Notification(titre, { body: corps, tag }); return true; } catch { return false; }
}

/* Rappel programmé : renvoie false si impossible (SW absent) */
export async function planifieRappel(id, delayMs, titre, corps, tag) {
  const reg = await swNotifs();
  if (reg && reg.active) {
    reg.active.postMessage({ type: "planifie", id, delayMs, titre, corps, tag });
    return true;
  }
  return false;
}

/* Au lancement de l'app : affiche les rappels manqués pendant l'absence */
export async function rattrapeRappels() {
  const reg = await swNotifs();
  if (reg && reg.active) reg.active.postMessage({ type: "verifie" });
}
