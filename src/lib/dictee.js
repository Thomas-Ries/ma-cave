/* Dictée vocale pour la modale d'ajout : Web Speech API (natif navigateur,
   zéro dépendance). Le parseur est PUR (testable au node) : il découpe la
   transcription en segments « mot-clé valeur » et remplit la fiche au fil
   de la voix. Le wrapper gère micro/permission/redémarrage automatique. */

/* ---------- Nombres en lettres (français) → chiffres ---------- */
const U = { zéro: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100 };

export function nbFr(s) {
  s = String(s || "").trim().replace(/[\u2019']/g, " ");
  if (!s) return null;
  if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return parseFloat(s.replace(",", "."));
  const toks = s.split(/[\s\u2013\u2014-]+/).filter(Boolean);
  if (!toks.length) return null;
  let total = 0, cur = 0, has = false;
  for (const t of toks) {
    if (t === "et" || t === "et-un" || t === "e") continue;
    if (t === "mille" || t === "milles") { total += (cur || 1) * 1000; cur = 0; has = true; continue; }
    if (t === "cents" || t === "cent") { cur = (cur || 1) * 100; has = true; continue; }
    if (t === "vingt" && cur === 4) { cur = 80; has = true; continue; }      /* quatre-vingt */
    if (t === "dix" && cur === 60) { cur = 70; has = true; continue; }       /* soixante-dix */
    if (t === "dix" && cur === 80) { cur = 90; has = true; continue; }       /* quatre-vingt-dix */
    const u = U[t];
    if (u == null) return null;                                             /* mot inconnu → pas un nombre */
    cur += u; has = true;
  }
  return has ? total + cur : null;
}

/* ---------- Normalisation légère (accents, apostrophes) ---------- */
function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

/* Champs reconnus : mot-clé en début de segment. L'ordre compte peu, la
   valeur s'arrête au mot-clé suivant. */
const CHAMPS = [
  { re: /^(?:le\s+|la\s+)?(?:nom|domaine|ch[âa]teau)\b/i, f: "nom", strip: /^(?:le\s+|la\s+)?nom\b[\s:,–—-]*/i },
  { re: /^cat[ée]gorie\b/i, f: "categorie" },
  { re: /^mill[ée]sime\b|^ann[ée]e\b/i, f: "millesime" },
  { re: /^quantit[ée]|^nombre de bouteilles\b/i, f: "quantite" },
  { re: /^cave\b/i, f: "cave" },
  { re: /^appellation\b/i, f: "appellation" },
  { re: /^c[ée]pages?\b/i, f: "cepage" },
  { re: /^r[ée]gion\b/i, f: "region" },
  { re: /^pays\b/i, f: "pays" },
  { re: /^cuv[ée]e\b/i, f: "cuvee" },
  { re: /^prix\b/i, f: "prix" },
  { re: /^format\b/i, f: "format" },
  { re: /^apog[ée]e\b/i, f: "apogee" },
  { re: /^commentaire\b/i, f: "commentaire" },
];

/* Mots qui terminent une valeur (début d'un segment suivant) */
const BORNE = /\b(?:nom|domaine|ch[âa]teau|cat[ée]gorie|mill[ée]sime|ann[ée]e|quantit[ée]|cave|appellation|c[ée]pages?|r[ée]gion|pays|cuv[ée]e|prix|format|apog[ée]e|commentaire|bouteilles?)(?![a-zà-ÿ])/gi;

/* ---------- Catégories ---------- */
const CATS_MAP = [
  [/(?:vin\s+)?rouge/i, "Rouge"], [/(?:vin\s+)?blanc/i, "Blanc"], [/(?:vin\s+)?ros[ée]/i, "Rosé"],
  [/champagne/i, "Champagne"], [/cr[ée]mant/i, "Crémant"], [/effervescent|mousseux/i, "Effervescent"],
  [/moelleux|liquoreux/i, "Moelleux"], [/spiritueux|whisky|rhum|gin|vodka|cognac/i, "Spiritueux"],
];

/* ---------- Formats ---------- */
function formatDepuis(v) {
  const t = v.toLowerCase();
  if (/magnum/.test(t)) return "Magnum (1.5 L)";
  if (/j[ée]roboam/.test(t)) return "Jéroboam (3 L)";
  if (/demi/.test(t)) return "Demi (37.5 cl)";
  if (/bouteille/.test(t)) return "Bouteille (75 cl)";
  return null;
}

/* ---------- Parse principal : texte complet → correctifs de fiche ----------
   On relit TOUT le tampon à chaque résultat final : idempotent, et un nom
   coupé en deux morceaux par le moteur vocal se recolle naturellement. */
export function parseDictee(texte, fiche) {
  const patch = {};
  const t = norm(texte);
  if (!t) return patch;
  const BORNE_GLOB = new RegExp(BORNE.source, "gi");
  /* positions de tous les mots-clés (début de segment) dans l'ordre d'énonciation */
  const segs = [];
  let m;
  while ((m = BORNE_GLOB.exec(t))) {
    for (const c of CHAMPS) {
      const rest = t.slice(m.index);
      if (c.re.test(rest)) { segs.push({ f: c.f, start: m.index }); break; }
    }
    BORNE_GLOB.lastIndex = m.index + 1;
  }
  if (!segs.length) return raffineNom(t, patch);   /* pas de mot-clé : « Domaine X 2019 rouge » */
  for (let i = 0; i < segs.length; i++) {
    const fin = i + 1 < segs.length ? segs[i + 1].start : t.length;
    let v = norm(t.slice(segs[i].start, fin));
    /* retire le mot-clé lui-même */
    const c = CHAMPS.find(c => c.re.test(v));
    if (!c) continue;
    v = norm(v.replace(c.strip || c.re, "").replace(/^[\s:,–—-]+/, ""));
    if (!v) continue;
    applique(c.f, v, patch, fiche);
  }
  return patch;
}

function maj(v) { return v ? v.charAt(0).toUpperCase() + v.slice(1) : v; }

/* Nom dicté SANS mots-clés (« Domaine X 2019 rouge six bouteilles ») : on
   extrait quand même les infos évidentes pour ne pas tout mettre dans « nom ». */
function raffineNom(v, patch) {
  let reste = v;
  /* prix : « 15 euros », « 15,50 € » */
  if (patch.prix == null) {
    const pe = reste.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|€)/i);
    if (pe) { const n = nbFr(pe[1]); if (n != null) { patch.prix = n; reste = reste.replace(pe[0], " "); } }
  }
  /* quantité : « six bouteilles » */
  if (patch.quantite == null) {
    const qe = reste.match(/([a-zà-ÿ-]+|\d+)\s+bouteilles?/i);
    if (qe) { const n = nbFr(qe[1]); if (n != null && n >= 1) { patch.quantite = Math.round(n); reste = reste.replace(qe[0], " "); } }
  }
  /* millésime : 4 chiffres, ou « deux mille dix-neuf » */
  if (patch.millesime == null) {
    const ye = reste.match(/\b(19\d{2}|20\d{2})\b/);
    if (ye) { patch.millesime = parseInt(ye[0], 10); reste = reste.replace(ye[0], " "); }
    else {
      const yl = reste.match(/\bdeux\s+mille(?:\s+[a-zà-ÿ-]+)?/i);
      if (yl) { const n = nbFr(yl[0]); if (n != null && n >= 1900 && n <= 2100) { patch.millesime = Math.round(n); reste = reste.replace(yl[0], " "); } }
    }
  }
  /* catégorie : couleur détachée du nom. Retirée seulement si elle n'ouvre pas
     le nom (« Champagne Bollinger ») et qu'elle suit un millésime ou précède
     autre chose — sinon « Clos Rouge » deviendrait « Clos ». */
  if (patch.categorie == null) {
    const ce = reste.match(/\b(?:vin\s+)?(rouge|blancs?|ros[ée]e?|champagne|cr[ée]mants?|effervescents?|moelleux|liquoreux|spiritueux)\b/i);
    if (ce) {
      const avant = reste.slice(0, ce.index).trim();
      const apres = reste.slice(ce.index + ce[0].length).replace(/^[\s,.;:–—-]+/, "");
      const anneeAvant = patch.millesime != null || /\b(19|20)\d{2}\b/.test(avant) || /\bdeux\s+mille/i.test(avant);
      if (avant && (anneeAvant || apres)) {
        const hit = CATS_MAP.find(([re]) => re.test(ce[1]));
        if (hit) { patch.categorie = hit[1]; reste = avant + " " + apres; }
      }
    }
  }
  reste = reste.replace(/\s{2,}/g, " ").replace(/^[\s,.;:–—-]+/, "").replace(/[\s,.;:–—-]+$/, "").trim();
  if (reste.length > 1) patch.nom = maj(reste);
  return patch;
}

