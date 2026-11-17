<script setup>
/* Cave : liste, recherche, filtres, mode dense avec en-têtes collants par région */
import { ref, computed, watch, inject, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useCave } from "../stores/cave.js";
import { estimeApogee } from "../lib/apogee.js";
import { exportLivreCave } from "../lib/livre.js";
import { uid, CEPAGES, SPECIFICITES, SPIRIT_MENTIONS } from "../config.js";
import { photoFromFile, splitNom, cepageCourt, regionTxt } from "../util.js";
import { speechSupporte, creerDictee, parseDictee } from "../lib/dictee.js";
import Ic from "../components/Ic.vue";
import { chargePhotoRegion, regionSlug, REGIONS } from "../lib/regions.js";
import FiltresSheet from "../components/FiltresSheet.vue";
import ListesSheet from "../components/ListesSheet.vue";
import ImportPreview from "../components/ImportPreview.vue";

const cave = useCave();
const router = useRouter();
const year = new Date().getFullYear();

const openFiche = inject("openFiche");

/* Préférences du soir (bandeau apogée) : même source que Ce soir, rafraîchie
   quand les préférences changent (soirVersion). Le bandeau les référence —
   sans cette définition, le rendu de la vue plantait dès qu'une bouteille
   était en apogée (prefsSoir undefined → TypeError, vue figée). */
const prefsSoir = computed(() => {
  void cave.soirVersion;
  return cave.soirPrefs();
});
/* Cloche : notifications d'apogée (déménagée de l'ex-onglet Apogées) */
async function toggleCloche() {
  if (!cave.apoAlerte && typeof Notification !== "undefined" && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch {}
  }
  cave.apoAlerte = !cave.apoAlerte;
  cave.toast(cave.apoAlerte ? "Notifications d'apogée activées" : "Notifications d'apogée coupées");
}
/* Ligne d'état + badge Filtres : résumé lisible du tri et des filtres actifs */
const TRI_LIB = { "": "défaut", recent: "récentes", apogee: "apogée ↑", nom: "nom", millesime: "Millésime ↓", millesime_asc: "Millésime ↑", prix: "prix ↓", format: "format", region: "région" };
const triLibelle = computed(() => TRI_LIB[cave.db.filters.tri || ""] || "défaut");
const filtresParts = computed(() => {
  const f = cave.db.filters; const parts = [];
  if (f.apogee) parts.push({ boire: "à boire", bientot: "bientôt", passe: "passées" }[f.apogee] || f.apogee);
  if (cave.apogeeFiltre) parts.push("à boire cette année");
  if (f.cat && f.cat !== "Toutes") parts.push(f.cat);
  if (f.cave && f.cave !== "Toutes") parts.push(f.cave);
  if (f.region && f.region !== "Toutes") parts.push(f.region);
  if (f.q) parts.push("« " + f.q + " »");
  return parts;
});
const filtresLibelle = computed(() => filtresParts.value.join(" · "));
const search = ref((cave.db.filters && cave.db.filters.q) || ""); /* repart du filtre actif : jamais bloqué sur une recherche invisible */
watch(() => cave.db.filters && cave.db.filters.q, v => { if ((v || "") !== search.value) search.value = v || ""; });
const showAdd = ref(false);
const showFiltres = ref(false);
const showListes = ref(false);
const importRows = ref(null);
const showFichiers = ref(false);
watch(showFichiers, v => cave.overlay("fichiers", v));
const fileInput = ref(null);
const jsonInput = ref(null);
const addMore = ref(false);
const addOk = ref(false);
const saving = ref(false);
const n = ref({});
const newCave = ref(false);
const caveSel = ref("");
watch(caveSel, v => {
  if (v === "__nouvelle__") { newCave.value = true; n.value.cave = ""; }
  else n.value.cave = v;
});

/* Verrouillage du scroll de fond tant qu'une modale/feuille est ouverte */
/* Installation PWA (Android/Chrome ; iOS : Ajouter à l'écran d'accueil via Partager) */
const canInstall = ref(false);
let deferredPrompt = null;
onMounted(() => window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; canInstall.value = true; }));

