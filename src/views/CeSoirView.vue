<script setup>
/* Accueil « Ce soir » v2.25 (maquette « Oeni » validée, sans emoji — icônes Ic) :
   bandeau micro, carte vedette avec photo de région (fond de carte + bouteille pleine
   colorée par type au premier plan, bulles pour les effervescents), jauge d'apogée,
   3 tuiles stats, rappel discret, spiritueux en une ligne.
   Région sans photo embarquée → fond sombre + possibilité d'ajouter SA photo
   (stockage local de l'appareil). */
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCave } from "../stores/cave.js";
import { splitNom, regionTxt, fmtListeDate, joursAvant } from "../util.js";
import ListesSheet from "../components/ListesSheet.vue";
import { classeSoir, meteoActuelle } from "../lib/soir.js";
import { CAT_COLORS } from "../config.js";
import { regionSlug, clePhotoRegion, photoRegionLocale, photoRegionSauve, chargePhotoRegion, REGIONS, normR } from "../lib/regions.js";
import Ic from "../components/Ic.vue";

const cave = useCave();
const router = useRouter();

const YEAR = new Date().getFullYear();
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const now = new Date();
const jour = JOURS[now.getDay()];
const h = now.getHours();
const salut = (h >= 17 || h < 5) ? "Bonsoir" : "Bonjour";
const prenom = computed(() => (cave.PROFILS[cave.PROFIL]?.nom || "").split(" ")[0]);

/* ===== Suggestion du soir (logique inchangée) ===== */
const ceSoir = ref(null);
const meteo = ref(null);
const prefsSoir = computed(() => cave.soirPrefs());
const soirOff = ref(false);
function soirKey() { return cave.pKeys.db + "-soir" }
function soirState() { try { return JSON.parse(localStorage.getItem(soirKey()) || "null") } catch { return null } }
function saveSoir(s) { try { localStorage.setItem(soirKey(), JSON.stringify(s)) } catch {} }
function classeDuSoir() { return classeSoir(cave.soirItems, prefsSoir.value, meteo.value); }
function pickSoir(suivante) {
  const today = new Date().toISOString().slice(0, 10);
  const st = soirState() || {};
  if (soirOff.value) { ceSoir.value = null; return; }
  const cands = classeDuSoir();
  if (!cands.length) { ceSoir.value = null; return; }
  let idx = st.jour === today ? st.idx : 0;
  if (st.jour !== today && st.lastId && cands.length > 1 && cands[idx] && cands[idx].b.id === st.lastId) idx = 1;
  if (suivante && ceSoir.value) { const i = cands.findIndex(c => c.b.id === ceSoir.value.b.id); idx = ((i < 0 ? idx : i) + 1) % cands.length; }
  if (!cands[idx]) idx = 0;
  ceSoir.value = cands[idx];
  saveSoir({ jour: today, idx, lastId: ceSoir.value.b.id });
}
async function posVoyage() {
  if (!prefsSoir.value.voyage) return null;
  if (!navigator.geolocation) return null;
  return new Promise(res => {
    const done = ok => res(ok);
    navigator.geolocation.getCurrentPosition(p => done({ lat: p.coords.latitude, lon: p.coords.longitude }), () => done(null), { timeout: 5000, maximumAge: 600000 });
    setTimeout(() => done(null), 6000);
  });
}
async function initSoir() {
  pickSoir(false);
  if (prefsSoir.value.meteo && prefsSoir.value.lat != null) {
    const ici = (await posVoyage()) || prefsSoir.value;
    const m = await meteoActuelle(ici.lat, ici.lon);
    if (m && m.t !== meteo.value?.t) { meteo.value = m; pickSoir(false); }
  }
}
onMounted(() => initSoir());
watch(prefsSoir, (p, oldP) => { if (p.lat !== oldP.lat || p.lon !== oldP.lon || p.ville !== oldP.ville) initSoir(); });

