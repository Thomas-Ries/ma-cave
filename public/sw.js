/* Ma Cave — service worker de NOTIFICATIONS (sw.js)
 *
 * Ce SW ne met AUCUN fichier en cache (aucun handler fetch) : il ne peut donc
 * jamais servir d'anciens assets, contrairement au SW v1 qui posait problème.
 * Son unique rôle : planifier et afficher les notifications de l'app,
 * et rattraper celles manquées pendant qu'il était endormi.
 *
 * Cycle de vie d'un rappel :
 *  1. l'app envoie { type:"planifie", id, delayMs, titre, corps, tag } ;
 *  2. le SW l'enregistre dans IndexedDB avec son échéance et arme un timer ;
 *  3. à l'échéance → showNotification + suppression de la base ;
 *  4. si le SW a été tué entre-temps (app fermée longtemps), le rappel reste
 *     en base : il s'affichera au prochain réveil (réouverture de l'app,
 *     tap sur une notification, ou activation) — jamais perdu.
 */

const DB = "ma-cave-rappels";
const ST = "rappels";

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function put(item) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, "readwrite");
    t.objectStore(ST).put(item);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function del(id) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, "readwrite");
    t.objectStore(ST).delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function all() {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, "readonly");
    const req = t.objectStore(ST).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

async function affiche(it) {
  try {
    await self.registration.showNotification(it.titre || "Ma Cave", {
      body: it.corps || "",
      tag: it.tag || "ma-cave",
      renotify: true,
      icon: "/icon.svg",
      data: { url: "/" },
    });
  } catch {}
}

/* Arme (ou rattrape) tous les rappels en attente */
async function arme() {
  let items = [];
  try { items = await all(); } catch { return; }
  const now = Date.now();
  for (const it of items) {
    if (it.quand <= now) {
      await affiche(it);
      try { await del(it.id); } catch {}
    } else {
      /* Best effort : si le SW survit jusqu'à l'échéance, l'affichage est à l'heure ;
         sinon le rappel sera rattrapé au prochain réveil. */
      setTimeout(async () => {
        let reste = [];
        try { reste = await all(); } catch { return; }
        const cible = reste.find(x => x.id === it.id);
        if (cible && cible.quand <= Date.now()) { await affiche(cible); try { await del(cible.id); } catch {} }
      }, it.quand - now);
    }
  }
}

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil(self.clients.claim().then(arme).catch(() => {}));
});

self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "planifie") {
    put({ id: d.id, quand: Date.now() + (d.delayMs || 0), titre: d.titre, corps: d.corps, tag: d.tag })
      .then(arme).catch(() => {});
  }
  if (d.type === "verifie") arme().catch(() => {});
});

/* Tap sur une notification : focus l'app ouverte, sinon on l'ouvre */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of cs) { if ("focus" in c) return c.focus(); }
    try { return await self.clients.openWindow("/"); } catch { return null; }
  })());
});
