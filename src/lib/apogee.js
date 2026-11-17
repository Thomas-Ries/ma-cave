/* Ma Cave — moteur de règles d'apogée (src/lib/apogee.js)
 * Règles pures, sans dépendance :
 *   1. Appellation précise (Morgon, Châteauneuf-du-Pape, Sauternes…)
 *   2. Cépage × région > cépage > région × catégorie > catégorie
 *   3. Mentions régionalisées (grand cru, premier cru, cru classé, VT/SGN…)
 *   4. Modificateurs : format (magnum / demi-bouteille), grand millésime,
 *      millésime délicat.
 * Toujours écrasable à la main — la suggestion affiche sa règle.
 * Sources des fenêtres (v2.13) : Apogenio (guide croisé Hachette /
 * Bettane+Desseauve / Wine Spectator), Vinabox (tableaux CIVB/BIVB/InterLoire),
 * Tire-Bouchon (fenêtres par appellation + facteurs tanins/acidité/sucre),
 * règles empiriques Bourgogne (village 7-10 / 1er cru 10-15 / GC 15+).
 */

const YEAR = new Date().getFullYear();

const CATS = ["Rouge", "Blanc", "Rosé", "Champagne", "Crémant", "Effervescent", "Moelleux"];

/* ---------- 1. FENÊTRES PAR APPELLATION ----------
 * [debut, fin] en années de garde après le millésime.
 * Matchées sur nom + cuvée + appellation + région (normalisés sans accents).
 * Précises : elles écrasent les règles cépage/région génériques.
 * Important : les libellés les plus longs doivent précéder les courts
 * ("chablis grand cru" avant "chablis", "montrachet" en dernier…). */
