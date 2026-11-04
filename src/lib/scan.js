/* Scan de code-barres (EAN) : utile surtout pour les spiritueux, rare sur les
   bouteilles de vin en France. Deux chemins caméra distincts :
   - BarcodeDetector natif (Chrome Android) : l'appelant ouvre le flux lui-même ;
   - zxing en repli (iOS Safari) : zxing ouvre ET gère sa propre caméra —
     NE PAS ouvrir un getUserMedia avant (deux flux en même temps → iOS gèle).
   Puis OpenFoodFacts (gratuit, sans clé) pré-remplit les champs. */

export function barcodeDetectorDispo() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/* getUserMedia avec garde-fou : sur iPhone en PWA, la promesse peut rester
   pendante (bug WebKit connu) — on ne reste jamais bloqué sur « Ouverture ». */
export function ouvrirCamera(video, delaiMs = 9000) {
  return new Promise((res, rej) => {
    if (!navigator.mediaDevices?.getUserMedia) return rej(new Error("inaccessible"));
    let fini = false;
    const t = setTimeout(() => { if (!fini) { fini = true; rej(new Error("delai")); } }, delaiMs);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(stream => {
        if (fini) { try { stream.getTracks().forEach(x => x.stop()); } catch {} return; } /* trop tard */
        fini = true; clearTimeout(t);
        video.srcObject = stream;
        video.play().catch(() => {});
        res(stream);
      }, e => { if (!fini) { fini = true; clearTimeout(t); rej(e); } });
  });
}

/* Chemin 1 — BarcodeDetector natif (le flux est déjà ouvert par l'appelant) */
export function lireAvecDetecteur(video) {
  const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
  return new Promise(res => {
    const boucle = async () => {
      try {
        const codes = await det.detect(video);
        if (codes && codes.length) { res(codes[0].rawValue); return; }
      } catch {}
      setTimeout(boucle, 350);
    };
    boucle();
  });
}

/* Chemin 2 — zxing : il ouvre la caméra lui-même. onStop permet à l'appelant
   d'arrêter (bouton Annuler) ; le flux est arrêté par reader.reset(). */
export async function lireAvecZxing(video, onStop) {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 });
  const stop = () => { try { reader.reset(); } catch {} };
  onStop(stop);
  return new Promise((res, rej) => {
    try {
      reader.decodeFromVideoDevice(undefined, video, (r) => {
        if (r) { stop(); res(r.getText()); }
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

  const cats = [p.categories, ...(p.categories_tags || [])].join(" ");
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
