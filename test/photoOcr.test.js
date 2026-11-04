/* Tests du parseur d'étiquette OCR — node test/photoOcr.test.js */
import { parseEtiquette } from "../src/lib/photoOcr.js";

let ok = 0, ko = 0;
function eq(reel, attendu, label) {
  const trie = o => JSON.stringify(o == null ? o : Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {}));
  if (trie(reel) === trie(attendu)) { ok++; console.log(`  ✅ ${label}`); }
  else { ko++; console.log(`  ❌ ${label}\n     obtenu : ${trie(reel)}\n     attendu: ${trie(attendu)}`); }
}

console.log("Parseur d'étiquette — échantillons OCR");
eq(
  parseEtiquette("DOMAINES SCHLUMBERGER\nLES PRINCES ABBÉS\nRIESLING 2021\nAppellation Alsace Contrôlée\nMis en bouteille dans nos chais\n13% vol - 75 cl"),
  { nom: "Domaines Schlumberger", millesime: 2021, appellation: "Alsace", cepage: "Riesling" },
  "étiquette alsacienne complète"
);
eq(
  parseEtiquette("CHAMPAGNE BOLLINGER\nBRUT RÉSERVE\nMis en bouteille en Champagne\n75 cl"),
  { nom: "Champagne Bollinger", categorie: "Champagne" },
  "champagne : catégorie détectée, nom avec préfixe gardé"
);
eq(
  parseEtiquette("Domaine David Beaupère\n2023\nVin de France\nRouge\n13% ALCOOL - CONTIENT DES SULFITES"),
  { nom: "Domaine David Beaupère", millesime: 2023, categorie: "Rouge" },
  "vin de france rouge : bruit ignoré"
);
eq(
  parseEtiquette("CHÂTEAU HAUT-BRION\nPREMIER GRAND CRU CLASSÉ\n2018\nAppellation Pessac-Léognan Contrôlée\nMis en bouteille au château"),
  { nom: "Château Haut-Brion", millesime: 2018, appellation: "Pessac-Léognan" },
  "bordeaux : cru classé dans le bruit, appellation ok"
);
eq(
  parseEtiquette("LAPHROAIG\n10 ANS\nISLAY SINGLE MALT\nSCOTCH WHISKY\n40% VOL"),
  { nom: "Laphroaig", categorie: "Spiritueux" },
  "whisky → Spiritueux"
);
eq(
  parseEtiquette("ÉTABLI EN 1897\nMAS DE DAUMAS GASSAC\n2020\nROUGE\nSUD DE LA FRANCE"),
  { nom: "Mas de Daumas Gassac", millesime: 2020, categorie: "Rouge" },
  "« établi en 1897 » n'est pas le millésime"
);
eq(parseEtiquette(""), {}, "texte vide");
eq(parseEtiquette("75 cl\nwww.test.fr"), {}, "que du bruit → rien");

console.log(`\n${ok + ko} cas — ${ok} réussis${ko ? ", " + ko + " ÉCHecs" : ""}`);
process.exit(ko ? 1 : 0);
