/* Tests du moteur d'apogée — node test/apogee.test.js */
import { estimeApogee } from "../src/lib/apogee.js";

const YEAR = new Date().getFullYear();
let pass = 0, fail = 0;

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n     attendu ${JSON.stringify(want)}\n     obtenu  ${JSON.stringify(got)}`); }
}

console.log("Moteur d'apogée — 9 cas\n");

/* 1. Riesling Alsace 2019 : 4–12 → 2023–2031 */
let r = estimeApogee({ nom: "Riesling", cepage: "Riesling", region: "Alsace", categorie: "Blanc", millesime: 2019 });
check("Riesling Alsace 2019", [r.debut, r.fin], [2023, 2031]);

/* 2. Gewurztraminer VT : mention +4/+15 sur 3–8 → 2015+4=2019, 2012+8+15=2035 */
r = estimeApogee({ nom: "Gewurztraminer Vendanges Tardives", cepage: "Gewurztraminer", region: "Alsace", categorie: "Moelleux", millesime: 2012 });
check("Gewurz VT 2012", [r.debut, r.fin], [2019, 2035]);

/* 3. Morgon Côte du Py 2021 : gamay|beaujolais 3–8 + mention côte du py +1/+3 → 2025–2032 */
r = estimeApogee({ nom: "Morgon Côte du Py", cepage: "Gamay", region: "Beaujolais", categorie: "Rouge", millesime: 2021 });
check("Morgon Côte du Py 2021", [r.debut, r.fin], [2025, 2032]);

/* 4. Merlot Bordeaux 2013 : 3–8 → 2016–2021 */
r = estimeApogee({ nom: "Fronsac", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2013 });
check("Merlot Bordeaux 2013", [r.debut, r.fin], [2016, 2021]);

/* 5. Grand Cru Classé : la mention « cru classé » doit primer sur « grand cru » → +4/+10 */
r = estimeApogee({ nom: "Grand Cru Classé", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2015 });
check("Grand Cru Classé 2015 (+cru classé)", [r.debut, r.fin], [2022, 2033]);

/* 6. Maury moelleux sans cépage : catégorie Moelleux 8–25 */
r = estimeApogee({ nom: "Maury", cepage: "", region: "Languedoc", categorie: "Moelleux", millesime: 2018 });
check("Maury moelleux 2018", [r.debut, r.fin], [2026, 2043]);

/* 7. Crémant sans millésime (NM) : à boire maintenant → année en cours */
r = estimeApogee({ nom: "Crémant NM", cepage: "", region: "Alsace", categorie: "Effervescent", millesime: null });
check("Crémant NM (sans millésime)", [r.debut, r.fin], [YEAR, YEAR + 2]);

/* 8. Spiritueux : pas de fenêtre */
r = estimeApogee({ nom: "Springbank 10 ans", type: "Spiritueux", categorie: "Spiritueux", millesime: null });
check("Springbank → null", r, null);

/* 9. Vouvray « moelleux de garde » : mention moelleux de garde +5/+15 sur chenin 5–15 */
r = estimeApogee({ nom: "Vouvray moelleux de garde", cepage: "Chenin", region: "Vallée de la Loire", categorie: "Blanc", millesime: 2018 });
check("Vouvray moelleux de garde 2018", [r.debut, r.fin], [2028, 2048]);

console.log(`\n${pass}/9 réussis${fail ? `, ${fail} échoué(s)` : ""}`);
process.exit(fail ? 1 : 0);