/* ===== Vedette : suggestion du soir, sinon proposition plaisir ===== */
const plaisirOff = ref(false);
const plaisirIdx = ref(0);
const stockVins = computed(() => cave.db.bouteilles.filter(b => b.quantite > 0 && b.type !== "Spiritueux"));
const plaisir = computed(() => {
  const pool = stockVins.value;
  if (!pool.length) return null;
  const seed = new Date().toISOString().slice(0, 10);
  let hsh = 0; for (const c of seed) hsh = (hsh * 31 + c.charCodeAt(0)) % 9973;
  return pool[(hsh + plaisirIdx.value) % pool.length];
});
const vedette = computed(() => {
  if (ceSoir.value) return { b: ceSoir.value.b, r: ceSoir.value.r, urgent: true };
  if (soirOff.value || plaisirOff.value || !plaisir.value) return null;
  return { b: plaisir.value, r: [], urgent: false };
});
function fermerVedette() {
  if (ceSoir.value) soirOff.value = true; else plaisirOff.value = true;
  ceSoir.value = null;
}
function autreIdee() {
  if (ceSoir.value) pickSoir(true);
  else plaisirIdx.value++;
}
function boireSoir() {
  const b = vedette.value?.b;
  if (!b) return;
  ceSoir.value = null; soirOff.value = true; plaisirOff.value = true;
  cave.boireDemande(b.id);
}
function frigoSoir() {
  const b = vedette.value?.b;
  if (!b) return;
  ceSoir.value = null; soirOff.value = true; plaisirOff.value = true;
  cave.auFrigo(b);
  cave.rappelFrigo(b);
}

/* Couleur de la vedette : la charte prend la teinte de la catégorie du vin. */
const vedetteCol = computed(() => CAT_COLORS[vedette.value?.b?.categorie] || "#D9C589");

/* ===== En-tête photo de la vedette (maquette Oeni) ===== */
/* Photo perso de la fiche en priorité, sinon photo de région (locale puis embarquée),
   sinon fond sombre + bouteille. Le pseudo-slug sert de clé pour une photo ajoutée
   à la main sur une région sans photo embarquée (Jura, Savoie…). */
const photoHead = ref(null);
const photoCle = computed(() => vedette.value ? clePhotoRegion(vedette.value.b) : null);
watch(() => [vedette.value?.b?.id, vedette.value?.b?.photo, photoCle.value], async () => {
  const b = vedette.value?.b;
  if (!b) { photoHead.value = null; return; }
  if (b.photo) { photoHead.value = b.photo; return; }
  photoHead.value = await chargePhotoRegion(b);
}, { immediate: true });
/* Le bouton « ajouter une photo » n'apparaît que s'il n'y a NI photo embarquée NI
   photo locale : on enrichit la carte avec ta propre image de région. */
const peutAjouterPhoto = computed(() => {
  const b = vedette.value?.b;
  return b && !b.photo && !photoHead.value && photoCle.value && (b.region || b.pays);
});
function photoRegionChoisie(ev) {
  const f = ev.target.files[0];
  ev.target.value = "";
  const b = vedette.value?.b;
  const cle = photoCle.value;
  if (!f || !b || !cle) return;
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 640 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const d = cv.toDataURL("image/jpeg", 0.65);
      photoRegionSauve(cle, d);
      photoHead.value = d;
      cave.toast("Photo de région enregistrée sur cet appareil");
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(f);
}

/* Nom de région affiché sur la photo : le libellé de la fiche, sinon celui de la table. */
const regionNom = computed(() => {
  const b = vedette.value?.b;
  if (!b) return "";
  return b.region || b.pays || REGIONS[regionSlug(b)]?.nom || "";
});

/* Bouteille pleine : couleur du VIN (pas seulement du contour). Effervescents → bulles
   animées. Spiritueux → bouteille verte (gin, vodka) ou ambrée (whisky, rhum, cognac). */
const bouteilleCol = computed(() => {
  const b = vedette.value?.b;
  if (!b) return "#7A2E3E";
  const cat = b.categorie || "";
  if (cat === "Spiritueux") {
    const t = normR([b.nom, b.cuvee].join(" "));
    return /whisky|whiskey|rhum|cognac|armagnac|bourbon/.test(t) ? "#B26C1E" : "#34583A";
  }
  return CAT_COLORS[cat] || "#7A2E3E";
});
const aBulles = computed(() => ["Champagne", "Crémant", "Effervescent"].includes(vedette.value?.b?.categorie));
const coeurVedette = computed(() => { try { return !!cave.estCoeur(vedette.value?.b) } catch { return false } });

