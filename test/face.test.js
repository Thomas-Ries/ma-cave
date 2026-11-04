/* Tests de la lib biométrique (partie pure, sans WebAuthn) — node test/face.test.js */
import { b64u, deb64u, enregistrerCle, cleDe, supprimerCle, associerCle } from "../src/lib/face.js";

let ok = 0, ko = 0;
function assert(cond, label, obtenu) {
  if (cond) { ok++; console.log(`  ✅ ${label}`); }
  else { ko++; console.log(`  ❌ ${label}${obtenu !== undefined ? " — obtenu : " + obtenu : ""}`); }
}

console.log("Biométrie WebAuthn — partie pure");

/* base64url */
const u8 = Uint8Array.from([1, 2, 3, 250, 255, 0, 128]);
const enc = b64u(u8);
assert(enc.indexOf("+") === -1 && enc.indexOf("/") === -1 && enc.indexOf("=") === -1, "base64url sans +, / ni =", enc);
assert(Array.from(deb64u(enc)).every((v, i) => v === u8[i]), "aller-retour b64u → deb64u identique");

/* persistance */
enregistrerCle("thomas", enc);
assert(cleDe("thomas") === enc, "clé relue après enregistrement");
assert(cleDe("inconnu") === null, "profil sans clé → null");
try { enregistrerCle("x", ""); assert(false, "clé vide rejetée"); }
catch { assert(true, "clé vide rejetée"); }
supprimerCle("thomas");
assert(cleDe("thomas") === null, "suppression effective");

/* association profil ← clé */
enregistrerCle("a", b64u(Uint8Array.from([1])));
enregistrerCle("b", b64u(Uint8Array.from([2])));
assert(associerCle(b64u(Uint8Array.from([1])), ["a", "b"]) === "a", "clé 1 → profil a");
assert(associerCle(b64u(Uint8Array.from([2])), ["a", "b"]) === "b", "clé 2 → profil b");
assert(associerCle(b64u(Uint8Array.from([9])), ["a", "b"]) === null, "clé inconnue → aucun profil");
assert(associerCle(b64u(Uint8Array.from([1])), ["b"]) === null, "profil non inscrit ignoré");
supprimerCle("a"); supprimerCle("b");

console.log(`\n${ok + ko} cas — ${ok} réussis${ko ? ", " + ko + " ÉCHecs" : ""}`);
process.exit(ko ? 1 : 0);
