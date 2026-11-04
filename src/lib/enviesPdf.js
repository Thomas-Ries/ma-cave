/* Générateur PDF minimal (sans dépendance) pour le partage WhatsApp des envies.
   Contenu identique à l'export imprimable enviesPrint.js : titre, date, une
   section par note (nom + caviste) et ses bouteilles (nom · millésime · prix).
   Les PDF se construisent à la main : catalogue, pages, deux fontes Helvetica,
   textes WinAnsi. Retourne un Uint8Array prêt pour File/Blob. */

const W = 595, H = 842, MARGIN = 48, LARGEUR = W - 2 * MARGIN;
const INK = { r: 0.169, g: 0.153, b: 0.141 };   /* #2B2724 */
const ACCENT = { r: 0.478, g: 0.180, b: 0.243 };/* #7A2E3E */
const MUTED = { r: 0.541, g: 0.498, b: 0.459 }; /* #8A7F75 */

/* Échappe et convertit en WinAnsi (bytes latin-1), emojis ignorés */
function winAnsi(s) {
  let out = "";
  for (const ch of String(s ?? "")) {
    const c = ch.codePointAt(0);
    if (c === 0x20AC) out += "\u0080";      /* € */
    else if (c === 0x2022) out += "\u0095"; /* • */
    else if (c <= 255) out += ch;
    /* sinon : caractère non représentable → ignoré */
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/* Découpe un texte en lignes tenant dans la largeur (approx Helvetica : ~0.5 × corps) */
function coupe(texte, size, maxLignes = 2) {
  const maxChars = Math.max(20, Math.floor(LARGEUR / (size * 0.5)));
  const mots = String(texte || "").split(/\s+/);
  const lignes = [];
  let l = "";
  for (const m of mots) {
    if ((l + " " + m).trim().length > maxChars && l) { lignes.push(l.trim()); l = m; } else l = (l + " " + m).trim();
    if (lignes.length >= maxLignes) { if (l && lignes.length === maxLignes) { lignes[maxLignes - 1] += "…"; l = ""; } break; }
  }
  if (l && lignes.length < maxLignes) lignes.push(l);
  return lignes.length ? lignes : [""];
}

export function enviesPDFBytes(notes) {
  /* Contenu : tableau de { t, size, bold, couleur, ecart } */
  const dateTxt = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const lignes = [];
  lignes.push({ t: "Mes envies d'achat", size: 20, bold: true, couleur: ACCENT, ecart: 26 });
  lignes.push({ t: "Liste de courses — " + dateTxt, size: 10, bold: false, couleur: MUTED, ecart: 14 });
  lignes.push({ t: "", size: 10, ecart: 10 });
  for (const e of notes) {
    const items = (e.items || []).filter(i => !i.ajouteLe);
    if (!items.length) continue;
    lignes.push({ t: e.nom + (e.caviste ? " — " + e.caviste : ""), size: 13, bold: true, couleur: ACCENT, ecart: 18 });
    for (const it of items) {
      const d = [it.nom || "Sans nom", it.cuvee, it.millesime, it.prix != null ? it.prix + " €" : null, it.commentaire].filter(Boolean).join(" · ");
      lignes.push({ t: "\u2022 " + d, size: 10, bold: false, couleur: INK, ecart: 13.5, marge: 6 });
    }
    lignes.push({ t: "", size: 10, ecart: 8 });
  }

  /* Mise en page A4, retour à la ligne automatique, saut de page quand plein */
  const pages = [];
  let cur = [], y = H - MARGIN;
  const push = ln => { cur.push(ln); y -= ln.ecart; };
  for (const ln of lignes) {
    const morceaux = ln.t ? coupe(ln.t, ln.size) : [ln.t];
    for (const t of morceaux) {
      if (y - ln.ecart < MARGIN) { pages.push(cur); cur = []; y = H - MARGIN; }
      push({ ...ln, t });
    }
  }
  if (cur.length) pages.push(cur);

  /* Flux de contenu */
  const streams = pages.map(page => {
    let y = H - MARGIN, s = "";
    for (const ln of page) {
      y -= ln.ecart;
      const c = ln.couleur || INK;
      s += "BT /F" + (ln.bold ? "2" : "1") + " " + ln.size + " Tf " +
        c.r.toFixed(3) + " " + c.g.toFixed(3) + " " + c.b.toFixed(3) + " rg " +
        (MARGIN + (ln.marge || 0)) + " " + y.toFixed(1) + " Td (" + winAnsi(ln.t) + ") Tj ET\n";
    }
    return s;
  });

  /* Assemblage des objets PDF + table xref */
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = streams.map((_, i) => (5 + i * 2) + " 0 R").join(" ");
  objs[2] = "<< /Type /Pages /Kids [" + kids + "] /Count " + streams.length + " >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  streams.forEach((s, i) => {
    const numPage = 5 + i * 2;
    objs[numPage] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (numPage + 1) + " 0 R >>";
    objs[numPage + 1] = "<< /Length " + s.length + " >>\nstream\n" + s + "endstream";
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = pdf.length;
    pdf += i + " 0 obj\n" + objs[i] + "\nendobj\n";
  }
  const xrefPos = pdf.length;
  pdf += "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
  for (let i = 1; i < objs.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF";

  /* Encodage latin-1 → bytes (WinAnsi) */
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
