/* Ma Cave — moteur de règles d'apogée (src/lib/apogee.js)
 * Règles pures, sans dépendance :
 *   1. Appellation précise (Morgon, Châteauneuf-du-Pape, Sauternes…)
 *   2. Cépage × région > cépage > région × catégorie > catégorie
 *   3. Mentions régionalisées (grand cru, premier cru, cru classé, VT/SGN…)
 * Toujours écrasable à la main — la suggestion affiche sa règle.
 * Sources des fenêtres : guide par appellation (Beaujolais/Alsace 2026),
 * règle empirique Bourgogne (régionale 5-7 / village 7-10 / 1er cru 10-15 / GC 15+),
 * catégories Champagne (BSA 2-5 / millésimé 10-20+ / prestige 15+), Cornas 10-20…
 */

const YEAR = new Date().getFullYear();

const CATS = ["Rouge", "Blanc", "Rosé", "Champagne", "Crémant", "Effervescent", "Moelleux"];

/* ---------- 1. FENÊTRES PAR APPELLATION ----------
 * [debut, fin] en années de garde après le millésime.
 * Matchées sur nom + cuvée + appellation + région (normalisés sans accents).
 * Précises : elles écrasent les règles cépage/région génériques. */
const PAR_APPELLATION = {
  /* Bordeaux — hiérarchie des classements */
  "1er grand cru classe": [12, 40], "premier grand cru classe": [12, 40], "grand cru classe": [8, 30],
  "cru bourgeois": [4, 12],
  "pauillac": [8, 25], "saint julien": [8, 25], "margaux": [7, 20], "saint estephe": [8, 25],
  "pomerol": [5, 18], "saint emilion": [5, 15], "saint emilion grand cru": [5, 18],
  "graves": [4, 12], "pessac leognan": [5, 15],
  "bordeaux superieur": [2, 8], "bordeaux super": [2, 8],
  "sauternes": [10, 35], "barsac": [10, 30],
  /* Bourgogne — hiérarchie régionale / village / cru */
  "chablis grand cru": [8, 20], "chablis premier cru": [5, 12], "chablis": [3, 8],
  "gevrey chambertin": [6, 18], "chambolle musigny": [6, 18], "vosne romanee": [6, 20],
  "morey saint denis": [6, 18], "chambertin": [10, 25], "musigny": [10, 25],
  "nuits saint georges": [6, 15], "volnay": [5, 12], "pommard": [5, 14],
  "mercurey": [4, 10], "givry": [3, 8], "rully": [3, 8],
  "meursault": [5, 14], "puligny montrachet": [6, 16], "chassagne montrachet": [6, 16],
  "montrachet": [10, 25], "corton charlemagne": [8, 20], "corton": [6, 15],
  "pouilly fuisse": [4, 10], "saint veran": [2, 6], "macon": [2, 6],
  /* Alsace — la hiérarchie des Grands Crus est dans MENTIONS (régionalisée) */
  /* Beaujolais — les crus se gardent bien plus que le Beaujolais simple */
  "moulin a vent": [6, 15], "morgon": [5, 12], "chenas": [5, 12], "julienas": [4, 10],
  "fleurie": [4, 10], "cote de brouilly": [4, 9], "brouilly": [3, 7],
  "regnie": [3, 7], "chiroubles": [3, 7], "saint amour": [3, 7],
  "beaujolais villages": [2, 5], "beaujolais nouveau": [0, 1],
  /* Vallée du Rhône */
  "chateauneuf du pape": [5, 18], "cote rotie": [7, 20], "hermitage": [8, 22],
  "cornas": [8, 20], "saint joseph": [4, 10], "crozes hermitage": [3, 8],
  "condrieu": [3, 8], "cotes du rhone villages": [3, 8], "gigondas": [5, 14],
  "vacqueyras": [4, 12], "rasteau": [4, 12], "cairanne": [4, 10],
  /* Loire */
  "chinon": [4, 12], "bourgueil": [4, 12], "saint nicolas de bourgueil": [4, 12],
  "saumur champigny": [4, 9], "sancerre": [2, 8], "sancerre rouge": [4, 10],
  "quincy": [2, 5], "menetou salon": [2, 5], "reuilly": [2, 5],
  "muscadet": [1, 4], "muscadet sur lie": [1, 5], "santenay": [3, 8],
  "savoie": [1, 5], "roussette de savoie": [3, 8],
  /* Sud-Ouest */
  "cahors": [5, 15], "madiran": [8, 20], "jurancon": [5, 20], "gaillac": [2, 8],
  "bergerac": [2, 8], "monbazillac": [8, 25], "irouleguy": [5, 15], "pacherenc": [5, 20],
  /* Jura — oxydatifs de très longue garde */
  "chateau chalon": [10, 40], "savagnin": [8, 30], "arbois": [3, 15],
  /* Languedoc-Roussillon */
  "fitou": [4, 12], "corbieres": [3, 10], "minervois": [3, 10], "saint chinian": [3, 10],
  "collioure": [4, 12], "banyuls": [10, 40], "muscat de rivesaltes": [5, 25],
  "maury": [10, 35], "roussillon villages": [4, 12],
};