/* ===== Jauge d'apogée de la vedette ===== */
const apoJ = computed(() => {
  const b = vedette.value?.b;
  if (!b || b.type === "Spiritueux") return null;
  const d = b.apoDebut ?? b.apoAuto?.debut;
  const f = b.apoFin ?? (b.apoDebut != null ? b.apoDebut : b.apoAuto?.fin);
  if (d == null) return null;
  const fin = f ?? d, mil = b.millesime;
  const y = YEAR;
  let pos;
  if (y < d) {
    const from = mil ?? d - 3;
    pos = 4 + 22 * Math.max(0, Math.min(1, (y - from) / Math.max(1, d - from)));
  } else if (y <= fin) {
    pos = fin > d ? 28 + 30 * (y - d) / (fin - d) : 45;
  } else {
    pos = Math.min(97, 62 + 36 * ((y - fin) / Math.max(2, (fin - d) * 0.8)));
  }
  const verdict = y < d ? `À garder — apogée dès ${d}`
    : y <= fin ? (fin > d ? `En pleine apogée · jusqu'en ${fin}` : `Apogée en ${d}`)
    : `Passée l'apogée — à boire sans attendre`;
  return { pos, verdict, etat: y < d ? "garder" : y <= fin ? "apogee" : "passe" };
});

/* ===== Warning frigo ===== */
const frigoB = computed(() => cave.db.bouteilles.filter(b => b.quantite > 0 && b.cave === "Frigo"));
const nbFrigo = computed(() => frigoB.value.length);

/* ===== Rappel actif ===== */
const showListes = ref(false);
const rappel = computed(() => {
  const l = cave.listes.find(x => x.date && (x.ids || []).length && joursAvant(x.date) >= 0 && joursAvant(x.date) <= 2);
  if (l) return { t: "Soirée « " + l.nom + " »", s: fmtListeDate(l.date) + " · " + l.ids.length + " bouteille" + (l.ids.length > 1 ? "s" : "") + " de côté", action: "listes" };
  return null;
});
function rappelGo() {
  const a = rappel.value?.action;
  if (!a) return;
  if (a === "listes") { showListes.value = true; return; }
  cave.db.filters.apogee = "passe";
  cave.cavePage = 1;
  router.push("/cave");
}

/* ===== Tuiles stats ===== */
function versCaveApo(v) { cave.db.filters.apogee = v; cave.cavePage = 1; router.push("/cave"); }
function versCaveFrigo() { cave.db.filters.cave = "Frigo"; cave.cavePage = 1; router.push("/cave"); }

/* ===== Mini-stats ===== */
const stCave = computed(() => cave.stats);
const camembert = computed(() => {
  const st = stCave.value;
  const tot = st.totalB || 1;
  const entries = Object.entries(st.parCat || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 5);
  const reste = entries.slice(5).reduce((s, [, n]) => s + n, 0);
  if (reste > 0) top.push(["Autres", reste]);
  let acc = 0;
  const parts = top.map(([cat, n]) => {
    const part = n * 100 / tot;
    const seg = { cat, n, color: CAT_COLORS[cat] || "#8A7F75", dash: Math.max(part - 0.7, 0.5) + " " + (100 - Math.max(part - 0.7, 0.5)), offset: 100 - acc };
    acc += part;
    return seg;
  });
  return { parts, totalB: st.totalB };
});
const miniStats = computed(() => {
  const st = stCave.value;
  const ms = st.stock.filter(b => b.millesime && !isNaN(b.millesime)).map(b => parseInt(b.millesime));
  const regions = new Set(st.stock.filter(b => b.region).map(b => b.region)).size;
  return {
    totalB: st.totalB,
    regions,
    mill: ms.length ? { min: Math.min(...ms), max: Math.max(...ms) } : null,
    valeur: st.valeur > 0 ? Math.round(st.valeur) : null,
    bues: st.buesCount || null,
    note: st.avgNote || null,
  };
});

