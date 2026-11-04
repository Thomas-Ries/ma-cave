/* Ma Cave v2 (Vue) — Pages Function en mode avancé (_worker.js)
 * Fichier unique à la racine du dossier dist : reconnu par le glisser-déposer Cloudflare (Direct Upload).
 * Token NOTION_TOKEN + NOTION_DATABASE_ID_CAVE côté serveur (jamais dans le front).
 *
 * Routes :
 *   POST /api/sync-notion  actions : "add", "drink", "sync" (upsert massif), "pull", "move", "delete"
 *   GET  /api/sync-notion  idem "pull" (pratique pour tester dans le navigateur)
 *   GET  /api/avatar       ?profil=X → avatar du profil (base64 + date d'édition)
 *   POST /api/avatar       { profil, data } — data: null = suppression
 *   GET  /api/listes       ?profil=X → listes d'envie du profil (JSON + date d'édition)
 *   GET/POST /api/envies  — envies d'achat (panier), stockage partagé tous profils
 *   POST /api/listes       { profil, data } — JSON des listes, data: null = tout effacer
 *   tout le reste → fichiers statiques (env.ASSETS)
 *
 * Méta-pages Notion (exclues du traitement des bouteilles) :
 *   « Profil (avatar) »  — propriété texte « Avatar (base64) », chunks de 1900 caractères
 *   « Listes d'envie »   — propriété texte « Listes (JSON) », chunks de 1900 caractères
 * Résolution multi-appareils : le plus récent gagne (last_edited_time vs horodatage local).
 */

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function headers(token) {
  return { "Authorization": `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" };
}

function toNotionProperties(b) {
  const props = {
    "Nom": { title: [{ text: { content: b.nom || "Bouteille sans nom" } }] },
    "Type": { select: { name: b.type || "Vin" } },
    "Catégorie": { select: { name: b.categorie || "Rouge" } },
    "Cave": { select: { name: b.cave || "Cave principale" } },
    "Statut": { select: { name: b.statut || (b.quantite > 0 ? "En cave" : "Bue") } },
    "Quantité": { number: b.quantite ?? null },
    "Millésime": { number: b.millesime ?? null },
    "Prix": { number: b.prix ?? null },
    "Note": { number: b.note ?? null },
    "Cépage": { rich_text: [{ text: { content: b.cepage || "" } }] },
    "Appellation": { rich_text: [{ text: { content: b.appellation || "" } }] },
    "Cuvée": { rich_text: [{ text: { content: b.cuvee || "" } }] },
    "Spécificité": { rich_text: [{ text: { content: b.specificite || "" } }] },
    "Format": { select: { name: b.format || "Bouteille (75 cl)" } },
    "Commentaire": { rich_text: [{ text: { content: b.commentaire || "" } }] },
  };
  /* Un select avec un nom VIDE est refusé par Notion (validation_error 400, renvoyé
     en 502) : Région et Pays ne partent que s'ils sont renseignés. */
  if (b.region && String(b.region).trim()) props["Région"] = { select: { name: b.region } };
  if (b.pays && String(b.pays).trim()) props["Pays"] = { select: { name: b.pays } };
  return props;
}

function toNotionPage(dbId, b) {
  return { parent: { database_id: dbId }, properties: toNotionProperties(b) };
}

function fromNotionPage(p) {
  const props = p.properties || {};
  const sel = (n) => props[n]?.select?.name || null;
  const num = (n) => (props[n]?.number ?? null);
  const rt = (n) => (props[n]?.rich_text || []).map(t => t.plain_text || "").join("");
  const title = (n) => (props[n]?.title || []).map(t => t.plain_text || "").join("");
  return {
    nom: title("Nom") || "",
    type: sel("Type") || "Vin",
    categorie: sel("Catégorie") || "Rouge",
    cave: sel("Cave") || "Cave principale",
    region: sel("Région") || "",
    pays: sel("Pays") || "",
    statut: sel("Statut") || "En cave",
    quantite: num("Quantité"),
    millesime: num("Millésime"),
    prix: num("Prix"),
    note: num("Note"),
    cepage: rt("Cépage"),
    appellation: rt("Appellation"),
    cuvee: rt("Cuvée"),
    specificite: rt("Spécificité"),
    format: sel("Format") || "Bouteille (75 cl)",
    commentaire: rt("Commentaire"),
    lastEdited: p.last_edited_time || "",
  };
}

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

/* Clé alignée sur importKey de l'app : nom + cuvée + millésime + cave.
   « Cave principale » et « Principale » = même cave ; la cuvée distingue
   les cuvées différentes d'un même domaine/millésime. */
function pageKey(nom, millesime, cave, cuvee) {
  let c = normTxt(cave);
  if (c === "cave principale") c = "principale";
  return [normTxt(nom), normTxt(cuvee), normMil(millesime), c].join(" | ");
}

/* Toutes les pages de la base, pagination incluse */
async function notionCode(res) {
  try { const j = await res.clone().json(); return j.code || j.message || null; } catch { return null; }
}

async function queryAll(token, dbId) {
  const out = [];
  let cursor = undefined;
  do {
    const res = await fetch(`${API}/databases/${dbId}/query`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok && res.status === 429) {
      /* Limite de débit : Notion demande de patienter — on réessaie une fois */
      await new Promise(r => setTimeout(r, Math.min(+(res.headers.get("retry-after") || 1) * 1000, 5000)));
      continue;
    }
    if (!res.ok) throw new Error(`Notion query ${res.status} ${(await notionCode(res)) || ""}`.trim());
    const j = await res.json();
    out.push(...(j.results || []));
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return out;
}

/* Profils (v27) : chaque profil a sa base Notion — Thomas NOTION_DATABASE_ID_CAVE,
 * Marc Joseph NOTION_DATABASE_ID_CAVE_MARC (à ajouter dans les variables Cloudflare). */
function dbIdFor(env, profil) {
  return profil === "marc" ? (env.NOTION_DATABASE_ID_CAVE_MARC || env.NOTION_DATABASE_ID_CAVE) : env.NOTION_DATABASE_ID_CAVE;
}

/* ---------- Méta-pages (avatar, listes) — stockage clé/valeur dans la base ----------
 * Contenu textuel découpé en morceaux de 1900 caractères (l'API Notion limite un bloc à 2000).
 * Ces pages sont exclues partout du traitement des bouteilles (pull, upsert, drink, delete). */
const AVATAR_TITLE = "Profil (avatar)";
const AVATAR_PROP = "Avatar (base64)";
const LISTES_TITLE = "Listes d'envie";
const LISTES_PROP = "Listes (JSON)";
const ENVIES_TITLE = "Envies d'achat";
const ENVIES_PROP = "Envies (JSON)";
const PREFS_TITLE = "Préférences soir";
const PREFS_PROP = "Prefs soir (JSON)";
const BUES_TITLE = "Bues (historique)";
const BUES_PROP = "Bues (JSON)";

function isMetaPage(p) {
  const t = ((p.properties?.Nom?.title) || []).map(x => x.plain_text || "").join("");
  return t === AVATAR_TITLE || t === LISTES_TITLE || t === ENVIES_TITLE || t === PREFS_TITLE || t === BUES_TITLE;
}

function toChunks(s, n = 1900) {
  const out = [];
  for (let i = 0; i < (s || "").length; i += n) out.push({ text: { content: s.slice(i, i + n) } });
  return out;
}

async function ensureProp(token, dbId, propName) {
  const res = await fetch(`${API}/databases/${dbId}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ properties: { [propName]: { rich_text: {} } } }),
  });
  if (!res.ok) throw new Error(`Notion schema ${res.status}`);
}

