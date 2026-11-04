/* Scan de code-barres (EAN) : utile surtout pour les spiritueux, rare sur les
   bouteilles de vin en France. La caméra lit le code via BarcodeDetector
   (natif, Chrome Android) ou zxing en repli (iOS Safari), puis OpenFoodFacts
   (gratuit, sans clé, aucune donnée envoyée SAUF le code recherché) pré-remplit
   les champs. On complète à la main ou à la dictée ensuite. */

/* ---------- Lecture caméra : renvoie le code dès qu'il est lu ---------- */
export async function lireCodeBarres(video) {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    return new Promise(res => {
      const boucle = async () => {
        try {
          const codes = await det.detect(video);
          if (codes.length) { res(codes[0].rawValue); return; }
        } catch {}
        setTimeout(boucle, 350);
      };
      boucle();
    });
  }
  /* Repli : zxing (dynamique, chunk séparé) */
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 });
  return new Promise((res, rej) => {
    try {
      reader.decodeFromVideoDevice(undefined, video, (r, err) => {
        if (r) { try { reader.reset(); } catch {} res(r.getText()); }
      });
    } catch (e) { rej(e); }
  });
}

/* ---------- OpenFoodFacts : code → patch de fiche ---------- */
const SPIRITUEUX = /spirit|whisk|whiskey|vodka|rhum|rum\b|gin\b|cognac|armagnac|calvados|liqueur|liquor|eau-de-vie|tequila|mezcal|absinthe|sake|pastis/i;
const CHATONS = [
  [/champagne/i, "Champagne"], [/cremant|crémant/i, "Crémant"],
  [/mousseux|effervescent|sparkling/i, "Effervescent"],
  [/moelleux|doux|sweet|liquoreux/i, "Moelleux"],
  [/rose|rosé|rosado/i, "Rosé"], [/rouge|red wine|red/i, "Rouge"], [/blanc|white/i, "Blanc"],
];

export async function chercheProduit(code) {
  const r = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(code) + ".json");
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const p = j && j.product;
  if (!p) return null;

  const cats = [p.categories, ...(p.categories_tags || []), p.categories_lc === "" ? "" : ""].join(" ");
  let nom = String(p.product_name || "").trim();
  if (!nom && p.brands) nom = String(p.brands).split(",")[0].trim();
  if (!nom && p.generic_name) nom = String(p.generic_name).trim();

  const patch = {};
  if (nom) patch.nom = nom;
  if (SPIRITUEUX.test(cats)) { patch.type = "Spiritueux"; patch.categorie = "Spiritueux"; }
  else if (/wine|vin\b/i.test(cats)) {
    for (const [re, cat] of CHATONS) if (re.test(cats)) { patch.categorie = cat; break; }
  }
  if (p.origins) patch.pays = String(p.origins).split(",")[0].trim();
  else if (p.countries) patch.pays = String(p.countries).split(",")[0].trim();
  const bits = ["Code-barres " + code];
  if (p.brands && patch.nom !== p.brands) bits.push(String(p.brands).split(",")[0].trim());
  patch.commentaire = bits.join(" · ");

  return Object.keys(patch).length > 1 ? patch : null; /* juste un commentaire = rien trouvé */
}
