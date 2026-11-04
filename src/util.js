/* Utilitaires partagés : photo, formats, texte */

/* Photo : compression locale (la base64 reste dans l'app, jamais dans Notion) */
export function photoFromFile(file, cb, MAX = 900, QUALITE = 0.72) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > MAX || h > MAX) { const k = Math.min(MAX / w, MAX / h); w = Math.round(w * k); h = Math.round(h * k); }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(cv.toDataURL("image/jpeg", QUALITE));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* Sépare domaine et cuvée depuis le nom complet */
export function splitNom(b) {
  const nom = String(b.nom || "").trim();
  const pre = nom.match(/^(Domaines?|Châteaux?|Chateaux?|Clos|Mas|Maison|Vignobles|Caves?|Coopérative|Société)\s+/u);
  if (!pre) return { domaine: nom, cuvee: b.cuvee || "" };
  const toks = nom.slice(pre[0].length).split(/\s+/);
  let i = 0, domaine = pre[0].trim();
  while (i < toks.length) {
    const t = toks[i];
    const isConn = /^[a-zàâäéèêëîïôöùûüç]/.test(t);
    domaine += " " + t;
    i++;
    if (!isConn) break;
  }
  const cuvee = b.cuvee || toks.slice(i).join(" ").trim();
  return { domaine, cuvee: cuvee || "" };
}

/* Région affichée : si France on n'affiche pas le pays, hors France on l'ajoute */
export function regionTxt(b) {
  const reg = (b.region || "").trim();
  const pays = (b.pays || "").trim();
  if (!pays || /^france$/i.test(pays)) return reg;
  return [reg, pays].filter(Boolean).join(", ");
}

/* Cépage court : « Assemblage » si plusieurs cépages */
export function cepageCourt(b) {
  const c = (b.cepage || "").trim();
  if (!c) return "";
  return /[,;/]|\set\s/i.test(c) ? "Assemblage" : c;
}

/* Texte blindé : jamais de [object Object] dans l'UI */
export function accTxt(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(accTxt).filter(Boolean).join(" · ");
  if (typeof v === "object") return Object.values(v).map(accTxt).filter(Boolean).join(" · ");
  return String(v);
}

export function catDot(cat, colors) {
  const color = colors[cat] || "#8A7F75";
  return color;
}

/* Température de service : règle par catégorie, affinée pour les rouges (structurés ou non) */
export function tempService(b) {
  const cat = b.categorie || (b.type === "Spiritueux" ? "Spiritueux" : "Rouge");
  if (cat === "Rouge") {
    const t = ((b.region || "") + " " + (b.cepage || "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const puissant = /bordeaux|rhone|languedoc|provence|cahors|madiran|sud-ouest|nebbiolo|cabernet|syrah|malbec|tannat|mourvedre|grenache/.test(t);
    return { c: puissant ? "16–18 °C" : "14–16 °C", t: puissant ? "carafe si jeune · sortir 1 h avant" : "légèrement frais · 30 min à l'air" };
  }
  const T = { Blanc: ["9–11 °C", "2 h au frigo avant le service"], Rosé: ["8–10 °C", "2 h au frigo avant le service"], Champagne: ["7–9 °C", "3 h au frigo avant le service"], Crémant: ["7–9 °C", "3 h au frigo avant le service"], Effervescent: ["7–9 °C", "3 h au frigo avant le service"], Moelleux: ["8–10 °C", "2 h au frigo avant le service"] };
  return { c: (T[cat] || T.Blanc)[0], t: (T[cat] || T.Blanc)[1] };
}

export function joursAvant(iso) { const d = new Date(iso + "T12:00:00"); const n = Math.ceil((d - Date.now()) / 86400000); return n >= 0 ? n : null; }
export function fmtListeDate(iso) { try { return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); } catch { return iso; } }
export function ilYA(ts) {
  const min = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (min < 60) return min + " min";
  const h = Math.round(min / 60);
  if (h < 24) return h + " h";
  return Math.round(h / 24) + " j";
}
