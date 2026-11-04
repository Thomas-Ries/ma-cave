/* Profils & constantes partagées */
export const PROFILS = {
  thomas: { id: "thomas", nom: "Thomas" },
  marc: { id: "marc", nom: "Marc Joseph" },
};

export const FORMATS = ["Bouteille (75 cl)", "Magnum (1.5 L)", "Demi (37.5 cl)", "Jéroboam (3 L)", "Autre"];

export const CATS = ["Rouge", "Blanc", "Rosé", "Champagne", "Crémant", "Effervescent", "Moelleux", "Spiritueux"];

export const CAT_COLORS = { Rouge: "#7A2E3E", Blanc: "#A8842C", "Rosé": "#D98A96", "Champagne": "#C4A35A", "Crémant": "#8FBF9F", Effervescent: "#4A7856", Moelleux: "#C48B3F", Spiritueux: "#8A5A2B" };

export function uid() { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