const PAR_APPELLATION = {
  /* Bordeaux — hiérarchie des classements (cru classé : 10-35 ans) */
  "premier grand cru classe": [12, 40], "1er grand cru classe": [12, 40],
  "grand cru classe": [10, 35], "cru bourgeois": [6, 15],
  "pauillac": [10, 30], "saint julien": [10, 28], "margaux": [9, 25], "saint estephe": [10, 28],
  "listrac medoc": [6, 15], "moulis": [6, 15], "haut medoc": [6, 15], "medoc": [3, 10],
  "pomerol": [7, 20], "lalande de pomerol": [5, 14],
  "saint emilion grand cru": [8, 25], "saint emilion": [5, 15], "fronsac": [4, 10],
  "graves": [5, 12], "pessac leognan": [6, 15],
  "bordeaux superieur": [2, 8], "bordeaux super": [2, 8],
  "sauternes": [15, 40], "barsac": [12, 35], "cerons": [8, 20],
  /* Bourgogne — GC 12-30 ans, 1ers crus 8-20, villages 5-15 */
  "clos de vougeot": [10, 25],
  "grands echezeaux": [10, 25], "echezeaux": [8, 20],
  "vosne romanee": [10, 25], "gevrey chambertin": [8, 20], "chambolle musigny": [8, 20],
  "chambertin": [12, 30], "musigny": [12, 30],
  "morey saint denis": [8, 20], "nuits saint georges": [7, 18],
  "volnay": [6, 14], "pommard": [6, 15], "aloxe corton": [7, 18],
  "corton charlemagne": [10, 25], "corton": [8, 20],
  "batard montrachet": [10, 30], "puligny montrachet": [8, 20], "chassagne montrachet": [8, 20],
  "montrachet": [10, 30],
  "chablis grand cru": [10, 25], "chablis premier cru": [6, 15], "chablis": [3, 8],
  "meursault": [6, 16], "pouilly fuisse": [5, 12], "saint veran": [2, 6], "macon": [2, 6],
  "mercurey": [5, 12], "santenay": [4, 10], "givry": [3, 8], "rully": [3, 8],
  /* Beaujolais — les crus se gardent bien plus que le Beaujolais simple */
  "moulin a vent": [8, 18], "morgon": [7, 15], "chenas": [6, 14], "julienas": [5, 12],
  "fleurie": [5, 12], "cote de brouilly": [5, 10], "brouilly": [4, 8],
  "regnie": [4, 8], "chiroubles": [4, 8], "saint amour": [4, 8],
  "beaujolais villages": [2, 5], "beaujolais nouveau": [0, 1],
  /* Vallée du Rhône */
  "chateauneuf du pape": [8, 20], "cote rotie": [10, 25], "hermitage": [10, 25],
  "cornas": [10, 25], "saint joseph": [6, 12], "crozes hermitage": [4, 10],
  "condrieu": [4, 8], "gigondas": [6, 16], "vacqueyras": [5, 14],
  "rasteau": [5, 14], "cairanne": [5, 12], "vinsobres": [5, 12], "lirac": [4, 10], "tavel": [2, 6],
  "cotes du rhone villages": [4, 10],
  /* Loire */
  "saint nicolas de bourgueil": [5, 15], "bourgueil": [5, 15], "chinon": [5, 15],
  "saumur champigny": [5, 10], "savennieres": [6, 20],
  "bonnezeaux": [10, 30], "quarts de chaume": [10, 30], "coteaux du layon": [8, 25],
  "vouvray": [3, 12],
  "sancerre rouge": [5, 12], "sancerre": [3, 10],
  "quincy": [2, 5], "menetou salon": [2, 6], "reuilly": [2, 5],
  "muscadet sur lie": [1, 5], "muscadet": [1, 4],
  "roussette de savoie": [4, 10], "savoie": [1, 5],
  /* Alsace — la hiérarchie des Grands Crus est dans MENTIONS (régionalisée) */
  /* Sud-Ouest */
  "cahors": [6, 18], "madiran": [10, 25], "jurancon": [8, 25],
  "gaillac": [2, 8], "bergerac": [2, 8], "monbazillac": [10, 30],
  "irouleguy": [5, 15], "pacherenc": [8, 25], "marcillac": [2, 6],
  "fronton": [3, 8], "pecharmant": [5, 12],
  /* Jura — oxydatifs de très longue garde */
  "chateau chalon": [10, 50], "l etoile": [5, 20], "arbois": [3, 15],
  "cotes du jura": [3, 15], "savagnin": [10, 35],
  /* Provence */
  "bandol": [8, 20], "cassis": [4, 8], "palette": [8, 20],
  /* Languedoc-Roussillon */
  "fitou": [5, 14], "corbieres": [4, 12], "minervois": [4, 12], "saint chinian": [4, 12],
  "faugeres": [5, 14], "pic saint loup": [4, 12], "terrasses du larzac": [5, 15],
  "collioure": [6, 15], "banyuls": [10, 50], "muscat de rivesaltes": [8, 25],
  "maury": [10, 40], "roussillon villages": [5, 15],
  /* Italie / Espagne / Portugal */
  "barolo": [10, 30], "barbaresco": [8, 25], "brunello": [10, 30],
  "chianti classico": [6, 18], "chianti": [4, 12],
  "rioja": [6, 20], "ribera del duero": [6, 20],
  "porto": [10, 40], "vintage port": [10, 40],
  /* Tokaj */
  "tokaj": [10, 40],
};

/* ---------- 2. Cépage × région (vins génériques sans appellation précise) ---------- */
const PAR_CEPAGE_REGION = {
  "riesling|alsace": [4, 15], "gewurztraminer|alsace": [3, 10], "pinot gris|alsace": [3, 8],
  "sylvaner|alsace": [1, 4], "muscat|alsace": [2, 6],
  "chenin|vallee de la loire": [5, 20], "chenin|loire": [5, 20],
  "nebbiolo|piemont": [8, 25], "nebbiolo|italie": [8, 25],
  "gamay|beaujolais": [2, 5],
  "merlot|bordeaux": [3, 8], "cabernet sauvignon|bordeaux": [8, 25],
  "cabernet franc|vallee de la loire": [5, 15], "cabernet franc|loire": [5, 15],
  "pinot noir|bourgogne": [5, 12], "pinot noir|alsace": [3, 8],
  "syrah|rhone": [4, 12], "grenache|rhone": [4, 12],
  "mourvedre|provence": [6, 16], "carignan|languedoc": [3, 10],
  "chardonnay|bourgogne": [5, 12], "malbec|cahors": [6, 18], "tannat|madiran": [10, 25],
  "riesling|moselle": [5, 20], "riesling|allemagne": [5, 20],
};