/* ---------- 2. Cépage × région (vins génériques sans appellation précise) ---------- */
const PAR_CEPAGE_REGION = {
  "riesling|alsace": [3, 10], "gewurztraminer|alsace": [2, 7], "pinot gris|alsace": [2, 7],
  "sylvaner|alsace": [1, 4], "muscat|alsace": [2, 6],
  "chenin|vallee de la loire": [4, 12], "chenin|loire": [4, 12],
  "nebbiolo|piemont": [7, 20], "gamay|beaujolais": [2, 5],
  "merlot|bordeaux": [3, 8], "cabernet sauvignon|bordeaux": [6, 20],
  "cabernet franc|vallee de la loire": [4, 12], "cabernet franc|loire": [4, 12],
  "pinot noir|bourgogne": [4, 10], "pinot noir|alsace": [2, 7],
  "syrah|rhone": [3, 10], "grenache|rhone": [3, 10],
  "mourvedre|provence": [5, 14], "carignan|languedoc": [3, 10],
  "chardonnay|bourgogne": [4, 10], "malbec|cahors": [5, 15],
  "tannat|madiran": [8, 20], "riesling|moselle": [4, 12],
};

/* ---------- 3. Cépage seul ---------- */
const PAR_CEPAGE = {
  riesling: [3, 10], chenin: [4, 12], nebbiolo: [6, 18],
  "cabernet sauvignon": [6, 20], "pinot noir": [3, 10], chardonnay: [3, 10],
  gamay: [2, 6], merlot: [3, 8], syrah: [3, 10], malbec: [4, 12],
  "cabernet franc": [3, 10], gewurztraminer: [2, 7], "pinot gris": [2, 6],
  grenache: [4, 12], mourvedre: [6, 16], tannat: [8, 20], savagnin: [8, 30],
};

/* ---------- 4. Région × catégorie (vins sans cépage connu) ---------- */
const PAR_REGION_CATEGORIE = {
  bordeaux: { rouge: [3, 10], blanc: [2, 6] },
  bourgogne: { rouge: [4, 10], blanc: [3, 8] },
  beaujolais: { rouge: [2, 5] },
  "vallee de la loire": { rouge: [3, 8], blanc: [3, 10] },
  alsace: { blanc: [2, 8] },
  rhone: { rouge: [3, 10] },
  "vallee du rhone": { rouge: [3, 10] },
  languedoc: { rouge: [3, 8], blanc: [2, 5] },
  provence: { rouge: [3, 8], rose: [1, 3] },
  "sud ouest": { rouge: [3, 10], blanc: [2, 6] },
  champagne: { effervescent: [1, 4] },
  jura: { rouge: [3, 10], blanc: [4, 15] },
};

/* ---------- 5. Fenêtres par défaut selon la catégorie ---------- */
const PAR_CATEGORIE = {
  Rouge: [3, 10], Blanc: [2, 8], Rosé: [1, 3],
  "Champagne": [1, 8], "Crémant": [1, 4], Effervescent: [1, 4], Moelleux: [8, 25],
};

/* ---------- Mentions régionalisées ----------
 * « grand cru » ne signifie pas la même chose en Bourgogne, en Alsace ou à Saint-Émilion.
 * regions : liste de sous-chaînes (normalisées) où la règle s'applique ;
 * absente → partout. Le bonus s'ajoute à la fenêtre de base. */
const MENTIONS = [
  { mots: ["vendanges tardives", " vt", "late harvest"], bonus: [4, 15], hors: ["bordeaux"] },
  { mots: ["selection de grains nobles", " sgn", "grains nobles"], bonus: [8, 25] },
  { mots: ["moelleux de garde", "bonnezeaux", "quarts de chaume", "coteaux du layon", "vouvray moelleux"], bonus: [5, 15] },
  /* Alsace : les Grands Crus sont des vins de tension, 15-30 ans pour le Riesling */
  { mots: ["grand cru"], regions: ["alsace"], bonus: [4, 10] },
  /* Bourgogne : GC 15+, 1er cru 10-15, village 7-10 (règle empirique) */
  { mots: ["grand cru"], regions: ["bourgogne"], bonus: [6, 15] },
  { mots: ["premier cru", "1er cru"], regions: ["bourgogne"], bonus: [3, 7] },
  /* Général, hors régions déjà traitées */
  { mots: ["grand cru"], bonus: [2, 6] },
  { mots: ["premier cru"], bonus: [1, 4] },
  { mots: ["clos"], bonus: [1, 3] },
  { mots: ["vieilles vignes", " vv"], bonus: [1, 4] },
  { mots: ["reserve"], bonus: [1, 3] },
];

/* ---------- Champagne : millésimé / blanc de blancs / prestige ---------- */
const CHAMPAGNE_MENTIONS = [
  { mots: ["blanc de blancs"], bonus: [2, 8] },
  { mots: ["cru"], bonus: [1, 3] },
];

