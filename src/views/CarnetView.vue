<script setup>
/* Le carnet : hub des usages « papier » — envies, listes, accords, bues.
   Chaque CTA ouvre la vue dédiée ; les badges signalent ce qui attend une action. */
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useCave } from "../stores/cave.js";
import Ic from "../components/Ic.vue";
import ListesSheet from "../components/ListesSheet.vue";

const cave = useCave();
const router = useRouter();
const showListes = ref(false);

/* Bues sans note : le carnet attend qu'on raconte la dégustation */
const buesANoter = computed(() => (cave.db.bues || []).filter(h => h.note == null).length);

function vers(p) { router.push(p); }
</script>

<template>
  <section class="p-4">
    <p class="text-[10px] text-muted uppercase tracking-widest">Ma Cave</p>
    <h1 class="font-serif text-2xl leading-tight">Le carnet</h1>
    <p class="text-xs text-muted mt-0.5">Envies, listes, accords et dégustations.</p>

    <div class="mt-4 space-y-2">
      <button @click="vers('/envies')" class="w-full flex items-center gap-3 bg-white border border-hairline rounded-xl2 p-4 text-left card-sh">
        <span class="w-10 h-10 rounded-full bg-gold/10 text-gold flex items-center justify-center shrink-0"><Ic name="heart" cls="w-5 h-5" /></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium">Envies du caviste</span>
          <span class="block text-[11px] text-muted mt-0.5">Les bouteilles repérées, pas encore achetées</span>
        </span>
        <span v-if="cave.nbEnvies" class="px-2 py-0.5 rounded-full bg-gold text-white text-[11px] shrink-0">{{ cave.nbEnvies }}</span>
        <Ic name="chevR" cls="w-4 h-4 text-muted shrink-0" />
      </button>

      <button @click="showListes = true" class="w-full flex items-center gap-3 bg-white border border-hairline rounded-xl2 p-4 text-left card-sh">
        <span class="w-10 h-10 rounded-full bg-riesling/40 text-ink flex items-center justify-center shrink-0"><Ic name="note" cls="w-5 h-5" /></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium">Listes &amp; soirées</span>
          <span class="block text-[11px] text-muted mt-0.5">Bouteilles mises de côté pour une occasion</span>
        </span>
        <span v-if="cave.nbReservees" class="px-2 py-0.5 rounded-full bg-accent text-white text-[11px] shrink-0">{{ cave.nbReservees }}</span>
        <Ic name="chevR" cls="w-4 h-4 text-muted shrink-0" />
      </button>

      <button @click="vers('/accords')" class="w-full flex items-center gap-3 bg-white border border-hairline rounded-xl2 p-4 text-left card-sh">
        <span class="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0"><Ic name="sparkles" cls="w-5 h-5" /></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium">Accords mets &amp; vins</span>
          <span class="block text-[11px] text-muted mt-0.5">Que servir avec ce plat ce soir ?</span>
        </span>
        <Ic name="chevR" cls="w-4 h-4 text-muted shrink-0" />
      </button>

      <button @click="vers('/coeurs')" class="w-full flex items-center gap-3 bg-white border border-hairline rounded-xl2 p-4 text-left card-sh">
        <span class="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0"><Ic name="heart" cls="w-5 h-5 fill-current" /></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium">Mes coups de cœur</span>
          <span class="block text-[11px] text-muted mt-0.5">Les vins marqués ❤️, en cave et dans le carnet</span>
        </span>
        <span v-if="cave.nbCoeurs()" class="px-2 py-0.5 rounded-full bg-accent text-white text-[11px] shrink-0">{{ cave.nbCoeurs() }}</span>
        <Ic name="chevR" cls="w-4 h-4 text-muted shrink-0" />
      </button>

      <button @click="vers('/bues')" class="w-full flex items-center gap-3 bg-white border border-hairline rounded-xl2 p-4 text-left card-sh">
        <span class="w-10 h-10 rounded-full bg-ink/5 text-ink flex items-center justify-center shrink-0"><Ic name="archive" cls="w-5 h-5" /></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium">Ce que j'ai bu</span>
          <span class="block text-[11px] text-muted mt-0.5">Historique, notes et souvenirs de dégustation</span>
        </span>
        <span v-if="buesANoter" class="px-2 py-0.5 rounded-full bg-ink text-white text-[11px] shrink-0">{{ buesANoter }}</span>
        <Ic name="chevR" cls="w-4 h-4 text-muted shrink-0" />
      </button>
    </div>

    <ListesSheet :open="showListes" @close="showListes = false" @to-cave="() => router.push('/cave')" />
  </section>
</template>