function installer() { if (!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt = null; canInstall.value = false; }

watch(showAdd, v => cave.overlay("add", v));
/* L'onglet Ce soir demande l'ouverture du formulaire d'ajout (rachat « Autre… » ou bouton +) */
watch(() => cave.ouvrirAjout, v => { if (v) { cave.ouvrirAjout = false; showAdd.value = true; } });
onMounted(() => { if (cave.ouvrirAjout) { cave.ouvrirAjout = false; showAdd.value = true; } });
watch(showFiltres, v => cave.overlay("filtres", v));
watch(showListes, v => cave.overlay("listes", v));
watch(importRows, v => cave.overlay("import", !!v));

function blankAdd() {
  return { nom: "", categorie: cave.db.filters.etage === "Spiritueux" ? "Spiritueux" : "Rouge", quantite: 1, millesime: null, prix: null, appellation: "", cepage: "", specificite: "", region: "", pays: "France", cave: "", cuvee: "", format: "Bouteille (75 cl)", statut: "En cave", commentaire: "", photo: null, apoDebut: null, apoFin: null };
}
const preFill = ref(false); /* pré-remplissage depuis une note d'achat : ne pas écraser n à l'ouverture */
watch(showAdd, v => { if (v) { if (!preFill.value) { n.value = blankAdd(); addMore.value = false; addOk.value = false; newCave.value = false; caveSel.value = ""; } apoTouche.value = false; preFill.value = false; } });

/* Promotion d'une envie d'achat → formulaire d'ajout pré-rempli */
function envieVersCave(it) {
  preFill.value = true;
  n.value = { ...blankAdd(), nom: it.nom || "", cuvee: it.cuvee || "", millesime: it.millesime ?? null, prix: it.prix ?? null, commentaire: it.commentaire || "" };
  addMore.value = true;
  addOk.value = false;
  newCave.value = false;
  caveSel.value = "Principale";
  showAdd.value = true;
}

/* Retour de la vue Envies avec une bouteille à promouvoir (via store, la vue est démontée entre-temps) */
onMounted(() => {
  if (cave.enviePrefill) { const it = cave.enviePrefill; cave.enviePrefill = null; envieVersCave(it); }
});
watch(() => cave.enviePrefill, it => { if (it) { cave.enviePrefill = null; envieVersCave(it); } });

const canAdd = computed(() => (n.value.nom || "").trim().length > 1);

/* ===== Bascule Vin ↔ Spiritueux dans la fiche d'ajout =====
   L'état dérive de n.categorie (la dictée peut aussi la basculer) ;
   on mémorise la catégorie de vin pour la restaurer au retour. */
const estSpirit = computed(() => n.value.categorie === "Spiritueux");
const prevCategorie = ref("Rouge");
function switchType(spirit) {
  if (spirit) {
    if (n.value.categorie !== "Spiritueux") prevCategorie.value = n.value.categorie || "Rouge";
    n.value.categorie = "Spiritueux";
  } else {
    n.value.categorie = prevCategorie.value || "Rouge";
  }
}

/* Pré-remplissage de l'apogée : estimation live pendant la saisie.
   Tant que l'utilisateur n'a pas touché les champs lui-même (@input → apoTouche),
   la suggestion du moteur remplit Apogée dès / Jusqu'à ; dès qu'il les édite,
   on ne ré-écrit plus jamais par-dessus. */
const apoTouche = ref(false);
const apoSugg = computed(() => {
  const x = parseFloat(String(n.value.millesime ?? "").replace(",", "."));
  return estimeApogee({
    nom: n.value.nom, cuvee: n.value.cuvee, appellation: n.value.appellation,
    cepage: n.value.cepage, region: n.value.region, categorie: n.value.categorie,
    specificite: n.value.specificite,
    type: n.value.categorie === "Spiritueux" ? "Spiritueux" : "Vin",
    millesime: isNaN(x) ? null : Math.round(x),
  });
});

/* Select cépage : liste courante + Assemblage + « Autre… » (saisie libre).
   get : si la valeur (dictée, import) n'est pas dans la liste → mode Autre, texte conservé. */
const CEPAGE_OPTS = ["", ...CEPAGES, "Assemblage", "__autre__"];
const cepageSel = computed({
  get() { return CEPAGE_OPTS.includes(n.value.cepage) ? n.value.cepage : "__autre__"; },
  set(v) { n.value.cepage = v === "__autre__" ? "" : v; },
});
watch(apoSugg, s => { if (!apoTouche.value && s) { n.value.apoDebut = s.debut; n.value.apoFin = s.fin; } }, { immediate: true });

function saveAdd() {
  if (!canAdd.value || saving.value) return;
  saving.value = true;
  const num = v => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(x) ? null : x; };
  const m = num(n.value.millesime);
  const b = {
    id: uid(),
    nom: n.value.nom.trim(),
    categorie: n.value.categorie,
    type: n.value.categorie === "Spiritueux" ? "Spiritueux" : "Vin",
    quantite: Math.max(1, Math.round(num(n.value.quantite) || 1)),
    millesime: m != null ? Math.round(m) : null,
    prix: num(n.value.prix),
    appellation: (n.value.appellation || "").trim(),
    cepage: (n.value.cepage || "").trim(),
    specificite: (n.value.specificite || "").trim(),
    region: (n.value.region || "").trim(),
    pays: (n.value.pays || "").trim(),
    cave: (n.value.cave || "").trim(),
    cuvee: (n.value.cuvee || "").trim(),
    format: n.value.format,
    statut: n.value.statut,
    commentaire: (n.value.commentaire || "").trim(),
    photo: n.value.photo || null,
    creeLe: new Date().toISOString(),
    modifLe: new Date().toISOString(),
    apoDebut: null, apoFin: null, apoAuto: null, apoRegle: null, note: null
  };
  const d = num(n.value.apoDebut);
  if (d != null) { b.apoDebut = Math.round(d); b.apoFin = Math.round(num(n.value.apoFin) || d); }
  else if (b.categorie !== "Spiritueux") { b.apoAuto = estimeApogee(b); b.apoRegle = b.apoAuto ? b.apoAuto.regle : null; }
  cave.db.bouteilles.unshift(b);
  cave.save();
  cave.toast(b.nom + " bien ajoutée à la cave");
  saving.value = false;
  /* Pastille de confirmation visible puis retour automatique à la cave,
     même quand le formulaire « plus d'infos » est déplié. */
  addOk.value = true;
  setTimeout(() => { addOk.value = false; showAdd.value = false; cave.cavePage = 1; }, 900);
}

function onAddPhoto(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  photoFromFile(f, data => { n.value.photo = data; cave.toast("Photo ajoutée"); });
  ev.target.value = "";
}

/* ---------- Dictée vocale (Web Speech API, native navigateur) ---------- */
const speechOK = speechSupporte();
const dicteeOn = ref(false);
const dicteeTexte = ref("");
let dictee = null, dicteeBuf = "", dicteeVeille = null;
/* iOS : la dictée Web Speech est capricieuse en PWA (micro silencieux) —
   si rien n'est capté après 5 s on le dit au lieu de laisser croire que ça marche. */
const isIOS = typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
function stopDictee() {
  dicteeOn.value = false; dicteeTexte.value = "";
  if (dicteeVeille) { clearTimeout(dicteeVeille); dicteeVeille = null; }
  if (dictee) { dictee.stop(); dictee = null; }
}
/* Fusionne un correctif (dictée ou photo) dans le formulaire, avec cave canonique */
function appliquePatch(patch) {
  if (patch.cave) {
    /* comparaison insensible à la casse + orthographe canonique existante,
       sinon « principale » dicté créerait un doublon de « Principale » */
    const connue = cave.cavesConnues.find(c => c.toLowerCase().trim() === patch.cave.toLowerCase().trim());
    if (connue) { caveSel.value = connue; delete patch.cave; }
    else newCave.value = true;   /* cave inconnue : on affiche l'input, n.cave déjà rempli */
  }
  const detail = ["appellation", "cepage", "region", "pays", "cuvee", "prix", "format", "apoDebut", "commentaire"].some(k => k in patch);
  Object.assign(n.value, patch);
  if (detail) addMore.value = true;   /* déplie « plus d'infos » pour montrer les champs remplis */
}



