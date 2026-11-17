/* Photos de régions viticoles (v2.25.0, maquette « Oeni » validée).
   Sources : Openverse / Flickr, licence CC-BY (crédit affiché sur la carte vedette).
   Les images sont embarquées en base64 découpées en fragments < 48 ko
   (contrainte de l'outil de livraison) ; chaque fragment vit dans son fichier
   src/lib/regions/<slug>.<n>.js. Chargement PARESSEUX : les fragments sont des
   import() dynamiques → Vite les sort en chunks séparés, le démarrage de l'app
   n'est pas alourdi (préoccupation « démarrage lent » déjà connue).
   Une photo peut aussi être ajoutée par l'utilisateur pour une région sans
   photo embarquée (stockage LOCAL, clé ma-cave-regionimg-<clé>, jamais en BDD). */

export const REGIONS = {
  alsace: { nom: "Alsace", mots: ["alsace", "riquewihr", "gewurztraminer d'alsace"] },
  bordeaux: { nom: "Bordeaux", mots: ["bordeaux", "saint-emilion", "saint emilion", "pomerol", "fronsac", "libourne", "pauillac", "medoc", "sauternes", "barsac", "graves", "margaux", "pessac", "saint-estephe", "lalande", "pomerol"] },
  bourgogne: { nom: "Bourgogne", mots: ["bourgogne", "burgundy", "chablis", "beaujolais", "gevrey", "nus", "pommard", "meursault", "puligny", "chassagne"] },
  rhone: { nom: "Vallée du Rhône", mots: ["rhone", "chateauneuf", "cote rotie", "hermitage", "cornas", "gigondas", "vacqueyras", "vinsobre", "tavel"] },
  loire: { nom: "Loire", mots: ["loire", "sancerre", "chinon", "vouvray ", "muscadet", "saumur", "anjou", "touraine", "savennieres", "quarts de chaume", "bonnezeaux"] },
  champagne: { nom: "Champagne", mots: ["champagne"] },
  languedoc: { nom: "Languedoc", mots: ["languedoc", "roussillon", "fitou", "corbieres", "minervois", "picpoul", "saint-chinian", "faugeres", "limoux"] },
  provence: { nom: "Provence", mots: ["provence", "bandol", "cassis", "palette", "bellet", "varois", "cotes de provence"] },
  italie: { nom: "Italie", mots: ["italie", "italy", "toscane", "tuscany", "piemont", "barolo", "barbaresco", "chianti", "veneto", "sicile", "sardaigne", "vénétie"] },
  portugal: { nom: "Portugal", mots: ["portugal", "douro", "porto", "vinho verde", "madeira"] },
  espagne: { nom: "Espagne", mots: ["espagne", "spain", "rioja", "ribera", "priorat", "rias baixas", "jerez", "navarre"] },
  allemagne: { nom: "Allemagne", mots: ["allemagne", "germany", "moselle", "mosel", "rheingau", "rheinhessen", "nahe", "pfalz", "franken"] },
};

/* Chargeurs paresseux : chaque région = 1 à 4 fragments assemblés en un data URL. */
const CHARGEURS = {
  alsace: () => Promise.all([import("./regions/alsace.1.js"), import("./regions/alsace.2.js")]),
  bordeaux: () => Promise.all([import("./regions/bordeaux.1.js"), import("./regions/bordeaux.2.js"), import("./regions/bordeaux.3.js")]),
  bourgogne: () => Promise.all([import("./regions/bourgogne.1.js"), import("./regions/bourgogne.2.js"), import("./regions/bourgogne.3.js"), import("./regions/bourgogne.4.js")]),
  rhone: () => Promise.all([import("./regions/rhone.1.js"), import("./regions/rhone.2.js")]),
  champagne: () => Promise.all([import("./regions/champagne.1.js"), import("./regions/champagne.2.js"), import("./regions/champagne.3.js")]),
  languedoc: () => Promise.all([import("./regions/languedoc.1.js"), import("./regions/languedoc.2.js")]),
  provence: () => Promise.all([import("./regions/provence.1.js"), import("./regions/provence.2.js")]),
  loire: () => Promise.all([import("./regions/loire.1.js"), import("./regions/loire.2.js"), import("./regions/loire.3.js")]),
  italie: () => Promise.all([import("./regions/italie.1.js"), import("./regions/italie.2.js")]),
  portugal: () => Promise.all([import("./regions/portugal.1.js"), import("./regions/portugal.2.js")]),
  espagne: () => Promise.all([import("./regions/espagne.1.js"), import("./regions/espagne.2.js")]),
  allemagne: () => Promise.all([import("./regions/allemagne.1.js"), import("./regions/allemagne.2.js")]),
};

const cache = {};

export function normR(t) { return (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

/* Slug de région embarquée reconnu depuis la fiche (region, appellation, nom, pays). */
export function regionSlug(b) {
  if (!b) return null;
  const t = normR([b.region, b.appellation, b.nom].filter(Boolean).join(" "));
  for (const [slug, r] of Object.entries(REGIONS)) if (r.mots.some(m => t.includes(m))) return slug;
  const p = normR(b.pays || "");
  if (p) {
    if (p.includes("ital")) return "italie";
    if (p.includes("espagne") || p.includes("spain")) return "espagne";
    if (p.includes("portugal")) return "portugal";
    if (p.includes("allemagne") || p.includes("germany")) return "allemagne";
  }
  return null;
}

/* Clé de stockage local pour la photo d'une région SANS photo embarquée (ex. Jura). */
export function clePhotoRegion(b) {
  const slug = regionSlug(b);
  if (slug) return slug;
  const t = normR(b?.region || b?.pays || "").trim();
  return t ? "r-" + t.replace(/[^a-z0-9]+/g, "-").slice(0, 24) : null;
}

export function photoRegionLocale(cle) {
  try { return localStorage.getItem("ma-cave-regionimg-" + cle) || null; } catch { return null; }
}
export function photoRegionSauve(cle, dataURL) {
  try { localStorage.setItem("ma-cave-regionimg-" + cle, dataURL); } catch {}
}

/* Photo complète d'une région : locale d'abord, puis fragment(s) embarqué(s). */
export async function chargePhotoRegion(b) {
  const cle = clePhotoRegion(b);
  if (!cle) return null;
  const locale = photoRegionLocale(cle);
  if (locale) return locale;
  if (cache[cle]) return cache[cle];
  const slug = regionSlug(b);
  const ch = slug && CHARGEURS[slug];
  if (!ch) return null;
  try {
    const mods = await ch();
    const d = "data:image/jpeg;base64," + mods.map(m => m.default).join("");
    cache[cle] = d;
    return d;
  } catch { return null; }
}