function norm(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fenetreAppellation(texte) {
  const t = norm(texte);
  for (const key of Object.keys(PAR_APPELLATION)) {
    if (t.includes(key)) return { fen: PAR_APPELLATION[key], app: key };
  }
  return null;
}

function fenetreRegion(region, categorie) {
  const r = norm(region);
  let hit = null;
  for (const key of Object.keys(PAR_REGION_CATEGORIE)) {
    if (r.includes(key)) { hit = PAR_REGION_CATEGORIE[key]; break; }
  }
  if (!hit) return null;
  const cat = norm(categorie).replace("é", "e");
  return hit[cat] || null;
}

function fenetreCepage(cepage) {
  const c = norm(cepage);
  for (const key of Object.keys(PAR_CEPAGE)) {
    if (c.includes(key)) return PAR_CEPAGE[key];
  }
  return null;
}

function fenetreCepageRegion(cepage, region) {
  const c = norm(cepage), r = norm(region);
  if (!c || !r) return null;
  for (const key of Object.keys(PAR_CEPAGE_REGION)) {
    if (c.includes(key.split("|")[0]) && r.includes(key.split("|")[1])) {
      return PAR_CEPAGE_REGION[key];
    }
  }
  return null;
}

/* Bonus des mentions, régionalisées : la 1re règle qui matche (ordre du tableau) gagne
   pour sa famille ; on garde le max toutes familles confondues. */
function bonusMentions(texte, region, appKey) {
  const t = norm(texte), r = norm(region);
  let bd = 0, bf = 0;
  for (const m of MENTIONS) {
    const mot = m.mots.find(mot => t.includes(mot));
    if (!mot) continue;
    if (appKey && appKey.includes(mot)) continue; /* mention déjà dans l'appellation matchée (Chablis Grand Cru…) */
    if (m.regions && !m.regions.some(reg => r.includes(reg))) continue;
    if (m.hors && m.hors.some(h => r.includes(h))) continue;
    bd = m.bonus[0]; bf = m.bonus[1];
    break;
  }
  return [bd, bf];
}

function bonusChampagne(texte) {
  const t = norm(texte);
  let bd = 0, bf = 0;
  for (const m of CHAMPAGNE_MENTIONS) {
    if (m.mots.some(mot => t.includes(mot))) { bd = Math.max(bd, m.bonus[0]); bf = Math.max(bf, m.bonus[1]); }
  }
  return [bd, bf];
}

function estimeApogee(b) {
  if (!b || b.type === "Spiritueux" || b.categorie === "Spiritueux") return null;

  const texte = [b.nom, b.cuvee, b.appellation, b.region].join(" ");
  const cat = b.categorie || "";
  const catNorm = norm(cat);

  /* ---------- Cas Champagne/Crémant : la catégorie pilote, millésimé en bonus ---------- */
  if (catNorm === "champagne" || catNorm === "cremant" || catNorm === "effervescent") {
    const [cbd, cbf] = bonusChampagne(texte);
    let base = catNorm === "champagne" ? [1, 5] : [1, 4];
    let regle = "Champagne";
    if (b.millesime != null && !isNaN(b.millesime)) { base = [3, 15]; regle = "Champagne millésimé"; }
    if (cbd > 0) regle += " + cuvée";
    const mil = b.millesime;
    if (mil == null || isNaN(mil)) return { debut: YEAR, fin: YEAR + 2, regle };
    return { debut: mil + base[0] + cbd, fin: mil + base[1] + cbf, regle };
  }

  /* ---------- Hiérarchie générale ---------- */
  const hitApp = fenetreAppellation(texte);
  const fCepReg = fenetreCepageRegion(b.cepage, b.region);
  const fCep = fenetreCepage(b.cepage);
  const fReg = fenetreRegion(b.region, cat);

  const base = (hitApp && hitApp.fen) || fCepReg || fCep || fReg || PAR_CATEGORIE[cat] || PAR_CATEGORIE.Rouge;

  let regle;
  if (hitApp) regle = hitApp.app.replace(/\b\w/g, c => c.toUpperCase());
  else if (fCepReg) regle = `${b.cepage} en ${b.region}`;
  else if (fCep) regle = `${b.cepage}`;
  else if (fReg) regle = `${b.region} (${cat.toLowerCase()})`;
  else regle = `catégorie ${cat.toLowerCase()}`;

  const [bd, bf] = bonusMentions(texte, b.region, hitApp ? hitApp.app : null);
  if (bd > 0) regle += " + mention";

  const mil = b.millesime;
  if (mil == null || isNaN(mil)) {
    /* Sans millésime (NM, crémant…) : à boire maintenant */
    return { debut: YEAR, fin: YEAR + 2, regle };
  }

  return { debut: mil + base[0] + bd, fin: mil + base[1] + bf, regle };
}

export { estimeApogee };/* ESM */
