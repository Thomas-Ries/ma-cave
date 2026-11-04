/* Reconnaissance faciale 100 % locale : face-api.js n'est chargé qu'à la
   demande (chunk séparé du bundle principal), les modèles sont téléchargés
   au premier usage depuis un CDN public, et seul un descripteur numérique
   (128 valeurs) est stocké par profil — aucune image ne quitte l'appareil. */

/* Stockage : localStorage dans le navigateur, simple Map au node (tests) */
const mem = new Map();
const store = {
  get(k) { try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : (mem.get(k) ?? null); } catch { return mem.get(k) ?? null; } },
  set(k, v) { try { if (typeof localStorage !== "undefined") { localStorage.setItem(k, v); return; } } catch {} mem.set(k, v); },
  del(k) { try { if (typeof localStorage !== "undefined") { localStorage.removeItem(k); return; } } catch {} mem.delete(k); }
};
const K = id => "ma-cave-face-" + id;

/* ---------- Descripteurs : persistance (pur, testable au node) ---------- */
export function enregistrerVisage(profilId, desc) {
  if (!profilId || !Array.isArray(desc) || desc.length !== 128) throw new Error("descripteur invalide");
  store.set(K(profilId), JSON.stringify({ d: desc, ts: Date.now() }));
}
export function visageDe(profilId) {
  try {
    const v = JSON.parse(store.get(K(profilId)) || "null");
    return v && Array.isArray(v.d) && v.d.length === 128 ? v.d : null;
  } catch { return null; }
}
export function supprimerVisage(profilId) { store.del(K(profilId)); }

/* Distance euclidienne entre deux descripteurs (0 = jumeaux) */
export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < 128; i++) { const d = (a[i] || 0) - (b[i] || 0); s += d * d; }
  return Math.sqrt(s);
}

/* Identification : le profil inscrit le plus proche, sous le seuil */
export function identifier(desc, ids, seuil = 0.5) {
  let meilleur = null, meilleure = seuil;
  for (const id of ids) {
    const ref = visageDe(id);
    if (!ref) continue;
    const d = distance(desc, ref);
    if (d < meilleure) { meilleure = d; meilleur = id; }
  }
  return meilleur;
}

/* Descripteur bidon pour les tests (écart contrôlé) */
export function descripteurFactice(base = 0, ecart = 0) {
  return Array.from({ length: 128 }, (_, i) => base + (i % 7 === 0 ? ecart : 0));
}

/* ---------- Caméra + modèle (navigateur uniquement) ---------- */
const POIDS = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";
let api = null, enCours = null;

async function modele() {
  if (api) return api;
  if (!enCours) {
    enCours = (async () => {
      const faceapi = await import("face-api");
      await faceapi.nets.tinyFaceDetector.loadFromUri(POIDS);
      await faceapi.nets.faceLandmark68Net.loadFromUri(POIDS);
      await faceapi.nets.faceRecognitionNet.loadFromUri(POIDS);
      api = faceapi;
      return api;
    })();
  }
  return enCours;
}

/* Extrait le descripteur du visage vu dans la vidéo (null si aucun visage) */
export async function visageDepuisVideo(video) {
  const faceapi = await modele();
  const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  const det = await faceapi.detectSingleFace(video, opt).withFaceLandmarks().withFaceDescriptor();
  return det ? Array.from(det.descriptor) : null;
}
