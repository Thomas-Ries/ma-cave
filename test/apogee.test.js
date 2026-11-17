/* Tests du moteur d'apogée — node test/apogee.test.js */
import { estimeApogee } from "../src/lib/apogee.js";

const YEAR = new Date().getFullYear();
let pass = 0, fail = 0;

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n     attendu ${JSON.stringify(want)}\n     obtenu  ${JSON.stringify(got)}`); }
}

console.log("Moteur d'apogée v2 — hiérarchie + mentions + format + millésimes\n");

/* --- Base : cépage × région --- */
/* 1. Riesling Alsace simple 2019 : 4–15 + grand millésime alsace (+2/+4) → 2025–2038 */
let r = estimeApogee({ nom: "Riesling", cepage: "Riesling", region: "Alsace", categorie: "Blanc", millesime: 2019 });
check("Riesling Alsace 2019 (grand millésime)", [r.debut, r.fin], [2025, 2038]);

/* 2. Gewurztraminer VT 2012 : 3–10 + mention VT +5/+20 → 2020–2042 */
r = estimeApogee({ nom: "Gewurztraminer Vendanges Tardives", cepage: "Gewurztraminer", region: "Alsace", categorie: "Moelleux", millesime: 2012 });
check("Gewurz VT 2012", [r.debut, r.fin], [2020, 2042]);

/* 2b. Gewurztraminer 2020 avec SPÉCIFICITÉ Vendanges tardives → 2028–2050 */
r = estimeApogee({ nom: "Gewurztraminer", cepage: "Gewurztraminer", specificite: "Vendanges tardives", region: "Alsace", categorie: "Blanc", millesime: 2020 });
check("Gewurz VT 2020 (spécificité)", [r.debut, r.fin], [2028, 2050]);

/* 2c. Vin de glace 2021 : riesling alsace 4–15 + glace +8/+25 → 2033–2061 */
r = estimeApogee({ nom: "Riesling", cepage: "Riesling", specificite: "Vin de glace", region: "Alsace", categorie: "Moelleux", millesime: 2021 });
check("Vin de glace 2021 (spécificité)", [r.debut, r.fin], [2033, 2061]);

/* 2d. Blanc moelleux (catégorie Blanc + spécificité) : alsace blanc 2–8 + liquoreux +5/+17 → 2027–2045 */
r = estimeApogee({ nom: "Pinot Gris", cepage: "", specificite: "Moelleux / Liquoreux", region: "Alsace", categorie: "Blanc", millesime: 2020 });
check("Blanc moelleux 2020 (spécificité)", [r.debut, r.fin], [2027, 2045]);

/* 3. Morgon 2021 : appellation 7–15 → 2028–2036 */
r = estimeApogee({ nom: "Morgon Côte du Py", cepage: "Gamay", region: "Beaujolais", categorie: "Rouge", millesime: 2021 });
check("Morgon Côte du Py 2021", [r.debut, r.fin], [2028, 2036]);

/* 4. Fronsac 2013 : appellation 4–10 + millésime délicat (-1/-2) → 2016–2021 */
r = estimeApogee({ nom: "Fronsac", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2013 });
check("Fronsac 2013 (millésime délicat)", [r.debut, r.fin], [2016, 2021]);

/* --- Hiérarchie Bordeaux --- */
/* 5. Grand Cru Classé 2015 : GCC 10–35 + grand millésime (+2/+4) → 2027–2054 */
r = estimeApogee({ nom: "Grand Cru Classé", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2015 });
check("Grand Cru Classé 2015 (grand millésime)", [r.debut, r.fin], [2027, 2054]);

/* 6. Bordeaux Supérieur 2020 : 2–8 + grand millésime → 2024–2032 */
r = estimeApogee({ nom: "Bordeaux Supérieur", cepage: "Merlot", region: "Bordeaux", categorie: "Rouge", millesime: 2020 });
check("Bordeaux Supérieur 2020 (grand millésime)", [r.debut, r.fin], [2024, 2032]);

/* 7. Pauillac 2018 : 10–30 + grand millésime → 2030–2052 */
r = estimeApogee({ nom: "Pauillac", cepage: "Cabernet Sauvignon", region: "Bordeaux", categorie: "Rouge", millesime: 2018 });
check("Pauillac 2018 (grand millésime)", [r.debut, r.fin], [2030, 2052]);

/* --- Hiérarchie Bourgogne --- */
/* 8. Gevrey-Chambertin 1er cru 2018 : 8–20 + 1er cru +4/+8 → 2030–2046 */
r = estimeApogee({ nom: "Gevrey-Chambertin 1er Cru", cepage: "Pinot Noir", region: "Bourgogne", categorie: "Rouge", millesime: 2018 });
check("Gevrey 1er cru 2018", [r.debut, r.fin], [2030, 2046]);

/* 9. Chablis Grand Cru 2020 : appellation 10–25 + grand millésime (+2/+4) → 2032–2049 */
r = estimeApogee({ nom: "Chablis Grand Cru", cepage: "Chardonnay", region: "Bourgogne", categorie: "Blanc", millesime: 2020 });
check("Chablis Grand Cru 2020 (grand millésime)", [r.debut, r.fin], [2032, 2049]);

/* --- Alsace : Grands Crus de longue garde --- */
/* 10. Riesling Grand Cru Alsace 2019 : 4–15 + GC alsace +5/+12 + millésime +2/+4 → 2030–2050 */
r = estimeApogee({ nom: "Riesling Grand Cru", cepage: "Riesling", region: "Alsace", categorie: "Blanc", millesime: 2019 });
check("Riesling GC Alsace 2019 (grand millésime)", [r.debut, r.fin], [2030, 2050]);

/* --- Champagne --- */
/* 11. Champagne millésimé 2012 : 5–18 → 2017–2030 */
r = estimeApogee({ nom: "Champagne", cepage: "", region: "Champagne", categorie: "Champagne", millesime: 2012 });
check("Champagne millésimé 2012", [r.debut, r.fin], [2017, 2030]);

/* 12. Champagne BSA sans millésime : à boire maintenant */
r = estimeApogee({ nom: "Brut", cepage: "", region: "Champagne", categorie: "Champagne", millesime: null });
check("Champagne BSA (sans millésime)", [r.debut, r.fin], [YEAR, YEAR + 2]);

/* --- Rhône / Loire / moelleux --- */
/* 13. Châteauneuf-du-Pape 2019 : 8–20 + grand millésime rhône → 2029–2043 */
r = estimeApogee({ nom: "Châteauneuf-du-Pape", cepage: "", region: "Vallée du Rhône", categorie: "Rouge", millesime: 2019 });
check("Châteauneuf-du-Pape 2019 (grand millésime)", [r.debut, r.fin], [2029, 2043]);

/* 14. Maury 2018 : appellation 10–40 → 2028–2058 */
r = estimeApogee({ nom: "Maury", cepage: "", region: "Languedoc", categorie: "Moelleux", millesime: 2018 });
check("Maury moelleux 2018", [r.debut, r.fin], [2028, 2058]);

/* 15. Vouvray moelleux de garde 2018 : vouvray 3–12 + moelleux de garde +6/+18 → 2027–2048 */
r = estimeApogee({ nom: "Vouvray moelleux de garde", cepage: "Chenin", region: "Vallée de la Loire", categorie: "Blanc", millesime: 2018 });
check("Vouvray moelleux de garde 2018", [r.debut, r.fin], [2027, 2048]);

/* 16. Crémant sans millésime (NM) : à boire maintenant */
r = estimeApogee({ nom: "Crémant NM", cepage: "", region: "Alsace", categorie: "Effervescent", millesime: null });
check("Crémant NM (sans millésime)", [r.debut, r.fin], [YEAR, YEAR + 2]);

/* 17. Spiritueux : pas de fenêtre */
r = estimeApogee({ nom: "Springbank 10 ans", type: "Spiritueux", categorie: "Spiritueux", millesime: null });
check("Springbank → null", r, null);

/* --- v2.13 : modificateurs format & millésime, fenêtres élargies --- */
/* 18. Sauternes 2015 : 15–40 + grand millésime → 2032–2059 */
r = estimeApogee({ nom: "Sauternes", cepage: "", region: "Bordeaux", categorie: "Moelleux", millesime: 2015 });
check("Sauternes 2015 (longue garde)", [r.debut, r.fin], [2032, 2059]);

/* 19. Moulin-à-Vent 2020 : 8–18 + grand millésime beaujolais → 2030–2042 */
r = estimeApogee({ nom: "Moulin-à-Vent", cepage: "Gamay", region: "Beaujolais", categorie: "Rouge", millesime: 2020 });
check("Moulin-à-Vent 2020 (grand millésime)", [r.debut, r.fin], [2030, 2042]);

/* 20. Morgon 2021 en magnum : 7–15 + magnum +2/+6 → 2030–2042 */
r = estimeApogee({ nom: "Morgon", cepage: "Gamay", region: "Beaujolais", categorie: "Rouge", millesime: 2021, format: "Magnum (1,5 L)" });
check("Morgon 2021 magnum", [r.debut, r.fin], [2030, 2042]);

/* 21. Morgon 2021 en demi-bouteille : 7–15 -1/-3 → 2027–2033 */
r = estimeApogee({ nom: "Morgon", cepage: "Gamay", region: "Beaujolais", categorie: "Rouge", millesime: 2021, format: "Demi-bouteille (37,5 cl)" });
check("Morgon 2021 demi-bouteille", [r.debut, r.fin], [2027, 2033]);

/* 22b. Pauillac 2015 : 10–30 + grand millésime → 2027–2049 */
r = estimeApogee({ nom: "Pauillac", cepage: "Cabernet Sauvignon", region: "Bordeaux", categorie: "Rouge", millesime: 2015 });
check("Pauillac 2015 (repère 2025–2045)", [r.debut, r.fin], [2027, 2049]);

/* 26. La règle cite le millésime : lisibilité de la suggestion */
r = estimeApogee({ nom: "Morgon", cepage: "Gamay", region: "Beaujolais", categorie: "Rouge", millesime: 2021, format: "Magnum (1,5 L)" });
check("Règle magnum mentionnée", r.regle.includes("magnum"), true);

console.log(`\n${pass}/26 réussis${fail ? `, ${fail} échoué(s)` : ""}`);
process.exit(fail ? 1 : 0);
