<script setup>
/* Stats : compteurs, note moyenne, répartition par catégorie */
import { computed } from "vue";
import { useCave } from "../stores/cave.js";

const cave = useCave();
const st = computed(() => cave.stats);
const cats = computed(() => {
  const m = new Map();
  for (const b of cave.db.bouteilles.filter(b => b.quantite > 0)) m.set(b.categorie, (m.get(b.categorie) || 0) + b.quantite);
  const tot = [...m.values()].reduce((s, x) => s + x, 0) || 1;
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([cat, n]) => ({ cat, n, pct: Math.round(n * 100 / tot) }));
});
</script>

<template>
  <section class="p-4">
    <p class="text-[10px] text-muted uppercase tracking-widest">Ma Cave</p>
    <h1 class="font-serif text-2xl leading-tight">Stats</h1>

    <div class="grid grid-cols-2 gap-2 mt-4">
      <div class="bg-white border border-hairline rounded-xl2 p-4">
        <p class="text-[10px] text-muted uppercase tracking-widest">Bouteilles</p>
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ st.totalB }}</p>
      </div>
      <div class="bg-white border border-hairline rounded-xl2 p-4">
        <p class="text-[10px] text-muted uppercase tracking-widest">Références</p>
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ st.refs }}</p>
      </div>
      <div class="bg-white border border-hairline rounded-xl2 p-4">
        <p class="text-[10px] text-muted uppercase tracking-widest">Valeur</p>
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ st.valeur ? st.valeur + ' €' : '—' }}</p>
        <p v-if="st.valeur" class="text-[11px] text-muted mt-0.5">prix connus uniquement</p>
      </div>
      <div class="bg-white border border-hairline rounded-xl2 p-4">
        <p class="text-[10px] text-muted uppercase tracking-widest">Bues</p>
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ st.buesCount }}</p>
        <p v-if="st.avgNote" class="text-[11px] text-muted mt-0.5">note moyenne {{ st.avgNote }}/100</p>
      </div>
    </div>

    <p class="text-[10px] text-muted uppercase tracking-widest mt-5">Répartition par catégorie</p>
    <div class="mt-2 space-y-2">
      <div v-for="c in cats" :key="c.cat" class="bg-white border border-hairline rounded-xl2 px-3 py-2.5 flex items-center gap-3">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background:' + (cave.CAT_COLORS[c.cat] || '#8A7F75')"></span>
        <span class="flex-1 min-w-0">
          <span class="flex justify-between text-sm"><span class="truncate">{{ c.cat }}</span><span class="text-muted tabular-nums shrink-0 ml-2">{{ c.n }}</span></span>
          <span class="block h-1.5 bg-cream rounded-full mt-1 overflow-hidden"><span class="block h-full rounded-full" :style="'width:' + c.pct + '%;background:' + (cave.CAT_COLORS[c.cat] || '#8A7F75')"></span></span>
        </span>
      </div>
    </div>
  </section>
</template>
