<script setup>
/* Mes coups de cœur : les vins marqués d'un cœur (sur une bue du carnet ou une
   bouteille de cave). Deux sections : ce qu'il reste en cave, et les souvenirs. */
import { computed } from "vue";
import { useCave } from "../stores/cave.js";
import Ic from "../components/Ic.vue";

const cave = useCave();

const enCave = computed(() =>
  (cave.db.bouteilles || []).filter(b => b.quantite > 0 && cave.estCoeur(b))
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || "")));
const bues = computed(() =>
  [...(cave.db.bues || [])].filter(h => cave.estCoeur(h))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")));
</script>

<template>
  <section class="p-4">
    <p class="text-[10px] text-muted uppercase tracking-widest">Ma Cave</p>
    <h1 class="font-serif text-2xl leading-tight">Mes coups de cœur</h1>
    <p class="text-xs text-muted mt-0.5">Les vins que tu as marqués ❤️ — marqués depuis le carnet ou la cave.</p>

    <div v-if="enCave.length" class="mt-5">
      <p class="text-[10px] text-muted uppercase tracking-widest mb-2">Encore en cave · {{ enCave.length }}</p>
      <button v-for="b in enCave" :key="b.id" @click="cave.openFiche(b.id)" class="w-full text-left bg-white border border-hairline rounded-xl2 p-3 mb-2 flex items-center gap-3">
        <span class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center" :style="'background:' + (cave.CAT_COLORS[b.categorie] || '#8A7F75') + '22'"><span class="w-3.5 h-3.5 rounded-full" :style="'background:' + (cave.CAT_COLORS[b.categorie] || '#8A7F75')"></span></span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm font-medium">{{ b.nom }}</span>
          <span class="block text-[11px] text-muted mt-0.5">{{ b.cave }}<span v-if="b.millesime"> · {{ b.millesime }}</span> · ×{{ b.quantite }}</span>
        </span>
        <span class="text-accent shrink-0"><Ic name="heart" cls="w-5 h-5 fill-current" /></span>
      </button>
    </div>

    <div v-if="bues.length" class="mt-5">
      <p class="text-[10px] text-muted uppercase tracking-widest mb-2">Dans le carnet · {{ bues.length }}</p>
      <button v-for="h in bues" :key="h.id" @click="cave.buesFiche = h.id" class="w-full text-left bg-white border border-hairline rounded-xl2 p-3 mb-2 flex items-center gap-3">
        <span class="w-2 h-2 rounded-full shrink-0" :style="'background:' + (cave.CAT_COLORS[h.categorie] || '#8A7F75')"></span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm font-medium">{{ h.nom }}</span>
          <span class="block text-[11px] text-muted mt-0.5">Bue le {{ new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }}<span v-if="h.millesime"> · {{ h.millesime }}</span></span>
        </span>
        <span v-if="h.note != null" class="font-serif text-lg tabular-nums shrink-0">{{ h.note }}</span>
        <span class="text-accent shrink-0"><Ic name="heart" cls="w-4 h-4 fill-current" /></span>
      </button>
    </div>

    <div v-if="!enCave.length && !bues.length" class="py-16 text-center">
      <p class="font-serif text-lg">Aucun cœur pour l'instant</p>
      <p class="text-sm text-muted mt-1">Touche le cœur sur une dégustation du carnet, ou depuis la fiche d'une bouteille bue.</p>
    </div>
  </section>
</template>
