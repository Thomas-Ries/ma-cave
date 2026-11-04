<script setup>
/* Accords : que boire ce soir, recherche de plat, familles */
import { ref, computed, inject, watch } from "vue";
import { useCave } from "../stores/cave.js";
import { PLATS, FAMILLES, OCCASIONS, trouvePlat, accordsPour, platsPourBouteille, bouteillesPourOccasion } from "../lib/accords.js";
import { accTxt, joursAvant } from "../util.js";
import Ic from "../components/Ic.vue";

const cave = useCave();
const openFiche = inject("openFiche");
const year = new Date().getFullYear();

const q = ref("");
const fam = ref(null);
const plat = ref(null);
const occasion = ref(null);

const searchPlat = () => {
  const p = trouvePlat(q.value.trim());
  if (p) plat.value = p; else cave.toast("Pas de plat trouvé pour « " + q.value.trim() + " »");
};

const platsAffiches = computed(() => {
  let list = PLATS;
  if (fam.value) list = list.filter(p => p.famille === fam.value);
  return list;
});

const dansTaCave = (p) => bouteillesPourOccasion(p.id, cave.db.bouteilles.filter(b => b.quantite > 0), year).length;
/* Compteur lisible : 0 → « aucune », 1-5 → chiffre exact, au-delà → « 5+ » */
const dansTaCaveTxt = (p) => { const n = dansTaCave(p); return n === 0 ? "aucune" : (n > 5 ? "5+" : String(n)); };
const accsDuPlat = computed(() => plat.value ? accordsPour(plat.value, cave.db.bouteilles.filter(b => b.quantite > 0), year) : []);
const voirPlus = ref(false);
watch(plat, () => { voirPlus.value = false; });

/* ---------- Recherche inversée : une bouteille en tête ---------- */
/* On cherche par n'importe quoi : nom du vin ou du domaine, cuvée, cépage,
   région, appellation, catégorie. On retient une BOUTEILLE → ses plats. */
const normC = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const qVin = ref("");
const bSel = ref(null);
const stockVif = computed(() => cave.db.bouteilles.filter(b => b.quantite > 0));
const matchBouteilles = computed(() => {
  const q = normC(qVin.value);
  if (q.length < 2) return [];
  const champs = b => [b.nom, b.cuvee, b.cepage, b.region, b.appellation, b.categorie, b.pays].map(normC);
  const scoring = b => { let s = 0; if (champs(b).some(v => v === q)) s += 2; if (champs(b).some(v => v.includes(q))) s += 1; return s; };
  return stockVif.value.filter(b => champs(b).some(v => v.includes(q)))
    .sort((a, b) => scoring(b) - scoring(a) || (a.nom || "").localeCompare(b.nom || "", "fr"))
    .slice(0, 6);
});
const platsDeLaBouteille = computed(() => bSel.value ? platsPourBouteille(bSel.value, year) : []);
function choisirBouteille(b) { bSel.value = b; qVin.value = ""; }
</script>

