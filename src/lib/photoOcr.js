/* Reconnaissance d'étiquette par photo (OCR Tesseract, côté client, aucune
   donnée envoyée ailleurs). parseEtiquette est PUR et testable au node ;
   reconnaitEtiquette charge Tesseract à la demande (chunk séparé du bundle,
   modèle français téléchargé au premier usage). Le résultat est un correctif
   de fiche : on le fusionne comme la dictée, et la voix peut tout corriger. */

/* Lignes de bruit fréquentes sur une étiquette (mentions légales, etc.) */
const BRUIT = /(appellation|contr[ôo]l[ée]e|prot[ée]g[ée]e|mis en bouteille|bouteill[ée]e[s]?\s+[àa]|n[°o]\s|contient|sulfites|alcool|produit\s+(?:de|du|d[ée])|volume|75\s?cl|37\s?cl|1[,.]5\s?l|s[ée]lection|[ée]lev[ée]|d[ée]gustation|www\.|\.com|\.fr|t[ée]l[ée]phone|l[ée]gende|établi|fond[ée]e?|depuis|cr[ée][ée]e?\s+en|r[ée]colte|vendanges|vin de table|vin de france|indicatif)/i;

/* Catégories : l'ordre compte (les plus spécifiques d'abord) */
const CATS_OCR = [
  [/champagne/i, "Champagne"], [/cr[ée]mant/i, "Crémant"], [/mousseux|effervescent/i, "Effervescent"],
  [/moelleux|liquoreux/i, "Moelleux"],
  [/whisky|vodka|rhum|gin|cognac|armagnac|calvados|eau[- ]de[- ]vie|spiritueux/i, "Spiritueux"],
  [/ros[ée]/i, "Rosé"], [/rouge/i, "Rouge"], [/blanc/i, "Blanc"],
];

/* Cépages courants — la casse sera refaite */
const CEPAGES = ["pinot noir", "pinot blanc", "pinot gris", "pinot meunier", "chardonnay", "riesling", "gewurztraminer", "gewurz", "sylvaner", "auxerrois", "muscat", "sauvignon blanc", "sauvignon", "sémillon", "chenin", "cabernet sauvignon", "cabernet franc", "merlot", "syrah", "shiraz", "grenache", "mourvèdre", "cinsault", "carignan", "malbec", "gamay", "tempranillo", "viognier", "roussanne", "marsanne", "chasselas", "edelzwicker", "grüner veltliner", "godello", "albariño", "corvina", "nebbiolo", "barbera", "sangiovese", "montepulciano", "primitivo", "zinfandel", "vermentino", "marselan", "petit verdot", "ugni blanc", "folle blanche", "melon de bourgogne"];

const PARTICULES = new Set(["de", "du", "des", "la", "le", "les", "à", "en", "aux", "sous", "sur", "et", "van", "von"]);
function title(s) {
  /* casse française : les particules restent basses (« Mas de Daumas ») */
  return s.toLowerCase().split(/([\s'’-]+)/).map((tok, i) =>
    i > 0 && PARTICULES.has(tok) ? tok : tok.replace(/[a-zà-ÿ]/, c => c.toUpperCase())
  ).join("");
}

/* ---------- Parse : texte OCR brut → correctifs de fiche ---------- */
export function parseEtiquette(texte) {
  const patch = {};
  const t = String(texte || "").replace(/\r/g, "");
  const lignes = t.split(/\n+/).map(l => l.replace(/\s{2,}/g, " ").trim()).filter(l => l.length > 1);
  if (!lignes.length) return patch;

  /* Millésime : première année plausible (les « depuis 1897 » sont filtrées) */
  annee: {
    for (const l of lignes) {
      for (const m of l.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) {
        const n = parseInt(m[0], 10);
        if (n >= 1950 && n <= 2040) { patch.millesime = n; break annee; }
      }
    }
  }

  /* Catégorie (le mot peut être n'importe où sur l'étiquette) */
  for (const [re, cat] of CATS_OCR) {
    if (re.test(t)) { patch.categorie = cat; break; }
  }

  /* Appellation : « Appellation X Contrôlée » / AOC / AOP / « Grand Vin de X » */
  const ap = t.match(/appellation\s+(.{3,40}?)(?:\s+contr[ôo]l[ée]e[es]?|\s+prot[ée]g[ée]e[es]?|$)/i)
          || t.match(/\b(?:aoc|aop)\b[.:\s]+(.{3,40})/i);
  if (ap) {
    const a = ap[1].replace(/[-–—,.;:]+$/, "").trim();
    if (a && !BRUIT.test(a)) patch.appellation = title(a);
  }

  /* Cépage : première variété citée sur sa propre ligne ou après le nom */
  for (const c of CEPAGES) {
    const re = new RegExp("(?:^|[\\s.,'" + "’" + "])" + c.replace(/[éè]/g, "[ée]") + "(?:\\b)", "i");
    if (re.test(t)) { patch.cepage = title(c); break; }
  }

  /* Mots courants qui n'ont rien à faire dans un nom de domaine — l'OCR les
   invente parfois en essayant de lire une calligraphie décorative. */
const COMMUNS = /^(?:lettre|lettres|image|dessin|photo|logo|livret|livre|cave|garde|présent|present|années?|année|cuve|vin de table)\b/i;

/* Score d'une ligne candidate au titre de « nom » : Domaine/Château devant,
   cuvée entre guillemets, millésime, majuscule initiale… ; bruit courant pénalisé */
function scoreLigne(l) {
  let s = 0;
  if (/domaine|ch[âa]teau|clos\b|mas\b/i.test(l)) s += 3;
  if (/^["«'’]/.test(l)) s += 2;                              /* cuvée quotée */
  if (/\b(?:19[5-9]\d|20[0-4]\d)\b/.test(l)) s += 1;
  if (/^[A-ZÀ-Ý]/.test(l)) s += 1;
  if (l.split(/\s+/).filter(Boolean).length >= 2) s += 1;
  if (l.length > 40) s -= 1;
  if (COMMUNS.test(l)) s -= 5;
  if (/whisky|whiskey|scotch|malt|islay|vintage|single|grand cru|cru class|brut|r[ée]serve/i.test(l)) s -= 3;
  return s;
}

/* Nom / domaine : la meilleure ligne significative (hors bruit, préfixes enlevés).
   On ne prend plus « la première venue » : une ligne parasite lue sur une
   calligraphie décorative (« Lettre Dés ») ne doit pas battre la vraie. */
{
  let meilleur = null, meilleurScore = -99;
  for (const l of lignes) {
    if (BRUIT.test(l)) continue;
    const nom = l.replace(/^(?:grand vin de(?: la|s)?|vin de|domaines?\s+de la)\s+/i, "").trim();
    if (nom.length < 3) continue;
    const s = scoreLigne(nom);
    if (s > meilleurScore) { meilleur = nom; meilleurScore = s; }
  }
  if (meilleur) patch.nom = title(meilleur);
}

  return patch;
}

/* ---------- OCR : photo (data URL) → correctifs ---------- */
export async function reconnaitEtiquette(dataUrl) {
  /* import dynamique : Tesseract n'est chargé que si l'utilisateur prend une photo */
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("fra");
  try {
    const { data } = await worker.recognize(dataUrl);
    const brut = (data.text || "").trim();
    return { patch: parseEtiquette(brut), brut };
  } finally {
    try { await worker.terminate(); } catch {}
  }
}
