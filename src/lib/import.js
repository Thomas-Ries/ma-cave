/* Ma Cave — import.js : import CSV / Excel (.xlsx) avec FUSION (jamais d'écrasement)
 * - CSV : parser maison (séparateur , ; ou tabulation, guillemets gérés)
 * - XLSX : SheetJS chargé à la demande depuis le CDN (uniquement si tu importes un .xlsx)
 * - Fusion : clé = Nom + Millésime + Cave. Une ligne existante est MIS À JOUR,
 *   jamais supprimée ; les bouteilles absentes du fichier restent en cave.
 * - V1.1 : parseImportFile() (lecture seule) séparé de applyImportRows() (écriture),
 *   pour afficher un écran de confirmation AVANT d'écrire dans la cave.
 */

const IMPORT_HEADERS = {
  nom: ["nom", "name"],
  type: ["type"],
  categorie: ["categorie", "category"],
  region: ["region", "province"],
  cepage: ["cepage", "variete"],
  appellation: ["appellation"],
  millesime: ["millesime", "vintage", "annee"],
  apoDebut: ["apogeedebut", "apogee", "debutapogee"],
  apoFin: ["apogefin", "finapogee", "apogeefin"], /* "apogeefin" : normHeader garde le double e de « Apogée » */
  quantite: ["quantite", "qty", "nombre", "nb"],
  prix: ["prix", "price", "valeur"],
  cave: ["cave", "cellier"],
  cuvee: ["cuvee", "cuvee", "cru", "parcelle"],
  format: ["format", "contenance", "bouteilleformat"],
  statut: ["statut", "status", "etat"],
  commentaire: ["commentaire", "comment", "notes", "note"],
  pays: ["pays", "country"],
};

