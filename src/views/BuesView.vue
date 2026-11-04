<script setup>
/* Bues : historique, tri par date */
import { computed } from "vue";
import { useCave } from "../stores/cave.js";
import { splitNom } from "../util.js";
import Ic from "../components/Ic.vue";

const cave = useCave();
const bues = computed(() => [...(cave.db.bues || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")));
const noteMoy = computed(() => {
  const n = bues.value.filter(b => b.note != null).map(b => b.note);
  return n.length ? Math.round(n.reduce((s, x) => s + x, 0) / n.length) : null;
});
</script>

<template>
  <section class="p-4">
    <p class="text-[10px] text-muted uppercase tracking-widest">Ma Cave</p>
    <h1 class="font-serif text-2xl leading-tight">Bues</h1>
    <p class="text-xs text-muted mt-0.5">{{ bues.length }} bouteille{{ bues.length > 1 ? 's' : '' }} bues<span v-if="noteMoy"> · note moyenne {{ noteMoy }}/100</span></p>

    <div v-if="bues.length" class="mt-4">
      <button v-for="h in bues" :key="h.id" @click="cave.buesFiche = h.id" class="w-full text-left bg-white border border-hairline rounded-xl2 p-3 mb-2 flex items-center gap-3">
        <span class="w-2 h-2 rounded-full shrink-0" :style="'background:' + (cave.CAT_COLORS[h.categorie] || '#8A7F75')"></span>
        <span class="flex-1 min-w-0">
          <span class="block truncate text-sm font-medium">{{ h.nom }}</span>
          <span class="block text-[11px] text-muted mt-0.5">{{ new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }}<span v-if="h.millesime"> · {{ h.millesime }}</span></span>
          <span v-if="h.occasion || h.avec" class="block text-[11px] text-accent mt-0.5 truncate"><span v-if="h.occasion">{{ h.occasion }}</span><span v-if="h.occasion && h.avec"> · </span><span v-if="h.avec">{{ h.avec }}</span></span>
        </span>
        <span v-if="h.note != null" class="font-serif text-lg tabular-nums shrink-0">{{ h.note }}</span>
      </button>
    </div>
    <div v-else class="py-16 text-center">
      <p class="font-serif text-lg">Rien de bu pour l'instant</p>
      <p class="text-sm text-muted mt-1">Bois une bouteille depuis la cave, elle apparaîtra ici avec sa note.</p>
    </div>
  </section>
</template>
