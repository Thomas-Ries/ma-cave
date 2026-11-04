/* Ma Cave — moteur de la suggestion du soir (src/lib/soir.js)
 * Score = urgence apogée + adéquation météo (Open-Meteo, gratuit sans clé)
 * + bonus saison, selon les préférences du profil.
 * Chaque bouteille retenue explique pourquoi elle a été choisie (« raisons »).
 */

/* Rouges structurés : besoins de fraîcheur ou de chaleur selon la météo */
const ROUGE_PUISSANT = /bordeaux|rhone|languedoc|provence|cahors|madiran|sud-ouest|nebbiolo|cabernet|syrah|malbec|tannat|mourvedre|grenache/;

export function estPuissant(b) {
  const t = ((b.region || "") + " " + (b.cepage || "")).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ROUGE_PUISSANT.test(t);
}

const FRAIS = ["Champagne", "Crémant", "Effervescent"];

/* Blancs secs et vifs, parfaits dès qu'il fait chaud : muscat, sylvaner, riesling… */
const BLANC_SEC_FRAIS = /riesling|sylvaner|muscat|auxerrois|pinot blanc|gentil|chasselas|klevener|chenin|picpoul|assyrtiko|albarino|godello|vermentino|gruner/;

function estBlancSecFrais(b) {
  return BLANC_SEC_FRAIS.test((b.cepage || "").toLowerCase());
}

/* Points météo selon la température ressentie du jour et la catégorie */
function scoreMeteo(b, temp) {
  const cat = b.categorie || (b.type === "Spiritueux" ? "Spiritueux" : "Rouge");
  const rouge = cat === "Rouge";
  const puissant = rouge && estPuissant(b);
  if (temp >= 26) {
    if (cat === "Rosé") return { s: 20, p: "rosé pour " + temp + " °C" };
    if (FRAIS.includes(cat)) return { s: 15, p: "bulles pour " + temp + " °C" };
    if (cat === "Blanc" && estBlancSecFrais(b)) return { s: 18, p: "blanc sec frais pour " + temp + " °C" };
    if (cat === "Blanc") return { s: 12, p: "blanc frais pour " + temp + " °C" };
    if (rouge && !puissant) return { s: 4, p: "" };
    return { s: -12, p: "" };
  }
  if (temp >= 19) {
    if (rouge && !puissant) return { s: 13, p: "" };
    if (cat === "Blanc" && estBlancSecFrais(b)) return { s: 14, p: "blanc sec frais pour " + temp + " °C" };
    if (cat === "Blanc" || cat === "Rosé") return { s: 11, p: "" };
    if (rouge) return { s: 5, p: "" };
    if (FRAIS.includes(cat)) return { s: 6, p: "" };
    return { s: 0, p: "" };
  }
  if (temp >= 12) {
    if (rouge) return { s: 11, p: "" };
    if (cat === "Blanc") return { s: 7, p: "" };
    if (cat === "Moelleux") return { s: 5, p: "" };
    return { s: -2, p: "" };
  }
  /* Froid de canard */
  if (cat === "Moelleux") return { s: 12, p: "moelleux pour " + temp + " °C" };
  if (rouge && puissant) return { s: 15, p: "rouge généreux pour " + temp + " °C" };
  if (rouge) return { s: 9, p: "" };
  if (cat === "Blanc") return { s: 2, p: "" };
  return { s: -12, p: "" };
}

/* Bonus saison (mois 0-11) : hiver aime les rouges et moelleux, l'été les frais */
function scoreSaison(b, month) {
  const hiver = month === 11 || month <= 1;
  const ete = month >= 5 && month <= 7;
  const cat = b.categorie || "Rouge";
  if (hiver) return ["Rouge", "Moelleux"].includes(cat) ? 8 : -3;
  if (ete) return (cat === "Rosé" || cat === "Blanc" || FRAIS.includes(cat)) ? 7 : -3;
  return 0;
}

/* items = sortie de soirItems ({b, u, t}). Retourne la liste triée par score
   décroissant, chaque entrée portant ses « raisons » (badges). */
export function classeSoir(items, prefs, meteo) {
  const month = new Date().getMonth();
  return items.map(it => {
    let score = 0;
    const r = [];
    if (prefs.apogee !== false) { score += (2 - it.u) * 15; }    /* urgence d'apogée */
    if (it.u === 0) r.push("à boire sans attendre");
    else if (it.u === 1) r.push("en apogée");
    else r.push("bientôt prête");
    if (prefs.saison) score += scoreSaison(it.b, month);
    if (prefs.meteo && meteo) {
      const m = scoreMeteo(it.b, meteo.t);
      score += m.s;
      if (m.p) r.push(m.p);
    }
    score -= (it.b.quantite || 1) * 0.5;                          /* fonds de rayon d'abord */
    return { ...it, score, r };
  }).sort((a, z) => z.score - a.score || (a.b.nom || "").localeCompare(z.b.nom || ""));
}

/* ---------- Open-Meteo (gratuit, sans clé) : météo du jour, cache 2 h ---------- */

export async function meteoActuelle(lat, lon) {
  if (lat == null || lon == null) return null;
  const key = "ma-cave-meteo-" + Math.round(lat * 10) + "-" + Math.round(lon * 10);
  try {
    const c = JSON.parse(localStorage.getItem(key) || "null");
    if (c && Date.now() - c.ts < 2 * 3600e3) return c.meteo;
  } catch {}
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
      "&current=temperature_2m,weather_code&daily=temperature_2m_max&timezone=auto&forecast_days=1";
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const t = Math.round(j.current?.temperature_2m ?? j.daily?.temperature_2m_max?.[0] ?? 20);
    const meteo = { t, code: j.current?.weather_code ?? 0 };
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), meteo })); } catch {}
    return meteo;
  } catch { return null; }
}

/* Géocodage d'une ville saisie (Open-Meteo, gratuit) → { lat, lon, ville } */
export async function chercheVille(nom) {
  try {
    const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(nom) + "&count=1&language=fr&format=json");
    if (!res.ok) return null;
    const j = await res.json();
    const r = (j.results || [])[0];
    return r ? { lat: r.latitude, lon: r.longitude, ville: r.name } : null;
  } catch { return null; }
}

/* Ville détectée depuis la position (Nominatim/OpenStreetMap, gratuit) */
export async function villeDepuis(lat, lon) {
  try {
    const res = await fetch("https://nominatim.openstreetmap.org/reverse?lat=" + lat + "&lon=" + lon + "&format=json&accept-language=fr&zoom=12");
    if (!res.ok) return "";
    const j = await res.json();
    const a = j.address || {};
    return a.city || a.town || a.village || a.municipality || j.name || "";
  } catch { return ""; }
}