/* ---------- 3. Cépage seul ---------- */
const PAR_CEPAGE = {
  riesling: [4, 15], chenin: [5, 20], nebbiolo: [8, 25],
  "cabernet sauvignon": [8, 25], "pinot noir": [4, 12], chardonnay: [4, 12],
  gamay: [2, 6], merlot: [3, 8], syrah: [4, 12], malbec: [5, 15],
  "cabernet franc": [4, 12], gewurztraminer: [2, 7], "pinot gris": [2, 6],
  grenache: [5, 15], mourvedre: [8, 20], tannat: [10, 25], savagnin: [10, 35],
  "tempranillo": [4, 15], sangiovese: [4, 12], viognier: [1, 4],
};

/* ---------- 4. Région × catégorie (vins sans cépage connu) ---------- */
const PAR_REGION_CATEGORIE = {
  bordeaux: { rouge: [3, 10], blanc: [2, 6] },
  bourgogne: { rouge: [5, 12], blanc: [4, 10] },
  beaujolais: { rouge: [2, 5] },
  "vallee de la loire": { rouge: [3, 8], blanc: [3, 10] },
  alsace: { blanc: [2, 8] },
  rhone: { rouge: [4, 12] },
  "vallee du rhone": { rouge: [4, 12] },
  languedoc: { rouge: [4, 10], blanc: [2, 5] },
  provence: { rouge: [3, 8], rose: [1, 3] },
  "sud ouest": { rouge: [4, 12], blanc: [2, 6] },
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
  { mots: ["selection de grains nobles", " sgn", "grains nobles"], bonus: [10, 30] },
  { mots: ["vendanges tardives", " vt", "late harvest"], bonus: [5, 20], hors: ["bordeaux"] },
  { mots: ["vin de glace", "eiswein", "ice wine"], bonus: [8, 25] },
  { mots: ["vin de paille"], bonus: [6, 20] },
  { mots: ["liquoreux"], bonus: [5, 17] },
  { mots: ["moelleux de garde", "bonnezeaux", "quarts de chaume", "coteaux du layon", "vouvray moelleux"], bonus: [6, 18] },
  /* Alsace : les Grands Crus sont des vins de tension, 15-30 ans pour le Riesling */
  { mots: ["grand cru"], regions: ["alsace"], bonus: [5, 12] },
  /* Bourgogne : GC 15-30, 1er cru 10-18, village 7-10 (règle empirique) */
  { mots: ["grand cru"], regions: ["bourgogne"], bonus: [8, 18] },
  { mots: ["premier cru", "1er cru"], regions: ["bourgogne"], bonus: [4, 8] },
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
  { mots: ["prestige", "grande cuvee", "cuvee prestige", "special cuvee"], bonus: [3, 10] },
  { mots: ["cru"], bonus: [1, 3] },
];

/* ---------- Modificateur de format : le volume pilote la vitesse de vieillissement ----------
 * Un magnum vieillit nettement plus lentement (moins d'oxygène relatif),
 * une demi-bouteille beaucoup plus vite. */
const FORMATS = [
  { mots: ["magnum", "jeroboam", "mathusalem", "1,5 l", "1.5 l", "3 l", "4,5 l"], bonus: [2, 6], tag: "magnum" },
  { mots: ["demi bouteille", "demi-bouteille", "37,5", "37.5", "35 cl"], bonus: [-1, -3], tag: "demi-bouteille" },
];

