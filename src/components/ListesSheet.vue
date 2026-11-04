<script setup>
/* Feuille glissante « Listes d'envie » — quantités, dates, bandeau post-événement, synchro Notion */
import { ref, computed, watch } from "vue";
import { useCave } from "../stores/cave.js";
import { cepageCourt, fmtListeDate, joursAvant, photoFromFile } from "../util.js";
import Ic from "./Ic.vue";

const cave = useCave();
const props = defineProps({ open: Boolean });
const emit = defineEmits(["close", "toCave"]);
watch(() => props.open, v => cave.overlay("listes", v));

const listeOpenId = ref(null);
const listePick = ref(null);
const listeEditId = ref(null);
const listeDateId = ref(null);
const nouveauNom = ref("");
const renNom = ref("");

const listes = computed(() => cave.listes);
const stock = computed(() => cave.db.bouteilles.filter(b => b.quantite > 0));
const pendantes = computed(() => listes.value.filter(l => cave.listePostPending(l)));

function itemsDe(l) { return (l.ids || []).map(id => cave.db.bouteilles.find(b => b.id === id)).filter(Boolean); }
function dateChipOld(l) {
  if (!l.date) return { type: "btn" };
  const d = joursAvant(l.date);
  if (d != null && d <= 2) return { type: "urgent", d };
  return { type: "chip" };
}
function creer() {
  const nom = (nouveauNom.value || "").trim();
  if (!nom) { cave.toast("Donne un nom à ta liste"); return; }
  cave.listes.push({ id: "l" + Date.now().toString(36), nom, date: null, ids: [], qtes: {} });
  nouveauNom.value = "";
  cave.save(); cave.syncListes();
  cave.toast(`Liste « ${nom} » créée`);
}
function renommer(l) {
  const nom = (renNom.value || "").trim();
  if (nom) { l.nom = nom; cave.save(); cave.syncListes(); cave.toast("Liste renommée"); }
  listeEditId.value = null;
}
function supprimer(l) {
  cave.askConfirm(`Supprimer la liste « ${l.nom} » ? Les bouteilles restent dans la cave.`, "Supprimer", () => {
    cave.db.listes = cave.listes.filter(x => x.id !== l.id);
    listeEditId.value = null; listeOpenId.value = null;
    cave.save(); cave.syncListes();
    cave.toast("Liste supprimée");
  });
}
function ajouter(l, b) {
  if ((l.ids || []).includes(b.id)) { l.ids = l.ids.filter(x => x !== b.id); delete l.qtes[b.id]; cave.save(); cave.syncListes(); return; }
  cave.toggleListe(l.id, b);
}
function retirer(l, b) {
  l.ids = (l.ids || []).filter(x => x !== b.id);
  delete l.qtes[b.id];
  cave.save(); cave.syncListes();
  cave.toast(`Sortie de « ${l.nom} »`);
}
function qte(l, b, delta) {
  l.qtes[b.id] = Math.max(1, Math.min(b.quantite, cave.listeQ(l, b.id) + delta));
  if (l.qtes[b.id] <= 1) delete l.qtes[b.id];
  cave.save(); cave.syncListes();
}
function bloquee(b, l) { return b.quantite === 1 && cave.listesDe(b).some(x => x.id !== l.id); }
function saveDate(l) {
  l.date = l._dateTmp || l.date;
  l.postEvent = null;
  listeDateId.value = null;
  cave.save(); cave.syncListes();
  cave.toast(l.date ? `Date enregistrée : ${fmtListeDate(l.date)}` : "Date enlevée");
}

/* ---------- Bouteilles repérées en ligne (screenshots chez un caviste web) ----------
   l.ext : [{ id, nom, prix, url, photo, ajouteLe }] — stockées dans la liste,
   synchronisées Notion comme le reste, disponibles sur tous les appareils. */
