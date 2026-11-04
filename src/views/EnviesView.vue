<script setup>
/* Envies d'achat : liste des notes prises chez les cavistes + détail d'une note.
   Le bouton « note » de la Cave mène ici ; les notes se trient par caviste, date
   ou nombre à acheter, et le détail reprend le design dense de la cave. */
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useCave } from "../stores/cave.js";
import { photoFromFile, ilYA } from "../util.js";
import { exportEnviesPDF } from "../lib/enviesPrint.js";
import { enviesPDFBytes } from "../lib/enviesPdf.js";
import Ic from "../components/Ic.vue";

const cave = useCave();
const router = useRouter();

const noteOuverte = ref(null);   /* note courante en détail */
const rech = ref("");
const tri = ref("recent");       /* recent | caviste */
const editMeta = ref(false);     /* renommage nom/caviste en détail */
const renNom = ref("");
const renCaviste = ref("");
const nouveauNom = ref("");
const addOpen = ref(false);      /* formulaire d'article */
const ni = ref({});
const photoEnCours = ref(false);

const envies = computed(() => (Array.isArray(cave.db.envies) ? cave.db.envies : []));
const nbItems = e => (e.items || []).filter(i => !i.ajouteLe).length;
const totalItems = e => (e.items || []).length;

/* Liste : recherche + tri (caviste = groupes avec en-têtes, comme le mode dense) */
const enviesVisibles = computed(() => {
  const q = (rech.value || "").trim().toLowerCase();
  let list = envies.value.filter(e =>
    !q || [e.nom, e.caviste, ...(e.items || []).flatMap(i => [i.nom, i.cuvee, i.commentaire])].some(v => (v || "").toLowerCase().includes(q)));
  if (tri.value === "caviste") list = [...list].sort((a, b) => (a.caviste || "zz").localeCompare(b.caviste || "zz", "fr") || (a.creeLe < b.creeLe ? 1 : -1));
  else list = [...list].sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1));
  return list;
});
const groupesCaviste = computed(() => {
  if (tri.value !== "caviste") return null;
  const g = new Map();
  for (const e of enviesVisibles.value) {
    const c = e.caviste || "Sans caviste";
    if (!g.has(c)) g.set(c, []);
    g.get(c).push(e);
  }
  return [...g.entries()].map(([caviste, notes]) => ({ caviste, notes }));
});

function creerNote() {
  const nom = (nouveauNom.value || "").trim();
  if (!nom) { cave.toast("Donne un titre à ta note pour pouvoir l'enregistrer"); return; }
  const e = { id: "e" + Date.now().toString(36), nom, caviste: "", creeLe: new Date().toISOString(), items: [] };
  cave.db.envies.unshift(e);
  cave.save(); cave.syncEnvies();
  nouveauNom.value = "";
  ouvrirNote(e);
  cave.toast(`Note « ${nom} » créée`);
}

function ouvrirNote(e) {
  noteOuverte.value = e;
  editMeta.value = false;
  addOpen.value = !(e.items || []).length;
  ni.value = newItem();
}
function fermerNote() { noteOuverte.value = null; editMeta.value = false; }

function startEdit() { renNom.value = noteOuverte.value.nom; renCaviste.value = noteOuverte.value.caviste || ""; editMeta.value = true; }
function renommer() {
  const e = noteOuverte.value;
  const nom = (renNom.value || "").trim();
  if (nom) e.nom = nom;
  e.caviste = (renCaviste.value || "").trim();
  cave.save(); cave.syncEnvies();
  editMeta.value = false;
  cave.toast("Note mise à jour");
}
function supprimerNote(e) {
  cave.askConfirm(`Supprimer la note « ${e.nom} » ?`, "Supprimer", () => {
    cave.db.envies = envies.value.filter(x => x.id !== e.id);
    cave.save(); cave.syncEnvies();
    noteOuverte.value = null;
    cave.toast("Note supprimée");
  });
}

/* ---------- Articles ---------- */
function newItem() { return { nom: "", cuvee: "", millesime: null, prix: null, commentaire: "", photos: [] }; }
function ouvrirForm() { addOpen.value = true; ni.value = newItem(); }