function applique(f, v, patch) {
  switch (f) {
    case "nom": if (v.length > 1) raffineNom(v.replace(/^(?:vin|cuvée)\s+/i, ""), patch); break;
    case "categorie": { const hit = CATS_MAP.find(([re]) => re.test(v)); if (hit) patch.categorie = hit[1]; break; }
    case "millesime": { const n = nbFr(v); if (n != null && n >= 1900 && n <= 2100) patch.millesime = Math.round(n); break; }
    case "quantite": { const n = nbFr(v.replace(/bouteilles?/gi, "")); if (n != null && n >= 1 && n <= 999) patch.quantite = Math.round(n); break; }
    case "prix": { const n = nbFr(v.replace(/euros?/gi, "").trim()); if (n != null && n >= 0 && n <= 100000) patch.prix = n; break; }
    case "cave": if (v.length > 1) patch.cave = v; break;
    case "appellation": patch.appellation = v; break;
    case "cepage": patch.cepage = v; break;
    case "region": patch.region = v; break;
    case "pays": patch.pays = v; break;
    case "cuvee": patch.cuvee = v; break;
    case "format": { const f2 = formatDepuis(v); if (f2) patch.format = f2; break; }
    case "apogee": {
      /* « de 2020 à 2030 », « entre 2020 et 2030 », « 2020 2030 » ou un seul millésime */
      const nums = [];
      const parts = v.split(/(?:[àa]|jusqu'[áa]|et|–|-|\s)\s*/i);
      for (const p of parts) { const n = nbFr(p); if (n != null && n >= 1900 && n <= 2200) nums.push(Math.round(n)); }
      if (nums.length >= 2) { patch.apoDebut = nums[0]; patch.apoFin = nums[1]; }
      else if (nums.length === 1) { patch.apoDebut = nums[0]; patch.apoFin = nums[0]; }
      break;
    }
    case "commentaire": if (v.length > 1) patch.commentaire = v; break;
  }
}

/* ---------- Wrapper Web Speech API ---------- */
export function speechSupporte() {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function creerDictee({ onFinal, onInterim, onErreur } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = "fr-FR";
  rec.continuous = true;
  rec.interimResults = true;
  /* gen = jeton de génération : seul le dernier start() peut relancer une session.
     Sans lui, un onend en retard redémarrait le micro après un stop (session zombie). */
  let actif = false, gen = 0;
  rec.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
    }
    if (final && onFinal) onFinal(final);
    if (onInterim) onInterim(interim);
  };
  /* iOS coupe souvent la reconnaissance après une pause : on relance tant que actif,
     avec un léger délai pour laisser le moteur retomber (start immédiat → InvalidState). */
  rec.onend = () => {
    const g = gen;
    setTimeout(() => { if (actif && gen === g) { try { rec.start(); } catch {} } }, 250);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      actif = false; gen++;
      onErreur && onErreur("Micro refusé — autorise le micro dans les réglages");
    } else if (e.error === "no-speech" || e.error === "aborted" || e.error === "network") {
      /* silencieux : onend relancera la session si nécessaire */
    } else if (onErreur) onErreur(null, e.error);
  };
  return {
    start() { gen++; actif = true; try { rec.start(); } catch {} },
    /* Coupe net : on détache TOUT callback (aucun onend ne peut relancer),
       abort() tue la session immédiatement (stop() seul la laisse vivre sur iOS). */
    stop() {
      gen++; actif = false;
      rec.onend = null; rec.onresult = null; rec.onerror = null;
      try { rec.abort(); } catch {}
      try { rec.stop(); } catch {}
    },
    get actif() { return actif; },
  };
}
