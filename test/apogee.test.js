/* Tests du moteur d'apogée — node test/apogee.test.js */
import { estimeApogee } from "../src/lib/apogee.js";

const YEAR = new Date().getFullYear();
let pass = 0, fail = 0;

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n     attendu ${JSON.stringify(want)}\n     obtenu  ${JSON.stringify(got)}`); }
}

console.log("Moteur d'apogée — hiérarchie appellation > cépage×région > cépage > région > catégorie\n");

/* --- Base : cépage × région --- */
/* 1. Riesling Alsace simple 2019 : 3–10 → 2022–2029 */
let r = estimeApogee({ nom: "Riesling", cepage: "Riesling", region: "Alsace", categorie: "Blanc", millesime: 2019 });
check("Riesling Alsace 2019", [r.debut, r.fin], [2022, 2029]);

/* 2. Gewurztraminer VT 2012 : 2–7 + mention VT +4/+15 → 2018–2034 */
r = estimeApogee({ nom: "Gewurztraminer Vendanges Tardives", cepage: "Gewurztraminer", region: "Alsace", categorie: "Moelleux", millesime: 2012 });
check("Gewurz VT 2012", [r.debut, r.fin], [2018, 2034]);

/* 3. Morgon 2021 : appellation 5–12 → 2026–2033 */
r = estimeApogee({ nom: "Morgon Côte du Py", cepage: "Gamay", region: "Beaujolais", categorie: "Rouge", millesime: 2021 });
check("Morgon Côte du Py 2021", [r.debut, r.fin], [2026, 2033]);

/* 4. Merlot Bordeaux simple (Fronsac) 2013 : 3–8 → 2016–2021 */
r = estimeApogee({ nom: "Fronsac", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2013 });
check("Merlot Bordeaux 2013", [r.debut, r.fin], [2016, 2021]);

/* --- Hiérarchie Bordeaux --- */
/* 5. Grand Cru Classé 2015 : appellation GCC 8–30 → 2023–2045 */
r = estimeApogee({ nom: "Grand Cru Classé", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2015 });
check("Grand Cru Classé 2015", [r.debut, r.fin], [2023, 2045]);

/* 6. Bordeaux Supérieur 2020 : 2–8 → 2022–2028 (hiérarchie vs GCC) */
r = estimeApogee({ nom: "Bordeaux Supérieur", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2020 });
check("Bordeaux Supérieur 2020", [r.debut, r.fin], [2022, 2028]);

/* 7. Pauillac 2018 : 8–25 → 2026–2043 */
r = estimeApogee({ nom: "Pauillac", cepage: "Cabernet Sauvignon", region: "Bordeaux", categorie: "Rouge", millesime: 2018 });
check("Pauillac 2018", [r.debut, r.fin], [2026, 2043]);

/* --- Hiérarchie Bourgogne --- */
/* 8. Gevrey-Chambertin 1er cru 2018 : 6–18 + 1er cru +3/+7 → 2027–2043 */
r = estimeApogee({ nom: "Gevrey-Chambertin 1er Cru", cepage: "Pinot Noir", region: "Bourgogne", categorie: "Rouge", millesime: 2018 });
check("Gevrey 1er cru 2018", [r.debut, r.fin], [2027, 2043]);

/* 9. Chablis Grand Cru 2020 : appellation 8–20, pas de double bonus mention → 2028–2040 */
r = estimeApogee({ nom: "Chablis Grand Cru", cepage: "Chardonnay", region: "Bourgogne", categorie: "Blanc", millesime: 2020 });
check("Chablis Grand Cru 2020", [r.debut, r.fin], [2028, 2040]);

/* --- Alsace : Grands Crus de longue garde --- */
/* 10. Riesling Grand Cru Alsace 2019 : 3–10 + GC alsace +4/+10 → 2026–2039 */
r = estimeApogee({ nom: "Riesling Grand Cru", cepage: "Riesling", region: "Alsace", categorie: "Blanc", millesime: 2019 });
check("Riesling GC Alsace 2019", [r.debut, r.fin], [2026, 2039]);

/* --- Champagne --- */
/* 11. Champagne millésimé 2012 : 3–15 → 2015–2027 */
r = estimeApogee({ nom: "Champagne", cepage: "", region: "Champagne", categorie: "Champagne", millesime: 2012 });
check("Champagne millésimé 2012", [r.debut, r.fin], [2015, 2027]);

/* 12. Champagne BSA sans millésime : à boire maintenant */
r = estimeApogee({ nom: "Brut", cepage: "", region: "Champagne", categorie: "Champagne", millesime: null });
check("Champagne BSA (sans millésime)", [r.debut, r.fin], [YEAR, YEAR + 2]);

/* --- Rhône / Loire / moelleux --- */
/* 13. Châteauneuf-du-Pape 2019 : 5–18 → 2024–2037 */
r = estimeApogee({ nom: "Châteauneuf-du-Pape", cepage: "", region: "Vallée du Rhône", categorie: "Rouge", millesime: 2019 });
check("Châteauneuf-du-Pape 2019", [r.debut, r.fin], [2024, 2037]);

/* 14. Maury 2018 : appellation 10–35 → 2028–2058 */
r = estimeApogee({ nom: "Maury", cepage: "", region: "Languedoc", categorie: "Moelleux", millesime: 2018 });
check("Maury moelleux 2018", [r.debut, r.fin], [2028, 2053]);

/* 15. Vouvray moelleux de garde 2018 : chenin|loire 4–12 + mention +5/+15 → 2027–2045 */
r = estimeApogee({ nom: "Vouvray moelleux de garde", cepage: "Chenin", region: "Vallée de la Loire", categorie: "Blanc", millesime: 2018 });
check("Vouvray moelleux de garde 2018", [r.debut, r.fin], [2027, 2045]);

/* 16. Crémant sans millésime (NM) : à boire maintenant */
r = estimeApogee({ nom: "Crémant NM", cepage: "", region: "Alsace", categorie: "Effervescent", millesime: null });
check("Crémant NM (sans millésime)", [r.debut, r.fin], [YEAR, YEAR + 2]);

/* 17. Spiritueux : pas de fenêtre */
r = estimeApogee({ nom: "Springbank 10 ans", type: "Spiritueux", categorie: "Spiritueux", millesime: null });
check("Springbank → null", r, null);

console.log(`\n${pass}/17 réussis${fail ? `, ${fail} échoué(s)` : ""}`);
process.exit(fail ? 1 : 0);
