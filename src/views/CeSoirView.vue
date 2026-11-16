<script setup>
/* Accueil « Ce soir » (Variante A validée en preview) :
   la suggestion du soir devient une carte vedette, les compteurs d'apogée
   mènent directement à l'onglet filtré, et les rachats fréquents permettent
   de rentrer un achat en un tap. La logique du soir vient de CaveView (v52). */
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCave } from "../stores/cave.js";
import { splitNom, regionTxt, tempService } from "../util.js";
import { classeSoir, meteoActuelle } from "../lib/soir.js";
import Ic from "../components/Ic.vue";

const cave = useCave();
const router = useRouter();

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const now = new Date();
const jour = JOURS[now.getDay()];
const h = now.getHours();
const salut = (h >= 17 || h < 5) ? "Bonsoir" : "Bonjour";
const prenom = computed(() => (cave.PROFILS[cave.PROFIL]?.nom || "").split(" ")[0]);

/* ===== Suggestion du soir (déplacée de CaveView) ===== */
const ceSoir = ref(null);
const meteo = ref(null);
const prefsSoir = ref(cave.soirPrefs());
watch(() => cave.soirVersion, () => { prefsSoir.value = cave.soirPrefs(); initSoir(); });
const ceSoirTemp = computed(() => ceSoir.value ? tempService(ceSoir.value.b) : null);
const soirKey = () => cave.pKeys.db + "-soir";
function soirState() { try { return JSON.parse(localStorage.getItem(soirKey()) || "null") } catch { return null } }
function saveSoir(s) { try { localStorage.setItem(soirKey(), JSON.stringify(s)) } catch {} }
function classeDuSoir() { return classeSoir(cave.soirItems, prefsSoir.value, meteo.value); }
const soirOff = ref(false);
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
function fermerSoir() { ceSoir.value = null; soirOff.value = true; }
function sortirSoir() {
  const b = ceSoir.value?.b;
  if (!b) return;
  ceSoir.value = null; soirOff.value = true;
  cave.toast(`${b.nom} sortie pour ce soir — santé !`);
}
function frigoSoir() {
  const b = ceSoir.value?.b;
  if (!b) return;
  ceSoir.value = null; soirOff.value = true;
  cave.auFrigo(b);
  cave.rappelFrigo(b);
}
onMounted(() => initSoir());

/* ===== Compteurs d'apogée → onglet Apogées pré-filtré ===== */
function versApo(id) { cave.apoDemande = id; router.push("/apogees"); }

/* ===== Rachats fréquents : les références les plus fournies de la cave ===== */
const rachats = computed(() => cave.topRachats);
function plusUn(b) { cave.plusUn(b); }
function autreAchat() { cave.ouvrirAjout = true; router.push("/cave"); }
function ouvrirAjouter() { cave.ouvrirAjout = true; router.push("/cave"); }
function versEnvies() { router.push("/envies"); }
function versCave() { router.push("/cave"); }

/* ===== Compteurs de la cave ===== */
const nbRefs = computed(() => cave.db.bouteilles.filter(b => b.quantite > 0).length);
const nbBouteilles = computed(() => cave.db.bouteilles.reduce((n, b) => n + (b.quantite > 0 ? b.quantite : 0), 0));
</script>

