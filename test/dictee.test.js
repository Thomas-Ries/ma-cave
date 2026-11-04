/* Tests du parseur de dictée — node test/dictee.test.js */
import { parseDictee, nbFr } from "../src/lib/dictee.js";

let ok = 0, ko = 0;
function eq(reel, attendu, label) {
  const trie = o => JSON.stringify(o == null ? o : Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {}));
  const a = trie(reel), b = trie(attendu);
  if (a === b) { ok++; console.log(`  ✅ ${label}`); }
  else { ko++; console.log(`  ❌ ${label}\n     obtenu : ${a}\n     attendu: ${b}`); }
}

console.log("Moteur de dictée — nombres");
eq(nbFr("2019"), 2019, "2019");
eq(nbFr("deux mille dix-neuf"), 2019, "deux mille dix-neuf");
eq(nbFr("quinze"), 15, "quinze");
eq(nbFr("six"), 6, "six");
eq(nbFr("quatre-vingt-dix-sept"), 97, "quatre-vingt-dix-sept");
eq(nbFr("douze euros cinquante"), null, "douze euros cinquante (pas un nombre pur)");
eq(nbFr("15,50"), 15.5, "15,50");

console.log("Moteur de dictée — phrases complètes");
eq(
  parseDictee("nom domaine David Beaupère millésime deux mille vingt-trois catégorie rouge quantité six bouteilles région Alsace"),
  { nom: "Domaine David Beaupère", millesime: 2023, categorie: "Rouge", quantite: 6, region: "Alsace" },
  "fiche complète en lettres"
);
eq(
  parseDictee("nom Domaine test année 2019 prix 15 euros cave Paris"),
  { nom: "Domaine test", millesime: 2019, prix: 15, cave: "Paris" },
  "nom + année + prix + cave"
);
eq(
  parseDictee("catégorie spiritueux nom Springbank"),
  { categorie: "Spiritueux", nom: "Springbank" },
  "ordre inversé"
);
eq(
  parseDictee("appellation Chablis cépage chardonnay pays France cuvée les Clos"),
  { appellation: "Chablis", cepage: "chardonnay", pays: "France", cuvee: "les Clos" },
  "champs détaillés"
);
eq(
  parseDictee("apogée de 2020 à 2030"),
  { apoDebut: 2020, apoFin: 2030 },
  "apogée bornée"
);
eq(
  parseDictee("format magnum commentaire cadeau d'anniversaire"),
  { format: "Magnum (1.5 L)", commentaire: "cadeau d'anniversaire" },
  "format + commentaire"
);
eq(
  parseDictee("nom Château Margaux catégorie vin rouge prix vingt euros"),
  { nom: "Château Margaux", categorie: "Rouge", prix: 20 },
  "vin rouge → Rouge, vingt euros"
);
eq(parseDictee("", {}), {}, "silence → rien");
eq(parseDictee("bonjour ça va", {}), { nom: "Bonjour ça va" }, "phrase sans mot-clé → devient le nom");
eq(
  parseDictee("nom Trimbach"),
  { nom: "Trimbach" },
  "nom seul"
);


console.log("Moteur de dictée — sans mots-clés (style naturel)");
eq(
  parseDictee("Domaine David Beaupère 2019 rouge six bouteilles 15 euros"),
  { nom: "Domaine David Beaupère", millesime: 2019, categorie: "Rouge", quantite: 6, prix: 15 },
  "tout sans mots-clés"
);
eq(
  parseDictee("Domaine des Lambrays deux mille dix-neuf"),
  { nom: "Domaine des Lambrays", millesime: 2019 },
  "millésime en lettres sans mot-clé"
);
eq(
  parseDictee("Clos Rouge"),
  { nom: "Clos Rouge" },
  "« Clos Rouge » : la couleur fait partie du nom"
);
eq(
  parseDictee("Champagne Bollinger 2019"),
  { nom: "Champagne Bollinger", millesime: 2019 },
  "« Champagne Bollinger » : catégorie pas volée au nom"
);
eq(
  parseDictee("Trimbach 2019 blanc"),
  { nom: "Trimbach", millesime: 2019, categorie: "Blanc" },
  "nom nu + année + couleur finale après année"
);
eq(
  parseDictee("Domaine Weinbach deux mille vingt-trois quantité douze bouteilles"),
  { nom: "Domaine Weinbach", millesime: 2023, quantite: 12 },
  "année en lettres + quantité"
);

console.log(`\n${ok + ko} cas — ${ok} réussis${ko ? ", " + ko + " ÉCHecs" : ""}`);
process.exit(ko ? 1 : 0);
