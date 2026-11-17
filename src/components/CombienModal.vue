<script setup>
/* Combien en sors-tu ? — ouvert par le store (cave.combien) quand une référence
   a plusieurs bouteilles : repas de famille, soirée… on ne boit pas qu'une ! */
import { computed } from "vue";
import { useCave } from "../stores/cave.js";
import Ic from "./Ic.vue";

const cave = useCave();
const b = computed(() => cave.combien ? cave.db.bouteilles.find(x => x.id === cave.combien.id) : null);
</script>

<template>
  <div v-if="cave.combien && b" class="fixed inset-0 z-[95] flex items-end" role="dialog" aria-label="Combien de bouteilles ?">
    <div class="absolute inset-0 bg-ink/40" @click="cave.combien = null"></div>
    <div class="relative w-full bg-cream rounded-t-3xl border-t border-hairline px-5 pt-3 pb-7">
      <div class="w-10 h-1 rounded-full bg-hairline mx-auto mb-4"></div>
      <p class="font-serif text-lg text-center leading-tight px-4">{{ b.nom }}</p>
      <p class="text-[11px] text-muted text-center mt-0.5">{{ [b.cuvee, b.millesime].filter(Boolean).join(' · ') }} · ×{{ b.quantite }} en cave</p>
      <p class="text-xs text-muted text-center mt-4">Tu sors combien de bouteilles&nbsp;?</p>
      <div class="mt-2 flex items-center justify-center gap-5">
        <button @click="cave.combien.q = Math.max(1, cave.combien.q - 1)" class="w-11 h-11 rounded-full bg-white border border-hairline text-xl flex items-center justify-center active:scale-95" aria-label="Moins">−</button>
        <span class="font-serif text-3xl w-10 text-center">{{ cave.combien.q }}</span>
        <button @click="cave.combien.q = Math.min(cave.combien.max, cave.combien.q + 1)" class="w-11 h-11 rounded-full bg-white border border-hairline text-xl flex items-center justify-center active:scale-95" aria-label="Plus">+</button>
      </div>
      <div class="mt-5 flex gap-2">
        <button @click="cave.combien = null" class="flex-1 py-2.5 rounded-full bg-white border border-hairline text-sm">Annuler</button>
        <button @click="cave.boireConfirmee()" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm flex items-center justify-center gap-1.5"><Ic name="bottleEmpty" cls="w-4 h-4" /> Sortir {{ cave.combien.q }}</button>
      </div>
    </div>
  </div>
</template>