<template>
  <section class="p-4">
    <!-- En-tête : salutation + envies + ajout -->
    <div class="flex items-end justify-between gap-3">
      <div>
        <p class="text-[10px] text-muted uppercase tracking-widest">Ce soir · {{ jour.toLowerCase() }}</p>
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

    <!-- Carte vedette : suggestion du soir -->
    <div v-if="ceSoir" class="mt-3 rounded-xl2 border border-riesling bg-white overflow-hidden card-sh">
      <div class="flex items-stretch">
        <div class="w-[3px] self-stretch shrink-0 bg-riesling"></div>
        <div class="flex-1 min-w-0 py-3 pl-4 pr-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[10px] text-riesling-ink uppercase tracking-widest">{{ meteo ? 'Il fait ' + meteo.t + ' °C — sers plutôt…' : 'Ce soir, sers plutôt…' }}</p>
            <span v-if="ceSoirTemp" class="text-[10px] text-muted shrink-0">{{ ceSoirTemp.c }} · {{ ceSoirTemp.t }}</span>
            <button @click="fermerSoir" class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-ink" title="Masquer jusqu'à demain"><Ic name="x" cls="w-3.5 h-3.5" /></button>
          </div>
          <button @click="cave.openFiche(ceSoir.b.id)" class="text-left mt-0.5 max-w-full">
            <p class="font-serif text-[17px] leading-snug break-words">{{ splitNom(ceSoir.b).domaine }}</p>
            <p class="text-[11px] text-muted mt-0.5 break-words leading-snug">{{ [splitNom(ceSoir.b).cuvee, ceSoir.b.millesime, regionTxt(ceSoir.b)].filter(Boolean).join(' · ') }}</p>
          </button>
          <div v-if="ceSoir.r.length" class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span v-for="r in ceSoir.r" :key="r" class="text-[10px] px-1.5 py-0.5 rounded-full bg-riesling/40 text-ink">{{ r }}</span>
          </div>
          <div class="flex gap-2 mt-3">
            <button @click="sortirSoir" class="flex-1 py-2.5 rounded-xl2 bg-accent text-white text-[11px] flex items-center justify-center gap-1.5"><Ic name="bottleEmpty" cls="w-3.5 h-3.5" /> Sortir</button>
            <button @click="frigoSoir" class="flex-1 py-2.5 rounded-xl2 border border-accent/40 text-accent text-[11px] flex items-center justify-center gap-1.5"><Ic name="snow" cls="w-3.5 h-3.5" /> Au frigo</button>
            <button @click="pickSoir(true)" class="flex-1 py-2.5 rounded-xl2 border border-gold/60 text-gold text-[11px] flex items-center justify-center gap-1.5" title="Proposer une autre bouteille"><Ic name="sparkles" cls="w-3.5 h-3.5" /> Une autre idée</button>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!soirOff" class="mt-3 rounded-xl2 border border-hairline bg-white/60 p-4 text-center">
      <p class="font-serif text-sm">Ta cave est sereine</p>
      <p class="text-[11px] text-muted mt-1">Rien d'urgent à boire ce soir — sers ce qui te fait plaisir.</p>
    </div>

    <!-- Compteurs d'apogée -->
    <div v-if="cave.apogeeStats.boire + cave.apogeeStats.bientot + cave.apogeeStats.passe > 0" class="flex gap-2 mt-3">
      <button @click="versApo('boire')" class="flex-1 py-2 rounded-xl2 border border-riesling/60 bg-riesling/15 text-center">
        <p class="font-serif text-lg leading-none text-riesling-ink">{{ cave.apogeeStats.boire }}</p>
        <p class="text-[10px] text-muted mt-1">à boire</p>
      </button>
      <button @click="versApo('bientot')" class="flex-1 py-2 rounded-xl2 border border-gold/30 bg-gold/10 text-center">
        <p class="font-serif text-lg leading-none text-gold">{{ cave.apogeeStats.bientot }}</p>
        <p class="text-[10px] text-muted mt-1">bientôt</p>
      </button>
      <button @click="versApo('passe')" class="flex-1 py-2 rounded-xl2 border border-accent/30 bg-accent-soft text-center">
        <p class="font-serif text-lg leading-none text-accent">{{ cave.apogeeStats.passe }}</p>
        <p class="text-[10px] text-muted mt-1">passées</p>
      </button>
    </div>

    <!-- Rachats fréquents -->
    <p class="mt-5 mb-2 text-[10px] text-muted uppercase tracking-widest">Un achat à rentrer ?</p>
    <div class="flex gap-1.5 flex-wrap">
      <button v-for="b in rachats" :key="b.id" @click="plusUn(b)" class="px-3 py-2 rounded-full border border-hairline bg-white text-xs flex items-center gap-1.5 active:scale-95 transition-transform" :title="'Ajouter une ' + b.nom + ' à la cave'">
        <span class="max-w-[150px] truncate">{{ splitNom(b).domaine }}</span>
        <span class="font-semibold text-accent">+1</span>
      </button>
      <button @click="autreAchat" class="px-3 py-2 rounded-full border border-dashed border-hairline bg-white text-xs text-muted">Autre…</button>
    </div>

    <!-- Raccourci cave -->
    <div class="border-t border-hairline mt-5 pt-4 flex items-center justify-between">
      <div>
        <p class="text-sm font-medium">Ta cave</p>
        <p class="text-[11px] text-muted mt-0.5">{{ nbBouteilles }} bouteille{{ nbBouteilles > 1 ? 's' : '' }} · {{ nbRefs }} référence{{ nbRefs > 1 ? 's' : '' }}</p>
      </div>
      <button @click="versCave" class="px-4 py-2 rounded-full border border-hairline bg-white text-xs text-accent flex items-center gap-1.5">Ouvrir <Ic name="chevR" cls="w-3.5 h-3.5" /></button>
    </div>
  </section>
</template>
