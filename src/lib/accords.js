/* Ma Cave — src/accords.js : accords mets & vins
 * 10 fiches plats + moteur qui cherche la meilleure bouteille DANS TA CAVE.
 * Pur et testable : aucune dépendance DOM. Utilisable côté navigateur et Node.
 */

/* ---------- Normalisation ---------- */

function normAcc(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'").replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ").trim();
}

/* ---------- Les plats (une dizaine de classiques + pièges à éviter) ---------- */

const PLATS = [
  {
    id: "huitres", nom: "Huîtres & fruits de mer",
    desc: "Iode, citron, huître n°2, crevettes, langoustines",
    categories: ["Blanc", "Champagne", "Crémant", "Effervescent"],
    cepages: ["chardonnay", "muscadet", "riesling", "sauvignon", "pinot blanc", "melon"],
    regions: ["loire", "chablis", "bourgogne", "champagne", "alsace"],
    mots: ["huitre", "oyster", "fruit de mer", "fruits de mer", "moule", "crevette", "langoustine", "crabe", "homard", "bulot", "plateau"],
    pourquoi: "la fraîcheur acide et le minerai d'un blanc sec, ou la bulle qui rince l'iode",
    eviter: ["Rouge"], eviterPourquoi: "les tanins cassent l'iode",
  },
  {
    id: "poisson", nom: "Poisson grillé ou en sauce légère",
    desc: "Bar, daurade, saint-pierre, sole meunière",
    categories: ["Blanc"],
    cepages: ["chardonnay", "sauvignon", "riesling", "aligote", "vermentino"],
    regions: ["bourgogne", "bordeaux", "loire", "alsace", "provence"],
    mots: ["poisson", "bar", "daurade", "sole", "cabillaud", "saumon", "turbot", "truite", "merlu"],
    pourquoi: "un blanc sec qui suit la finesse du poisson sans l'écraser",
    eviter: ["Rouge"], eviterPourquoi: "les tanins dominent la chair délicate",
  },
  {
    id: "volaille", nom: "Volaille rôtie",
    desc: "Poulet fermier, chapon, pintade aux morilles",
    categories: ["Blanc", "Rouge"],
    cepages: ["chardonnay", "pinot noir", "gamay"],
    regions: ["bourgogne", "beaujolais", "bordeaux", "jura"],
    mots: ["volaille", "poulet", "chapon", "pintade", "canard", "morille", "roti", "rôti"],
    pourquoi: "un blanc rond ou un rouge léger : terrain d'entente parfait",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre jure sur la peau croustillante",
  },
  {
    id: "boeuf", nom: "Bœuf grillé & steak",
    desc: "Entrecôte, côte de bœuf, burger maison",
    categories: ["Rouge"],
    cepages: ["cabernet sauvignon", "cabernet franc", "malbec", "syrah", "merlot", "tannat"],
    regions: ["bordeaux", "cahors", "madiran", "rhone", "argentine"],
    mots: ["boeuf", "bœuf", "steak", "entrecote", "cote de boeuf", "côte de bœuf", "burger", "filet", "onglet"],
    pourquoi: "la structure tannique qui tient le gras et le grillé",
    eviter: ["Blanc", "Moelleux"], eviterPourquoi: "trop fins pour le grillé",
  },
  {
    id: "gibier", nom: "Gibier & plats en sauce",
    desc: "Civet, daube, biche, sauce au vin, champignons",
    categories: ["Rouge"],
    cepages: ["nebbiolo", "syrah", "grenache", "mourvedre", "cabernet sauvignon", "pinot noir"],
    regions: ["piemont", "rhone", "bourgogne", "bordeaux", "languedoc"],
    mots: ["gibier", "civet", "daube", "sanglier", "chevreuil", "biche", "sauce", "ragout", "ragoût", "braise"],
    pourquoi: "un rouge de caractère qui s'invite dans la sauce",
    eviter: ["Blanc", "Rosé"], eviterPourquoi: "ils s'effacent devant la puissance du plat",
  },
  {
    id: "agneau", nom: "Agneau",
    desc: "Gigot, carré d'agneau, navarin, côtelettes",
    categories: ["Rouge"],
    cepages: ["cabernet sauvignon", "syrah", "grenache", "merlot"],
    regions: ["bordeaux", "rhone", "provence", "languedoc"],
    mots: ["agneau", "gigot", "navarin", "cotelette", "côtelette", "carrier"],
    pourquoi: "le classique bordeaux-rhône : la finesse du plat appelle du vin souple et épicé",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre écrase le goût de l'agneau",
  },
  {
    id: "tomate", nom: "Pâtes, pizza & tomate",
    desc: "Bolognaise, margherita, lasagnes, ratatouille",
    categories: ["Rouge", "Rosé"],
    cepages: ["sangiovese", "gamay", "grenache", "merlot", "syrah"],
    regions: ["italie", "beaujolais", "provence", "rhone", "languedoc"],
    mots: ["pate", "pâtes", "pates", "pizza", "tomate", "bolognaise", "lasagne", "spaghetti", "ratatouille", "risotto"],
    pourquoi: "l'acidité de la tomate adore un rouge friand et peu tannique",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre contre l'acidité, ça frotte",
  },
  {
    id: "charcuterie", nom: "Charcuterie & apéro",
    desc: "Jambon, saucisson, terrine, tapas, quiche",
    categories: ["Rosé", "Rouge", "Champagne", "Crémant", "Effervescent"],
    cepages: ["gamay", "grenache", "cinsault", "syrah"],
    regions: ["beaujolais", "rhone", "provence", "languedoc", "loire"],
    mots: ["charcuterie", "jambon", "saucisson", "terrine", "tapas", "apero", "apéro", "quiche", "rillette", "pate", "pâté"],
    pourquoi: "un rosé friand ou un rouge léger, désaltérants sur le sel",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre contre le salé, rarement bon",
  },
  {
    id: "fromages", nom: "Fromages",
    desc: "Plateau : chèvre, brebis, comté, bleu",
    categories: ["Blanc", "Rouge", "Moelleux"],
    cepages: ["sauvignon", "chenin", "chardonnay", "gewurztraminer"],
    regions: ["loire", "jura", "alsace", "bourgogne", "sud-ouest"],
    mots: ["fromage", "chevre", "chèvre", "brebis", "comte", "comté", "bleu", "roquefort", "camembert", "brie", "plateau", "raclette", "tartiflette"],
    pourquoi: "le fromage préfère souvent les blancs : un chèvre et un sauvignon, un bleu et un moelleux",
    eviter: [], eviterPourquoi: "",
  },
  {
    id: "desserts", nom: "Desserts",
    desc: "Tarte, chocolat, dessert au fruit, brioche",
    categories: ["Moelleux", "Champagne", "Crémant", "Effervescent"],
    cepages: ["gewurztraminer", "chenin", "riesling", "semillon", "muscat"],
    regions: ["alsace", "loire", "bordeaux", "sud-ouest", "languedoc"],
    mots: ["dessert", "chocolat", "tarte", "brioche", "fruit", "cake", "crepe", "crêpe", "gateau", "gâteau"],
    pourquoi: "le sucre du vin doit couvrir celui du dessert : moelleux ou VT",
    eviter: ["Rouge"], eviterPourquoi: "un rouge sec semble amer sur le sucré",
  },
];

