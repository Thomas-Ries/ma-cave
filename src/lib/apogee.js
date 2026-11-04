/* Ma Cave — moteur de règles d'apogée (src/apogee.js)
 * Règles pures, sans dépendance : cépage×région > cépage > région×catégorie > catégorie.
 * Les mentions (Vendanges Tardives, Grand Cru, cru classé, Morgon…) allongent la fenêtre.
 * Toujours écrasable à la main — la suggestion affiche sa règle.
 * Export CommonJS pour les tests, global sinon.
 */

const YEAR = new Date().getFullYear();

const CATS = ["Rouge", "Blanc", "Rosé", "Champagne", "Crémant", "Effervescent", "Moelleux"];

/* Fenêtres [debut, fin] en années de garde (+N après le millésime) */
const PAR_CEPAGE_REGION = {
  "riesling|alsace": [4, 12], "gewurztraminer|alsace": [3, 8], "pinot gris|alsace": [3, 8],
  "chenin|vallee de la loire": [5, 15], "chenin|loire": [5, 15],
  "nebbiolo|piemont": [7, 20], "gamay|beaujolais": [3, 8],
  "merlot|bordeaux": [3, 8], "cabernet sauvignon|bordeaux": [8, 25],
  "cabernet franc|vallee de la loire": [5, 15], "cabernet franc|loire": [5, 15],
  "sylvaner|alsace": [2, 5], "pinot noir|bourgogne": [5, 15],
  "pinot noir|alsace": [3, 8], "syrah|rhone": [4, 12], "grenache|rhone": [4, 12],
  "mourvedre|provence": [6, 16], "carignan|languedoc": [3, 10],
  "chardonnay|bourgogne": [5, 12], "malbec|cahors": [5, 15],
  "tannat|madiran": [8, 20], "riesling|moselle": [4, 12],
};

const PAR_CEPAGE = {
  riesling: [3, 10], chenin: [4, 12], nebbiolo: [6, 18],
  "cabernet sauvignon": [6, 20], "pinot noir": [3, 10], chardonnay: [3, 10],
  gamay: [2, 6], merlot: [3, 8], syrah: [3, 10], malbec: [4, 12],
  "cabernet franc": [3, 10], gewurztraminer: [2, 7], "pinot gris": [2, 6],
  grenache: [4, 12], mourvedre: [6, 16], tannat: [8, 20],
};

/* Région × catégorie pour les vins sans cépage connu */
const PAR_REGION_CATEGORIE = {
  bordeaux: { rouge: [5, 15], blanc: [3, 8] },
  bourgogne: { rouge: [5, 15], blanc: [4, 10] },
  beaujolais: { rouge: [2, 6] },
  "vallee de la loire": { rouge: [4, 10], blanc: [4, 12] },
  alsace: { blanc: [3, 10] },
  rhone: { rouge: [4, 12] },
  "vallee du rhone": { rouge: [4, 12] },
  languedoc: { rouge: [3, 10], blanc: [2, 6] },
  provence: { rouge: [3, 10], rose: [1, 3] },
  "sud ouest": { rouge: [4, 12] },
};

/* Fenêtres par défaut selon la catégorie */
const PAR_CATEGORIE = {
  Rouge: [3, 10], Blanc: [2, 8], Rosé: [1, 3],
  "Champagne": [1, 8], "Crémant": [1, 4], Effervescent: [1, 4], Moelleux: [8, 25],
};

/* Mentions dans le nom qui allongent la fenêtre */
const MENTIONS = [
  { mots: ["vendanges tardives", " vt", "late harvest"], bonus: [4, 15] },
  { mots: ["vouvray", "moelleux de garde", "bonnezeaux", "quarts de chaume", "coteaux du layon"], bonus: [5, 15] },
  { mots: ["selection de grains nobles", " sgn", "grains nobles"], bonus: [8, 25] },
  { mots: ["cru classe", "grand cru classe"], bonus: [4, 10] },
  { mots: ["grand cru"], bonus: [2, 6] },
  { mots: ["premier cru"], bonus: [1, 4] },
  { mots: ["cru bourgeois"], bonus: [2, 5] },
  { mots: ["cote du py", "morgon"], bonus: [1, 3] },
  { mots: ["clos"], bonus: [1, 3] },
  { mots: ["vieilles vignes", "vv"], bonus: [1, 4] },
  { mots: ["reserve"], bonus: [1, 3] },
];

function norm(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function bonusMentions(nom) {
  const n = norm(nom);
  let bd = 0, bf = 0;
  for (const m of MENTIONS) {
    if (m.mots.some(mot => n.includes(mot))) {
      bd = Math.max(bd, m.bonus[0]);
      bf = Math.max(bf, m.bonus[1]);
    }
  }
  return [bd, bf];
}

function estimeApogee(b) {
  if (!b || b.type === "Spiritueux" || b.categorie === "Spiritueux") return null;

  const base =
    fenetreCepageRegion(b.cepage, b.region) ||
    fenetreCepage(b.cepage) ||
    fenetreRegion(b.region, b.categorie) ||
    PAR_CATEGORIE[b.categorie] ||
    PAR_CATEGORIE.Rouge;

  const [bd, bf] = bonusMentions(b.nom);

  let regle;
  if (fenetreCepageRegion(b.cepage, b.region)) regle = `${b.cepage} en ${b.region}`;
  else if (fenetreCepage(b.cepage)) regle = `${b.cepage}`;
  else if (fenetreRegion(b.region, b.categorie)) regle = `${b.region} (${b.categorie.toLowerCase()})`;
  else regle = `catégorie ${b.categorie.toLowerCase()}`;
  if (bd > 0) regle += " + mention";

  const mil = b.millesime;
  if (mil == null || isNaN(mil)) {
    /* Sans millésime (NM, crémant…) : à boire maintenant */
    return { debut: YEAR, fin: YEAR + 2, regle };
  }

  return { debut: mil + base[0] + bd, fin: mil + base[1] + bf, regle };
}

export { estimeApogee };/* ESM */
