/* Déverrouillage biométrique via WebAuthn : Face ID sur iOS, empreinte ou
   visage sur Android, Touch ID sur Mac, Windows Hello — le système affiche
   son propre prompt natif. Rien ne sort de l'appareil : on ne stocke que
   l'identifiant de la clé (base64url) créée par l'authentificateur. */

/* Stockage : localStorage dans le navigateur, simple Map au node (tests) */
const mem = new Map();
const store = {
  get(k) { try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : (mem.get(k) ?? null); } catch { return mem.get(k) ?? null; } },
  set(k, v) { try { if (typeof localStorage !== "undefined") { localStorage.setItem(k, v); return; } } catch {} mem.set(k, v); },
  del(k) { try { if (typeof localStorage !== "undefined") { localStorage.removeItem(k); return; } } catch {} mem.delete(k); }
};
const K = id => "ma-cave-bio-" + id;

/* ---------- base64url (pur, testable au node) ---------- */
export function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function deb64u(s) {
  const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
const rand = n => { const u = new Uint8Array(n); crypto.getRandomValues(u); return u; };

/* ---------- Persistance par profil (pur) ---------- */
export function enregistrerCle(profilId, credB64) {
  if (!profilId || !credB64) throw new Error("clé biométrique invalide");
  store.set(K(profilId), JSON.stringify({ cred: credB64, ts: Date.now() }));
}
export function cleDe(profilId) {
  try {
    const v = JSON.parse(store.get(K(profilId)) || "null");
    return v && typeof v.cred === "string" ? v.cred : null;
  } catch { return null; }
}
export function supprimerCle(profilId) { store.del(K(profilId)); }

/* Associe l'identifiant de clé renvoyé par l'authentificateur à un profil */
export function associerCle(rawB64, ids) {
  return ids.find(i => cleDe(i) === rawB64) || null;
}

/* ---------- WebAuthn (navigateur uniquement) ---------- */
export function biometrieDispo() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials?.create;
}

/* La biométrie ne marche QUE dans la PWA installée (écran d'accueil).
   Sur Mac/PC ou navigateur classique : pas de prompt du tout — le
   secours est le code à 4 chiffres du profil. */
export function enPWA() {
  return typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches === true || window.navigator?.standalone === true);
}

/* Vrai check biométrique : PWA installée ET Face ID / empreinte sur CET
   appareil. Si non, on n'ouvre aucun prompt (sinon le navigateur propose
   des clés d'accès avec QR code, téléphone voisin, etc. — on n'en veut pas). */
export async function biomometriePrete() {
  if (!enPWA() || !biometrieDispo()) return false;
  try { return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}

/* Inscription : crée la clé biométrique du profil (prompt Face ID/empreinte) */
export async function inscrireBiometrie(profilId) {
  if (!(await biomometriePrete())) { const e = new Error("incompatible"); e.bioIncompatible = true; throw e; }
  const pk = {
    challenge: rand(32),
    rp: { name: "Ma Cave", id: location.hostname },
    user: { id: new TextEncoder().encode(profilId), name: "Profil " + profilId, displayName: "Ma Cave — " + profilId },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
    timeout: 60000,
    attestation: "none"
  };
  const cred = await navigator.credentials.create({ publicKey: pk });
  const id = b64u(cred.rawId);
  enregistrerCle(profilId, id);
  return id;
}

/* Vérification au démarrage (ou test juste après activation) */
export async function verifierBiometrie(ids) {
  const allow = ids.map(cleDe).filter(Boolean).map(cred => ({ type: "public-key", id: deb64u(cred) }));
  if (!allow.length) return null;
  if (!(await biomometriePrete())) { const e = new Error("incompatible"); e.bioIncompatible = true; throw e; }
  const pk = { challenge: rand(32), rpId: location.hostname, userVerification: "required", timeout: 60000, allowCredentials: allow };
  const cred = await navigator.credentials.get({ publicKey: pk });
  return associerCle(b64u(cred.rawId), ids);
}
