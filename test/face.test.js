/* Tests de la lib reconnaissance faciale (partie pure, sans caméra) — node test/face.test.js */
import { enregistrerVisage, visageDe, supprimerVisage, distance, identifier, descripteurFactice } from "../src/lib/face.js";

let ok = 0, ko = 0;
function assert(cond, label, obtenu) {
  if (cond) { ok++; console.log(`  ✅ ${label}`); }
  else { ko++; console.log(`  ❌ ${label}${obtenu !== undefined ? " — obtenu : " + obtenu : ""}`); }
}

console.log("Reconnaissance faciale — partie pure");

/* distance */
assert(distance(descripteurFactice(), descripteurFactice()) === 0, "distance nulle à soi-même");
const d = distance(descripteurFactice(0), descripteurFactice(0, 0.05));
assert(d > 0 && d < 0.5, "distance faible pour des visages proches", d);
assert(distance(descripteurFactice(0), descripteurFactice(1)) > 0.5, "distance forte pour des visages différents");

/* enregistrement / lecture / suppression */
enregistrerVisage("thomas", descripteurFactice(0.1));
assert(!!visageDe("thomas"), "descripteur relu après enregistrement");
assert(visageDe("inconnu") === null, "profil non inscrit → null");
assert(visageDe("thomas").length === 128, "128 valeurs stockées");
try { enregistrerVisage("x", [1, 2, 3]); assert(false, "descripteur court rejeté"); }
catch { assert(true, "descripteur court rejeté"); }
supprimerVisage("thomas");
assert(visageDe("thomas") === null, "suppression effective");

/* identification */
enregistrerVisage("a", descripteurFactice(0));
enregistrerVisage("b", descripteurFactice(1));
assert(identifier(descripteurFactice(0, 0.02), ["a", "b"]) === "a", "visage proche de a → a");
assert(identifier(descripteurFactice(1, -0.02), ["a", "b"]) === "b", "visage proche de b → b");
assert(identifier(descripteurFactice(0.5), ["a", "b"]) === null, "visage trop loin des deux → aucun");
assert(identifier(descripteurFactice(0, 0.02), ["b"]) === null, "seul b inscrit → a ignoré");
supprimerVisage("a"); supprimerVisage("b");

console.log(`\n${ok + ko} cas — ${ok} réussis${ko ? ", " + ko + " ÉCHecs" : ""}`);
process.exit(ko ? 1 : 0);
