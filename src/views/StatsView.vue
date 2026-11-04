<script setup>
/* Stats : compteurs, notes, répartitions (catégorie, région), activité, coups de cœur */
import { computed } from "vue";
import { useCave } from "../stores/cave.js";

const cave = useCave();
const st = computed(() => cave.stats);

/* Palette pour les régions (tour des teintes de la charte) */
const PALETTE = ["#7A2E3E", "#D9C589", "#8A7F75", "#2B2724", "#B0563F", "#5C6B57", "#A67B5B"];

const cats = computed(() => {
  const m = new Map();
  for (const b of cave.db.bouteilles.filter(b => b.quantite > 0)) m.set(b.categorie, (m.get(b.categorie) || 0) + b.quantite);
  const tot = [...m.values()].reduce((s, x) => s + x, 0) || 1;
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([cat, n]) => ({ cat, n, pct: Math.round(n * 100 / tot) }));
});

const regions = computed(() => {
  const m = new Map();
  for (const b of cave.db.bouteilles.filter(b => b.quantite > 0 && b.region)) m.set(b.region, (m.get(b.region) || 0) + b.quantite);
  const tot = [...m.values()].reduce((s, x) => s + x, 0) || 1;
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([r, n], i) => ({ r, n, pct: Math.round(n * 100 / tot), col: PALETTE[i % PALETTE.length] }));
});

/* Bues des 12 derniers mois → petites barres */
const mois = computed(() => {
  const out = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ cle: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), lab: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""), n: 0 });
  }
  for (const b of cave.db.bues || []) {
    const cle = (b.date || "").slice(0, 7);
    const m = out.find(o => o.cle === cle);
    if (m) m.n++;
  }
  const max = Math.max(...out.map(o => o.n), 1);
  return { bars: out.map(o => ({ ...o, h: Math.round(o.n * 56 / max) })), total: out.reduce((s, o) => s + o.n, 0) };
});

/* Top 3 des meilleures notes du carnet */
const amours = computed(() => [...(cave.db.bues || [])].filter(b => b.note != null).sort((a, b) => b.note - a.note || (b.date || "").localeCompare(a.date || "")).slice(0, 3));

/* Millésimes en stock : le plus ancien et le plus récent */
const mill = computed(() => {
  const ms = cave.db.bouteilles.filter(b => b.quantite > 0 && b.millesime && !isNaN(b.millesime)).map(b => parseInt(b.millesime));
  return ms.length ? { min: Math.min(...ms), max: Math.max(...ms) } : null;
});

const euro = v => (Math.round(v) || v) ? Math.round(v).toLocaleString("fr-FR") + " €" : "—";
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
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ st.valeur ? euro(st.valeur) : '—' }}</p>
        <p v-if="st.valeur" class="text-[11px] text-muted mt-0.5">prix connus uniquement</p>
      </div>
      <div class="bg-white border border-hairline rounded-xl2 p-4">
        <p class="text-[10px] text-muted uppercase tracking-widest">Bues</p>
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ st.buesCount }}</p>
        <p v-if="st.avgNote" class="text-[11px] text-muted mt-0.5">note moyenne {{ st.avgNote }}/100</p>
      </div>
      <div class="bg-white border border-hairline rounded-xl2 p-4">
        <p class="text-[10px] text-muted uppercase tracking-widest">Valeur bue</p>
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ st.buesPrix ? euro(st.buesPrix) : '—' }}</p>
        <p v-if="st.buesPrix" class="text-[11px] text-muted mt-0.5">santé !</p>
      </div>
      <div v-if="mill" class="bg-white border border-hairline rounded-xl2 p-4">
        <p class="text-[10px] text-muted uppercase tracking-widest">Millésimes</p>
        <p class="font-serif text-3xl mt-1 tabular-nums">{{ mill.min === mill.max ? mill.min : mill.min + '–' + mill.max }}</p>
        <p class="text-[11px] text-muted mt-0.5">du plus jeune au plus ancien</p>
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

    <template v-if="regions.length">
      <p class="text-[10px] text-muted uppercase tracking-widest mt-5">Par région</p>
      <div class="mt-2 space-y-2">
        <div v-for="r in regions" :key="r.r" class="bg-white border border-hairline rounded-xl2 px-3 py-2.5 flex items-center gap-3">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="'background:' + r.col"></span>
          <span class="flex-1 min-w-0">
            <span class="flex justify-between text-sm"><span class="truncate">{{ r.r }}</span><span class="text-muted tabular-nums shrink-0 ml-2">{{ r.n }}</span></span>
            <span class="block h-1.5 bg-cream rounded-full mt-1 overflow-hidden"><span class="block h-full rounded-full" :style="'width:' + r.pct + '%;background:' + r.col"></span></span>
          </span>
        </div>
      </div>
    </template>

    <template v-if="mois.total > 0">
      <p class="text-[10px] text-muted uppercase tracking-widest mt-5">Activité · 12 derniers mois</p>
      <div class="mt-2 bg-white border border-hairline rounded-xl2 px-3 py-3">
        <div class="flex items-end justify-between gap-1 h-14">
          <div v-for="b in mois.bars" :key="b.cle" class="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span v-if="b.n" class="text-[9px] text-muted tabular-nums leading-none">{{ b.n }}</span>
            <span class="w-full max-w-3 rounded-t-[3px]" :class="b.n ? 'bg-accent' : 'bg-cream'" :style="'height:' + Math.max(b.h, b.n ? 4 : 2) + 'px'"></span>
          </div>
        </div>
        <div class="flex justify-between gap-1 mt-1.5">
          <span v-for="b in mois.bars" :key="b.cle" class="flex-1 text-center text-[8px] text-muted truncate">{{ b.lab }}</span>
        </div>
        <p class="text-[11px] text-muted mt-2 text-center">{{ mois.total }} bouteille{{ mois.total > 1 ? 's' : '' }} passée{{ mois.total > 1 ? 's' : '' }} cette année glissante</p>
      </div>
    </template>

    <template v-if="amours.length">
      <p class="text-[10px] text-muted uppercase tracking-widest mt-5">Coups de cœur</p>
      <div class="mt-2 space-y-2">
        <button v-for="(a, i) in amours" :key="a.id" @click="cave.buesFiche = a.id" class="w-full text-left bg-white border border-hairline rounded-xl2 px-3 py-2.5 flex items-center gap-3">
          <span class="font-serif text-sm text-muted w-4 shrink-0">{{ i + 1 }}</span>
          <span class="flex-1 min-w-0">
            <span class="block truncate text-sm font-medium">{{ a.nom }}</span>
            <span class="block text-[11px] text-muted mt-0.5">{{ new Date(a.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }}<span v-if="a.occasion"> · {{ a.occasion }}</span></span>
          </span>
          <span class="font-serif text-lg tabular-nums shrink-0 text-accent">{{ a.note }}</span>
        </button>
      </div>
    </template>
  </section>
</template>
