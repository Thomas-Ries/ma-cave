<script setup>
/* Fiche d'une bouteille bue : noter, commenter, remettre en cave — carnet de dégustation */
import { ref, computed, watch } from "vue";
import { useCave } from "../stores/cave.js";
import Ic from "./Ic.vue";
import { notePalier } from "../lib/noteEchelle.js";

const cave = useCave();
const h = computed(() => cave.bueOuverte);
const noteVal = ref(80);
const com = ref("");
const occ = ref("");
const avec = ref("");

/* Occasions courantes — tap pour choisir, re-tap pour vider */
const OCCASIONS = ["Dîner", "Apéro", "Entre amis", "En amoureux", "Anniversaire", "Fête de famille", "Détente solo"];

watch(h, (nh) => { if (nh) { noteVal.value = nh.note ?? 80; com.value = nh.commentaire || ""; occ.value = nh.occasion || ""; avec.value = nh.avec || ""; } }, { immediate: true });

/* Légende d'échelle de notation (70–100, comme le carnet de dégustation) */
const leg = computed(() => notePalier(noteVal.value));

/* Verrouillage du scroll de fond */
watch(() => h.value != null, v => cave.overlay("bue", v));

function save() {
  /* snapshot AVANT la fermeture : buesFiche = null rend h.value null immédiatement
     (computed) — lire h.value ensuite crashait sur .commentaire */
  const hh = h.value;
  if (!hh) return;
  hh.note = parseInt(noteVal.value, 10);
  hh.commentaire = (com.value || "").trim();
  hh.occasion = occ.value || "";
  hh.avec = (avec.value || "").trim();
  cave.save();
  cave.syncBues();
  cave.buesFiche = null;
  cave.toast(hh.commentaire ? `Note ${hh.note} et souvenir enregistrés` : `Note ${hh.note} enregistrée`);
}
function undo() { if (cave.buesFiche != null) cave.undoDrink(cave.buesFiche); }
function suppr() {
  if (cave.buesFiche == null) return;
  const nom = h.value?.nom || "cette bouteille";
  cave.askConfirm(`Supprimer « ${nom} » de l’historique des bues ?`, "Supprimer", () => cave.supprimerBue(cave.buesFiche));
}
</script>

<template>
  <div v-if="h" class="fixed inset-0 z-30 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4" @click.self="cave.buesFiche = null">
    <div class="bg-white rounded-t-xl2 md:rounded-xl2 w-full max-w-md max-h-[92vh] overflow-y-auto">
      <div class="p-5">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] text-muted uppercase tracking-widest">Carnet de dégustation</p>
            <h2 class="font-serif text-xl leading-tight">{{ h.nom }}</h2>
          </div>
          <button @click="cave.buesFiche = null" class="close-x" title="Fermer"><Ic name="x" cls="w-4 h-4" /></button>
        </div>

        <div class="mt-4 p-3 bg-cream rounded-xl2 text-center">
          <p class="text-[10px] text-muted uppercase tracking-widest">Bue le</p>
          <p class="font-serif text-2xl mt-0.5">{{ new Date(h.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) }}</p>
        </div>

        <!-- Occasion : chips tap pour choisir / re-tap pour vider -->
        <div class="mt-3">
          <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">L’occasion</p>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="o in OCCASIONS" :key="o" type="button" @click="occ = (occ === o ? '' : o)"
              class="px-3 py-1.5 rounded-full text-xs border transition-colors"
              :class="occ === o ? 'bg-accent text-white border-accent' : 'bg-white text-ink border-hairline hover:border-accent/40'">{{ o }}</button>
          </div>
          <input v-model="avec" placeholder="Avec qui ? (optionnel)" class="w-full mt-2 bg-white border border-hairline rounded-lg px-3 py-2.5 text-sm" />
        </div>

        <dl class="mt-3 text-sm">
          <div v-for="([k, v]) in [['Millésime', h.millesime ?? '—'], ['Catégorie', h.categorie || '—']]" :key="k" class="flex justify-between gap-2 py-1.5 border-b border-hairline last:border-0">
            <dt class="text-muted">{{ k }}</dt><dd class="text-right">{{ v }}</dd>
          </div>
        </dl>

        <div class="mt-3 p-3 rounded-xl2 bg-accent-soft border border-accent/20">
          <div class="flex items-center justify-between">
            <p class="text-[10px] text-muted uppercase tracking-widest">Ta note</p>
            <p class="font-serif text-2xl leading-none"><span class="tabular-nums">{{ noteVal }}</span><span class="text-muted text-xs"> / 100</span></p>
          </div>
          <input v-model.number="noteVal" type="range" min="70" max="100" class="flex-1 w-full mt-2 accent-gold" aria-label="Note sur 100" />
          <p class="text-[12px] text-muted italic leading-snug mt-1"><b class="text-gold not-italic">{{ leg.palier }}</b> · {{ leg.texte }}</p>
          <p class="text-[10px] text-muted uppercase tracking-widest mt-3 mb-1.5">Souvenir (optionnel)</p>
          <textarea v-model="com" rows="3" placeholder="Une anecdote, un plat, une envie…?" class="w-full bg-white border border-hairline rounded-lg px-3 py-2.5 text-sm"></textarea>
          <button @click="save" class="mt-2 w-full py-2.5 rounded-full bg-accent text-white text-sm font-medium flex items-center justify-center gap-1.5"><Ic name="check" cls="w-4 h-4" /> Enregistrer au carnet</button>
        </div>

        <div class="flex items-stretch gap-2 mt-4">
          <button @click="undo" class="flex-1 py-2.5 rounded-full bg-accent-soft text-accent border border-accent/25 text-sm flex items-center justify-center gap-2"><Ic name="trayUp" cls="w-5 h-5" /> Remettre dans ma cave</button>
          <button @click="suppr" title="Supprimer de l’historique" class="w-11 h-11 shrink-0 rounded-full bg-white border border-accent/30 text-accent flex items-center justify-center"><Ic name="trash" cls="w-5 h-5" /></button>
        </div>
      </div>
    </div>
  </div>
</template>
