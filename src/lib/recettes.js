/* Recettes sauvegardées depuis Hopla ! (v2.28) — localStorage, par ordre récent.
   Titre déduit de la première ligne utile du texte (pastilles « ** » strippées). */

const KEY = "ma-cave-recettes-v1";

export function recettes() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function sauve(liste) {
  try { localStorage.setItem(KEY, JSON.stringify(liste.slice(0, 100))); } catch {}
}
export function nbRecettes() { return recettes().length; }

export function ajouteRecette(texte, vin) {
  const t = String(texte || "").replace(/\*\*/g, "").trim();
  const titre = (t.split("\n").find(l => l.trim().length > 3) || "Recette").replace(/^\d+[.)]\s*/, "").trim().slice(0, 70);
  const liste = recettes();
  const item = { id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), titre, texte: t.slice(0, 8000), vin: vin || "", date: new Date().toISOString() };
  liste.unshift(item);
  sauve(liste);
  return item;
}
export function supprimeRecette(id) { sauve(recettes().filter(r => r.id !== id)); }
