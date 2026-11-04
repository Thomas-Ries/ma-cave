/* Profils & constantes partagées */
export const PROFILS = {
  thomas: { id: "thomas", nom: "Thomas" },
  marc: { id: "marc", nom: "Marc Joseph" },
};

export const FORMATS = ["Bouteille (75 cl)", "Magnum (1.5 L)", "Demi (37.5 cl)", "Jéroboam (3 L)", "Autre"];

export const CATS = ["Rouge", "Blanc", "Rosé", "Champagne", "Crémant", "Effervescent", "Moelleux", "Spiritueux"];

export const CAT_COLORS = { Rouge: "#7A2E3E", Blanc: "#A8842C", "Rosé": "#D98A96", "Champagne": "#C4A35A", "Crémant": "#8FBF9F", Effervescent: "#4A7856", Moelleux: "#C48B3F", Spiritueux: "#8A5A2B" };

/* Cépages les plus courants pour le formulaire (select + « Autre… » en saisie libre).
   L'option « Assemblage » indique un mix — le moteur bascule alors sur région/catégorie. */
export const CEPAGES = ["Riesling", "Gewurztraminer", "Pinot Gris", "Pinot Blanc", "Sylvaner", "Muscat", "Chardonnay", "Sauvignon", "Chenin", "Melon", "Pinot Noir", "Gamay", "Aligoté", "Pinot Meunier", "Merlot", "Cabernet Sauvignon", "Cabernet Franc", "Malbec", "Petit Verdot", "Syrah", "Grenache", "Mourvèdre", "Cinsault", "Viognier", "Roussanne", "Marsanne", "Tannat", "Fer Servadou", "Grolleau", "Nebbiolo", "Sangiovese"];

/* Spécificités de vinification qui changent radicalement la garde (VT, SGN, glace…). */
export const SPECIFICITES = ["Vendanges tardives", "Sélection de grains nobles", "Vin de glace", "Vin de paille", "Moelleux / Liquoreux"];

export function uid() { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