/* ---------- Grands millésimes & millésimes délicats (bonus/malus par région) ----------
 * Repères des guides : à Bordeaux 1982, 1990, 2000, 2005, 2009, 2010, 2015, 2016,
 * 2019, 2020 tiennent nettement plus longtemps ; 2013 se boit plus vite. */
const MILLESIMES_FORTS = {
  bordeaux: [1982, 1990, 2000, 2005, 2009, 2010, 2015, 2016, 2018, 2019, 2020],
  bourgogne: [1990, 1999, 2002, 2005, 2009, 2010, 2015, 2019, 2020],
  beaujolais: [2009, 2011, 2015, 2018, 2020, 2022],
  rhone: [1990, 1998, 2003, 2007, 2010, 2015, 2016, 2019],
  "vallee de la loire": [1989, 1990, 1996, 2002, 2005, 2009, 2014, 2015, 2019],
  alsace: [1996, 2001, 2007, 2010, 2015, 2017, 2019],
  champagne: [1982, 1990, 1996, 2002, 2005, 2008, 2012, 2015, 2018],
  "sud ouest": [2005, 2009, 2010, 2015, 2016, 2019, 2020],
  languedoc: [2016, 2019, 2020],
  provence: [2017, 2019, 2022],
};
const MILLESIMES_DELICATS = {
  bordeaux: [2013],
};

function norm(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[''']/g, "'")
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

/* Modificateur de format (magnum, demi-bouteille…) */
function bonusFormat(b) {
  const t = norm([b.format, b.nom, b.cuvee].join(" "));
  for (const f of FORMATS) {
    if (f.mots.some(mot => t.includes(mot))) return { bonus: f.bonus, tag: f.tag };
  }
  return null;
}

/* Grand millésime / millésime délicat selon la région */
function bonusMillesime(b) {
  const mil = b.millesime;
  if (mil == null || isNaN(mil)) return null;
  const r = norm(b.region);
  if (r) {
    for (const reg of Object.keys(MILLESIMES_DELICATS)) {
      if (r.includes(reg) && MILLESIMES_DELICATS[reg].includes(mil)) return { bonus: [-1, -2], tag: "millésime délicat" };
    }
    for (const reg of Object.keys(MILLESIMES_FORTS)) {
      if (r.includes(reg) && MILLESIMES_FORTS[reg].includes(mil)) return { bonus: [2, 4], tag: "grand millésime" };
    }
  }
  return null;
}

function estimeApogee(b) {
  if (!b || b.type === "Spiritueux" || b.categorie === "Spiritueux") return null;

  const texte = [b.nom, b.cuvee, b.appellation, b.region, b.specificite].join(" ");
  const cat = b.categorie || "";
  const catNorm = norm(cat);

  /* ---------- Cas Champagne/Crémant : la catégorie pilote, millésimé en bonus ---------- */
  if (catNorm === "champagne" || catNorm === "cremant" || catNorm === "effervescent") {
    const [cbd, cbf] = bonusChampagne(texte);
    let base = catNorm === "champagne" ? [1, 5] : [1, 4];
    let regle = "Champagne";
    if (b.millesime != null && !isNaN(b.millesime)) { base = [5, 18]; regle = "Champagne millésimé"; }
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

  /* ---------- Modificateurs : format puis millésime ---------- */
  let dd = base[0] + bd, ff = base[1] + bf;
  const fmt = bonusFormat(b);
  if (fmt) { dd += fmt.bonus[0]; ff += fmt.bonus[1]; regle += " + " + fmt.tag; }
  const mm = bonusMillesime(b);
  if (mm) { dd += mm.bonus[0]; ff += mm.bonus[1]; regle += " + " + mm.tag; }

  /* Garde-fous : jamais de départ avant le millésime, jamais fin < début */
  let debut = mil + dd, fin = mil + ff;
  if (debut < mil) debut = mil;
  if (fin < debut) fin = debut;

  return { debut, fin, regle };
}

export { estimeApogee };/* ESM */