function toggleDictee() {
  if (dicteeOn.value) { stopDictee(); return; }
  dicteeBuf = ""; dicteeTexte.value = "";
  dictee = creerDictee({
    onFinal: t => {
      /* Commande vocale de fin : « … ajouter / valider / enregistrer / stop / terminer ».
         On retire le mot de commande du morceau AVANT de l'analyser (sinon
         « Domaine X rouge stop » mettrait « stop » dans le nom), on applique
         les champs, PUIS on enregistre. */
      const morceau = t.trim();
      const cmd = /(ajoute[rz]?|valide[rz]?|enregistre[rz]?|confirme[rz]?|stop(?:per)?|termin[ée]e?)\s*[!.,]?\s*$/i.exec(morceau);
      const utile = cmd ? morceau.slice(0, cmd.index).trim() : morceau;
      if (utile) dicteeBuf += " " + utile;   /* on relit tout le tampon : un nom coupé en deux se recolle */
      const patch = parseDictee(dicteeBuf);
      appliquePatch(patch);
      if (cmd) {
        stopDictee();
        if (canAdd.value && !saving.value) saveAdd();
      }
    },
    onInterim: t => { dicteeTexte.value = t || ""; if (dicteeVeille) { clearTimeout(dicteeVeille); dicteeVeille = null; } },
    onErreur: msg => { stopDictee(); cave.toast(msg || "Dictée indisponible"); },
  });
  dictee.start();
  dicteeOn.value = true;
  if (isIOS) dicteeVeille = setTimeout(() => {
    if (dicteeOn.value && !dicteeTexte.value) cave.toast("Rien capté — sur iPhone, la dictée marche mieux dans Safari (onglet) ou avec le micro du clavier sur chaque champ");
  }, 5000);
}
watch(showAdd, v => { if (!v) stopDictee(); });

const PER_PAGE = computed(() => cave.denseOn ? 20 : 10);
const pageCount = computed(() => Math.max(1, Math.ceil(cave.visible.length / PER_PAGE.value)));
watch(() => cave.visible.length, () => { if (cave.cavePage > pageCount.value) cave.cavePage = pageCount.value; });
const pageItems = computed(() => cave.visible.slice((cave.cavePage - 1) * PER_PAGE.value, cave.cavePage * PER_PAGE.value));

/* Bandeau photo de région (v2.26, style « B » validé) : chargé paresseusement
   page par page ; regions.js garde un cache par slug → 1 seul décodage par région. */
const photosCards = ref({});
const photosEnCours = new Set();
function nomRegionCard(b) {
  const slug = regionSlug(b);
  if (slug) return REGIONS[slug]?.nom || slug;
  return (b?.region || b?.pays || "").trim();
}
function photoCard(b) { return photosCards.value[b.id] || null; }
watch(pageItems, async items => {
  for (const b of items) {
    if (photosCards.value[b.id] || photosEnCours.has(b.id)) continue;
    photosEnCours.add(b.id);
    try { const d = await chargePhotoRegion(b); if (d) photosCards.value[b.id] = d; } catch {}
  }
}, { immediate: true });

/* Compteur d'en-tête : reflète TOUJOURS la liste filtrée/visible,
   et rappelle le total quand un filtre/recherche est actif */
const filtresActifs = computed(() => {
  const f = cave.db.filters || {};
  return !!(cave.apogeeFiltre || (f.q || "").trim() || (f.etage && f.etage !== "Tout") || (f.cat && f.cat !== "Toutes") || (f.cave && f.cave !== "Toutes") || (f.region && f.region !== "Toutes"));
});
const visBouteilles = computed(() => cave.visible.reduce((s, b) => s + (b.quantite || 0), 0));
const totalRefs = computed(() => cave.db.bouteilles.filter(b => b.quantite > 0).length);

/* Groupes par région pour le mode dense (en-têtes collants) */
const denseGroups = computed(() => {
  const g = new Map();
  for (const b of pageItems.value) {
    const r = regionTxt(b) || "Sans région";
    if (!g.has(r)) g.set(r, []);
    g.get(r).push(b);
  }
  return [...g.entries()].map(([region, items]) => ({ region, items }));
});

function setStatutBadge(b) {
  const apo = b.apoDebut != null ? { debut: b.apoDebut, fin: b.apoFin ?? b.apoDebut } : b.apoAuto;
  if (b.statut === "Vide") return { t: "Vide", c: "text-muted bg-cream" };
  if (b.statut === "Réservé") return { t: "Réservé", c: "text-gold bg-gold/10" };
  if (b.statut === "À offrir") return { t: "À offrir", c: "text-riesling-ink bg-riesling/20" };
  if (apo) {
    /* Code couleur apogée : rouge = dépassée, riesling = à boire, or = bientôt, crème = à garder */
    if (year > apo.fin) return { t: "passée l'apogée", c: "text-white bg-accent" };
    if (year >= apo.debut) return { t: "à boire", c: "text-ink bg-riesling" };
    if (apo.debut - year <= 2) return { t: "bientôt prête", c: "text-gold bg-gold/10" };
    return { t: "à garder", c: "text-muted bg-cream" };
  }
  return { t: "en cave", c: "text-muted bg-cream" };
}

/* Swipe gauche = boire */
const sw = ref({ id: null, x: 0, dx: 0 });
function swipeStart(b, ev) { sw.value = { id: b.id, x: ev.clientX, dx: 0 }; }
function swipeMove(ev) { if (sw.value.id != null) sw.value.dx = ev.clientX - sw.value.x; }
function swipeEnd(b) {
  if (sw.value.id === b.id && sw.value.dx < -60) cave.boireDemande(b.id);
  sw.value = { id: null, x: 0, dx: 0 };
}