/* ===== Spiritueux du soir ===== */
const spiritux = computed(() => cave.spiritueuxDuSoir);

function ouvrirAjouter() { cave.ouvrirAjout = true; router.push("/cave"); }
function versEnvies() { router.push("/envies"); }
</script>

<template>
  <section class="p-4">
    <!-- Bandeau micro : salut + météo une ligne + envies / ajout -->
    <div class="flex items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[10px] text-muted uppercase tracking-widest truncate">Ce soir · {{ jour.toLowerCase() }}<template v-if="meteo"> · {{ meteo.t }}°</template><span v-if="meteo && prefsSoir.ville" class="normal-case tracking-normal"> à {{ prefsSoir.ville }}</span></p>
        <h1 class="font-serif text-2xl leading-tight">{{ salut }} {{ prenom }}</h1>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button @click="versEnvies" class="relative w-11 h-11 rounded-full bg-white border border-hairline text-accent flex items-center justify-center" title="Envies d'achat (notes prises chez le caviste)">
          <Ic name="heart" cls="w-5 h-5" />
          <span v-if="cave.nbEnvies" class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-white text-[10px] flex items-center justify-center">{{ cave.nbEnvies }}</span>
        </button>
        <button @click="ouvrirAjouter" class="shrink-0 w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center" title="Ajouter une bouteille"><Ic name="plus" cls="w-6 h-6" /></button>
      </div>
    </div>

    <!-- Warning frigo -->
    <button v-if="nbFrigo" @click="versCaveFrigo" class="mt-3 w-full flex items-stretch rounded-xl2 overflow-hidden bg-accent-soft border border-accent/40 card-sh">
      <div class="w-[3px] self-stretch shrink-0 bg-accent"></div>
      <div class="flex-1 min-w-0 py-2.5 pl-3.5 pr-2 flex items-center gap-2.5 text-left">
        <Ic name="snow" cls="w-4 h-4 text-accent shrink-0" />
        <span class="flex-1 min-w-0">
          <span class="block text-xs font-medium text-accent">{{ nbFrigo }} bouteille{{ nbFrigo > 1 ? 's' : '' }} au frigo</span>
          <span class="block text-[11px] text-muted mt-0.5 truncate">Pense à les sortir avant le repas</span>
        </span>
        <Ic name="chevR" cls="w-4 h-4 text-accent shrink-0" />
      </div>
    </button>

    <!-- Carte vedette « Oeni » : photo de région en fond, bouteille pleine au premier plan -->
    <div v-if="vedette" class="mt-3 rounded-xl2 border bg-white overflow-hidden card-sh" :style="{ borderColor: vedetteCol }">
      <!-- En-tête visuel : photo (perso > région > fond sombre) -->
      <button @click="cave.openFiche(vedette.b.id)" class="relative block w-full h-[150px] overflow-hidden text-left" :style="photoHead ? {} : { background: '#2B2724' }" title="Ouvrir la fiche">
        <img v-if="photoHead" :src="photoHead" alt="" class="absolute inset-0 w-full h-full object-cover opacity-95" />
        <div class="absolute inset-0" style="background: linear-gradient(to top, #FAF6F1 0%, rgba(250,246,241,0) 48%)"></div>
        <!-- Badges : apogée, millésime, coup de cœur -->
        <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span v-if="apoJ" class="px-2 py-0.5 rounded-full text-[10px] font-medium" :style="{ background: apoJ.etat === 'passe' ? '#7A2E3E' : '#D9C589', color: apoJ.etat === 'passe' ? '#fff' : '#2B2724' }">{{ apoJ.etat === 'passe' ? 'À boire' : apoJ.etat === 'apogee' ? 'Apogée' : 'À garder' }}</span>
          <span v-if="vedette.b.millesime" class="px-2 py-0.5 rounded-full text-[10px] font-medium" style="background: rgba(43,39,36,.55); color: #fff">{{ vedette.b.millesime }}</span>
          <span v-if="coeurVedette" class="w-5 h-5 rounded-full flex items-center justify-center" style="background: rgba(43,39,36,.55)"><Ic name="heart" cls="w-3 h-3 text-gold fill-current" /></span>
        </div>
        <!-- Fermer la vedette -->
        <span @click.stop="fermerVedette" class="absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center" style="background: rgba(43,39,36,.45); color: #fff" title="Masquer jusqu'à demain"><Ic name="x" cls="w-3.5 h-3.5" /></span>
        <!-- Nom de région + catégorie -->
        <span class="absolute left-3 bottom-2 min-w-0">
          <span v-if="regionNom" class="block font-serif text-[15px] leading-tight" style="color: #2B2724">{{ regionNom }}</span>
          <span class="block text-[10px] mt-0.5 truncate" style="color: #5C5248">{{ [vedette.b.categorie, regionTxt(vedette.b) !== regionNom ? regionTxt(vedette.b) : ''].filter(Boolean).join(' · ') }}</span>
        </span>
        <!-- Crédit photo, très discret -->
        <span v-if="photoHead && !vedette.b.photo" class="absolute bottom-1.5 right-2 text-[8px] opacity-60" style="color: #fff">photo · CC-BY</span>
        <!-- Bouteille pleine : halo + ombre portée, couleur du vin, bulles si effervescent -->
        <span class="absolute right-1 -bottom-[14px] w-[94px] h-[94px] rounded-full pointer-events-none" style="background: radial-gradient(closest-side, rgba(255,255,255,.55), rgba(255,255,255,0) 70%)"></span>
        <svg viewBox="0 0 44 84" class="absolute right-3 -bottom-1 h-[124px] w-[62px] pointer-events-none" :style="{ color: bouteilleCol, filter: 'drop-shadow(0 4px 9px rgba(0,0,0,.45))' }">
          <path d="M19 5h6v13c0 3 8 5 8 12v44a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V30c0-7 8-9 8-12V5z" fill="currentColor" fill-opacity=".93" stroke="none" />
          <path d="M20.5 33v31" stroke="rgba(255,255,255,.5)" stroke-width="2.6" stroke-linecap="round" fill="none" />
          <path d="M19 5h6v13c0 3 8 5 8 12v44a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V30c0-7 8-9 8-12V5z" fill="none" stroke="rgba(43,39,36,.35)" stroke-width="1" />
          <g v-if="aBulles" fill="rgba(255,255,255,.9)">
            <circle class="bulle" cx="18" cy="60" r="1.3" style="animation-delay: 0s" />
            <circle class="bulle" cx="24" cy="66" r="1" style="animation-delay: .6s" />
            <circle class="bulle" cx="21" cy="70" r="1.4" style="animation-delay: 1.1s" />
            <circle class="bulle" cx="26" cy="61" r="0.9" style="animation-delay: 1.7s" />
            <circle class="bulle" cx="19.5" cy="64" r="1" style="animation-delay: 2.2s" />
          </g>
        </svg>
      </button>
      <!-- Ajouter une photo pour une région sans image embarquée (stockage local) -->
      <label v-if="peutAjouterPhoto" class="flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted border-b border-hairline cursor-pointer bg-cream/60">
        <Ic name="camera" cls="w-3.5 h-3.5" /> Ajouter une photo de « {{ regionNom }} » (enregistrée sur cet appareil)
        <input type="file" accept="image/*" class="hidden" @change="photoRegionChoisie" />
      </label>
      <!-- Corps : domaine, jauge d'apogée, raisons, actions -->
      <div class="px-3.5 py-3">
        <p class="text-[10px] uppercase tracking-widest min-w-0 truncate" :style="{ color: vedetteCol }">{{ vedette.urgent ? 'La bouteille du soir' : "Rien d'urgent — et si on ouvrait ça ?" }}</p>
        <button @click="cave.openFiche(vedette.b.id)" class="text-left mt-0.5 max-w-full">
          <p class="font-serif text-[17px] leading-snug break-words">{{ splitNom(vedette.b).domaine }}</p>
          <p class="text-[11px] text-muted mt-0.5 break-words leading-snug">{{ [splitNom(vedette.b).cuvee, vedette.b.millesime, regionTxt(vedette.b)].filter(Boolean).join(' · ') }}</p>
        </button>
        <div v-if="apoJ" class="mt-2.5">
          <div class="relative h-1.5 rounded-full" style="background: linear-gradient(90deg, #E9DDC0 0%, #A8842C 30%, #D9C589 58%, #D9A089 100%)">
            <div class="absolute -top-[3px] w-2.5 h-2.5 rounded-full bg-accent border-2 border-white shadow-sm" :style="{ left: apoJ.pos + '%' }"></div>
          </div>
          <div class="flex justify-between text-[9px] text-muted mt-1">
            <span>À garder</span><span>Apogée</span><span>Déclin</span>
          </div>
          <p class="text-[11px] font-medium mt-0.5" :class="apoJ.etat === 'passe' ? 'text-accent' : apoJ.etat === 'apogee' ? 'text-gold' : 'text-muted'">{{ apoJ.verdict }}</p>
        </div>
        <div v-if="vedette.r.length" class="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span v-for="r in vedette.r" :key="r" class="text-[10px] px-1.5 py-0.5 rounded-full bg-riesling/40 text-ink">{{ r }}</span>
        </div>
        <div class="flex gap-2 mt-3">
          <button @click="boireSoir" class="flex-1 py-2.5 rounded-xl2 bg-accent text-white text-[11px] flex items-center justify-center gap-1.5"><Ic name="bottleEmpty" cls="w-3.5 h-3.5" /><span class="whitespace-nowrap">Boire</span></button>
          <button @click="frigoSoir" class="flex-1 py-2.5 rounded-xl2 border border-accent/40 text-accent text-[11px] flex items-center justify-center gap-1.5"><Ic name="snow" cls="w-3.5 h-3.5" /><span class="whitespace-nowrap">Au frigo</span></button>
          <button @click="autreIdee" class="flex-1 py-2.5 rounded-xl2 border border-gold/60 text-gold text-[11px] flex items-center justify-center gap-1.5" title="Proposer une autre bouteille"><Ic name="sparkles" cls="w-3.5 h-3.5" /><span class="whitespace-nowrap">Autre idée</span></button>
        </div>
      </div>
    </div>
    <div v-else-if="!soirOff && !plaisirOff && !stockVins.length" class="mt-4 rounded-xl2 border border-hairline bg-white/60 p-4 text-center">
      <p class="font-serif text-sm">Ta cave est sereine</p>
      <p class="text-[11px] text-muted mt-1">Rien d'urgent à boire ce soir — sers ce qui te fait plaisir.</p>
    </div>

    <!-- 3 tuiles stats -->
    <div v-if="stockVins.length" class="mt-3 grid grid-cols-3 gap-2">
      <button @click="versCaveApo('boire')" class="rounded-xl2 bg-white border border-gold/60 py-2.5 px-2 flex flex-col items-center gap-0.5 card-sh">
        <Ic name="glass" cls="w-4 h-4 text-gold" />
        <span class="font-serif text-lg leading-none text-gold">{{ cave.apogeeStats.boire }}</span>
        <span class="text-[10px] text-muted">à boire</span>
      </button>
      <button @click="versCaveApo('passe')" class="rounded-xl2 bg-white border border-accent/40 py-2.5 px-2 flex flex-col items-center gap-0.5 card-sh">
        <Ic name="bell" cls="w-4 h-4 text-accent" />
        <span class="font-serif text-lg leading-none text-accent">{{ cave.apogeeStats.passe }}</span>
        <span class="text-[10px] text-muted">passées</span>
      </button>
      <button @click="versCaveFrigo" class="rounded-xl2 bg-white border border-ice/40 py-2.5 px-2 flex flex-col items-center gap-0.5 card-sh">
        <Ic name="snow" cls="w-4 h-4 text-ice" />
        <span class="font-serif text-lg leading-none text-ice">{{ nbFrigo }}</span>
        <span class="text-[10px] text-muted">au frigo</span>
      </button>
    </div>

    <!-- Ta cave en chiffres -->
    <button v-if="miniStats.totalB" @click="router.push('/stats')" class="mt-3 w-full rounded-xl2 bg-white border border-hairline px-3.5 py-3 text-left card-sh">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[10px] text-muted uppercase tracking-widest">Ta cave en chiffres</p>
        <span class="flex items-center gap-1 text-[10px] text-accent">Tout voir <Ic name="chevR" cls="w-3 h-3" /></span>
      </div>
      <div class="flex items-center gap-3.5 mt-2.5">
        <div class="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 42 42" class="w-16 h-16">
            <g transform="rotate(-90 21 21)">
              <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#EFE8DE" stroke-width="6.5" />
              <circle v-for="p in camembert.parts" :key="p.cat" cx="21" cy="21" r="15.9155" fill="none" stroke-width="6.5" :stroke="p.color" :stroke-dasharray="p.dash" :stroke-dashoffset="p.offset" stroke-linecap="butt" />
            </g>
            <text x="21" y="20.5" text-anchor="middle" class="font-serif" style="font-size: 9.5px" fill="#2B2724">{{ camembert.totalB }}</text>
            <text x="21" y="27" text-anchor="middle" style="font-size: 4.6px" fill="#8A7F75">bouteilles</text>
          </svg>
        </div>
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <span v-for="p in camembert.parts.slice(0, 4)" :key="p.cat" class="flex items-center gap-1.5 text-[11px] min-w-0">
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: p.color }"></span>
            <span class="min-w-0 truncate text-muted">{{ p.cat }}</span>
            <span class="shrink-0 font-medium">{{ p.n }}</span>
          </span>
        </div>
        <div class="shrink-0 text-right">
          <span v-if="miniStats.valeur" class="block font-serif text-base leading-none">{{ miniStats.valeur.toLocaleString('fr-FR') }} €</span>
          <span v-if="miniStats.mill" class="block text-[10px] text-muted mt-1">{{ miniStats.mill.min }}–{{ miniStats.mill.max }}</span>
          <span v-if="miniStats.note" class="block text-[10px] text-muted mt-0.5">{{ miniStats.note }}/5 <span class="text-gold">★</span></span>
        </div>
      </div>
    </button>

    <!-- Rappel actif -->
    <button v-if="rappel" @click="rappelGo" class="mt-3 w-full flex items-stretch rounded-xl2 overflow-hidden bg-accent-soft border border-accent/30 card-sh">
      <div class="w-[3px] self-stretch shrink-0 bg-accent"></div>
      <div class="flex-1 min-w-0 py-2.5 pl-4 pr-2 flex items-center gap-2.5 text-left">
        <Ic name="bell" cls="w-4 h-4 text-accent shrink-0" />
        <span class="flex-1 min-w-0">
          <span class="block text-xs font-medium text-accent">{{ rappel.t }}</span>
          <span class="block text-[11px] text-muted mt-0.5 truncate">{{ rappel.s }}</span>
        </span>
        <Ic name="chevR" cls="w-4 h-4 text-accent shrink-0" />
      </div>
    </button>

    <!-- Spiritueux du soir -->
    <button v-if="spiritux.length" @click="cave.openFiche(spiritux[0].id)" class="mt-3 w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl2 border border-chartreuse/50 bg-white card-sh text-left">
      <span class="w-2 h-2 rounded-full bg-chartreuse shrink-0"></span>
      <span class="flex-1 min-w-0">
        <span class="block text-xs font-medium truncate">{{ splitNom(spiritux[0]).domaine }}</span>
        <span class="block text-[10px] text-muted truncate">Pour l'apéro ou le digestif · ×{{ spiritux[0].quantite }}</span>
      </span>
      <Ic name="chevR" cls="w-4 h-4 text-chartreuse shrink-0" />
    </button>

    <ListesSheet :open="showListes" @close="showListes = false" @to-cave="id => { cave.db.filters.q = ''; router.push('/cave'); }" />
  </section>
</template>

<style>
/* Bulles des effervescents (carte vedette) */
@keyframes mcBulleUp { 0% { transform: translateY(0); opacity: .95 } 80% { opacity: .85 } 100% { transform: translateY(-26px); opacity: 0 } }
.bulle { animation: mcBulleUp 2.6s linear infinite; }
</style>
