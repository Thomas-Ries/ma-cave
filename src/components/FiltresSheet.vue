<script setup>
import { watch } from "vue";
import { useCave } from "../stores/cave.js";
import Ic from "./Ic.vue";

const cave = useCave();
const props = defineProps({ open: Boolean });
const emit = defineEmits(["close"]);
watch(() => props.open, v => cave.overlay("filtres", v));

const s = cave;
const list = cave.visible;
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-end" role="dialog">
    <div class="absolute inset-0 bg-ink/40" @click="emit('close')"></div>
    <div class="relative w-full bg-cream rounded-t-3xl border-t border-hairline px-5 pt-3 pb-6 max-h-[85vh] overflow-y-auto">
      <div class="w-10 h-1 rounded-full bg-hairline mx-auto mb-4"></div>
      <h3 class="font-serif text-lg mb-2">Filtres &amp; tri</h3>
      <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">Catégorie</p>
      <div class="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
        <button v-for="c in s.CATS" :key="c" @click="s.db.filters.cat = c" class="shrink-0 px-3.5 py-1.5 rounded-full text-xs border transition" :class="s.db.filters.cat === c ? 'bg-accent text-white border-accent' : 'bg-white text-ink border-hairline'">{{ c }}</button>
      </div>
      <div class="space-y-4 mt-1">
        <div>
          <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5 mt-2">Cave</p>
          <select :value="s.db.filters.cave" @change="s.db.filters.cave = $event.target.value" class="w-full bg-white border border-hairline rounded-full px-3 py-2.5 text-sm">
            <option value="Toutes">Toutes</option>
            <option v-for="c in [...new Set(s.db.bouteilles.filter(b => b.quantite > 0).map(b => b.cave || 'Principale'))].filter(c => c && c !== 'Toutes')" :key="c">{{ c }}</option>
          </select>
        </div>
        <div>
          <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">Région</p>
          <select :value="s.db.filters.region" @change="s.db.filters.region = $event.target.value" class="w-full bg-white border border-hairline rounded-full px-3 py-2.5 text-sm">
            <option value="Toutes">Toutes</option>
            <option v-for="r in [...new Set(s.db.bouteilles.filter(b => b.quantite > 0).map(b => (b.region || '').trim()).filter(Boolean))].sort((a, z) => a.localeCompare(z, 'fr'))" :key="r">{{ r }}</option>
          </select>
        </div>
        <div>
          <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">Tri</p>
          <select :value="s.db.filters.tri" @change="s.db.filters.tri = $event.target.value" class="w-full bg-white border border-hairline rounded-full px-3 py-2.5 text-sm">
            <option value="">Tri : défaut</option>
            <option value="recent">Récemment ajoutées</option>
            <option value="apogee">Apogée ↑</option>
            <option value="nom">Nom</option>
            <option value="millesime">Millésime ↓</option>
            <option value="prix">Prix ↓</option>
            <option value="format">Format</option>
          </select>
        </div>
      </div>
      <div class="flex gap-3 mt-5">
        <button @click="s.db.filters.cat = 'Toutes'; s.db.filters.cave = 'Toutes'; s.db.filters.region = 'Toutes'; s.db.filters.tri = ''; s.apogeeFiltre = false; s.save()" class="flex-1 py-2.5 rounded-full bg-white border border-hairline text-sm">Réinitialiser</button>
        <button @click="emit('close')" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">Afficher {{ list.length }} réf.</button>
      </div>
    </div>
  </div>
</template>