function openImport() { fileInput.value?.click(); }
async function onImportFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  try {
    const rows = await cave.parseImport(f);
    if (!rows.length) { cave.toast("Aucune ligne reconnue dans ce fichier"); return; }
    importRows.value = rows;
  } catch (e) { cave.toast("Fichier illisible : " + (e.message || "erreur")); }
  ev.target.value = "";
}
function openJson() { jsonInput.value?.click(); }
async function onJsonFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    cave.askConfirm({
      titre: "Restaurer une sauvegarde ?",
      texte: "Cette opération remplacera toute la cave actuelle par le contenu du fichier.",
      btn: "Restaurer",
      onOk: () => { cave.restoreBackup(obj); cave.toast("Sauvegarde restaurée"); }
    });
  } catch { cave.toast("Fichier JSON invalide"); }
  ev.target.value = "";
}

/* ===== Cave à étages : Vin / Spiritueux / Tout =====
   Sélecteur persisté dans db.filters.etage. On réinitialise la page,
   et on nettoie un filtre catégorie devenu incohérent avec l'étage
   (ex. étage Spiritueux + filtre Rouge → on remet « Toutes »). */
const ETAGES = [
  { id: "Vin", label: "Vins", count: c => c.vins },
  { id: "Spiritueux", label: "Spiritueux", count: c => c.spirit },
  { id: "Tout", label: "Tout", count: c => c.tout },
];
function setEtage(id) {
  cave.db.filters.etage = id;
  cave.cavePage = 1;
  const cat = cave.db.filters.cat;
  if (id === "Spiritueux" && cat !== "Toutes" && cat !== "Spiritueux") cave.db.filters.cat = "Toutes";
  if (id === "Vin" && cat === "Spiritueux") cave.db.filters.cat = "Toutes";
}
const etageCounts = computed(() => cave.etageCounts);

function livreDeCave() { exportLivreCave(cave.db.bouteilles, cave.PROFILS[cave.PROFIL].nom, t => cave.toast(t)); }
</script>