const ensuredProps = new Set();   /* schéma déjà assuré : dbId·prop */
const metaPageIds = new Map();     /* id de page méta : dbId·title → { id, ts } (TTL 10 min) */

async function findMetaPage(token, dbId, title) {
  const pages = await queryAll(token, dbId);
  return pages.find(p => {
    const t = ((p.properties?.Nom?.title) || []).map(x => x.plain_text || "").join("");
    return t === title;
  }) || null;
}

async function metaGet(env, profil, title, propName) {
  const token = env.NOTION_TOKEN;
  const dbId = dbIdFor(env, profil);
  if (!token || !dbId) return json({ ok: false, error: "Function non configurée" }, 500);
  const ck = dbId + "·" + title;
  try {
    let page = null;
    const cached = metaPageIds.get(ck);
    if (cached) {
      const res = await fetch(`${API}/pages/${cached.id}`, { headers: headers(token) });
      if (res.ok) page = await res.json();
      else if (res.status === 404 || res.status === 410) metaPageIds.delete(ck); /* page supprimée → on rescane */
    }
    if (!page) {
      page = await findMetaPage(token, dbId, title);
      if (page) metaPageIds.set(ck, { id: page.id, ts: Date.now() });
    }
    if (!page) return json({ ok: true, data: null, edited: null });
    const data = (page.properties?.[propName]?.rich_text || []).map(t => t.plain_text || "").join("");
    return json({ ok: true, data: data || null, edited: page.last_edited_time || null });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

async function metaPost(request, env, title, propName, validate, profilForce) {
  let body = {};
  try { body = await request.json(); } catch {}
  const profil = profilForce || body.profil || "thomas";
  const token = env.NOTION_TOKEN;
  const dbId = dbIdFor(env, profil);
  if (!token || !dbId) return json({ ok: false, error: "Function non configurée" }, 500);
  let data = body.data;
  if (data != null) {
    if (typeof data !== "string" || !validate(data)) return json({ ok: false, error: "Format invalide" }, 400);
    if (data.length > 180000) return json({ ok: false, error: "Charge trop volumineuse" }, 413);
  }
  const ck = dbId + "·" + title;
  try {
    const ek = dbId + "·" + propName;
    if (!ensuredProps.has(ek)) {
      await ensureProp(token, dbId, propName);
      ensuredProps.add(ek);
    }
    const props = {
      "Nom": { title: [{ text: { content: title } }] },
      [propName]: { rich_text: data ? toChunks(data) : [] },
    };
    const envoi = (method, url, body) => fetch(url, { method, headers: headers(token), body: JSON.stringify(body) });
    let res = null;
    const cached = metaPageIds.get(ck);
    if (cached) {
      res = await envoi("PATCH", `${API}/pages/${cached.id}`, { properties: props });
      if (res.status === 404 || res.status === 410) { metaPageIds.delete(ck); res = null; }
    }
    if (!res || !cached) {
      const page = await findMetaPage(token, dbId, title);
      if (page) { metaPageIds.set(ck, { id: page.id, ts: Date.now() }); res = await envoi("PATCH", `${API}/pages/${page.id}`, { properties: props }); }
      else res = await envoi("POST", `${API}/pages`, { parent: { database_id: dbId }, properties: props });
    }
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, Math.min(+(res.headers.get("retry-after") || 1) * 1000, 5000)));
      const id = metaPageIds.get(ck);
      res = id ? await envoi("PATCH", `${API}/pages/${id.id}`, { properties: props }) : res;
    }
    if (!res.ok) return json({ ok: false, error: `Notion ${res.status} ${(await notionCode(res)) || ""}`.trim() }, res.status === 429 ? 429 : 502);
    const j = await res.json();
    metaPageIds.set(ck, { id: j.id, ts: Date.now() });
    return json({ ok: true, edited: j.last_edited_time || null });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

/* ---------- Listes d'envie (v2.5) ----------
 * data = JSON.stringify(db.listes) : [{ id, nom, ids, date, … }] — petites charges, chunks largement suffisants. */
function listesValides(s) {
  try { const a = JSON.parse(s); return Array.isArray(a); } catch { return false; }
}

async function pullAllPages(env, profil) {
  const token = env.NOTION_TOKEN;
  const dbId = dbIdFor(env, profil);
  if (!token || !dbId) return json({ ok: false, error: "Function non configurée (NOTION_TOKEN / NOTION_DATABASE_ID_CAVE" + (profil === "marc" ? "_MARC" : "") + ")" }, 500);
  try {
    const pages = await queryAll(token, dbId);
    return json({ ok: true, bouteilles: pages.filter(p => !isMetaPage(p)).map(fromNotionPage) });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

async function syncUpsert(env, bouteilles, profil) {
  const token = env.NOTION_TOKEN;
  const dbId = dbIdFor(env, profil);
  if (!token || !dbId) return json({ ok: false, error: "Function non configurée (NOTION_TOKEN / NOTION_DATABASE_ID_CAVE)" }, 500);
  try {
    const pages = await queryAll(token, dbId);
    /* Synchro INCREMENTALE : la page Notion connaît sa date de dernière édition
       (last_edited_time) et l'app envoie modifLe à chaque modification locale.
       Si la page Notion est déjà au moins aussi récente que la bouteille, on ne
       fait AUCUN appel — une synchro sans changement ne coûte quasi rien à Notion
       (avant : 400+ PATCH à chaque fois → subrequests + limite de débit → 500). */
    const index = new Map(pages.filter(p => !isMetaPage(p)).map(p => { const b = fromNotionPage(p); return [pageKey(b.nom, b.millesime, b.cave, b.cuvee), { id: p.id, edited: p.last_edited_time || "" }]; }));
    let created = 0, updated = 0, failed = 0, skipped = 0, failedDetail = null;
    for (const b of (bouteilles || [])) {
      if (!b || !b.nom) continue;
      const key = pageKey(b.nom, b.millesime, b.cave, b.cuvee);
      const pid = index.get(key);
      if (pid && (!b.modifLe || (pid.edited && b.modifLe <= pid.edited))) { skipped++; continue; }
      const envoi = async (url, method, body) => {
        let res = await fetch(url, { method, headers: headers(token), body: JSON.stringify(body) });
        for (let i = 0; i < 2 && res.status === 429; i++) {
          await new Promise(r => setTimeout(r, Math.min(+(res.headers.get("retry-after") || 1) * 1000, 4000)));
          res = await fetch(url, { method, headers: headers(token), body: JSON.stringify(body) });
        }
        return res;
      };
      let res;
      if (pid) res = await envoi(`${API}/pages/${pid.id}`, "PATCH", { properties: toNotionProperties(b) });
      else {
        res = await envoi(`${API}/pages`, "POST", toNotionPage(dbId, b));
        if (res.ok) {
          const j = await res.json();
          index.set(key, { id: j.id, edited: "" });
        }
      }
      if (res.ok) pid ? updated++ : created++;
      else { failed++; if (!failedDetail) failedDetail = `Notion ${res.status} ${(await notionCode(res)) || ""}`.trim() + " — " + (b.nom || "?"); }
    }
    return json({ ok: true, created, updated, skipped, failed, failedDetail });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

async function handleSyncPost(request, env) {
  let body = {};
  try { body = await request.json(); } catch {}
  const action = body.action || "add";
  const token = env.NOTION_TOKEN;
  const profil = body.profil || "thomas";
  const dbId = dbIdFor(env, profil);

  if (action === "pull") return pullAllPages(env, profil);
  if (action === "sync") return syncUpsert(env, body.bouteilles, profil);

  if (!token || !dbId) return json({ ok: false, error: "Function non configurée" }, 500);

  if (action === "add" && body.bouteille) {
    try {
      const res = await fetch(`${API}/pages`, { method: "POST", headers: headers(token), body: JSON.stringify(toNotionPage(dbId, body.bouteille)) });
      if (!res.ok) return json({ ok: false, error: `Notion ${res.status}` }, 502);
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  if (action === "drink" && body.bouteille) {
    /* Décrément : on met à jour la page correspondante si elle existe (les quantités sont aussi réappliquées par "sync") */
    try {
      const pages = (await queryAll(token, dbId)).filter(p => !isMetaPage(p));
      const b = body.bouteille;
      const pid = (pages.map(p => ({ p, b2: fromNotionPage(p) })).find(({ b2 }) => pageKey(b2.nom, b2.millesime, b2.cave, b2.cuvee) === pageKey(b.nom, b.millesime, b.cave, b.cuvee)) || {}).p;
      if (pid) {
        const res = await fetch(`${API}/pages/${pid.id}`, { method: "PATCH", headers: headers(token), body: JSON.stringify({ properties: toNotionProperties(b) }) });
        if (!res.ok) return json({ ok: false, error: `Notion ${res.status}` }, 502);
      }
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  /* Déplacement de cave (ex. « Ce soir » → mise au frigo) : la page Notion est
     retrouvée avec l'ANCIENNE cave (la clé change quand la cave change), puis
     mise à jour avec les nouvelles propriétés. */
  if (action === "move" && body.bouteille) {
    try {
      const pages = (await queryAll(token, dbId)).filter(p => !isMetaPage(p));
      const b = body.bouteille;
      const oldKey = pageKey(b.nom, b.millesime, body.ancienneCave, b.cuvee);
      const pid = (pages.map(p => ({ p, b2: fromNotionPage(p) })).find(({ b2 }) => pageKey(b2.nom, b2.millesime, b2.cave, b2.cuvee) === oldKey) || {}).p;
      if (pid) {
        const res = await fetch(`${API}/pages/${pid.id}`, { method: "PATCH", headers: headers(token), body: JSON.stringify({ properties: toNotionProperties(b) }) });
        if (!res.ok) return json({ ok: false, error: `Notion ${res.status}` }, 502);
      }
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  if (action === "delete" && body.bouteille) {
    /* Suppression côté app → la page Notion correspondante est archivée (poubelle), pas effacée définitivement */
    try {
      const pages = (await queryAll(token, dbId)).filter(p => !isMetaPage(p));
      const b = body.bouteille;
      const pid = (pages.map(p => ({ p, b2: fromNotionPage(p) })).find(({ b2 }) => pageKey(b2.nom, b2.millesime, b2.cave, b2.cuvee) === pageKey(b.nom, b.millesime, b.cave, b.cuvee)) || {}).p;
      if (pid) {
        const res = await fetch(`${API}/pages/${pid.id}`, { method: "PATCH", headers: headers(token), body: JSON.stringify({ archived: true }) });
        if (!res.ok) return json({ ok: false, error: `Notion ${res.status}` }, 502);
      }
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  return json({ ok: false, error: "Action inconnue" }, 400);
}

/* ================= Pages publiques : /partage et /apropos =================
 * Servies directement par le worker : jamais de SPA-fallback vers l'app,
 * jamais d'écran de code — un visiteur ne voit QUE ces deux pages.
 *   /partage?b=<base64url> → carte publique d'une bouteille (lien de partage)
 *   /apropos              → présentation de l'app (carte promo)
 * Aucune donnée n'est lue côté serveur : la fiche voyage dans l'URL, encodée
 * par l'app (jamais prix, quantité, commentaire, photo, emplacement). */

const CAT_COLORS_PUB = { Rouge: "#7A2E3E", Blanc: "#A8842C", "Rosé": "#D98A96", Champagne: "#C4A35A", "Crémant": "#8FBF9F", Effervescent: "#4A7856", Spiritueux: "#7A8B2E" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const PUB_CSS = `
  :root { --cream:#FAF6F1; --ink:#2B2724; --accent:#7A2E3E; --gold:#A8842C; --riesling:#D9C589; --hairline:#EAE2D9; --muted:#8A7F75; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--cream); color:var(--ink); font-family:Georgia,"Times New Roman",serif; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:20px 14px; }
  .carte { width:400px; max-width:100%; background:#fff; border:1px solid var(--hairline); box-shadow:0 1px 2px rgba(43,39,36,.03),0 10px 30px rgba(43,39,36,.08); overflow:hidden; border-radius:18px; }
  .liseret { height:5px; background:linear-gradient(90deg,var(--accent) 0 55%,var(--riesling) 55% 78%,var(--gold) 78% 100%); }
  .inner { padding:28px 28px 22px; }
  .eyebrow { font-family:-apple-system,system-ui,sans-serif; font-size:10px; letter-spacing:.3em; text-transform:uppercase; color:var(--gold); text-align:center; }
  h1 { font-size:24px; font-weight:normal; text-align:center; margin-top:8px; line-height:1.25; word-break:break-word; }
  .sous { text-align:center; color:var(--muted); font-size:14px; font-style:italic; margin-top:4px; word-break:break-word; }
  .puce { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; vertical-align:1px; }
  .note-badge { display:flex; align-items:center; justify-content:center; margin-top:18px; }
  .note-val { background:var(--riesling); width:56px; height:56px; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .note-val small { font-size:7.5px; letter-spacing:.2em; text-transform:uppercase; }
  .note-val b { font-size:19px; font-weight:normal; line-height:1; }
  dl { margin-top:18px; font-size:14px; }
  dl > div { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--hairline); }
  dl > div:last-child { border-bottom:0; }
  dt { color:var(--muted); } dd { text-align:right; }
  .apogee { margin-top:16px; padding:14px 16px; background:rgba(217,197,137,.18); border:1px solid rgba(217,197,137,.55); font-size:14px; text-align:center; border-radius:12px; }
  .apogee small { display:block; font-family:-apple-system,system-ui,sans-serif; font-size:9.5px; letter-spacing:.26em; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
  .cta { display:block; margin-top:22px; text-align:center; }
  .cta a { display:inline-flex; align-items:center; gap:9px; background:var(--accent); color:#fff; text-decoration:none; padding:12px 24px; font-size:14px; letter-spacing:.04em; box-shadow:0 8px 20px rgba(122,46,62,.3); border-radius:12px; }
  .cta p { font-family:-apple-system,system-ui,sans-serif; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); margin-top:10px; }
  .erreur { text-align:center; padding:60px 20px; font-style:italic; color:var(--muted); }
  h1.grand { font-size:42px; }
  .vitrine { position:relative; height:196px; margin:26px -6px 10px; text-align:center; }
  .badge-note { position:absolute; left:calc(50% + 52px); top:72px; background:var(--riesling); color:var(--ink); width:74px; height:74px; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 6px 18px rgba(43,39,36,.18); z-index:3; }
  .badge-note small { font-size:8.5px; letter-spacing:.22em; text-transform:uppercase; }
  .badge-note b { font-size:26px; font-weight:normal; line-height:1.05; }
  .ligne { display:flex; align-items:center; gap:12px; padding:11px 0; border-bottom:1px solid var(--hairline); text-align:left; }
  .ligne:last-of-type { border-bottom:0; }
  .ligne .t b { font-weight:normal; font-family:-apple-system,system-ui,sans-serif; font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:var(--accent); display:block; margin-bottom:2px; }
  .ligne .t span { color:var(--muted); font-size:12.5px; font-style:italic; }
  .verre { display:inline-flex; }
`;

function pubPage(title, body) {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(title)}</title><meta name="robots" content="noindex"><style>${PUB_CSS}</style></head><body>${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "public, max-age=300" } }
  );
}

/* Décode un code base64url UTF-8 (payload du lien de partage) */
function decodeCode(code) {
  try {
    let s = String(code || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return o && o.n ? o : null;
  } catch { return null; }
}

function fenetreApogee(ap) {
  if (!ap || ap.d == null) return null;
  const f = ap.f != null ? ap.f : ap.d, y = new Date().getFullYear();
  if (y > f) return "à boire sans attendre — apogée dépassée, mais tout va bien";
  if (y >= ap.d) return "en pleine apogée — c'est le moment";
  if (ap.d - y <= 2) return "à ouvrir bientôt — apogée " + ap.d + (ap.f != null ? "–" + ap.f : "");
  return "à garder encore — apogée " + ap.d + (ap.f != null ? "–" + ap.f : "");
}

const ERREUR_LIEN = `<div class="carte"><div class="liseret"></div><div class="erreur">Ce lien de partage est incomplet ou invalide.</div></div>`;

function pagePartage(code) {
  const o = decodeCode(code);
  if (!o) return pubPage("Partage — Ma Cave", ERREUR_LIEN);
  const cat = o.cat || "Rouge";
  const spirit = cat === "Spiritueux";
  const lignes = [];
  if (o.m != null) lignes.push(["Millésime", o.m]);
  if (spirit && o.s) lignes.push(["Mention", o.s]);
  if (!spirit && o.ce) lignes.push(["Cépage", [o.ce, o.s].filter(Boolean).join(" · ")]);
  if (o.a) lignes.push(["Appellation", o.a]);
  if (o.r) lignes.push(["Région", o.r]);
  const ap = fenetreApogee(o.ap);
  const body = `<div class="carte"><div class="liseret"></div><div class="inner">
    <p class="eyebrow">Une bouteille de la cave</p>
    <h1><span class="puce" style="background:${esc(CAT_COLORS_PUB[cat] || "#8A7F75")}"></span>${esc(o.n)}</h1>
    ${o.c ? `<p class="sous">${esc(o.c)}</p>` : ""}
    ${o.note != null ? `<div class="note-badge"><div class="note-val"><small>Note</small><b>${esc(o.note)}</b></div></div>` : ""}
    ${lignes.length ? `<dl>${lignes.map(l => `<div><dt>${esc(l[0])}</dt><dd>${esc(l[1])}</dd></div>`).join("")}</dl>` : ""}
    ${ap ? `<div class="apogee"><small>Apogée</small>${esc(ap)}</div>` : ""}
    <div class="cta"><a href="/apropos">Découvrir Ma Cave</a><p>L&rsquo;app de cave gratuite — sans compte, hors ligne</p></div>
  </div></div>`;
  return pubPage((o.n || "Ma Cave") + " — à déguster", body);
}

function pageApropos() {
  const BOUTEILLE_SVG = `<svg width="70" height="176" viewBox="0 0 70 176" xmlns="http://www.w3.org/2000/svg">
    <path d="M29 4 h12 c1.6 0 3 1.4 3 3 v3 H26 V7 c0 -1.6 1.4 -3 3 -3 Z" fill="#2B2724"/>
    <path d="M28 10 h14 v22 c0 7 14 12 14 24 v108 c0 4 -3.5 7 -8 7 H22 c-4.5 0 -8 -3 -8 -7 V56 c0 -12 14 -17 14 -24 Z" fill="#7A2E3E"/>
    <rect x="17" y="84" width="36" height="54" fill="#FAF6F1" stroke="#EAE2D9"/>
    <line x1="22" y1="94" x2="48" y2="94" stroke="#D9C589" stroke-width="2"/>
    <text x="35" y="122" font-family="Georgia, serif" font-size="11" fill="#7A2E3E" text-anchor="middle" letter-spacing="1.5">2019</text>
  </svg>`;
  const ic = (d, c) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6">${d}</svg>`;
  const ligne = (svg, t, s) => `<div class="ligne">${svg}<div class="t"><b>${t}</b><span>${s}</span></div></div>`;
  const body = `<div class="carte"><div class="liseret"></div><div class="inner">
    <p class="eyebrow">L&rsquo;app des caves qui dorment bien</p>
    <h1 class="grand">Ma Cave.</h1>
    <p class="sous">Ta cave à vin, dans ta poche.<br>Elle sait quand ouvrir chaque bouteille.</p>
    <div class="vitrine">${BOUTEILLE_SVG}<div class="badge-note"><small>Apogée</small><b>2026</b></div></div>
    ${ligne(ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>', "#7A2E3E"), "Moteur d&rsquo;apogée", "80 appellations — il te dit quand boire, pas quand vendre.")}
    ${ligne(ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', "#7A2E3E"), "Dictée vocale", "« Domaine des Lambrays 2019, six bouteilles » — et c&rsquo;est en cave.")}
    ${ligne(ic('<path d="M17.5 18a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A4 4 0 0 0 7 18Z"/><path d="M12 21v-7m0 0-2.5 2.5M12 14l2.5 2.5"/>', "#7A2E3E"), "Suggestion du soir", "La météo, la saison et ton apogée choisissent la bouteille.")}
    ${ligne(ic('<path d="M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6Z"/><path d="m9 12 2 2 4-4"/>', "#7A8B2E"), "Tes données, chez toi", "Gratuite, sans compte, hors ligne — sauvegarde automatique.")}
    <div class="cta"><a href="mailto:thomasries.dev@gmail.com?subject=Demande%20d%27ajout%20%C3%A0%20l%27appli%20Ma%20Cave">Demande d&rsquo;ajout à l&rsquo;appli
      <span class="verre"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M8 2h8l-1 7a3.5 3.5 0 0 1-6 0ZM12 13v7M8 21h8"/></svg></span></a>
    <p>Disponible sur PC, Mac et smartphone en appli</p></div>
    <p class="sous" style="margin-top:16px;font-size:11.5px">Ta future cave est vierge : les bouteilles vivent sur TON appareil, jamais ici.</p>
  </div></div>`;
  return pubPage("Ma Cave — ta cave à vin, dans ta poche", body);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* Pages publiques : AVANT tout le reste — aucun risque de retomber sur l'app */
    if (url.pathname === "/partage") return pagePartage(url.searchParams.get("b") || "");
    if (url.pathname === "/apropos") return pageApropos();

    if (url.pathname === "/api/avatar") {
      if (request.method === "GET") return metaGet(env, url.searchParams.get("profil") || "thomas", AVATAR_TITLE, AVATAR_PROP);
      if (request.method === "POST") return metaPost(request, env, AVATAR_TITLE, AVATAR_PROP, s => s.startsWith("data:image"));
      return json({ ok: false, error: "Méthode non autorisée" }, 405);
    }

    /* Préférences du soir (météo, position, bandeaux) : par profil, comme l'avatar */
    if (url.pathname === "/api/prefs-soir") {
      if (request.method === "GET") return metaGet(env, url.searchParams.get("profil") || "thomas", PREFS_TITLE, PREFS_PROP);
      if (request.method === "POST") return metaPost(request, env, PREFS_TITLE, PREFS_PROP, s => { try { const j = JSON.parse(s); return !!j && typeof j === "object"; } catch { return false; } });
      return json({ ok: false, error: "Méthode non autorisée" }, 405);
    }

    /* Historique des bouteilles bues : par profil, comme les préférences */
    if (url.pathname === "/api/bues") {
      if (request.method === "GET") return metaGet(env, url.searchParams.get("profil") || "thomas", BUES_TITLE, BUES_PROP);
      if (request.method === "POST") return metaPost(request, env, BUES_TITLE, BUES_PROP, s => { try { const j = JSON.parse(s); return Array.isArray(j) || (j && Array.isArray(j.bues)); } catch { return false; } });
      return json({ ok: false, error: "Méthode non autorisée" }, 405);
    }

    /* Listes d'envie + Envies d'achat : STOCKAGE PARTAGÉ — toutes les modifications
       vont sur la base principale, visibles par tous les profils (PC, iPad…). */
    if (url.pathname === "/api/listes") {
      if (request.method === "GET") return metaGet(env, "thomas", LISTES_TITLE, LISTES_PROP);
      if (request.method === "POST") return metaPost(request, env, LISTES_TITLE, LISTES_PROP, listesValides, "thomas");
      return json({ ok: false, error: "Méthode non autorisée" }, 405);
    }

    if (url.pathname === "/api/envies") {
      if (request.method === "GET") return metaGet(env, "thomas", ENVIES_TITLE, ENVIES_PROP);
      if (request.method === "POST") return metaPost(request, env, ENVIES_TITLE, ENVIES_PROP, listesValides, "thomas");
      return json({ ok: false, error: "Méthode non autorisée" }, 405);
    }

    if (url.pathname === "/api/sync-notion") {
      if (request.method === "POST") return handleSyncPost(request, env);
      if (request.method === "GET") return pullAllPages(env, url.searchParams.get("profil") || "thomas");
      return json({ ok: false, error: "Méthode non autorisée" }, 405);
    }

    /* Tout le reste : servir les fichiers statiques de la Pages */
    return env.ASSETS.fetch(request);
  },
};