const extFormId = ref(null);
const ex = ref({});
const extPhotoEnCours = ref(false);
function ouvrirExtForm(l) {
  extFormId.value = l.id;
  ex.value = { nom: "", prix: null, url: "", photo: null };
}
function onExtPhoto(ev) {
  const f = ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  extPhotoEnCours.value = true;
  photoFromFile(f, data => { ex.value.photo = data; extPhotoEnCours.value = false; cave.toast("Capture ajoutée"); }, 600, 0.62);
}
function ajouterExt(l) {
  const x = ex.value;
  if (!(x.nom || "").trim() && !x.photo) { cave.toast("Donne au moins un nom ou une capture"); return; }
  const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? null : n; };
  l.ext = l.ext || [];
  l.ext.push({ id: "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nom: (x.nom || "").trim(), prix: num(x.prix), url: (x.url || "").trim(), photo: x.photo || null, ajouteLe: null });
  cave.save(); cave.syncListes();
  ouvrirExtForm(l);
  cave.toast("Bouteille repérée ajoutée à la liste");
}
function supprimerExt(l, x) {
  cave.askConfirm(`Supprimer « ${x.nom || "bouteille sans nom"} » de la liste ?`, "Supprimer", () => {
    l.ext = (l.ext || []).filter(y => y.id !== x.id);
    cave.save(); cave.syncListes();
    cave.toast("Retirée de la liste");
  });
}
function extVersCave(l, x) {
  x.ajouteLe = new Date().toISOString();
  cave.save(); cave.syncListes();
  emit("toCave", { nom: x.nom || "", millesime: null, prix: x.prix ?? null, commentaire: x.url ? "🔗 " + x.url : "" });
  cave.toast((x.nom || "Bouteille") + " — formulaire d'ajout pré-rempli");
}
function annuleExt(l, x) { x.ajouteLe = null; cave.save(); cave.syncListes(); }
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-end" role="dialog">
    <div class="absolute inset-0 bg-ink/40" @click="emit('close')"></div>
    <div class="relative w-full bg-cream rounded-t-3xl border-t border-hairline px-5 pt-3 pb-6 max-h-[85vh] overflow-y-auto">
      <div class="w-10 h-1 rounded-full bg-hairline mx-auto mb-4"></div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-serif text-lg">Listes d'envie</h3>
        <button @click="emit('close')" class="text-xs text-muted underline">Fermer</button>
      </div>
      <div class="flex gap-2 mb-4">
        <input v-model="nouveauNom" placeholder="Nom d'une nouvelle liste (ex. Apéro chez Marie)" class="flex-1 min-w-0 bg-white border border-hairline rounded-full px-4 py-2.5 text-sm" />
        <button @click="creer" class="shrink-0 px-4 py-2.5 rounded-full bg-accent text-white text-sm">Créer</button>
      </div>

      <!-- Bandeau post-événement : as-tu bu les bouteilles mises de côté ? -->
      <div v-for="l in pendantes" :key="'p' + l.id" class="bg-riesling/25 border border-gold/40 rounded-xl2 p-3 mb-2.5">
        <p class="text-xs font-medium mb-2">« {{ l.nom }} » c'était le {{ fmtListeDate(l.date) }} — as-tu bu les {{ cave.listeResteEnCave(l) }} bouteille{{ cave.listeResteEnCave(l) > 1 ? 's' : '' }} mise{{ cave.listeResteEnCave(l) > 1 ? 's' : '' }} de côté ?</p>
        <div class="flex gap-2">
          <button @click="cave.listeBues(l)" class="flex-1 py-2 rounded-full bg-accent text-white text-xs">Oui, on l{{ cave.listeResteEnCave(l) > 1 ? 'es a' : 'a' }} bu{{ cave.listeResteEnCave(l) > 1 ? 'es' : 'e' }}</button>
          <button @click="cave.listeGarde(l)" class="flex-1 py-2 rounded-full border border-hairline bg-white text-ink text-xs">Non, gardée{{ cave.listeResteEnCave(l) > 1 ? 's' : '' }} en cave</button>
        </div>
      </div>

      <div v-if="!listes.length" class="text-center text-muted text-xs py-6">Aucune liste — crée la première pour mettre des bouteilles de côté.</div>

      <div v-for="l in listes" :key="l.id" class="bg-white border border-hairline rounded-xl2 p-3 mb-2.5">
        <div class="flex items-center gap-2">
          <button @click="listeOpenId = listeOpenId === l.id ? null : l.id" class="flex-1 min-w-0 flex items-center gap-1.5 text-left">
            <Ic name="chevronR" :cls="'w-3.5 h-3.5 text-muted shrink-0 transition-transform ' + (listeOpenId === l.id ? 'rotate-90' : '')" />
            <span class="text-sm font-medium truncate">{{ l.nom }}</span>
            <span class="text-[10px] text-muted whitespace-nowrap">{{ (l.ids || []).reduce((s, id) => s + cave.listeQ(l, id), 0) }} btl<template v-if="(l.ext || []).length"> · {{ (l.ext || []).filter(x => !x.ajouteLe).length }} en ligne</template></span>
          </button>
          <!-- date : chip ou éditeur inline -->
          <template v-if="listeDateId === l.id">
            <input type="date" v-model="l._dateTmp" class="bg-white border border-hairline rounded-full px-2.5 py-1 text-[11px] shrink-0" />
            <button @click="saveDate(l)" class="shrink-0 text-[10px] font-bold bg-accent text-white rounded-full px-2.5 py-1 whitespace-nowrap">OK</button>
            <button v-if="l.date" @click="l.date = null; listeDateId = null; cave.save(); cave.syncListes()" class="shrink-0 text-[10px] text-muted underline whitespace-nowrap">enlever</button>
          </template>
          <template v-else-if="!l.date">
            <button @click="l._dateTmp = ''; listeDateId = l.id" class="text-[10px] text-gold underline whitespace-nowrap">+ date</button>
          </template>
          <template v-else-if="dateChipOld(l).type === 'urgent'">
            <button @click="l._dateTmp = l.date; listeDateId = l.id" class="text-[10px] font-bold bg-accent text-white rounded-full px-2 py-0.5 whitespace-nowrap">{{ fmtListeDate(l.date) }} · dans {{ dateChipOld(l).d }} j</button>
          </template>
          <template v-else>
            <button @click="l._dateTmp = l.date; listeDateId = l.id" class="text-[10px] font-bold bg-riesling text-ink rounded-full px-2 py-0.5 whitespace-nowrap underline">{{ fmtListeDate(l.date) }}</button>
          </template>
          <button v-if="listeEditId !== l.id" @click="listeEditId = l.id; renNom = l.nom" class="w-7 h-7 rounded-full flex items-center justify-center text-muted shrink-0" title="Renommer ou supprimer"><Ic name="pencil" cls="w-3.5 h-3.5" /></button>
        </div>

        <!-- renommage inline -->
        <div v-if="listeEditId === l.id" class="flex gap-2 mt-2">
          <input v-model="renNom" class="flex-1 min-w-0 bg-cream border border-hairline rounded-full px-3 py-1.5 text-xs" />
          <button @click="renommer(l)" class="px-3 py-1.5 rounded-full bg-accent text-white text-xs shrink-0">OK</button>
          <button @click="supprimer(l)" class="px-3 py-1.5 rounded-full border border-accent text-accent text-xs shrink-0">Supprimer</button>
        </div>

        <!-- contenu déplié -->
        <div v-if="listeOpenId === l.id" class="mt-2">
          <div v-if="listePick === l.id" class="border border-riesling rounded-xl2 p-2 max-h-52 overflow-y-auto bg-cream/60">
            <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">Ajouter à « {{ l.nom }} »</p>
            <button v-for="b in stock" :key="b.id" @click="ajouter(l, b)" class="w-full flex items-center gap-2.5 py-1.5 px-1 text-left" :class="bloquee(b, l) ? 'opacity-40' : ''">
              <Ic :name="(l.ids || []).includes(b.id) ? 'check' : 'plus'" :cls="'w-3.5 h-3.5 shrink-0 ' + ((l.ids || []).includes(b.id) ? 'text-accent' : 'text-muted')" />
              <span class="flex-1 min-w-0 text-xs truncate">{{ b.nom }}<span v-if="cepageCourt(b)" class="text-muted"> — {{ cepageCourt(b) }}</span></span>
              <span class="text-[10px] text-muted whitespace-nowrap">{{ b.quantite }} btl</span>
            </button>
            <button @click="listePick = null" class="w-full mt-1.5 py-2 rounded-full bg-accent text-white text-xs">Terminé</button>
          </div>
          <button v-else @click="listePick = l.id" class="w-full mt-2 py-2 rounded-full border border-dashed border-gold text-gold text-xs">+ Ajouter des bouteilles</button>

          <div v-for="b in itemsDe(l)" :key="b.id" class="flex items-center gap-2.5 py-1.5 border-t border-hairline/60">
            <span class="shrink-0 w-1 h-6 rounded-full" :style="'background:' + (cave.CAT_COLORS[b.type === 'Spiritueux' ? 'Spiritueux' : b.categorie] || '#7A2E3E')"></span>
            <span class="flex-1 min-w-0 text-xs truncate">{{ b.nom }}<span v-if="cepageCourt(b)" class="text-muted"> — {{ cepageCourt(b) }}</span></span>
            <span class="shrink-0 flex items-center gap-1">
              <template v-if="b.quantite > 1">
                <button @click="qte(l, b, -1)" class="w-6 h-6 rounded-full border border-hairline bg-white flex items-center justify-center text-muted" :class="{ 'opacity-30': cave.listeQ(l, b.id) <= 1 }" :disabled="cave.listeQ(l, b.id) <= 1" title="Réserver une bouteille de moins"><Ic name="minus" cls="w-3 h-3" /></button>
                <span class="text-[11px] font-semibold text-ink bg-riesling/40 rounded-full min-w-[30px] h-6 px-1.5 flex items-center justify-center" :title="'Réservées : ' + cave.listeQ(l, b.id) + ' / stock ' + b.quantite">×{{ cave.listeQ(l, b.id) }}</span>
                <button @click="qte(l, b, 1)" class="w-6 h-6 rounded-full border border-hairline bg-white flex items-center justify-center text-muted" :class="{ 'opacity-30': cave.listeQ(l, b.id) >= b.quantite }" :disabled="cave.listeQ(l, b.id) >= b.quantite" title="Réserver une bouteille de plus"><Ic name="plus" cls="w-3 h-3" /></button>
              </template>
              <span v-else class="text-[10px] text-muted whitespace-nowrap">1 btl</span>
            </span>
            <button @click="retirer(l, b)" class="w-6 h-6 rounded-full flex items-center justify-center text-muted shrink-0" title="Sortir de la liste (la cave ne bouge pas)"><Ic name="x" cls="w-3.5 h-3.5" /></button>
          </div>
          <p v-if="!itemsDe(l).length && listePick !== l.id" class="text-[11px] text-muted text-center py-3">Liste vide — ajoute des bouteilles.</p>

          <!-- Bouteilles repérées en ligne (captures d'écran) -->
          <div v-if="extFormId === l.id" class="mt-2 border border-riesling rounded-xl2 p-2.5 bg-cream/60">
            <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">Repérée en ligne</p>
            <div class="flex gap-2">
              <input v-model="ex.nom" placeholder="Nom de la bouteille" class="flex-1 min-w-0 bg-white border border-hairline rounded-full px-3 py-1.5 text-xs" />
              <input v-model.number="ex.prix" type="number" step="0.01" placeholder="Prix €" class="w-20 shrink-0 bg-white border border-hairline rounded-full px-3 py-1.5 text-xs" />
            </div>
            <input v-model="ex.url" placeholder="Lien du site (facultatif)" class="w-full mt-2 bg-white border border-hairline rounded-full px-3 py-1.5 text-xs" />
            <div class="flex gap-2 mt-2">
              <label class="flex-1 py-2 rounded-full border border-hairline bg-white text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                <Ic name="camera" cls="w-3.5 h-3.5" /> {{ ex.photo ? 'Changer la capture' : 'Capture d\u2019écran' }}
                <input type="file" accept="image/*" class="hidden" @change="onExtPhoto" />
              </label>
              <button @click="ajouterExt(l)" class="px-4 py-2 rounded-full bg-accent text-white text-xs shrink-0">Ajouter</button>
            </div>
            <img v-if="ex.photo" :src="ex.photo" alt="" class="w-full h-36 object-cover rounded-lg mt-2" />
            <p v-if="extPhotoEnCours" class="text-[10px] text-muted mt-1.5">Traitement de la capture…</p>
          </div>
          <button v-else @click="ouvrirExtForm(l)" class="w-full mt-2 py-2 rounded-full border border-dashed border-accent/50 text-accent text-xs">+ Bouteille repérée en ligne (capture)</button>

          <div v-for="x in (l.ext || [])" :key="'x' + x.id" class="flex items-start gap-2.5 py-2 border-t border-hairline/60" :class="x.ajouteLe ? 'opacity-55' : ''">
            <img v-if="x.photo" :src="x.photo" alt="" class="w-10 h-16 object-cover rounded-lg shrink-0" />
            <span v-else class="w-6 h-16 shrink-0 flex items-center justify-center text-muted"><Ic name="bottleEmpty" cls="w-5 h-5" /></span>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium truncate" :class="x.ajouteLe ? 'line-through' : ''">{{ x.nom || 'Sans nom' }}</p>
              <p class="text-[10px] text-muted truncate">{{ [(x.prix != null ? x.prix + ' €' : null), x.url ? 'en ligne' : null].filter(Boolean).join(' · ') }}</p>
              <p v-if="x.ajouteLe" class="text-[10px] text-green inline-flex items-center gap-1"><Ic name="check" cls="w-3 h-3" /> en cave</p>
            </div>
            <div class="flex flex-col gap-1.5 shrink-0">
              <button v-if="!x.ajouteLe" @click="extVersCave(l, x)" class="px-3.5 py-1.5 rounded-full bg-accent text-white text-xs flex items-center gap-1.5" title="Pré-remplir le formulaire d'ajout à la cave"><Ic name="plus" cls="w-3.5 h-3.5" /> Ma cave</button>
              <button v-else @click="annuleExt(l, x)" class="px-3.5 py-1.5 rounded-full border border-hairline text-muted text-xs" title="Annuler — pas encore achetée en fait">Annuler</button>
              <button @click="supprimerExt(l, x)" class="self-end w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center" title="Supprimer de la liste"><Ic name="trash" cls="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
