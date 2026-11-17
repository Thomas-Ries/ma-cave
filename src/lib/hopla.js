/* Hopla ! — le sommelier conversationnel de la cave (v2.28).
   POST /api/hopla du _worker.js relaie vers l'API Mistral : la clé
   MISTRAL_API_KEY vit côté Cloudflare, jamais dans le front.
   Historique : localStorage (60 derniers messages). Hors ligne : refus poli. */

const KEY = "ma-cave-hopla-v1";

export const ACCUEIL = "Bonjour Thomas. Je connais votre cave par cœur : accords, apogées, idées de recettes. Que puis-je pour vous ?";

export function chargeHistorique() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
export function sauveHistorique(msgs) {
  try { localStorage.setItem(KEY, JSON.stringify((msgs || []).slice(-60))); } catch {}
}
export function effaceHistorique() { try { localStorage.removeItem(KEY); } catch {} }

/* Prompt système : règles de maison + inventaire compact de la cave.
   Une ligne par bouteille en stock — ~25 ko pour 400 bouteilles, très en
   dessous des limites de contexte du modèle. */
export function promptSysteme(cave) {
  const y = new Date().getFullYear();
  const bs = (cave.db.bouteilles || []).filter(b => (b.quantite || 0) > 0);
  const lignes = bs.map(b => {
    const d = b.apoDebut ?? b.apoAuto?.debut;
    const f = b.apoFin ?? b.apoAuto?.fin;
    let apo = "";
    if (d) apo = (d <= y && (!f || f >= y)) ? "APOGÉE MAINTENANT" : "apogée " + d + (f ? "-" + f : "");
    return [b.nom, b.millesime, b.type === "Spiritueux" ? "Spiritueux" : b.categorie, b.region, "x" + (b.quantite || 0), apo]
      .filter(v => v !== "" && v != null).join(" · ");
  });
  const coeurs = (cave.db.coeurs || []).map(k => (k.split("|")[0] || "").trim()).filter(Boolean);
  const notes = (cave.db.bues || []).map(h => h.note).filter(n => n != null);
  const avg = notes.length ? (notes.reduce((s, n) => s + n, 0) / notes.length).toFixed(1) : null;

  return [
    "Tu es Hopla !, le sommelier domestique de l'application « Ma Cave », une cave familiale de Thomas (Alsace, France).",
    "RÈGLES DE MAISON :",
    "- Tu réponds toujours en français, sur un ton chaleureux, précis et concret, comme un caviste de quartier qui connaît son client.",
    "- INTERDICTION ABSOLUE d'utiliser des émojis ou des pictogrammes dans tes réponses.",
    "- Réponses courtes et utiles : quelques phrases, listes à puces en texte brut si besoin. Pas de langage marketing.",
    "- Quand une question porte sur la cave, appuie-toi STRICTEMENT sur l'inventaire ci-dessous. Si le vin n'y figure pas, dis-le.",
    "- Si on te demande une recette, donne une recette complète et réalisable (ingrédients puis étapes), adaptée à l'accord demandé.",
    "- Températures de service, carafage et fenêtres de garde : sois précis et prudent (mieux vaut boire un an trop tôt que dix ans trop tard).",
    "INVENTAIRE DE LA CAVE (une ligne par bouteille, format : nom · millésime · catégorie · région · quantité · apogée) :",
    lignes.join("\n"),
    coeurs.length ? "COUPS DE CŒUR (vins favoris) : " + coeurs.join(", ") : "",
    avg ? "Note moyenne donnée par Thomas sur ses dégustations : " + avg + " / 5." : "",
    "Aujourd'hui : " + y + "."
  ].filter(Boolean).join("\n");
}

/* Envoie la conversation (rôles user/assistant) et renvoie la réponse.
   cave.d1Fetch ajoute le jeton MA_CAVE_TOKEN attendu par le worker. */
export async function demandeHopla(cave, msgs) {
  const corps = {
    systeme: promptSysteme(cave),
    messages: msgs.map(m => ({ role: m.role === "moi" ? "user" : "assistant", content: m.texte })),
  };
  const r = await cave.d1Fetch("/api/hopla", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  let d = null;
  try { d = await r.json(); } catch {}
  if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || ("Hopla indisponible (" + r.status + ")"));
  return d.texte;
}