<template>
  <section class="p-4">
    <!-- Titre -->
    <div class="flex items-end justify-between gap-3">
      <div>
        <p class="text-[10px] text-muted uppercase tracking-widest">Ma Cave</p>
        <h1 class="font-serif text-2xl leading-tight">Cave de {{ cave.PROFILS[cave.PROFIL].nom }}</h1>
        <p class="text-xs text-muted mt-0.5">{{ cave.visible.length }} référence{{ cave.visible.length > 1 ? 's' : '' }} · {{ visBouteilles }} bouteille{{ visBouteilles > 1 ? 's' : '' }}<span v-if="filtresActifs" class="text-accent"> · sur {{ totalRefs }}</span></p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button @click="toggleCloche" class="relative shrink-0 w-11 h-11 rounded-full border flex items-center justify-center" :class="cave.apoAlerte ? 'border-accent text-accent bg-accent/10' : 'border-hairline text-muted'" title="Activer les notifications d'apogée">
          <Ic name="bell" cls="w-5 h-5" /><span v-if="cave.apoAlerte" class="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-accent"></span>
        </button>
        <button @click="router.push('/envies')" class="relative w-11 h-11 rounded-full bg-white border border-hairline text-accent flex items-center justify-center" title="Envies d'achat (notes prises chez le caviste)">
          <Ic name="note" cls="w-5 h-5" />
          <span v-if="cave.nbEnvies" class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-white text-[10px] flex items-center justify-center">{{ cave.nbEnvies }}</span>
        </button>
        <button @click="showAdd = true" class="shrink-0 w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center" title="Ajouter une bouteille"><Ic name="plus" cls="w-6 h-6" /></button>
      </div>
    </div>

    <!-- Cave à étages : Vins / Spiritueux / Tout -->
    <div class="flex gap-1.5 mt-2.5">
      <button v-for="t in ETAGES" :key="t.id" @click="setEtage(t.id)"
              class="px-3.5 py-1.5 rounded-full text-xs flex items-center gap-1.5 border"
              :class="(cave.db.filters.etage || 'Tout') === t.id ? 'bg-ink text-white border-ink' : 'bg-white border-hairline text-ink'">
        <span class="w-2 h-2 rounded-full" :style="'background:' + (t.id === 'Vin' ? cave.CAT_COLORS.Rouge : t.id === 'Spiritueux' ? cave.CAT_COLORS.Spiritueux : 'transparent')"></span>
        {{ t.label }}
        <span class="text-[10px] tabular-nums" :class="(cave.db.filters.etage || 'Tout') === t.id ? 'text-white/70' : 'text-muted'">{{ etageCounts ? (t.id === 'Vin' ? etageCounts.vins : t.id === 'Spiritueux' ? etageCounts.spirit : etageCounts.tout) : '' }}</span>
      </button>
    </div>

    <!-- Outils -->
    <div class="flex gap-1.5 mt-1.5 overflow-x-auto no-scrollbar pb-0.5">
      <button @click="livreDeCave" class="shrink-0 px-3 py-1.5 rounded-full border border-hairline bg-white text-xs flex items-center gap-1.5" title="Livre de cave (imprimable)"><Ic name="book" cls="w-3.5 h-3.5" /> Livre</button>
      <button @click="showListes = true" class="shrink-0 px-3 py-1.5 rounded-full border border-hairline bg-white text-xs flex items-center gap-1.5" title="Listes d'envies et réservations"><Ic name="heart" cls="w-3.5 h-3.5" /> Listes<span v-if="cave.nbReservees" class="ml-0.5 px-1.5 rounded-full bg-gold text-white">{{ cave.nbReservees }}</span></button>
      <button @click="showFichiers = true" class="shrink-0 px-3 py-1.5 rounded-full border border-hairline bg-white text-xs flex items-center gap-1.5" title="Importer / exporter : Excel, CSV, JSON"><Ic name="trayUp" cls="w-3.5 h-3.5 text-green" /> Fichiers</button>
      <button v-if="canInstall" @click="installer" class="shrink-0 px-3 py-1.5 rounded-full bg-accent text-white text-xs flex items-center gap-1.5" title="Installer Ma Cave sur cet appareil"><Ic name="grid" cls="w-3.5 h-3.5" /> Installer l'app</button>
    </div>
    <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="onImportFile" />
    <input ref="jsonInput" type="file" accept=".json" class="hidden" @change="onJsonFile" />

    <!-- Popin Fichiers : importer / exporter local, dans le thème de l'app -->
    <div v-if="showFichiers" class="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6" @click.self="showFichiers = false">
      <div class="bg-white rounded-xl2 p-5 w-full max-w-xs">
        <p class="font-serif text-lg">Fichiers &amp; sauvegardes</p>
        <p class="text-sm text-muted mt-1">Import et export locaux — rien ne quitte ton appareil.</p>
        <div class="space-y-2 mt-4">
          <button @click="showFichiers = false; openImport()" class="w-full p-3 rounded-xl2 border border-hairline text-left flex items-center gap-3">
            <Ic name="excel" cls="w-5 h-5 text-green" />
            <span><span class="block text-sm font-medium">Importer Excel / CSV</span><span class="block text-[11px] text-muted">Fusion avec la cave actuelle</span></span>
          </button>
          <button @click="showFichiers = false; cave.downloadBackup(true)" class="w-full p-3 rounded-xl2 border border-hairline text-left flex items-center gap-3">
            <Ic name="trayUp" cls="w-5 h-5 text-green" />
            <span><span class="block text-sm font-medium">Exporter Excel / CSV</span><span class="block text-[11px] text-muted">Sauvegarde réimportable</span></span>
          </button>
          <button @click="showFichiers = false; cave.exportBackupJSON()" class="w-full p-3 rounded-xl2 border border-hairline text-left flex items-center gap-3">
            <Ic name="trayUp" cls="w-5 h-5 text-accent" />
            <span><span class="block text-sm font-medium">Exporter JSON</span><span class="block text-[11px] text-muted">Toute la cave du profil (bouteilles, bues, listes, envies) + photos</span></span>
          </button>
          <button @click="showFichiers = false; openJson()" class="w-full p-3 rounded-xl2 border border-hairline text-left flex items-center gap-3">
            <Ic name="trayDown" cls="w-5 h-5 text-muted" />
            <span><span class="block text-sm font-medium">Restaurer une sauvegarde JSON</span><span class="block text-[11px] text-muted">Remplace la cave actuelle</span></span>
          </button>
        </div>
        <button @click="showFichiers = false" class="w-full mt-4 py-2.5 rounded-full border border-hairline text-sm">Fermer</button>
      </div>
    </div>

    <!-- Bandeau à boire cette année (v51 : liseré + compte, doré au repos, bordeaux actif) -->
    <div v-if="cave.apogeeStats.boire > 0 && prefsSoir.bandeauApogee !== false" class="mt-3 flex items-stretch rounded-xl2 overflow-hidden" :class="cave.apogeeFiltre ? 'bg-accent border border-accent' : 'bg-riesling/[.16] border border-riesling/50'">
      <div class="w-[3px] self-stretch shrink-0" :class="cave.apogeeFiltre ? 'bg-accent' : 'bg-riesling'"></div>
      <button @click="cave.apogeeFiltre = !cave.apogeeFiltre; cave.cavePage = 1" class="flex-1 min-w-0 py-3 pl-4 pr-2 text-left">
        <p class="text-xs font-medium" :class="cave.apogeeFiltre ? 'text-white' : 'text-ink'">{{ cave.apogeeFiltre ? 'Filtre : à boire cette année' : 'À boire cette année' }}</p>
        <p class="text-[10px]" :class="cave.apogeeFiltre ? 'text-white/80 italic' : 'text-muted'">{{ cave.apogeeFiltre ? 'tap pour retirer le filtre' : (cave.apogeeStats.passe > 0 ? cave.apogeeStats.passe + ' passée(s) l’apogée · tap pour filtrer' : 'en apogée cette année · tap pour filtrer') }}</p>
      </button>
      <div class="flex items-center pr-3">
        <span class="min-w-[30px] h-[30px] rounded-full flex items-center justify-center font-serif" :class="cave.apogeeFiltre ? 'bg-white text-accent' : 'bg-riesling text-ink'">{{ cave.apogeeStats.boire }}</span>
      </div>
      <button @click="cave.db.filters.apogee = cave.db.filters.apogee === 'passe' ? '' : 'passe'; cave.cavePage = 1" class="px-3 text-[11px] shrink-0 self-center" :class="(cave.db.filters.apogee === 'passe' || cave.apogeeFiltre) ? 'text-white underline underline-offset-2' : 'text-accent underline underline-offset-2'">{{ cave.db.filters.apogee === 'passe' ? 'Passées' : 'Passées ?' }}</button>
    </div>

    <!-- Recherche + filtres + dense -->
    <div class="flex gap-2 mt-3">
      <div class="flex-1 relative">
        <input v-model="search" placeholder="Rechercher un vin, un cépage, une région…" class="w-full bg-white border border-hairline rounded-full pl-10 pr-4 py-2 text-sm" @input="cave.db.filters.q = search" />
        <Ic name="search" cls="w-4 h-4 absolute left-3.5 top-2.5 text-muted" />
      </div>
      <button @click="showFiltres = true" class="relative shrink-0 px-3 rounded-full border text-xs flex items-center gap-1.5" :class="filtresParts.length ? 'border-accent text-accent' : 'border-hairline text-muted'">
        <Ic name="sliders" cls="w-4 h-4" /> Filtres
        <span v-if="filtresParts.length" class="ml-0.5 px-1.5 rounded-full bg-accent text-white text-[10px]">{{ filtresParts.length }}</span>
      </button>
      <button @click="cave.setDense(!cave.denseOn)" class="shrink-0 px-3 rounded-full border text-xs flex items-center gap-1.5" :class="cave.denseOn ? 'border-accent text-accent' : 'border-hairline text-muted'" :title="cave.denseOn ? 'Mode cartes' : 'Mode dense'">
        <Ic :name="cave.denseOn ? 'grid' : 'rows'" cls="w-4 h-4" />
      </button>
    </div>

    <!-- Ligne d'état : tri + filtres actifs, discret -->
    <p v-if="triLibelle || filtresLibelle" class="mt-1.5 text-[10px] text-muted">
      Tri : {{ triLibelle || 'défaut' }}<span v-if="filtresLibelle"> · {{ filtresLibelle }}</span> · {{ cave.visible.length }} réf.
    </p>

    <!-- Liste -->
    <div v-if="pageItems.length" class="mt-3">
      <!-- Mode dense avec en-têtes collants par région -->
      <template v-if="cave.denseOn">
        <div v-for="g in denseGroups" :key="g.region" class="mb-2">
          <div class="dense-region-head sticky top-0 z-10 -mx-1 px-1 py-2.5 bg-cream/95 backdrop-blur text-[13px] font-medium text-ink border-l-[3px] pl-2" :style="'border-color:' + (cave.CAT_COLORS[g.items[0].categorie] || '#8A7F75')">
            {{ g.region }} <span class="text-muted/70 font-normal">· {{ g.items.length }}</span>
          </div>
          <button v-for="b in g.items" :key="b.id" @click="openFiche(b.id)" class="w-full text-left px-2 py-2 border-b border-hairline flex items-baseline gap-2">
            <span class="w-2 h-2 rounded-full shrink-0 self-center" :style="'background:' + (cave.CAT_COLORS[b.categorie] || '#8A7F75')"></span>
            <span class="flex-1 min-w-0">
              <span class="block truncate text-sm">{{ splitNom(b).domaine }}</span>
              <span v-if="splitNom(b).cuvee" class="block truncate text-[11px] text-muted/90">{{ splitNom(b).cuvee }}</span>
              <span class="block truncate text-[11px] text-muted">{{ [b.millesime, cepageCourt(b), regionTxt(b), b.format !== 'Bouteille (75 cl)' ? b.format : null].filter(Boolean).join(' · ') }}</span>
            </span>
            <span v-if="b.quantite > 1" class="text-xs text-muted tabular-nums shrink-0">×{{ b.quantite }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" :class="setStatutBadge(b).c">{{ setStatutBadge(b).t }}</span>
          </button>
        </div>
      </template>

      <!-- Mode cartes -->
      <template v-else>
        <div v-for="b in pageItems" :key="b.id" class="relative bg-white border border-hairline rounded-xl2 mb-2 cursor-pointer select-none overflow-hidden"
             :style="sw.id === b.id && sw.dx < 0 ? 'transform:translateX(' + sw.dx + 'px)' : ''"
             @click="sw.id === b.id && sw.dx < -10 ? null : openFiche(b.id)"
             @pointerdown="swipeStart(b, $event)" @pointermove="swipeMove($event)" @pointerup="swipeEnd(b)" @pointercancel="sw.value = { id: null, x: 0, dx: 0 }">

          <!-- Bandeau photo de région (v2.26) : photo embarquée/locale, sinon fond sombre si la région est connue -->
          <div v-if="photoCard(b)" class="h-20 bg-cover bg-center relative shrink-0" :style="'background-image:url(' + photoCard(b) + ')'">
            <span class="absolute left-3 bottom-1.5 text-[9px] uppercase tracking-widest text-white/90" style="text-shadow:0 1px 4px rgba(0,0,0,.55)">{{ nomRegionCard(b) }}</span>
          </div>
          <div v-else-if="nomRegionCard(b)" class="h-20 bg-ink relative shrink-0">
            <span class="absolute left-3 bottom-1.5 text-[9px] uppercase tracking-widest text-white/80">{{ nomRegionCard(b) }}</span>
          </div>

          <div class="flex items-center gap-3 p-3">
          <!-- Pastille catégorie : rond de couleur, plus lisible et plus compact que la bouteille -->
          <span class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center" :style="'background:' + (cave.CAT_COLORS[b.categorie] || '#8A7F75') + '22'"><span class="w-3.5 h-3.5 rounded-full" :style="'background:' + (cave.CAT_COLORS[b.categorie] || '#8A7F75')"></span></span>
          <div class="flex-1 min-w-0">
            <p class="font-serif leading-tight truncate">{{ splitNom(b).domaine }}</p>
            <p v-if="splitNom(b).cuvee" class="text-xs text-muted truncate">{{ splitNom(b).cuvee }}</p>
            <p class="text-xs text-muted truncate mt-0.5">{{ cepageCourt(b) || b.categorie }}<span v-if="b.millesime"> · {{ b.millesime }}</span><span v-if="b.prix != null"> · {{ b.prix }} €</span><span v-if="cave.estCoeur(b)" class="text-accent"> · ❤</span></p>
            <span class="inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-1.5" :class="setStatutBadge(b).c">{{ setStatutBadge(b).t }}</span>
          </div>
          <div class="flex flex-col items-center gap-1 shrink-0">
            <span v-if="b.quantite > 1" class="text-xs text-muted tabular-nums">×{{ b.quantite }}</span>
            <button @click.stop="cave.plusUn(b)" class="px-2 py-1.5 rounded-full border border-hairline text-[11px] text-accent" :title="'Racheter une ' + b.nom" :class="cave.db.filters.etage === 'Spiritueux' ? 'border-chartreuse/40 text-chartreuse' : ''">+1</button>
          </div>
          </div>
        </div>
      </template>

      <!-- Pagination -->
      <div v-if="pageCount > 1" class="flex items-center justify-center gap-4 py-2">
        <button :disabled="cave.cavePage <= 1" @click="cave.cavePage--" class="p-2 text-muted disabled:opacity-30" title="Page précédente"><Ic name="chevL" cls="w-5 h-5" /></button>
        <span class="text-xs text-muted tabular-nums">{{ cave.cavePage }} / {{ pageCount }}</span>
        <button :disabled="cave.cavePage >= pageCount" @click="cave.cavePage++" class="p-2 text-muted disabled:opacity-30" title="Page suivante"><Ic name="chevR" cls="w-5 h-5" /></button>
      </div>
    </div>

    <!-- Vide -->
    <div v-else class="py-16 text-center">
      <p class="font-serif text-lg">Ta cave est vide</p>
      <p class="text-sm text-muted mt-1">Ajoute ta première bouteille, ou importe ton fichier Excel.</p>
      <div class="flex gap-2 justify-center mt-4">
        <button @click="showAdd = true" class="px-5 py-2.5 rounded-full bg-accent text-white text-sm">Ajouter une bouteille</button>
        <button @click="openImport" class="px-5 py-2.5 rounded-full border border-hairline text-sm">Importer un fichier</button>
      </div>
    </div>

    <!-- Feuilles & modales -->
    <FiltresSheet :open="showFiltres" @close="showFiltres = false" />
    <ListesSheet :open="showListes" @close="showListes = false" @to-cave="envieVersCave" />
    <ImportPreview v-if="importRows" :rows="importRows" @close="importRows = null" />


    <!-- Modale d'ajout -->
    <div v-if="showAdd" class="fixed inset-0 z-30 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4" @click.self="showAdd = false">
      <div class="bg-white rounded-t-xl2 md:rounded-xl2 w-full max-w-md max-h-[92vh] overflow-y-auto">
        <form class="p-5" @submit.prevent="saveAdd">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[10px] text-muted uppercase tracking-widest">Nouvelle bouteille</p>
              <p class="font-serif text-lg">{{ estSpirit ? 'Ajouter un spiritueux' : 'Ajouter à la cave' }}</p>
            </div>
            <button type="button" @click="showAdd = false" class="close-x" title="Fermer"><Ic name="x" cls="w-4 h-4" /></button>
          </div>

          <!-- Bascule Vin / Spiritueux : la fiche change de couleur et de champs -->
          <div class="mt-3 flex gap-1.5">
            <button type="button" @click="switchType(false)" class="flex-1 py-1.5 rounded-full text-xs border flex items-center justify-center gap-1.5" :class="!estSpirit ? 'bg-accent text-white border-accent' : 'bg-white border-hairline text-ink'">
              <span class="w-2 h-2 rounded-full" :style="'background:' + cave.CAT_COLORS.Rouge"></span> Vins
            </button>
            <button type="button" @click="switchType(true)" class="flex-1 py-1.5 rounded-full text-xs border flex items-center justify-center gap-1.5" :class="estSpirit ? 'bg-chartreuse text-white border-chartreuse' : 'bg-white border-hairline text-ink'">
              <span class="w-2 h-2 rounded-full" :style="'background:' + cave.CAT_COLORS.Spiritueux"></span> Spiritueux
            </button>
          </div>

          <!-- Pastille de confirmation d'ajout -->
          <div v-if="addOk" class="mt-3 px-4 py-2.5 rounded-full bg-green/10 border border-green/40 text-green text-xs flex items-center gap-2">
            <Ic name="check" cls="w-4 h-4" /> Bouteille bien ajoutée
          </div>

          <!-- Dictée vocale + photo -->
          <div class="mt-3 flex items-center gap-2">
            <button v-if="speechOK" type="button" @click="toggleDictee" class="shrink-0 h-9 px-3.5 rounded-full flex items-center gap-1.5 text-xs" :class="dicteeOn ? (estSpirit ? 'bg-chartreuse text-white' : 'bg-accent text-white') : (estSpirit ? 'bg-white border border-chartreuse/40 text-chartreuse' : 'bg-white border border-accent/40 text-accent')" :title="dicteeOn ? 'Arrêter la dictée' : 'Remplir la fiche à la voix'">
              <Ic name="mic" cls="w-4 h-4" /> {{ dicteeOn ? 'Arrêter' : 'Dicter' }}
            </button>
                        <p v-if="dicteeOn" class="text-[11px] text-muted italic truncate flex-1" title="Transcription en direct">{{ dicteeTexte || "Dis : « Domaine des Lambrays 2019 rouge » ou champ par champ : « nom …, millésime 2019, six bouteilles, prix quinze euros »" }}</p>
          </div>

          <div class="mt-4 space-y-2.5">
            <div>
              <input v-model="n.nom" placeholder="Domaine ou Spiritueux" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Nom</p>
            </div>
            <div class="flex gap-2 items-start">
              <div v-if="estSpirit" class="flex-1 min-w-0">
                <select v-model="n.specificite" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                  <option value="">—</option>
                  <option v-for="m in SPIRIT_MENTIONS" :key="m">{{ m }}</option>
                </select>
                <p class="text-[10px] text-muted mt-1 ml-1">Mention (VS, VSOP, XO…)</p>
              </div>
              <div v-else class="flex-1 min-w-0">
                <select v-model="n.categorie" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                  <option v-for="c in cave.CATS" :key="c">{{ c }}</option>
                </select>
                <p class="text-[10px] text-muted mt-1 ml-1">Catégorie</p>
              </div>
              <div class="w-16 shrink-0">
                <input v-model.number="n.quantite" type="number" min="1" placeholder="Qté" class="w-full bg-cream border border-hairline rounded-lg px-2 py-2.5 text-sm text-center" title="Quantité" />
                <p class="text-[10px] text-muted mt-1 text-center">Bouteilles</p>
              </div>
            </div>
            <div class="flex gap-2 items-start">
              <div class="w-1/2 min-w-0">
                <input v-model.number="n.millesime" type="number" placeholder="Millésime" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                <p class="text-[10px] text-muted mt-1 ml-1">Millésime</p>
              </div>
              <div class="w-1/2 min-w-0">
                <template v-if="newCave">
                  <input v-model="n.cave" placeholder="Nom de la cave" class="w-full bg-white border border-accent rounded-lg px-3 py-2.5 text-sm" />
                </template>
                <select v-else v-model="caveSel" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                  <option value="" disabled>Cave…</option>
                  <option v-for="c in cave.cavesConnues" :key="c" :value="c">{{ c }}</option>
                  <option value="__nouvelle__">Autre cave…</option>
                </select>
                <div class="flex items-center gap-1.5">
                  <p class="text-[10px] text-muted mt-1 ml-1">Cave</p>
                  <button v-if="newCave" type="button" @click="newCave = false; caveSel = n.cave || ''" title="Revenir à la liste" class="text-[10px] text-accent underline underline-offset-2 mt-1">Liste</button>
                </div>
              </div>
            </div>
            <img v-if="n.photo" :src="n.photo" alt="" class="w-full h-36 object-cover rounded-lg" />
            <label class="w-full py-2 rounded-full border border-hairline bg-cream text-xs flex items-center justify-center gap-1.5 cursor-pointer"><Ic name="camera" cls="w-4 h-4" /> {{ n.photo ? 'Changer la photo' : 'Ajouter une photo' }}<input type="file" accept="image/*" class="hidden" @change="onAddPhoto" /></label>

            <template v-if="addMore">
              <div>
                <input v-model="n.appellation" :placeholder="estSpirit ? 'Appellation (Cognac, Islay…)' : 'Appellation'" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                <p class="text-[10px] text-muted mt-1 ml-1">Appellation</p>
              </div>
              <div v-if="n.categorie !== 'Spiritueux'" class="flex gap-2 items-start">
                <div class="flex-1 min-w-0">
                  <select v-model="cepageSel" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                    <option value="" disabled>Sélectionne…</option>
                    <option v-for="c in CEPAGES" :key="c">{{ c }}</option>
                    <option value="Assemblage">Assemblage</option>
                    <option value="__autre__">Autre…</option>
                  </select>
                  <input v-if="cepageSel === '__autre__'" v-model="n.cepage" placeholder="Cépage (saisie libre)" class="w-full mt-2 bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                  <p class="text-[10px] text-muted mt-1 ml-1">Cépage</p>
                </div>
                <div class="flex-1 min-w-0">
                  <select v-model="n.specificite" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                    <option value="">—</option>
                    <option v-for="s in SPECIFICITES" :key="s">{{ s }}</option>
                  </select>
                  <p class="text-[10px] text-muted mt-1 ml-1">Spécificité (VT, SGN…)</p>
                </div>
              </div>
              <div class="flex gap-2 items-start">
                <div class="flex-1 min-w-0">
                  <input v-model="n.region" placeholder="Région" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                  <p class="text-[10px] text-muted mt-1 ml-1">Région</p>
                </div>
              </div>
              <div class="flex gap-2 items-start">
                <div class="w-1/2 min-w-0">
                  <input v-model="n.pays" placeholder="Pays" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                  <p class="text-[10px] text-muted mt-1 ml-1">Pays</p>
                </div>
                <div class="w-1/2 min-w-0">
                  <input v-model.number="n.prix" type="number" step="0.01" placeholder="Prix" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                  <p class="text-[10px] text-muted mt-1 ml-1">Prix (€)</p>
                </div>
              </div>
              <div class="flex gap-2 items-start">
                <div class="flex-1 min-w-0">
                  <input v-model="n.cuvee" placeholder="Cuvée" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                  <p class="text-[10px] text-muted mt-1 ml-1">Cuvée</p>
                </div>
                <div class="w-40 shrink-0">
                  <select v-model="n.format" class="w-full bg-cream border border-hairline rounded-lg px-2 py-2.5 text-sm">
                    <option v-for="f in cave.FORMATS" :key="f">{{ f }}</option>
                  </select>
                  <p class="text-[10px] text-muted mt-1 ml-1">Format</p>
                </div>
              </div>
              <div v-if="n.categorie !== 'Spiritueux'" class="flex gap-2 items-start">
                <div class="w-1/2 min-w-0">
                  <input v-model.number="n.apoDebut" @input="apoTouche = true" type="number" placeholder="Apogée dès" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                  <p class="text-[10px] text-muted mt-1 ml-1">Apogée dès</p>
                </div>
                <div class="w-1/2 min-w-0">
                  <input v-model.number="n.apoFin" @input="apoTouche = true" type="number" placeholder="Jusqu'à" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
                  <p class="text-[10px] text-muted mt-1 ml-1">Jusqu'à</p>
                </div>
              </div>
              <p v-if="apoSugg && n.categorie !== 'Spiritueux'" class="text-[10px] text-muted ml-1 -mt-0.5">Estimation : {{ apoSugg.debut }}–{{ apoSugg.fin }} · {{ apoSugg.regle }}{{ apoTouche ? ' — tu as modifié la suggestion' : ' — modifiable à tout moment' }}</p>
              <div>
                <textarea v-model="n.commentaire" rows="2" placeholder="Une occasion, un souvenir, une envie…" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm"></textarea>
                <p class="text-[10px] text-muted mt-1 ml-1">Commentaire</p>
              </div>
              <p v-if="n.categorie !== 'Spiritueux'" class="text-[11px] text-muted">L'apogée est pré-estimée depuis le moteur (appellation, cépage, région) — ajuste-la librement, ta valeur prime toujours.</p>
            </template>
            <button v-else type="button" @click="addMore = true" class="text-xs underline underline-offset-2" :class="estSpirit ? 'text-chartreuse' : 'text-accent'">Plus d'infos{{ estSpirit ? ' (appellation, prix…)' : ' (appellation, région, apogée…)' }}</button>
          </div>

          <div class="flex gap-2 mt-4">
            <button type="button" @click="showAdd = false" class="flex-1 py-2.5 rounded-full border border-hairline text-sm">Annuler</button>
            <button type="submit" :disabled="!canAdd || saving" class="flex-1 py-2.5 rounded-full text-white text-sm disabled:opacity-40 flex items-center justify-center gap-1.5" :class="estSpirit ? 'bg-chartreuse' : 'bg-accent'">
              <template v-if="addOk"><Ic name="check" cls="w-4 h-4" /> Ajoutée</template>
              <template v-else>Ajouter</template>
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