<template>
  <section class="p-4">
    <p class="text-[10px] text-muted uppercase tracking-widest">Ma Cave</p>
    <h1 class="font-serif text-2xl leading-tight">Accords</h1>

    <!-- Que boire ce soir ? -->
    <h2 class="font-serif text-lg mt-4">Que boire ce soir ?</h2>
    <div class="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar pb-0.5">
      <button v-for="o in OCCASIONS" :key="o.id" @click="occasion = occasion === o.id ? null : o.id" class="shrink-0 px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5" :class="occasion === o.id ? 'bg-accent text-white border-accent' : 'border-hairline bg-white'">
        <Ic :name="o.icon || 'sparkles'" cls="w-3.5 h-3.5" /> {{ o.nom }}
      </button>
    </div>

    <div v-if="occasion" class="mt-3 space-y-2">
      <button v-for="r in bouteillesPourOccasion(occasion, cave.db.bouteilles.filter(x => x.quantite > 0), year).slice(0, 5)" :key="r.b.id" @click="openFiche(r.b.id, 'accords')" class="w-full bg-white border border-hairline rounded-xl2 p-3 flex items-center gap-3 text-left">
        <span class="w-2 h-2 rounded-full shrink-0" :style="'background:' + (cave.CAT_COLORS[r.b.categorie] || '#8A7F75')"></span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm font-medium">{{ r.b.nom }}</span>
          <span class="block text-[11px] text-muted">{{ [r.b.millesime, r.b.categorie].filter(Boolean).join(' · ') }}</span>
        </span>
      </button>
    </div>

    <!-- Recherche inversée : une bouteille en tête -->
    <h2 class="font-serif text-lg mt-6">Une bouteille en tête ?</h2>
    <div class="flex gap-2 mt-2">
      <div class="flex-1 relative">
        <input v-model="qVin" placeholder="Un vin, un domaine, une région…" class="w-full bg-white border border-hairline rounded-full pl-9 pr-4 py-2 text-sm" @input="bSel = null" />
        <Ic name="search" cls="w-4 h-4 absolute left-3.5 top-2.5 text-muted" />
      </div>
    </div>
    <div v-if="matchBouteilles.length" class="mt-2 space-y-1.5">
      <button v-for="b in matchBouteilles" :key="b.id" @click="choisirBouteille(b)" class="w-full bg-white border border-hairline rounded-xl2 p-2.5 flex items-center gap-3 text-left">
        <span class="w-2 h-2 rounded-full shrink-0" :style="'background:' + (cave.CAT_COLORS[b.categorie] || '#8A7F75')"></span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm font-medium">{{ b.nom }}</span>
          <span class="block text-[11px] text-muted truncate">{{ [b.millesime, b.cuvee, b.cepage || b.region, b.cave].filter(Boolean).join(' · ') }}</span>
        </span>
      </button>
    </div>
    <p v-else-if="qVin.length > 1 && !bSel" class="text-[11px] text-muted mt-2">Aucune bouteille en cave pour « {{ qVin }} ».</p>
    <div v-if="bSel" class="mt-3">
      <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">Avec ton {{ bSel.nom }}{{ bSel.millesime ? ' ' + bSel.millesime : '' }}</p>
      <div class="space-y-2">
        <button v-for="r in platsDeLaBouteille" :key="r.plat.id" @click="plat = r.plat" class="w-full bg-white border border-hairline rounded-xl2 p-3 flex items-center gap-3 text-left">
          <Ic name="sparkles" cls="w-4 h-4 text-gold shrink-0" />
          <span class="flex-1 min-w-0">
            <span class="block truncate text-sm font-medium">{{ accTxt(r.plat.nom) }}</span>
            <span class="block text-[11px] text-muted">{{ r.pourquoi.join(" · ") }}</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Recherche plat -->
    <div class="flex gap-2 mt-5">
      <div class="flex-1 relative">
        <input v-model="q" placeholder="Un plat ? Un ingrédient ?" class="w-full bg-white border border-hairline rounded-full pl-10 pr-4 py-2 text-sm" @keydown.enter.prevent="searchPlat" />
        <Ic name="search" cls="w-4 h-4 absolute left-3.5 top-2.5 text-muted" />
      </div>
      <button @click="searchPlat" class="px-4 rounded-full bg-accent text-white text-sm">Trouver</button>
    </div>

    <!-- Familles -->
    <div class="flex gap-1.5 mt-4 overflow-x-auto no-scrollbar pb-0.5">
      <button @click="fam = null" class="shrink-0 px-3 py-1.5 rounded-full border text-xs" :class="!fam ? 'bg-ink text-white border-ink' : 'border-hairline bg-white'">Tout</button>
      <button v-for="f in FAMILLES" :key="f" @click="fam = fam === f ? null : f" class="shrink-0 px-3 py-1.5 rounded-full border text-xs" :class="fam === f ? 'bg-ink text-white border-ink' : 'border-hairline bg-white'">{{ f }}</button>
    </div>

    <!-- Grille plats -->
    <div class="grid grid-cols-2 gap-2 mt-3">
      <button v-for="p in platsAffiches" :key="p.id" @click="plat = p" class="bg-white border border-hairline rounded-xl2 p-3 text-left">
        <p class="text-sm font-medium leading-tight">{{ accTxt(p.nom) }}</p>
        <p class="text-[11px] text-muted mt-0.5 line-clamp-2">{{ accTxt(p.desc) }}</p>
        <p class="text-[11px] mt-1.5" :class="dansTaCave(p) ? 'text-accent' : 'text-muted'">Dans ta cave : {{ dansTaCaveTxt(p) }}</p>
      </button>
    </div>

    <!-- Modale plat -->
    <div v-if="plat" class="fixed inset-0 z-30 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4" @click.self="plat = null">
      <div class="bg-white rounded-t-xl2 md:rounded-xl2 w-full max-w-md max-h-[85vh] overflow-y-auto p-5">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] text-muted uppercase tracking-widest">{{ plat.famille }}</p>
            <h3 class="font-serif text-xl">{{ accTxt(plat.nom) }}</h3>
          </div>
          <button @click="plat = null" class="text-muted p-2 -m-2" title="Fermer"><Ic name="x" cls="w-5 h-5" /></button>
        </div>
        <p class="text-xs text-muted mt-1">{{ accTxt(plat.desc) }}</p>

        <p class="text-[10px] text-muted uppercase tracking-widest mt-4">{{ voirPlus ? 'Tous les accords (' + accsDuPlat.length + ')' : 'Top 3 de ta cave' }}</p>
        <div v-if="accsDuPlat.length" class="mt-2 space-y-2">
          <button v-for="(a, i) in accsDuPlat.slice(0, voirPlus ? 50 : 3)" :key="i" @click="openFiche(a.b.id, 'accords'); plat = null" class="w-full text-left bg-cream rounded-xl2 p-3 flex items-center gap-3">
            <span class="font-serif text-lg tabular-nums w-6 text-center">{{ i + 1 }}</span>
            <span class="flex-1 min-w-0">
              <span class="block truncate text-sm font-medium">{{ a.b.nom }}{{ a.b.millesime ? ' ' + a.b.millesime : '' }}</span>
              <span class="block text-[11px] text-muted">{{ (a.pourquoi || []).map(accTxt).join(' · ') }}</span>
            </span>
          </button>
        </div>
        <p v-else class="text-sm text-muted mt-2">Aucune bouteille idéale en cave — l'occasion de craquer pour une nouvelle référence.</p>

        <button v-if="accsDuPlat.length > 3" @click="voirPlus = !voirPlus" class="mt-2 w-full py-2 rounded-full border border-hairline text-xs text-muted flex items-center justify-center gap-1.5">
          <Ic name="chevron" cls="w-3.5 h-3.5" :class="voirPlus ? 'rotate-180' : ''" /> {{ voirPlus ? 'Réduire aux 3 meilleurs' : 'Voir plus d\'accords (' + (accsDuPlat.length - 3) + ' autres)' }}
        </button>

        <p v-if="plat.eviter && plat.eviter.length" class="text-[10px] text-muted uppercase tracking-widest mt-4">À éviter</p>
        <p v-if="plat.eviter && plat.eviter.length" class="text-xs text-muted mt-1">{{ plat.eviter.join(' · ') }}</p>

        <button @click="plat = null" class="mt-4 w-full py-2.5 rounded-full border border-hairline text-sm text-muted">Fermer</button>
      </div>
    </div>
  </section>
</template>
