<script setup>
/* Feuille « Recettes » du carnet (v2.28) : les recettes sauvegardées depuis
   Hopla !. Lecture locale (localStorage), tap pour déplier, suppression
   avec confirmation maison. */
import { ref, watch } from "vue";
import { recettes, supprimeRecette } from "../lib/recettes.js";
import { useCave } from "../stores/cave.js";
import Ic from "./Ic.vue";

const cave = useCave();
const props = defineProps({ open: Boolean });
const emit = defineEmits(["close"]);

const liste = ref([]);
const ouverte = ref(null);

const charge = () => { liste.value = recettes(); ouverte.value = null; };
watch(() => props.open, v => { if (v) charge(); });

function dateFr(iso) {
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; }
}
function supprime(r) {
  cave.askConfirm({
    titre: "Supprimer « " + r.titre + " » ?",
    texte: "Cette recette sera retirée du carnet.",
    onOk: () => { supprimeRecette(r.id); charge(); ouverte.value = null; },
  });
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-end" @click.self="emit('close')">
    <div class="absolute inset-0 bg-ink/40" @click="emit('close')"></div>
    <div class="relative w-full max-w-2xl mx-auto bg-cream max-h-[82vh] flex flex-col" style="border-radius: 24px 24px 0 0">
      <div class="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-hairline">
        <span class="w-10 h-10 rounded-full bg-gold/10 text-gold flex items-center justify-center shrink-0"><Ic name="bookOpen" cls="w-5 h-5" /></span>
        <div class="flex-1 min-w-0">
          <p class="font-serif text-lg leading-tight">Recettes de Hopla !</p>
          <p class="text-[11px] text-muted mt-0.5">{{ liste.length }} recette{{ liste.length > 1 ? 's' : '' }} sauvegardée{{ liste.length > 1 ? 's' : '' }}</p>
        </div>
        <button @click="emit('close')" class="w-9 h-9 rounded-full bg-ink/5 flex items-center justify-center shrink-0" title="Fermer"><Ic name="x" cls="w-4 h-4 text-ink" /></button>
      </div>

      <div class="overflow-y-auto px-5 py-4 space-y-2.5">
        <p v-if="!liste.length" class="text-sm text-muted text-center py-10">
          Aucune recette pour l'instant.<br />
          Demandez une recette à Hopla ! puis touchez « Sauver dans Le carnet ».
        </p>

        <div v-for="r in liste" :key="r.id" class="bg-white border border-hairline rounded-xl2 overflow-hidden">
          <button @click="ouverte = ouverte === r.id ? null : r.id" class="w-full flex items-center gap-3 p-4 text-left">
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium truncate">{{ r.titre }}</span>
              <span class="block text-[11px] text-muted mt-0.5">{{ dateFr(r.date) }}<template v-if="r.vin"> · accord {{ r.vin }}</template></span>
            </span>
            <Ic name="chevR" cls="w-4 h-4 text-muted shrink-0" :class="ouverte === r.id ? 'rotate-90' : ''" />
          </button>
          <div v-if="ouverte === r.id" class="px-4 pb-4">
            <p class="text-[13px] leading-relaxed whitespace-pre-line">{{ r.texte }}</p>
            <button @click="supprime(r)" class="mt-3 flex items-center gap-1.5 text-[12px] text-accent active:opacity-60">
              <Ic name="trash" cls="w-3.5 h-3.5" /> Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
