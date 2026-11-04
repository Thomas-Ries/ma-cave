<script setup>
/* Aperçu d'import : confirmation, rien n'est effacé (fusion par nom+millésime+cave) */
import { computed } from "vue";
import { useCave } from "../stores/cave.js";
import { importKey } from "../lib/import.js";
import Ic from "./Ic.vue";

const cave = useCave();
const props = defineProps({ rows: { type: Array, default: () => [] } });
const emit = defineEmits(["close"]);

const prev = computed(() => cave.previewImport(props.rows));
const isMaj = (r) => !!cave.db.bouteilles.find(b => importKey(b) === importKey(r));
const n = computed(() => props.rows.length);

function ok() {
  const r = cave.applyImportRows(props.rows);
  cave.save();
  emit("close");
  cave.toast(`Import : ${r.created} nouvelle${r.created > 1 ? "s" : ""}, ${r.updated} mise${r.updated > 1 ? "s" : ""} à jour`);
  /* Une seule requête groupée pour TOUT l'import (jamais un appel par bouteille :
     400 lignes = 400 requêtes → quota Cloudflare grillé) */
  if (r.created) cave.syncNotion({ action: "sync", bouteilles: cave.db.bouteilles.slice(-r.created) });
}
</script>

<template>
  <div class="fixed inset-0 z-30 bg-ink/40 flex items-end md:items-center justify-center p-4" @click.self="emit('close')">
    <div class="bg-white rounded-xl2 w-full max-w-md p-5 max-h-[82vh] overflow-y-auto">
      <h3 class="font-serif text-lg">Importer {{ n }} ligne{{ n > 1 ? 's' : '' }} ?</h3>
      <p class="text-xs text-muted mt-1">{{ prev.nouvelles.length }} nouvelle(s) · {{ prev.majs.length }} mise(s) à jour — <span class="text-green">rien ne sera effacé</span></p>
      <table class="w-full text-xs mt-3">
        <thead><tr class="text-left text-muted"><th>Nom</th><th>Mil.</th><th>Cave</th><th>Qté</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in rows.slice(0, 8)" :key="i" class="border-t border-hairline">
            <td class="py-1.5 pr-1 truncate max-w-[130px]">{{ r.nom }}</td>
            <td class="pr-1">{{ r.millesime ?? '—' }}</td>
            <td class="pr-1 truncate max-w-[80px]">{{ r.cave || '—' }}</td>
            <td class="pr-1">{{ r.quantite ?? 1 }}</td>
            <td class="whitespace-nowrap" :class="isMaj(r) ? 'text-gold' : 'text-green'">{{ isMaj(r) ? 'MàJ' : 'Nouvelle' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="n > 8" class="text-[11px] text-muted mt-1">+ {{ n - 8 }} autres…</p>
      <div class="flex gap-2 mt-4">
        <button @click="emit('close')" class="flex-1 py-2.5 rounded-full border border-hairline text-sm">Annuler</button>
        <button @click="ok" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">Importer {{ n }} ligne{{ n > 1 ? 's' : '' }}</button>
      </div>
    </div>
  </div>
</template>
