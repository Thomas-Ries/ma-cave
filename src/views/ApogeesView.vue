<script setup>
/* Apogées : à boire / bientôt / passé — avec rappel d'injecter openFiche */
import { computed, inject } from "vue";
import { useCave } from "../stores/cave.js";
import { splitNom, cepageCourt } from "../util.js";
import Ic from "../components/Ic.vue";

const cave = useCave();
const openFiche = inject("openFiche");
const year = new Date().getFullYear();

/* Code couleur repos : riesling (à boire) → or (bientôt) → bordeaux (passées), plus soutenu quand actif */
const FILTRES = [
  { id: "boire", t: "À boire", d: "En apogée cette année", cls: "bg-riesling/30 border-riesling", num: "text-riesling-ink", repos: "bg-riesling/15 border-riesling/50" },
  { id: "bientot", t: "Bientôt", d: "Dans 2 ans maximum", cls: "bg-gold/20 border-gold", num: "text-gold", repos: "bg-gold/10 border-gold/30" },
  { id: "passe", t: "Passées", d: "À boire sans attendre", cls: "bg-accent border-accent text-white", num: "text-accent", repos: "bg-accent-soft border-accent/30" }
];

const items = computed(() => cave.apoItems);
const badge = (it) => {
  const d = it.est.debut, f = it.est.fin ?? d;
  if (year > f) return { t: "à boire sans attendre", c: "text-white bg-accent" };
  if (year >= d) return { t: "en apogée", c: "text-ink bg-riesling" };
  if (d - year <= 2) return { t: "bientôt prête", c: "text-gold bg-gold/10" };
  return { t: "à garder", c: "text-muted bg-cream" };
};
</script>

<template>
  <section class="p-4">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-[10px] text-muted uppercase tracking-widest">Ma Cave</p>
        <h1 class="font-serif text-2xl leading-tight">Apogées</h1>
        <p class="text-xs text-muted mt-0.5">{{ cave.apogeeStats.boire }} à boire · {{ cave.apogeeStats.bientot }} bientôt · {{ cave.apogeeStats.passe }} passées</p>
      </div>
      <button @click="cave.apoAlerte = !cave.apoAlerte" class="shrink-0 w-11 h-11 rounded-full border flex items-center justify-center" :class="cave.apoAlerte ? 'border-accent text-accent bg-accent/10' : 'border-hairline text-muted'" title="Activer les notifications d'apogée">
        <Ic name="bell" cls="w-5 h-5" /><span v-if="cave.apoAlerte" class="absolute mt-[-30px] ml-[30px] w-1.5 h-1.5 rounded-full bg-accent"></span>
      </button>
    </div>

    <div class="grid grid-cols-3 gap-2 mt-4">
      <button v-for="f in FILTRES" :key="f.id" @click="cave.apoAlerte = cave.apoAlerte === f.id ? null : f.id" class="p-3 rounded-xl2 border text-left transition" :class="cave.apoAlerte === f.id ? f.cls + ' shadow-sm' : f.repos">
        <p class="text-sm font-medium">{{ f.t }}</p>
        <p class="text-[11px] text-muted mt-0.5">{{ f.d }}</p>
        <p class="font-serif text-xl mt-1 tabular-nums" :class="f.num">{{ cave.apogeeStats[f.id] }}</p>
      </button>
    </div>

    <div v-if="items.length" class="mt-4">
      <button v-for="it in items" :key="it.b.id" @click="openFiche(it.b.id, 'apogees')" class="w-full text-left bg-white border border-hairline rounded-xl2 p-3 mb-2 flex items-center gap-3">
        <span class="w-2 h-2 rounded-full shrink-0" :style="'background:' + (cave.CAT_COLORS[it.b.categorie] || '#8A7F75')"></span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm font-medium">{{ splitNom(it.b).domaine }}<span v-if="splitNom(it.b).cuvee" class="text-muted"> {{ splitNom(it.b).cuvee }}</span></span>
          <span class="block text-[11px] text-muted mt-0.5">{{ [it.b.millesime, cepageCourt(it.b), it.est.debut + '–' + (it.est.fin ?? it.est.debut)].filter(Boolean).join(' · ') }}</span>
        </span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" :class="badge(it).c">{{ badge(it).t }}</span>
      </button>
    </div>
    <p v-else class="text-sm text-muted text-center py-10">Aucune bouteille dans ce filtre.</p>
  </section>
</template>