/* Édition d'un article existant de la note */
const editItId = ref(null);
const ei = ref({});
function startEditItem(it) { editItId.value = it.id; ei.value = { nom: it.nom || "", cuvee: it.cuvee || "", millesime: it.millesime ?? null, prix: it.prix ?? null, commentaire: it.commentaire || "", photos: [...(it.photos || [])] }; }
function annuleEditItem() { editItId.value = null; }
function saveItem(it) {
  const num = v => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(x) ? null : x; };
  it.nom = (ei.value.nom || "").trim();
  it.cuvee = (ei.value.cuvee || "").trim();
  const m = num(ei.value.millesime);
  it.millesime = m != null ? Math.round(m) : null;
  it.prix = num(ei.value.prix);
  it.commentaire = (ei.value.commentaire || "").trim();
  it.photos = ei.value.photos || [];
  cave.save(); cave.syncEnvies();
  editItId.value = null;
  cave.toast("Bouteille mise à jour");
}
function ajouterItem() {
  const e = noteOuverte.value;
  const it = ni.value;
  if (!(it.nom || "").trim() && !(it.photos || []).length) { cave.toast("Donne au moins un nom ou une photo"); return; }
  const num = v => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(x) ? null : x; };
  const m = num(it.millesime);
  (e.items || (e.items = [])).push({
    id: "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    nom: (it.nom || "").trim(), cuvee: (it.cuvee || "").trim(), millesime: m != null ? Math.round(m) : null,
    prix: num(it.prix), commentaire: (it.commentaire || "").trim(),
    photos: it.photos || [], ajouteLe: null,
  });
  cave.save(); cave.syncEnvies();
  ouvrirForm();
  cave.toast("Bouteille ajoutée à la note");
}
function supprimerItem(it) {
  cave.askConfirm(`Supprimer « ${it.nom || "bouteille sans nom"} » de la note ?`, "Supprimer", () => {
    const e = noteOuverte.value;
    e.items = (e.items || []).filter(x => x.id !== it.id);
    cave.save(); cave.syncEnvies();
    cave.toast("Bouteille retirée de la note");
  });
}
/* Photos multiples par bouteille, compressées pour la synchro.
   cible = "edit" pour l'article en cours d'édition, sinon le nouvel article ni.
   (on ne passe pas la ref elle-même : dans le template, ei est auto-déballée) */
function onPhotos(ev, cible) {
  const files = [...ev.target.files];
  ev.target.value = "";
  if (!files.length) return;
  photoEnCours.value = true;
  const o = cible === "edit" ? ei : ni;
  files.forEach((f, k) => photoFromFile(f, data => {
    o.value.photos = [...(o.value.photos || []), data];
    if (k === files.length - 1) { photoEnCours.value = false; cave.toast(files.length > 1 ? files.length + " photos ajoutées" : "Photo ajoutée"); }
  }, 600, 0.62));
}

/* Promotion en cave : retour sur la vue Cave avec le formulaire pré-rempli */
function versCave(it) {
  it.ajouteLe = new Date().toISOString();
  cave.save(); cave.syncEnvies();
  cave.enviePrefill = it;
  cave.toast(`${it.nom || "Bouteille"} — formulaire d'ajout pré-rempli`);
  fermerNote();
}
function annuleAchete(it) { it.ajouteLe = null; cave.save(); cave.syncEnvies(); }
function fmtDate(iso) { return ilYA(new Date(iso).getTime()); }

/* ---------- Partage des notes (multi-sélection) : WhatsApp ou PDF ---------- */
const partageMode = ref(false);
const selIds = ref([]);
function startPartage() { partageMode.value = true; selIds.value = []; }
function stopPartage() { partageMode.value = false; selIds.value = []; }
function toggleSel(e) {
  const i = selIds.value.indexOf(e.id);
  if (i > -1) selIds.value.splice(i, 1); else selIds.value.push(e.id);
}
const selNotes = computed(() => envies.value.filter(e => selIds.value.includes(e.id)));

/* WhatsApp : on envoie le MÊME PDF que le partage PDF (générateur maison),
   via la feuille de partage système (fichier transmissible à WhatsApp) ;
   sinon téléchargement du PDF à attacher manuellement. */