function normHeader(h) {
  return String(h || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function mapHeaders(headerRow) {
  /* renvoie { champ: indexColonne } */
  const map = {};
  headerRow.forEach((h, i) => {
    const k = normHeader(h);
    for (const [field, aliases] of Object.entries(IMPORT_HEADERS)) {
      if (aliases.includes(k) || k === field) { if (!(field in map)) map[field] = i; break; }
    }
  });
  return map;
}

function num(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function rowToBottle(row, map) {
  const get = (f) => (map[f] != null ? row[map[f]] : null);
  const b = {
    nom: String(get("nom") ?? "").trim(),
    type: String(get("type") ?? "").trim(),
    categorie: String(get("categorie") ?? "").trim(),
    region: String(get("region") ?? "").trim(),
    cepage: String(get("cepage") ?? "").trim(),
    millesime: (() => { const n = num(get("millesime")); return n != null ? Math.round(n) : null; })(),
    apoDebut: (() => { const n = num(get("apoDebut")); return n != null ? Math.round(n) : null; })(),
    apoFin: (() => { const n = num(get("apoFin")); return n != null ? Math.round(n) : null; })(),
    quantite: (() => { const n = num(get("quantite")); return n != null ? Math.max(0, Math.round(n)) : null; })(),
    prix: num(get("prix")),
    cave: String(get("cave") ?? "").trim(),
    cuvee: String(get("cuvee") ?? "").trim(),
    format: String(get("format") ?? "").trim() || "Bouteille (75 cl)",
    statut: String(get("statut") ?? "").trim(),
    commentaire: String(get("commentaire") ?? "").trim(),
    appellation: String(get("appellation") ?? "").trim(),
    pays: String(get("pays") ?? "").trim(),
  };
  if (!b.categorie) b.categorie = b.type === "Spiritueux" ? "Spiritueux" : "Rouge";
  /* « Moelleux » n'est plus une catégorie : colonne Excel → Blanc + spécificité */
  if (b.categorie === "Moelleux") { b.categorie = "Blanc"; if (!b.specificite) b.specificite = "Moelleux / Liquoreux"; }
  if (!b.type) b.type = b.categorie === "Spiritueux" ? "Spiritueux" : "Vin";
  if (!b.statut) b.statut = "En cave";
  return b;
}

/* ---------- CSV ---------- */

function detectSep(text) {
  const line = text.split(/\r?\n/)[0] || "";
  const counts = { ";": (line.match(/;/g) || []).length, "\t": (line.match(/\t/g) || []).length, ",": (line.match(/,/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCSVLine(line, sep) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCSV(text) {
  const sep = detectSep(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0], sep);
  const map = mapHeaders(header);
  return lines.slice(1).map(l => rowToBottle(parseCSVLine(l, sep), map));
}

/* ---------- XLSX (SheetJS à la demande) ---------- */

let sheetJsPromise = null;
function loadSheetJS() {
  if (typeof XLSX !== "undefined") return Promise.resolve();
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Lecteur Excel indisponible (connexion ?) — exporte plutôt en CSV"));
    document.head.appendChild(s);
  });
  return sheetJsPromise;
}

async function parseXLSX(file) {
  await loadSheetJS();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("cave")) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
  if (!rows.length) return [];
  const header = Object.keys(rows[0]);
  const map = mapHeaders(header);
  return rows.map(r => rowToBottle(header.map(h => r[h]), map));
}

/* ---------- clé de fusion ---------- */

/* Normalisation forte : minuscules, sans accent, espaces réduits — deux fiches
   écrites différemment (« Crès »/« Cres », double espace…) restent LA même bouteille. */
function normTxt(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

function normMil(m) {
  if (m == null || m === "") return "";
  const n = Number(m);
  return Number.isFinite(n) ? String(n) : String(m).trim();
}

function importKey(b) {
  /* Clé = nom + cuvée + millésime + cave. La cuvée est indispensable : sans elle,
     « Cave de Tain 2022 » fusionnerait « Domaine des gardes » et « Exploration ».
     « Cave principale » et « Principale » sont LA MÊME cave (renommage v33) :
     sans cette normalisation, un pull Notion ré-ajoute toute la cave en doublons. */
  let c = normTxt(b.cave);
  if (c === "cave principale") c = "principale";
  return [normTxt(b.nom), normTxt(b.cuvee), normMil(b.millesime), c].join(" | ");
}

/* Trouve la ligne existante correspondant à une ligne importée.
   1. Clé exacte (nom + cuvée + millésime + cave).
   2. Sinon, rattrapage « Excel sans cuvée » : si l'Excel laisse la cuvée vide
      alors que l'app la connaît, même nom + millésime + cave :
      - un seul candidat → c'est LA même bouteille, on fusionne (l'app garde
        sa cuvée, l'import ne l'écrase pas avec du vide) ;
      - plusieurs candidats aux cuvées différentes → ambigu, on préfère celui
        à cuvée vide ; sinon on crée (on ne peut pas deviner laquelle c'est).
      Sans ce rattrapage, importer un Excel à cuvée vide dupliquerait toute
      une cave dont l'app connaît les cuvées. */
function trouveExistante(r, db) {
  const bouteilles = (db && db.bouteilles) || [];
  const exact = bouteilles.find(b => importKey(b) === importKey(r));
  if (exact) return exact;
  const k = importKey(r).split(" | ");
  if (k[1] !== "") return null;             /* l'import CONNAÎT la cuvée : clé exacte ou rien */
  const cands = bouteilles.filter(b => {
    const p = importKey(b).split(" | ");
    return p[0] === k[0] && p[2] === k[2] && p[3] === k[3];
  });
  if (cands.length === 1) return cands[0];
  const sansCuvee = cands.filter(b => importKey(b).split(" | ")[1] === "");
  return sansCuvee.length === 1 ? sansCuvee[0] : null;
}

/* ---------- V1.1 : lecture seule, puis écriture séparée ---------- */

async function parseImportFile(file) {
  const name = (file.name || "").toLowerCase();
  let rows;
  if (name.endsWith(".xlsx")) rows = await parseXLSX(file);
  else if (name.endsWith(".csv") || name.endsWith(".txt")) rows = parseCSV(await file.text());
  else throw new Error("Format non supporté — utilise .xlsx ou .csv");
  return rows.filter(r => r.nom !== "");
}

/* Aperçu sans écriture : compte nouvelles / mises à jour */
function previewImport(rows, db) {
  const nouvelles = [], majs = [];
  for (const r of rows) {
    const ex = trouveExistante(r, db);
    (ex ? majs : nouvelles).push(r);
  }
  return { nouvelles, majs };
}

function applyImportRows(rows, db, uidFn, estimeApogeeFn) {
  let created = 0, updated = 0;
  const now = new Date().toISOString();
  for (const r of rows) {
    const existing = trouveExistante(r, db);
    if (existing) {
      ["categorie", "region", "cepage", "cuvee", "appellation", "format", "commentaire", "pays", "type"].forEach(f => { if (r[f]) existing[f] = r[f]; });
      if (r.quantite != null) existing.quantite = r.quantite;
      if (r.prix != null) existing.prix = r.prix;
      if (r.apoDebut != null) { existing.apoDebut = r.apoDebut; existing.apoFin = r.apoFin ?? r.apoDebut; existing.apoAuto = null; }
      existing.modifLe = now;
      updated++;
    } else {
      const b = { ...r, id: (uidFn ? uidFn() : "b" + Date.now() + Math.random().toString(36).slice(2, 6)), bues: 0, note: null, photo: null, buLe: null, modifLe: now };
      if (b.quantite == null) b.quantite = 1; /* Quantité vide = 1 */
      const est = b.apoDebut != null ? null : (estimeApogeeFn ? estimeApogeeFn(b) : null);
      b.apoAuto = est; b.apoRegle = est ? est.regle : null;
      if (b.apoDebut == null) { b.apoDebut = null; b.apoFin = null; }
      db.bouteilles.push(b);
      created++;
    }
  }
  return { created, updated, total: rows.length };
}

/* Compat : import direct sans confirmation */
async function importCaveFile(file) {
  return applyImportRows(await parseImportFile(file));
}

export { importKey, previewImport, applyImportRows, parseImportFile, parseCSV };