/* ---------- Spécialités régionales & cuisine du monde ---------- */
const PLATS_MONDE = [
  {
    id: "choucroute", nom: "Choucroute",
    desc: "Choucroute garnie, saucisses, lard, Alsace",
    categories: ["Blanc", "Rouge"],
    cepages: ["riesling", "sylvaner", "pinot blanc", "pinot gris", "gewurztraminer"],
    regions: ["alsace"],
    mots: ["choucroute", "saucisse", "lard", "kassler", "knack", "strasbourg"],
    pourquoi: "le mariage alsacien : le Riesling sec tranche avec le gras de la charcuterie",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre ne supporte pas le salé fumé",
  },
  {
    id: "flammekueche", nom: "Tarte flambée",
    desc: "Flammekueche, crème, oignons, lardons, tartes flambées",
    categories: ["Blanc"],
    cepages: ["riesling", "sylvaner", "pinot blanc", "pinot gris", "gewurztraminer"],
    regions: ["alsace"],
    mots: ["flammekueche", "flammekuech", "tarte flambee", "tartes flambees", "flammiche", "flamm"],
    pourquoi: "la crème et l'oignon veulent un blanc sec d'Alsace, tendu et net",
    eviter: ["Rouge"], eviterPourquoi: "les tanins se battent avec la crème",
  },
  {
    id: "magret", nom: "Canard & magret",
    desc: "Magret, confit, canard à l'orange, aiguillettes",
    categories: ["Rouge"],
    cepages: ["merlot", "cabernet sauvignon", "cabernet franc", "malbec", "pinot noir", "syrah"],
    regions: ["bordeaux", "sud-ouest", "cahors", "bourgogne", "rhone"],
    mots: ["magret", "canard", "confit", "aiguillette", "canard a l'orange", "graisse"],
    pourquoi: "le canard du Sud-Ouest appelle un rouge structuré du même terroir",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre écrase la graisse du canard (sauf à l'orange)",
  },
  {
    id: "coq-au-vin", nom: "Coq au vin & mijotés",
    desc: "Coq au vin, bœuf bourguignon, carbonnade, pot-au-feu",
    categories: ["Rouge"],
    cepages: ["pinot noir", "gamay", "merlot", "cabernet franc"],
    regions: ["bourgogne", "beaujolais", "bordeaux", "loire", "rhone"],
    mots: ["coq au vin", "coq", "bourguignon", "carbonnade", "pot au feu", "pot-au-feu", "mijote", "estouffade"],
    pourquoi: "le plat mijoté au vin veut le même vin en accompagnement",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre casse la sauce salée",
  },
  {
    id: "cassoulet", nom: "Cassoulet & Southwest",
    desc: "Cassoulet, confits, garbure, saucisse de Toulouse",
    categories: ["Rouge"],
    cepages: ["malbec", "tannat", "grenache", "syrah", "merlot", "cabernet franc"],
    regions: ["cahors", "madiran", "sud-ouest", "languedoc", "rhone"],
    mots: ["cassoulet", "toulouse", "garbure", "sud ouest", "sud-ouest"],
    pourquoi: "Cahors ou Madiran : la puissance rustique du Sud-Ouest pour le plat du même terroir",
    eviter: ["Blanc"], eviterPourquoi: "trop fin pour la puissance du gratin",
  },
  {
    id: "asiatique", nom: "Asiatique",
    desc: "Sushis, nems, wok, thaï, poke, printemps",
    categories: ["Blanc", "Champagne", "Crémant", "Effervescent", "Rosé"],
    cepages: ["riesling", "gewurztraminer", "pinot gris", "chenin", "gruener veltliner", "silvaner", "sylvaner"],
    regions: ["alsace", "loire", "autriche", "bourgogne", "champagne"],
    mots: ["asiatique", "sushi", "sushis", "nem", "wok", "thai", "printemps", "satay", "banh", "bao"],
    pourquoi: "le Riesling et l'aromatique alsacien sont faits pour la cuisine asiatique",
    eviter: ["Rouge"], eviterPourquoi: "les tanins accrochent avec le soja et les épices",
  },
  {
    id: "epices", nom: "Curry & épices",
    desc: "Curry, indien, tajine, épicé, merguez",
    categories: ["Blanc", "Rouge", "Rosé"],
    cepages: ["gewurztraminer", "riesling", "pinot gris", "grenache", "syrah", "mourvedre"],
    regions: ["alsace", "rhone", "languedoc", "provence", "sud-ouest"],
    mots: ["curry", "epice", "epices", "indien", "masala", "tajine", "tajine", "merguez", "couscous", "chorizo", "piment", "sichuan"],
    pourquoi: "l'aromatique puissant (Gewurztraminer) ou un rouge épicé du Rhône : les épices appellent du parfum",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre sur les épices chaudes, rarement heureux",
  },
];
PLATS.push(...PLATS_MONDE);

/* ---------- Familles (v35 : organisation de l'onglet Accords) ---------- */

const FAMILLES = ["Apéro & tapas", "Fruits de mer & poissons", "Viandes & volailles", "Fromages", "Desserts", "Cuisine du monde & régions", "Fêtes"];

const FAMILLES_MAP = {
  huitres: "Fruits de mer & poissons", poisson: "Fruits de mer & poissons",
  volaille: "Viandes & volailles", boeuf: "Viandes & volailles", gibier: "Viandes & volailles", agneau: "Viandes & volailles",
  magret: "Viandes & volailles", "coq-au-vin": "Viandes & volailles", cassoulet: "Viandes & volailles",
  tomate: "Cuisine du monde & régions", choucroute: "Cuisine du monde & régions", flammekueche: "Cuisine du monde & régions",
  asiatique: "Cuisine du monde & régions", epices: "Cuisine du monde & régions",
  charcuterie: "Apéro & tapas", fromages: "Fromages", desserts: "Desserts",
};

/* ---------- Nouveaux plats (v35) ---------- */

const PLATS_PLUS = [
  {
    id: "tapas", nom: "Tapas & amuse-bouche", famille: "Apéro & tapas",
    desc: "Olives, gougères, verrines, petites bouchées salées",
    categories: ["Rosé", "Rouge", "Champagne", "Crémant", "Effervescent"],
    cepages: ["gamay", "grenache", "cinsault", "syrah"],
    regions: ["provence", "rhone", "languedoc", "espagne"],
    mots: ["tapas", "amuse", "amuse bouche", "olive", "verrine", "gougere", "gougère", "bruschetta", "canape", "canapé", "petit four sale"],
    pourquoi: "des bouchées salées et variées : un rosé friand ou une bulle, tout passe avec tout",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre n'a rien à faire dans l'apéro salé",
  },
  {
    id: "melon", nom: "Melon & apéro d'été", famille: "Apéro & tapas",
    desc: "Melon, jambon de Bayonne, pastèque, piquenique",
    categories: ["Rosé", "Blanc"],
    cepages: ["grenache", "cinsault", "mourvedre", "sauvignon"],
    regions: ["provence", "rhone", "languedoc", "loire"],
    mots: ["melon", "pastèque", "pique nique", "pique-nique", "ete", "été"],
    pourquoi: "le melon appelle un rosé sec et fruité — jamais sucré",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre sur le sucre du melon, trop",
  },
  {
    id: "homard", nom: "Homard, langoustines & saint-jacques", famille: "Fruits de mer & poissons",
    desc: "Homard breton, noix de saint-jacques, langoustines rôties",
    categories: ["Blanc", "Champagne"],
    cepages: ["chardonnay", "chenin", "pinot blanc", "riesling"],
    regions: ["bourgogne", "champagne", "loire", "alsace"],
    mots: ["homard", "langoustine", "saint jacques", "saint-jacques", "coquille", "scallop", "noix de saint", "bulot cuit"],
    pourquoi: "une chair noble et légèrement sucrée : un grand blanc tendu ou une bulle fine",
    eviter: ["Rouge"], eviterPourquoi: "les tanins dominent la délicatesse de la chair",
  },
  {
    id: "saumon-fume", nom: "Saumon fumé & tarama", famille: "Fruits de mer & poissons",
    desc: "Saumon fumé, tarama, toast de fêtes, gravlax",
    categories: ["Blanc", "Champagne", "Crémant", "Effervescent"],
    cepages: ["chardonnay", "sauvignon", "riesling", "pinot blanc"],
    regions: ["bourgogne", "champagne", "loire", "alsace"],
    mots: ["saumon fume", "saumon fumé", "tarama", "gravlax", "gravelax", "blinis", "hareng"],
    pourquoi: "le gras fumé se coupe par un blanc vif ou par la bulle",
    eviter: ["Rouge"], eviterPourquoi: "le tanin accroche sur le fumé gras",
  },
  {
    id: "sardines", nom: "Sardines grillées & anchois", famille: "Fruits de mer & poissons",
    desc: "Sardines, anchois, maquereau, espadon",
    categories: ["Rosé", "Blanc"],
    cepages: ["muscat", "sauvignon", "vermentino", "picpoul", "chenin"],
    regions: ["provence", "languedoc", "loire", "sud-ouest"],
    mots: ["sardine", "anchois", "anchoitade", "maquereau", "espadon", "poutargue"],
    pourquoi: "le poisson gras et iodé adore un blanc vif et salin, ou un rosé de soif",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre sur l'iode, très moyen",
  },
  {
    id: "porc", nom: "Rôti de porc & filet mignon", famille: "Viandes & volailles",
    desc: "Filet mignon, rôti, côtelette, escalope",
    categories: ["Blanc", "Rouge"],
    cepages: ["chardonnay", "gamay", "pinot noir", "merlot", "chenin"],
    regions: ["bourgogne", "beaujolais", "loire", "bordeaux"],
    mots: ["porc", "filet mignon", "roti de porc", "rôti de porc", "cotelette de porc", "escallope"],
    pourquoi: "une chair douce : blanc rond ou rouge léger, sans extraire de tanins",
    eviter: ["Spiritueux"], eviterPourquoi: "trop puissant pour la finesse du porc",
  },
  {
    id: "potee", nom: "Pot-au-feu & potée", famille: "Viandes & volailles",
    desc: "Pot-au-feu, potée, bouilli, légumes au bouillon",
    categories: ["Rouge", "Blanc"],
    cepages: ["pinot noir", "gamay", "chardonnay", "sylvaner"],
    regions: ["bourgogne", "alsace", "beaujolais", "loire"],
    mots: ["pot au feu", "pot-au-feu", "potee", "potée", "bouillon", "bouilli"],
    pourquoi: "le bouillon et la viande fondante : un rouge tendre ou même un blanc sec",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre casse le confort du bouillon",
  },
  {
    id: "veau", nom: "Escalope de veau & ris de veau", famille: "Viandes & volailles",
    desc: "Escalope, blanquette, ris de veau, côte de veau",
    categories: ["Blanc", "Rouge"],
    cepages: ["chardonnay", "sauvignon", "pinot noir", "riesling"],
    regions: ["bourgogne", "loire", "alsace", "bordeaux"],
    mots: ["escalope", "ris de veau", "cote de veau", "côte de veau", "blanquette", "veal"],
    pourquoi: "le veau est le meilleur ami des blancs — sauce à la crème oblige",
    eviter: ["Spiritueux"], eviterPourquoi: "trop corsé pour la chair délicate",
  },
  {
    id: "chevre", nom: "Chèvre frais & de surface", famille: "Fromages",
    desc: "Crottin, Sainte-Maure, Valençay, bûche",
    categories: ["Blanc"],
    cepages: ["sauvignon", "chenin", "muscat"],
    regions: ["loire", "provence"],
    mots: ["chevre frais", "crottin", "sainte maure", "valencay", "selles sur cher", "buche de chevre"],
    pourquoi: "l'acidité du chèvre rencontre celle du Sancerre ou du Pouilly — l'accord lodézien",
    eviter: ["Rouge"], eviterPourquoi: "les tanins deviennent amers sur le chèvre acide",
  },
  {
    id: "comte", nom: "Comté & pâtes pressées cuites", famille: "Fromages",
    desc: "Comté, Beaufort, Abondance, Gruyère",
    categories: ["Blanc", "Rouge"],
    cepages: ["chardonnay", "pinot noir", "gamay", "nebbiolo"],
    regions: ["jura", "bourgogne", "savoie", "piemont"],
    mots: ["comte", "comté", "beaufort", "abondance", "emmental", "gruyere", "gruyère"],
    pourquoi: "le noisetier du comté aime les blancs du Jura (et son vin de jaune)",
    eviter: [],
  },
  {
    id: "bleus", nom: "Roquefort & fromages bleus", famille: "Fromages",
    desc: "Roquefort, Fourme, gorgonzola, Stilton",
    categories: ["Moelleux", "Blanc"],
    cepages: ["semillon", "sauvignon", "chenin", "muscat", "grenache"],
    regions: ["bordeaux", "sud-ouest", "languedoc", "roussillon", "loire"],
    mots: ["roquefort", "fourme", "gorgonzola", "stilton", "bleu d'auvergne", "fromage bleu"],
    pourquoi: "le sel du bleu se marie au sucre d'un Sauternes : le classique des classiques",
    eviter: ["Rouge"], eviterPourquoi: "tanins + sel + bleu = confusion",
  },
  {
    id: "brie", nom: "Brie, coulommiers & camembert", famille: "Fromages",
    desc: "Brie de Meaux, coulommiers, camembert affiné",
    categories: ["Champagne", "Rouge", "Crémant"],
    cepages: ["pinot noir", "chardonnay", "gamay"],
    regions: ["champagne", "bourgogne", "beaujolais"],
    mots: ["brie", "coulommiers", "camembert", "brillat"],
    pourquoi: "pâte molle et crème : champagne (toujours) ou un pinot léger",
    eviter: [],
  },
  {
    id: "munster", nom: "Munster & croûtes lavées", famille: "Fromages",
    desc: "Munster, Époisses, Livarot, Maroilles",
    categories: ["Blanc"],
    cepages: ["riesling", "gewurztraminer", "pinot gris", "sylvaner"],
    regions: ["alsace", "autriche", "bourgogne"],
    mots: ["munster", "livarot", "epoisses", "époisses", "maroilles", "pont l'eveque", "vacherin"],
    pourquoi: "croûte lavée = puissance : un blanc aromatique et ferme qui lave le palais",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre fait ressortir l'ammoniaque du fromage",
  },
  {
    id: "brebis", nom: "Brebis & fromages du Sud-Ouest", famille: "Fromages",
    desc: "Ossau-Iraty, tomme de brebis, Etorki",
    categories: ["Rouge"],
    cepages: ["tannat", "malbec", "cabernet sauvignon", "cabernet franc"],
    regions: ["sud-ouest", "cahors", "madiran", "pays basque"],
    mots: ["brebis", "ossau", "ossau iraty", "iraty", "tomme de brebis", "etorki"],
    pourquoi: "l'Ossau-Iraty appelle un Madiran ou un rouge du terroir basque",
    eviter: [],
  },
  {
    id: "chocolat", nom: "Chocolat noir & desserts au chocolat", famille: "Desserts",
    desc: "Fondant, mousse, brownie, ganache",
    categories: ["Moelleux"],
    cepages: ["grenache", "mourvedre", "syrah"],
    regions: ["roussillon", "languedoc", "rhone", "douro"],
    mots: ["chocolat", "fondant", "mousse au chocolat", "brownie", "ganache", "cacao", "truffe"],
    pourquoi: "le cacao appelle un vin doux naturel (Banyuls, Maury) : puissance contre puissance",
    eviter: ["Blanc"], eviterPourquoi: "un blanc sec devient acide sur le cacao",
  },
  {
    id: "tarte-fruit", nom: "Tarte aux fruits & clafoutis", famille: "Desserts",
    desc: "Tarte aux pommes, clafoutis, crumble, far breton",
    categories: ["Moelleux", "Blanc"],
    cepages: ["chenin", "riesling", "gewurztraminer", "muscat"],
    regions: ["loire", "alsace", "bordeaux", "languedoc"],
    mots: ["clafoutis", "tarte aux fruits", "tarte aux pommes", "crumble", "compote", "far breton"],
    pourquoi: "fruit cuit = sucre discret : un moelleux tendre, type Vouvray",
    eviter: ["Rouge"],
  },
  {
    id: "fraises", nom: "Fraises & fruits rouges", famille: "Desserts",
    desc: "Fraises, framboises, charlotte, fraisier",
    categories: ["Champagne", "Moelleux", "Blanc"],
    cepages: ["chardonnay", "chenin", "gewurztraminer", "pinot noir"],
    regions: ["champagne", "loire", "alsace", "bourgogne"],
    mots: ["fraise", "framboise", "fruits rouges", "charlotte", "fraisier"],
    pourquoi: "le fruit frais adore le champagne rosé ou un moelleux léger et vif",
    eviter: [],
  },
  {
    id: "foie-gras", nom: "Foie gras & toasts de fête", famille: "Fêtes",
    desc: "Foie gras mi-cuit, toasts, terrine de foie",
    categories: ["Moelleux", "Champagne", "Blanc"],
    cepages: ["semillon", "chenin", "gewurztraminer", "riesling"],
    regions: ["bordeaux", "alsace", "loire", "champagne", "languedoc"],
    mots: ["foie gras", "foie", "terrine de foie", "toast de foie", "canard gras"],
    pourquoi: "Sauternes sur foie gras : l'accord des grandes occasions — ou un champagne",
    eviter: ["Rouge"], eviterPourquoi: "les tanins durcissent le gras du foie",
  },
  {
    id: "raclette", nom: "Raclette, fondue & tartiflette", famille: "Fêtes",
    desc: "Raclette, fondue savoyarde, tartiflette, reblochon",
    categories: ["Blanc", "Rouge"],
    cepages: ["chenin", "chardonnay", "gamay", "pinot noir", "aligote"],
    regions: ["savoie", "jura", "bourgogne", "beaujolais", "alsace"],
    mots: ["raclette", "fondue", "tartiflette", "reblochon", "crozet", "morbier"],
    pourquoi: "fromage fondu : un blanc sec vif ou un rouge léger — jamais de gros tanins",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre sur le fromage fondu, tout faux",
  },
  {
    id: "buche", nom: "Bûche & desserts de fête", famille: "Fêtes",
    desc: "Bûche de Noël, réveillon, desserts festifs",
    categories: ["Champagne", "Moelleux", "Crémant", "Effervescent"],
    cepages: ["chardonnay", "chenin", "muscat", "semillon"],
    regions: ["champagne", "bordeaux", "loire", "languedoc"],
    mots: ["buche", "bûche", "reveillon", "réveillon", "noel", "noël", "sylvestre"],
    pourquoi: "fin de repas en légèreté : champagne ou un moelleux discret",
    eviter: ["Rouge"],
  },
  {
    id: "ramen", nom: "Ramen & nouilles asiatiques", famille: "Cuisine du monde & régions",
    desc: "Ramen, pho, udon, bibimbap, gyoza",
    categories: ["Blanc", "Rosé"],
    cepages: ["riesling", "gewurztraminer", "pinot gris", "grenache"],
    regions: ["alsace", "rhone", "autriche", "languedoc"],
    mots: ["ramen", "pho", "nouille", "udon", "bibimbap", "coreen", "coréen", "gyoza", "goyza", "yakitori"],
    pourquoi: "bouillon riche et soja : un blanc aromatique bien sec, le Riesling en tête",
    eviter: ["Rouge"], eviterPourquoi: "les tanins accrochent sur le soja et le bouillon",
  },
  {
    id: "poke", nom: "Poke bowl & ceviche", famille: "Cuisine du monde & régions",
    desc: "Poke, ceviche, tartare de poisson, poissons marinés",
    categories: ["Blanc", "Rosé", "Effervescent", "Champagne"],
    cepages: ["sauvignon", "chenin", "riesling", "vermentino"],
    regions: ["loire", "alsace", "provence", "bourgogne"],
    mots: ["poke", "ceviche", "tartare de poisson", "poisson cru", "mariné"],
    pourquoi: "poisson cru mariné : un blanc vif et net, presque salin",
    eviter: ["Rouge"], eviterPourquoi: "le rouge ferre sur le poisson cru",
  },
  {
    id: "tacos", nom: "Tacos, burritos & mexicain", famille: "Cuisine du monde & régions",
    desc: "Tacos, burritos, fajitas, nachos, guacamole",
    categories: ["Rouge", "Rosé"],
    cepages: ["grenache", "syrah", "malbec", "mourvedre", "tempranillo"],
    regions: ["rhone", "languedoc", "sud-ouest", "argentine"],
    mots: ["taco", "burrito", "mexicain", "fajitas", "guacamole", "quesadilla", "nachos"],
    pourquoi: "haricots, épices et viande : un rouge gouleyant ou un rosé de soif",
    eviter: ["Moelleux"], eviterPourquoi: "le sucre ne comprend pas le piment",
  },
  {
    id: "paella", nom: "Paella & riz safrané", famille: "Cuisine du monde & régions",
    desc: "Paella, fideuà, arroz, riz safrané",
    categories: ["Blanc", "Rosé"],
    cepages: ["vermentino", "grenache", "macabeo", "sauvignon"],
    regions: ["provence", "languedoc", "rhone", "espagne"],
    mots: ["paella", "safran", "fideua", "fideuà", "arroz"],
    pourquoi: "le safran aime les blancs du Sud, secs et épicés",
    eviter: ["Rouge"], eviterPourquoi: "le tanin durcit le riz safrané",
  },
];
PLATS.push(...PLATS_PLUS);

/* famille sur tous les plats (anciens via la map, nouveaux déjà renseignés) */
for (const p of PLATS) {
  if (!p.famille) p.famille = FAMILLES_MAP[p.id] || "Cuisine du monde & régions";
}

/* ---------- Occasions (« Que boire ce soir ? ») ---------- */

const OCCASIONS = [
  { id: "soir", nom: "Ce soir", desc: "Le repas du soir, sans chichi", plats: ["poisson", "volaille", "boeuf", "tomate", "veau"] },
  { id: "apero", nom: "Apéro", desc: "Entre amis, avant l'heure", plats: ["charcuterie", "tapas", "melon", "chevre", "brie"] },
  { id: "fete", nom: "Fêtes", desc: "Réveillon et grandes tablées", plats: ["foie-gras", "huitres", "volaille", "saumon-fume", "buche"] },
  { id: "pique-nique", nom: "Pique-nique", desc: "Dehors, simple et bon", plats: ["charcuterie", "tapas", "tomate", "sardines", "fraises"] },
  { id: "hiver", nom: "Soirée d'hiver", desc: "Plats qui réchauffent", plats: ["raclette", "cassoulet", "coq-au-vin", "potee", "choucroute"] },
  { id: "amoureux", nom: "Dîner en amoureux", desc: "Carte blanche au plaisir", plats: ["homard", "poisson", "chocolat", "fraises", "volaille"] },
];

/* Les meilleures bouteilles de TA cave pour une occasion : union des accords de ses plats */
function bouteillesPourOccasion(occId, bouteilles, year) {
  const occ = OCCASIONS.find(o => o.id === occId) || OCCASIONS[0];
  const best = new Map();
  for (const pid of occ.plats) {
    const plat = PLATS.find(p => p.id === pid);
    if (!plat) continue;
    for (const r of accordsPour(plat, bouteilles, year)) {
      const cur = best.get(r.b.id);
      if (!cur || r.score > cur.score) best.set(r.b.id, { b: r.b, score: r.score, plat, pourquoi: r.pourquoi, evite: r.evite });
    }
  }
  return [...best.values()].sort((a, z) => z.score - a.score);
  /* NB : plus de slice(0,3) — les vues affichent ce qu'elles veulent ; le compte réel est la vérité */
}



/* Map mot → plat pour la recherche libre (termes hors fiches) */
const MOTS_LIBRES = {
  "moules": "huitres", "paella": "huitres", "ris de veau": "volaille", "bouillabaisse": "poisson",
  "omelette": "charcuterie", "salade": "charcuterie", "soupe": "poisson", "potage": "poisson",
  "porc": "charcuterie", "cochon": "charcuterie", "roti": "volaille", "legumes": "volaille",
  "oeuf": "charcuterie", "champignon": "gibier", "chili": "boeuf", "veau": "veau",
  "italien": "tomate", "risotto": "tomate", "frites": "charcuterie", "hamburger": "boeuf",
};

/* Recherche : renvoie le plat le plus proche d'une saisie libre (ou null) */
function trouvePlat(q) {
  const n = " " + normAcc(q) + " ";
  let best = null, bestScore = 0;
  for (const p of PLATS) {
    let s = 0;
    for (const mot of p.mots) if (n.includes(mot)) s = Math.max(s, mot.length + 2);
    if (n.includes(normAcc(p.nom).slice(0, 6))) s += 4;
    if (s > bestScore) { bestScore = s; best = p; }
  }
  if (best) return best;
  for (const [mot, platId] of Object.entries(MOTS_LIBRES)) {
    if (n.includes(mot)) return PLATS.find(p => p.id === platId);
  }
  return null;
}

/* Raison d'une catégorie pour un plat */
const RAISONS = {
  Blanc: "sa fraîcheur et son acidité",
  Effervescent: "sa bulle qui rince et rafraîchit",
  Champagne: "sa bulle fine et son prestige",
  Crémant: "sa bulle généreuse et son fruit",
  Rouge: "sa structure qui tient le plat",
  "Rosé": "sa souplesse fruitée",
  Moelleux: "son sucre bien dosé",
  Spiritueux: "en apéritif ou en digestif",
};

/* ---------- Le moteur : classe les bouteilles de TA cave pour un plat ---------- */

/* Catégorie effective pour les accords : une spécificité sucrée (VT, SGN,
   vin de glace, paille, moelleux) fait matcher la bouteille comme un moelleux,
   même si sa catégorie est désormais « Blanc » (v36). */
function catVin(b) {
  if (b.type === "Spiritueux") return "Spiritueux";
  const s = normAcc(b.specificite || "");
  if (s && /vendanges|grains|glace|paille|moelleux|liquoreux/.test(s)) return "Moelleux";
  return b.categorie;
}

function accordsPour(plat, bouteilles, year) {
  const y = year || new Date().getFullYear();
  const out = [];
  for (const b of bouteilles) {
    if (!b || !(b.quantite > 0)) continue;
    const cat = catVin(b);
    const cep = normAcc(b.cepage);
    const reg = normAcc(b.region);
    let score = 0;
    const pourquoi = [];

    if (plat.categories.includes(cat)) {
      score += 40;
      pourquoi.push(RAISONS[cat] || "son profil");
    }
    if (plat.cepages.some(c => cep.includes(normAcc(c)))) {
      score += 25;
      pourquoi.push(`cépage ${b.cepage}, fait pour ça`);
    }
    if (plat.regions.some(r => reg.includes(normAcc(r)))) {
      score += 12;
    }
    /* bonus dégustation optimale */
    const d = b.apoDebut ?? b.apoAuto?.debut;
    const f = b.apoFin ?? b.apoAuto?.fin;
    if (d != null && cat !== "Spiritueux") {
      if (y >= d && y <= (f ?? d)) { score += 15; pourquoi.push("et il est pile dans sa fenêtre d'apogée"); }
      else if (y > (f ?? d)) { score -= 12; }
    }
    if (b.note != null && b.note >= 90) { score += 10; pourquoi.push(`tu lui as mis ${b.note}/100`); }

    const evite = (plat.eviter || []).includes(cat);
    if (evite) score -= 45;

    if (score > 0) out.push({ b, score, pourquoi, evite });
  }
  out.sort((a, z) => z.score - a.score);
  return out; /* tous les accords positifs, triés ; les vues affichent ce qu'elles veulent */
}

/* ---------- Moteur inverse : quels plats vont avec CETTE bouteille ? ---------- */

/* Renvoie les plats classés pour une bouteille donnée : [{ plat, score, pourquoi, evite }] */
function platsPourBouteille(b, year) {
  const y = year || new Date().getFullYear();
  if (!b) return [];
  const cat = catVin(b);
  const cep = normAcc(b.cepage);
  const reg = normAcc(b.region);
  const out = [];
  for (const p of PLATS) {
    let score = 0;
    const pourquoi = [];
    if (p.categories.includes(cat)) { score += 50; pourquoi.push(RAISONS[cat] || "son profil"); }
    if (p.cepages.some(c => cep.includes(normAcc(c)))) { score += 30; pourquoi.push("le cépage " + b.cepage + " y est chez lui"); }
    if (p.regions.some(r => reg.includes(normAcc(r)))) { score += 10; pourquoi.push("accord régional"); }
    const d = b.apoDebut ?? b.apoAuto?.debut;
    const f = b.apoFin ?? b.apoAuto?.fin;
    if (d != null && cat !== "Spiritueux") {
      if (y >= d && y <= (f ?? d)) { score += 10; pourquoi.push("et l'apogée est pile maintenant"); }
      else if (y > (f ?? d)) { score -= 8; }
    }
    if (b.note != null && b.note >= 90) score += 5;
    const evite = (p.eviter || []).includes(cat);
    if (evite) score -= 60;
    if (score > 0) out.push({ plat: p, score, pourquoi, evite: false });
  }
  out.sort((a, z) => z.score - a.score);
  return out.slice(0, 5);
}

/* Export Node pour les tests ; dans le navigateur, les fonctions sont globales */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { PLATS, FAMILLES, OCCASIONS, trouvePlat, accordsPour, platsPourBouteille, bouteillesPourOccasion, normAcc };
}
export { PLATS, PLATS_MONDE, PLATS_PLUS, FAMILLES, OCCASIONS, accordsPour, bouteillesPourOccasion, trouvePlat, platsPourBouteille, RAISONS, FAMILLES_MAP };
