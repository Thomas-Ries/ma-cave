<script setup>
/* Accueil « Ce soir » v2 (maquette validée, sans emoji — icônes Ic) :
   bandeau micro (salut + météo une ligne), carte vedette avec jauge d'apogée,
   3 tuiles stats tapables, rappel discret, spiritueux en une ligne.
   Sans urgence : proposition plaisir du jour, « Autre idée » pour en changer. */
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCave } from "../stores/cave.js";
import { splitNom, regionTxt, fmtListeDate, joursAvant } from "../util.js";
import ListesSheet from "../components/ListesSheet.vue";
import { classeSoir, meteoActuelle } from "../lib/soir.js";
import { CAT_COLORS } from "../config.js";
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
/* Position/prefs changées dans le Profil → on relit la météo tout de suite (le bandeau suit) */
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
  /* Même flux que « Boire » depuis la fiche : décrémente le stock, inscrit
     l'entrée dans le carnet des bues et ouvre la fiche verdict.
     Quantité > 1 → le CombienModal demande combien (géré par le store). */
  cave.boireDemande(b.id);
}
function frigoSoir() {
  const b = vedette.value?.b;
  if (!b) return;
  ceSoir.value = null; soirOff.value = true; plaisirOff.value = true;
  cave.auFrigo(b);
  cave.rappelFrigo(b);
}

/* Couleur de la vedette : la charte prend la teinte de la catégorie du vin
   (bordeaux = rouge, or = blanc, rosé, champagne, crémant, moelleux, spiritueux…) */
const vedetteCol = computed(() => CAT_COLORS[vedette.value?.b?.categorie] || "#D9C589");
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

/* ===== Warning frigo : bandeau au-dessus de la vedette ===== */
const frigoB = computed(() => cave.db.bouteilles.filter(b => b.quantite > 0 && b.cave === "Frigo"));
const nbFrigo = computed(() => frigoB.value.length);

/* ===== Rappel actif : uniquement les mises de côté (les apogées ont leur tuile) ===== */
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

/* ===== Tuiles stats → cave pré-filtrée ===== */
function versCaveApo(v) { cave.db.filters.apogee = v; cave.cavePage = 1; router.push("/cave"); }
function versCaveFrigo() { cave.db.filters.cave = "Frigo"; cave.cavePage = 1; router.push("/cave"); }

/* ===== Mini-stats : quelques chiffres sur la homepage, tap → /stats ===== */
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

    <!-- Warning frigo : bandeau au-dessus de la vedette -->
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

    <!-- Carte vedette : suggestion du soir ou proposition plaisir -->
    <div v-if="vedette" class="mt-3 rounded-xl2 border bg-white overflow-hidden card-sh" :style="{ borderColor: vedetteCol }">
      <div class="flex items-stretch">
        <div class="w-[3px] self-stretch shrink-0" :style="{ background: vedetteCol }"></div>
        <!-- Colonne visuelle : vraie photo si elle existe, silhouette sinon -->
        <button @click="cave.openFiche(vedette.b.id)" class="w-[72px] shrink-0 flex items-center justify-center overflow-hidden" :style="{ background: 'linear-gradient(to bottom, ' + vedetteCol + '33, #A8842C1A, #FAF6F1)' }" title="Ouvrir la fiche">
          <img v-if="vedette.b.photo" :src="vedette.b.photo" alt="" class="w-full h-full object-cover" />
          <svg v-else viewBox="0 0 44 84" class="h-[72px] w-[38px]" :style="{ color: vedetteCol + 'B3' }" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M19 5h6v13c0 3 8 5 8 12v44a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V30c0-7 8-9 8-12V5z" />
            <path d="M13 50h18" stroke-width="1.2" />
          </svg>
        </button>
        <div class="flex-1 min-w-0 py-3 pl-3.5 pr-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[10px] uppercase tracking-widest min-w-0 truncate" :style="{ color: vedetteCol }">{{ vedette.urgent ? 'La bouteille du soir' : "Rien d'urgent — et si on ouvrait ça ?" }}</p>
            <button @click="fermerVedette" class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-ink" title="Masquer jusqu'à demain"><Ic name="x" cls="w-3.5 h-3.5" /></button>
          </div>
          <button @click="cave.openFiche(vedette.b.id)" class="text-left mt-0.5 max-w-full">
            <p class="font-serif text-[17px] leading-snug break-words">{{ splitNom(vedette.b).domaine }}</p>
            <p class="text-[11px] text-muted mt-0.5 break-words leading-snug">{{ [splitNom(vedette.b).cuvee, vedette.b.millesime, regionTxt(vedette.b)].filter(Boolean).join(' · ') }}</p>
          </button>
          <!-- Jauge d'apogée : À garder / Apogée / Déclin, curseur bordeaux -->
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
    </div>
    <div v-else-if="!soirOff && !plaisirOff && !stockVins.length" class="mt-4 rounded-xl2 border border-hairline bg-white/60 p-4 text-center">
      <p class="font-serif text-sm">Ta cave est sereine</p>
      <p class="text-[11px] text-muted mt-1">Rien d'urgent à boire ce soir — sers ce qui te fait plaisir.</p>
    </div>

    <!-- 3 tuiles stats : code couleur (or = prêtes, bordeaux = passées, bleu = frigo), un tap → cave filtrée -->
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

    <!-- Stats : camembert par catégorie + chiffres clés, tap → page Stats complète -->
    <button v-if="miniStats.totalB" @click="router.push('/stats')" class="mt-3 w-full rounded-xl2 bg-white border border-hairline px-3.5 py-3 text-left card-sh">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[10px] text-muted uppercase tracking-widest">Ta cave en chiffres</p>
        <span class="flex items-center gap-1 text-[10px] text-accent">Tout voir <Ic name="chevR" cls="w-3 h-3" /></span>
      </div>
      <div class="flex items-center gap-3.5 mt-2.5">
        <!-- Camembert par catégorie (anneau, couleurs de la charte) -->
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
        <!-- Légende : catégories dominantes -->
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <span v-for="p in camembert.parts.slice(0, 4)" :key="p.cat" class="flex items-center gap-1.5 text-[11px] min-w-0">
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: p.color }"></span>
            <span class="min-w-0 truncate text-muted">{{ p.cat }}</span>
            <span class="shrink-0 font-medium">{{ p.n }}</span>
          </span>
        </div>
        <!-- Chiffres clés -->
        <div class="shrink-0 text-right">
          <span v-if="miniStats.valeur" class="block font-serif text-base leading-none">{{ miniStats.valeur.toLocaleString('fr-FR') }} €</span>
          <span v-if="miniStats.mill" class="block text-[10px] text-muted mt-1">{{ miniStats.mill.min }}–{{ miniStats.mill.max }}</span>
          <span v-if="miniStats.note" class="block text-[10px] text-muted mt-0.5">{{ miniStats.note }}/5 <span class="text-gold">★</span></span>
        </div>
      </div>
    </button>

    <!-- Rappel actif : une ligne discrète, le plus urgent seulement -->
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

    <!-- Spiritueux du soir : une ligne tappable -->
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