async function partageWhatsapp() {
  if (!selNotes.value.length) { cave.toast("Sélectionne au moins une note"); return; }
  const avecItems = selNotes.value.filter(e => (e.items || []).some(i => !i.ajouteLe));
  if (!avecItems.length) { cave.toast("Aucune bouteille à acheter dans la sélection"); return; }
  try {
    const bytes = enviesPDFBytes(avecItems);
    const fichier = new File([bytes], "mes-envies.pdf", { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: "Mes envies d'achat" });
      stopPartage();
    } else {
      const url = URL.createObjectURL(fichier);
      const a = document.createElement("a");
      a.href = url; a.download = "mes-envies.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      cave.toast("PDF téléchargé — attache-le dans WhatsApp");
      stopPartage();
    }
  } catch { cave.toast("Partage indisponible sur cet appareil"); }
}

function partagePDF() {
  if (!selNotes.value.length) { cave.toast("Sélectionne au moins une note"); return; }
  exportEnviesPDF(selNotes.value, t => cave.toast(t));
}
</script>

<template>
  <section class="p-4 pb-24 max-w-2xl mx-auto">
    <!-- ===== Liste des notes ===== -->
    <template v-if="!noteOuverte">
      <button @click="router.push('/')" class="text-xs text-muted flex items-center gap-1 -ml-1 py-1" title="Retour à la cave"><Ic name="chevL" cls="w-4 h-4" /> Ma cave</button>
      <div class="mt-1">
        <p class="text-[10px] text-muted uppercase tracking-widest">Panier</p>
        <h1 class="font-serif text-2xl leading-tight">Envies d'achat</h1>
        <p class="text-xs text-muted mt-0.5">{{ cave.nbEnvies }} bouteille{{ cave.nbEnvies > 1 ? 's' : '' }} à acheter · {{ envies.length }} note{{ envies.length > 1 ? 's' : '' }}</p>
      </div>

      <div v-if="!partageMode" class="flex gap-2 mt-3">
        <input v-model="nouveauNom" placeholder="Nouvelle note (ex. Chez Michel · Strasbourg)" class="flex-1 min-w-0 bg-white border border-hairline rounded-full px-4 py-2.5 text-sm" @keyup.enter="creerNote" />
        <button @click="creerNote" class="shrink-0 px-4 py-2.5 rounded-full bg-accent text-white text-sm">Créer</button>
      </div>

      <div v-if="envies.length" class="flex gap-1.5 mt-3 items-center">
        <div class="flex-1 relative">
          <input v-model="rech" placeholder="Chercher un caviste, un vin…" class="w-full bg-white border border-hairline rounded-full pl-9 pr-4 py-2 text-sm" />
          <Ic name="search" cls="w-4 h-4 absolute left-3 top-2.5 text-muted" />
        </div>
      </div>
      <div v-if="envies.length" class="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar pb-0.5">
        <button v-for="t in [['recent', 'Récentes'], ['caviste', 'Par caviste']]" :key="t[0]" @click="tri = t[0]" class="shrink-0 px-3 py-1.5 rounded-full border text-xs" :class="tri === t[0] ? 'border-accent text-accent bg-white' : 'border-hairline bg-white text-muted'">{{ t[1] }}</button>
        <button @click="partageMode ? stopPartage() : startPartage()" class="shrink-0 px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5" :class="partageMode ? 'border-accent text-accent bg-white font-semibold' : 'border-2 border-accent text-accent bg-accent-soft font-semibold'"><Ic name="share" cls="w-3.5 h-3.5" /> {{ partageMode ? 'Choisir…' : 'Partager des notes' }}</button>
      </div>

      <div v-if="!enviesVisibles.length" class="py-14 text-center">
        <p class="font-serif text-lg">Aucune note</p>
        <p class="text-sm text-muted mt-1">{{ envies.length ? "Aucune note ne correspond à ta recherche" : "Crée une note pour commencer à sauvegarder les bouteilles repérées 🍷" }}</p>
      </div>

      <!-- Tri par caviste : groupes avec en-têtes -->
      <template v-if="groupesCaviste">
        <div v-for="g in groupesCaviste" :key="g.caviste" class="mb-3">
          <div class="sticky top-0 z-10 -mx-1 px-1 py-2.5 bg-cream/95 backdrop-blur text-[13px] font-medium text-ink border-l-[3px] border-accent pl-2">
            {{ g.caviste }} <span class="text-muted/70 font-normal">· {{ g.notes.length }} note{{ g.notes.length > 1 ? 's' : '' }} · {{ g.notes.reduce((s, e) => s + nbItems(e), 0) }} à acheter</span>
          </div>
          <div v-for="e in g.notes" :key="e.id" class="bg-white border rounded-xl2 p-3 mb-2 transition-colors" :class="selIds.includes(e.id) ? 'border-accent bg-accent-soft' : 'border-hairline'">
            <button @click="partageMode ? toggleSel(e) : ouvrirNote(e)" class="w-full flex items-center gap-2.5 text-left">
              <span v-if="partageMode" class="w-6 h-6 rounded-full border flex items-center justify-center shrink-0" :class="selIds.includes(e.id) ? 'bg-accent border-accent text-white' : 'border-hairline text-transparent'"><Ic name="check" cls="w-3.5 h-3.5" /></span>
              <span class="w-8 h-11 rounded-lg bg-cream border border-hairline flex items-center justify-center shrink-0 overflow-hidden">
                <img v-if="(e.items || [])[0]?.photos?.[0]" :src="e.items[0].photos[0]" alt="" class="w-full h-full object-cover" />
                <Ic v-else name="note" cls="w-4 h-4 text-muted" />
              </span>
              <span class="flex-1 min-w-0">
                <span class="block text-sm font-medium truncate">{{ e.nom }}</span>
                <span class="block text-[11px] text-muted truncate"><strong class="font-semibold text-ink">{{ e.caviste }}</strong><template v-if="e.caviste"> · </template>{{ fmtDate(e.creeLe) }} · {{ nbItems(e) }} à acheter<template v-if="totalItems(e) > nbItems(e)"> · {{ totalItems(e) - nbItems(e) }} en cave</template></span>
              </span>
              <Ic v-if="!partageMode" name="chevronR" cls="w-4 h-4 text-muted shrink-0" />
            </button>
          </div>
        </div>
      </template>

      <!-- Autres tris : liste simple -->
      <template v-else>
        <div v-for="e in enviesVisibles" :key="e.id" class="bg-white border rounded-xl2 p-3 mb-2 transition-colors" :class="selIds.includes(e.id) ? 'border-accent bg-accent-soft' : 'border-hairline'">
          <button @click="partageMode ? toggleSel(e) : ouvrirNote(e)" class="w-full flex items-center gap-2.5 text-left">
            <span v-if="partageMode" class="w-6 h-6 rounded-full border flex items-center justify-center shrink-0" :class="selIds.includes(e.id) ? 'bg-accent border-accent text-white' : 'border-hairline text-transparent'"><Ic name="check" cls="w-3.5 h-3.5" /></span>
            <span class="w-8 h-11 rounded-lg bg-cream border border-hairline flex items-center justify-center shrink-0 overflow-hidden">
              <img v-if="(e.items || [])[0]?.photos?.[0]" :src="e.items[0].photos[0]" alt="" class="w-full h-full object-cover" />
              <Ic v-else name="note" cls="w-4 h-4 text-muted" />
            </span>
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium truncate">{{ e.nom }}</span>
              <span class="block text-[11px] text-muted truncate"><strong class="font-semibold text-ink">{{ e.caviste }}</strong><template v-if="e.caviste"> · </template>{{ fmtDate(e.creeLe) }} · {{ nbItems(e) }} à acheter<template v-if="totalItems(e) > nbItems(e)"> · {{ totalItems(e) - nbItems(e) }} en cave</template></span>
            </span>
            <Ic v-if="!partageMode" name="chevronR" cls="w-4 h-4 text-muted shrink-0" />
          </button>
        </div>
      </template>
    </template>

    <!-- ===== Détail d'une note : design dense ===== -->
    <template v-else>
      <button @click="fermerNote" class="text-xs text-muted flex items-center gap-1 -ml-1 py-1"><Ic name="chevL" cls="w-4 h-4" /> Toutes les notes</button>

      <div class="flex items-start justify-between gap-2 mt-1">
        <div class="min-w-0">
          <h1 class="font-serif text-xl leading-tight break-words">{{ noteOuverte.nom }}<template v-if="noteOuverte.caviste"> <span class="font-sans text-sm text-muted font-normal">— {{ noteOuverte.caviste }}</span></template></h1>
          <p class="text-xs text-muted mt-0.5">{{ fmtDate(noteOuverte.creeLe) }} · {{ nbItems(noteOuverte) }} à acheter</p>
        </div>
        <button @click="startEdit" class="text-muted p-2 -m-2 shrink-0" title="Renommer, caviste ou supprimer"><Ic name="pencil" cls="w-5 h-5" /></button>
      </div>

      <div v-if="editMeta" class="bg-white border border-hairline rounded-xl2 p-3 mt-3">
        <div class="flex gap-2">
          <div class="flex-1 min-w-0">
            <input v-model="renNom" placeholder="Nom de la note" class="w-full bg-cream border border-hairline rounded-full px-3 py-2 text-sm" />
            <p class="text-[9px] text-muted text-center mt-0.5">Note</p>
          </div>
          <div class="w-36 shrink-0">
            <input v-model="renCaviste" placeholder="Caviste" class="w-full bg-cream border border-hairline rounded-full px-3 py-2 text-sm" />
            <p class="text-[9px] text-muted text-center mt-0.5">Caviste</p>
          </div>
        </div>
        <div class="flex gap-2 mt-2.5">
          <button @click="renommer" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">Enregistrer</button>
          <button @click="supprimerNote(noteOuverte)" class="px-4 py-2.5 rounded-full border border-accent text-accent text-sm flex items-center gap-1.5"><Ic name="trash" cls="w-4 h-4" /> Supprimer</button>
        </div>
      </div>

      <!-- Formulaire d'article -->
      <div v-if="addOpen" class="bg-white border border-riesling rounded-xl2 p-3 mt-3">
        <p class="text-[10px] text-muted uppercase tracking-widest mb-2">Nouvelle bouteille</p>
        <div class="flex gap-2">
          <div class="flex-1 min-w-0">
            <input v-model="ni.nom" placeholder="Nom de la bouteille" class="w-full bg-cream border border-hairline rounded-full px-3 py-2 text-sm" />
            <p class="text-[9px] text-muted text-center mt-0.5">Nom</p>
          </div>
          <div class="w-20 shrink-0">
            <input v-model.number="ni.millesime" type="number" placeholder="Millésime" class="w-full bg-cream border border-hairline rounded-full px-3 py-2 text-sm" />
            <p class="text-[9px] text-muted text-center mt-0.5">Millésime</p>
          </div>
          <div class="w-20 shrink-0">
            <input v-model.number="ni.prix" type="number" step="0.01" placeholder="Prix €" class="w-full bg-cream border border-hairline rounded-full px-3 py-2 text-sm" />
            <p class="text-[9px] text-muted text-center mt-0.5">Prix</p>
          </div>
        </div>
        <div class="flex gap-2 mt-2">
          <div class="flex-1 min-w-0">
            <input v-model="ni.cuvee" placeholder="Cuvée (facultatif)" class="w-full bg-cream border border-hairline rounded-full px-3 py-2 text-sm" />
            <p class="text-[9px] text-muted text-center mt-0.5">Cuvée</p>
          </div>
          <div class="flex-[1.6] min-w-0">
            <input v-model="ni.commentaire" placeholder="Une envie, une occasion… (facultatif)" class="w-full bg-cream border border-hairline rounded-full px-3 py-2 text-sm" />
            <p class="text-[9px] text-muted text-center mt-0.5">Commentaire</p>
          </div>
        </div>
        <div v-if="(ni.photos || []).length" class="flex gap-1.5 mt-2 pt-1.5 pr-1.5 overflow-x-auto no-scrollbar">
          <div v-for="(p, pi) in ni.photos" :key="pi" class="relative shrink-0">
            <img :src="p" alt="" class="w-16 h-20 object-cover rounded-lg border border-hairline" />
            <button @click="ni.photos.splice(pi, 1)" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-white flex items-center justify-center" title="Retirer"><Ic name="x" cls="w-3 h-3" /></button>
          </div>
        </div>
        <div class="flex gap-2 mt-2.5">
          <label class="flex-1 py-2.5 rounded-full border border-hairline bg-cream text-xs flex items-center justify-center gap-1.5 cursor-pointer">
            <Ic name="camera" cls="w-3.5 h-3.5" /> {{ (ni.photos || []).length ? 'Encore une photo' : 'Photo(s) de la bouteille' }}
            <input type="file" accept="image/*" multiple class="hidden" @change="onPhotos($event, ni)" />
          </label>
          <button @click="ajouterItem" class="px-5 py-2.5 rounded-full bg-accent text-white text-sm shrink-0 flex items-center gap-1.5"><Ic name="plus" cls="w-4 h-4" /> Ajouter</button>
        </div>
        <p v-if="photoEnCours" class="text-[10px] text-muted mt-1.5">Traitement des photos…</p>
      </div>
      <button v-else @click="ouvrirForm" class="w-full mt-3 py-2.5 rounded-full border border-dashed border-gold text-gold text-xs flex items-center justify-center gap-1.5"><Ic name="plus" cls="w-3.5 h-3.5" /> Ajouter une bouteille à cette note</button>

      <!-- Articles : design dense (lignes, liserés, badges) -->
      <div class="bg-white border border-hairline rounded-xl2 mt-3 overflow-hidden">
        <template v-for="it in noteOuverte.items" :key="it.id">
        <!-- Article en cours d'édition -->
        <div v-if="editItId === it.id" class="px-3 py-3 border-b border-hairline bg-cream/60">
          <p class="text-[10px] text-muted uppercase tracking-widest mb-2">Modifier la bouteille</p>
          <div class="flex gap-2">
            <div class="flex-1 min-w-0">
              <input v-model="ei.nom" placeholder="Nom de la bouteille" class="w-full bg-white border border-hairline rounded-full px-3 py-2 text-sm" />
              <p class="text-[9px] text-muted text-center mt-0.5">Nom</p>
            </div>
            <div class="w-20 shrink-0">
              <input v-model.number="ei.millesime" type="number" placeholder="Millésime" class="w-full bg-white border border-hairline rounded-full px-3 py-2 text-sm" />
              <p class="text-[9px] text-muted text-center mt-0.5">Millésime</p>
            </div>
            <div class="w-20 shrink-0">
              <input v-model.number="ei.prix" type="number" step="0.01" placeholder="Prix €" class="w-full bg-white border border-hairline rounded-full px-3 py-2 text-sm" />
              <p class="text-[9px] text-muted text-center mt-0.5">Prix</p>
            </div>
          </div>
          <div class="flex gap-2 mt-2">
            <div class="flex-1 min-w-0">
              <input v-model="ei.cuvee" placeholder="Cuvée (facultatif)" class="w-full bg-white border border-hairline rounded-full px-3 py-2 text-sm" />
              <p class="text-[9px] text-muted text-center mt-0.5">Cuvée</p>
            </div>
            <div class="flex-[1.6] min-w-0">
              <input v-model="ei.commentaire" placeholder="Commentaire (facultatif)" class="w-full bg-white border border-hairline rounded-full px-3 py-2 text-sm" />
              <p class="text-[9px] text-muted text-center mt-0.5">Commentaire</p>
            </div>
          </div>
          <div v-if="(ei.photos || []).length" class="flex gap-1.5 mt-2.5 pt-1.5 pr-1.5 overflow-x-auto no-scrollbar">
            <div v-for="(p, pi) in ei.photos" :key="pi" class="relative shrink-0">
              <img :src="p" alt="" class="w-16 h-20 object-cover rounded-lg border border-hairline" />
              <button @click="ei.photos.splice(pi, 1)" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center" title="Supprimer la photo"><Ic name="x" cls="w-3 h-3" /></button>
            </div>
          </div>
          <label class="mt-2.5 py-2 rounded-full border border-hairline bg-cream text-xs flex items-center justify-center gap-1.5 cursor-pointer">
            <Ic name="camera" cls="w-3.5 h-3.5" /> {{ (ei.photos || []).length ? 'Ajouter d\u2019autres photos' : 'Ajouter des photos' }}
            <input type="file" accept="image/*" multiple class="hidden" @change="onPhotos($event, 'edit')" />
          </label>
          <div class="flex gap-2 mt-2.5">
            <button @click="annuleEditItem" class="flex-1 py-2 rounded-full border border-hairline bg-white text-xs text-muted">Annuler</button>
            <button @click="saveItem(it)" class="flex-1 py-2 rounded-full bg-accent text-white text-xs">Enregistrer</button>
          </div>
        </div>

        <!-- Article normal -->
        <div v-else class="flex items-center gap-2.5 px-3 py-2.5 border-b border-hairline last:border-0" :class="it.ajouteLe ? 'opacity-55' : ''">
          <img v-if="it.photos && it.photos.length" :src="it.photos[0]" alt="" class="w-10 h-14 object-cover rounded-lg border border-hairline shrink-0" />
          <Ic v-else name="bottleEmpty" cls="w-6 h-14 shrink-0 text-muted/50" />
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate" :class="it.ajouteLe ? 'line-through text-muted' : ''">{{ it.nom || 'Sans nom' }}</p>
            <p class="block truncate text-[11px] text-muted">{{ [it.cuvee, it.millesime, (it.prix != null ? it.prix + ' €' : null), it.commentaire].filter(Boolean).join(' · ') }}</p>
          </div>
          <div class="flex flex-col gap-1.5 shrink-0">
            <button v-if="!it.ajouteLe" @click="versCave(it)" class="px-3.5 py-1.5 rounded-full bg-accent text-white text-xs flex items-center gap-1.5" title="Pré-remplir le formulaire d'ajout à la cave"><Ic name="plus" cls="w-3.5 h-3.5" /> Ma cave</button>
            <button v-else @click="annuleAchete(it)" class="px-3.5 py-1.5 rounded-full border border-hairline text-muted text-xs" title="Annuler — pas encore achetée en fait">Annuler</button>
            <div class="flex gap-1.5 justify-end">
              <button @click="startEditItem(it)" class="w-8 h-8 rounded-full border border-hairline bg-white flex items-center justify-center text-ink" title="Modifier la bouteille"><Ic name="pencil" cls="w-4 h-4" /></button>
              <button @click="supprimerItem(it)" class="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center" title="Supprimer la bouteille de la note"><Ic name="trash" cls="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </template>
        <p v-if="!(noteOuverte.items || []).length" class="text-[11px] text-muted text-center px-4 py-5">Note créée — ajoute la première bouteille repérée pour commencer à la sauvegarder 🍷</p>
      </div>
      <p v-if="(noteOuverte.items || []).length > 1" class="text-[10px] text-muted mt-2 text-center">Barrées = déjà passées en cave (annulable d'un tap sur « Annuler »)</p>
    </template>

    <!-- Barre d'action du mode partage -->
    <div v-if="partageMode" class="fixed bottom-20 inset-x-0 z-30 px-4 pointer-events-none">
      <div class="max-w-2xl mx-auto bg-white border border-hairline rounded-xl2 shadow-lg p-3 pointer-events-auto">
        <p class="text-xs text-muted text-center mb-2">{{ selIds.length }} note{{ selIds.length > 1 ? 's' : '' }} sélectionnée{{ selIds.length > 1 ? 's' : '' }}</p>
        <div class="flex gap-2">
          <button @click="partageWhatsapp" class="flex-1 px-2 py-2.5 rounded-full bg-accent text-white text-xs flex items-center justify-center gap-1.5"><Ic name="share" cls="w-3.5 h-3.5" /> WhatsApp</button>
          <button @click="partagePDF" class="flex-1 px-2 py-2.5 rounded-full bg-riesling text-ink text-xs flex items-center justify-center gap-1.5"><Ic name="book" cls="w-3.5 h-3.5" /> PDF</button>
          <button @click="stopPartage" class="flex-1 px-2 py-2.5 rounded-full border border-hairline text-xs text-muted">Annuler</button>
        </div>
      </div>
    </div>
  </section>
</template>
