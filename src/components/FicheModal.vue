<script setup>
/* Fiche bouteille : lecture + édition + « Avec quoi la boire ? » + listes + photo locale */
import { ref, computed, watch } from "vue";
import { useCave } from "../stores/cave.js";
import { estimeApogee } from "../lib/apogee.js";
import { platsPourBouteille } from "../lib/accords.js";
import { partagerBouteille } from "../lib/partage.js";
import { splitNom, cepageCourt, photoFromFile, accTxt } from "../util.js";
import { CEPAGES, SPECIFICITES, SPIRIT_MENTIONS } from "../config.js";
import Ic from "./Ic.vue";
import { notePalier } from "../lib/noteEchelle.js";

const cave = useCave();
const b = computed(() => cave.bouteilleOuverte);
const year = new Date().getFullYear();

const edit = ref(false);
const acc = ref(false);
const noteVal = ref(80);
const apoD = ref("");
const apoF = ref("");
const listeNewNom = ref(false);
const flisteNom = ref("");
const e = ref({});
const eCaveSel = ref("");
const eNewCave = ref(false);

/* Pré-remplit le formulaire d'édition depuis la bouteille ouverte.
   C'est LA seule source de vérité du pré-remplissage : startEdit() l'appelle
   (avant, les champs restaient vides car seul le watch remplissait e,
   et uniquement quand la bouteille changeait pendant l'édition). */
function remplitEdit(nb) {
  e.value = {
    nom: nb.nom ?? "", categorie: nb.categorie ?? "Rouge", quantite: nb.quantite ?? 1,
    millesime: nb.millesime ?? null, prix: nb.prix ?? null,
    appellation: nb.appellation ?? "", cepage: nb.cepage ?? "", specificite: nb.specificite ?? "", region: nb.region ?? "",
    pays: nb.pays ?? "", cave: nb.cave ?? "", cuvee: nb.cuvee ?? "",
    format: nb.format ?? "Bouteille (75 cl)",
    apoDebut: nb.apoDebut ?? null, apoFin: nb.apoFin ?? null, commentaire: nb.commentaire ?? "",
  };
  eNewCave.value = e.value.cave !== "" && !cave.cavesConnues.includes(e.value.cave);
  eCaveSel.value = eNewCave.value ? "__nouvelle__" : (e.value.cave || "");
}

/* Le champ cave fonctionne exactement comme à la création : liste déroulante
   des caves connues + « Autre cave… » qui bascule en saisie libre. */
watch(eCaveSel, v => {
  if (v === "__nouvelle__") { eNewCave.value = true; }
  else { eNewCave.value = false; if (e.value) e.value.cave = v; }
});

watch(b, (nb, ob) => {
  if (!nb) return;
  if (nb.id !== ob?.id) { edit.value = false; acc.value = false; listeNewNom.value = false; }
  noteVal.value = nb.note ?? 80;
  apoD.value = nb.apoDebut ?? "";
  apoF.value = nb.apoFin ?? "";
  if (edit.value) remplitEdit(nb);
}, { immediate: true });

/* Select cépage édition : liste + Assemblage + Autre… (texte conservé si hors liste) */
const CEPAGE_OPTS = ["", ...CEPAGES, "Assemblage", "__autre__"];
const eCepageSel = computed({
  get() { return e.value ? (CEPAGE_OPTS.includes(e.value.cepage) ? e.value.cepage : "__autre__") : ""; },
  set(v) { if (e.value) e.value.cepage = v === "__autre__" ? "" : v; },
});

function startEdit() { remplitEdit(b.value); edit.value = true; }

function saveEdit() {
  const bo = b.value;
  const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? null : n; };
  bo.nom = (e.value.nom || "").trim() || bo.nom;
  bo.categorie = e.value.categorie || bo.categorie;
  bo.type = bo.categorie === "Spiritueux" ? "Spiritueux" : "Vin";
  const q = num(e.value.quantite); bo.quantite = q != null ? Math.max(0, Math.round(q)) : bo.quantite;
  const m = num(e.value.millesime); bo.millesime = m != null ? Math.round(m) : null;
  bo.prix = num(e.value.prix);
  bo.appellation = (e.value.appellation || "").trim();
  bo.cepage = (e.value.cepage || "").trim();
  bo.specificite = (e.value.specificite || "").trim();
  bo.region = (e.value.region || "").trim();
  bo.pays = (e.value.pays || "").trim();
  bo.cave = (e.value.cave || "").trim() || bo.cave;
  bo.cuvee = (e.value.cuvee || "").trim();
  bo.format = e.value.format || "Bouteille (75 cl)";
  bo.commentaire = (e.value.commentaire || "").trim();
  const d = num(e.value.apoDebut), f2 = num(e.value.apoFin);
  if (d != null) { bo.apoDebut = Math.round(d); bo.apoFin = f2 != null ? Math.round(f2) : Math.round(d); bo.apoAuto = null; bo.apoRegle = null; }
  else { bo.apoDebut = null; bo.apoFin = null; bo.apoAuto = estimeApogee(bo); bo.apoRegle = bo.apoAuto ? bo.apoAuto.regle : null; }
  bo.modifLe = new Date().toISOString();
  cave.save();
  edit.value = false;
  cave.closeFiche();
  cave.toast("Fiche mise à jour");
  cave.syncNotion({ action: "sync", bouteilles: [bo] });
}

function saveNote() {
  const n = parseInt(noteVal.value, 10);
  b.value.note = n;
  const h = [...(cave.db.bues || [])].reverse().find(x => x.nom === b.value.nom);
  if (h) h.note = n;
  b.value.modifLe = new Date().toISOString();
  cave.save();
  cave.toast(`Note ${n} enregistrée`);
}

function saveApo() {
  const d = parseInt(apoD.value, 10), f2 = parseInt(apoF.value, 10);
  if (isNaN(d)) { cave.toast("Indique au moins l'année de début"); return; }
  b.value.apoDebut = d; b.value.apoFin = isNaN(f2) ? d : f2; b.value.apoAuto = null; b.value.apoRegle = null;
  b.value.modifLe = new Date().toISOString();
  cave.save();
  cave.toast("Ta fenêtre d'apogée prime");
}

function supprimer() {
  const nom = b.value.nom || "cette bouteille";
  cave.askConfirm(`Supprimer ${nom} de la cave ?`, "Supprimer", () => {
    const i = cave.db.bouteilles.findIndex(x => x.id === b.value.id);
    if (i > -1) {
      cave.syncNotion({ action: "delete", bouteille: cave.db.bouteilles[i] });
      cave.db.bouteilles.splice(i, 1);
      for (const l of cave.listes) l.ids = (l.ids || []).filter(x => x !== b.value.id);
      cave.save(); cave.syncListes();
    }
    cave.closeFiche();
    cave.toast("Bouteille supprimée de la cave");
  });
}

function boire() { const id = b.value.id; cave.closeFiche(); cave.drink(id); }

function newPhoto(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  cave.toast("Traitement de la photo…");
  photoFromFile(f, data => { b.value.photo = data; b.value.modifLe = new Date().toISOString(); cave.save(); cave.toast("Photo ajoutée à la fiche"); });
  ev.target.value = "";
}
function editPhoto(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  photoFromFile(f, data => { e.value._photo = data; cave.toast("Photo ajoutée — enregistrer pour l'appliquer"); });
  ev.target.value = "";
}

function newFicheListe() {
  const nom = (flisteNom.value || "").trim();
  if (!nom) { listeNewNom.value = false; return; }
  const l = { id: "l" + Date.now().toString(36), nom, date: null, ids: [b.value.id], qtes: {} };
  if (b.value.quantite === 1) { for (const o of cave.listes) { o.ids = (o.ids || []).filter(x => x !== b.value.id); delete o.qtes[b.value.id]; } }
  cave.listes.push(l);
  listeNewNom.value = false;
  cave.save(); cave.syncListes();
  cave.toast(`Réservée dans la nouvelle liste « ${nom} »`);
}

const sn = computed(() => splitNom(b.value || {}));
const apo = computed(() => {
  const bo = b.value || {};
  return bo.apoDebut != null ? { d: bo.apoDebut, f: bo.apoFin ?? bo.apoDebut, mine: true } : bo.apoAuto ? { d: bo.apoAuto.debut, f: bo.apoAuto.fin, mine: false, regle: bo.apoAuto.regle } : null;
});
const accs = computed(() => (b.value && acc.value) ? platsPourBouteille(b.value, year) : []);

/* Partage : carte PNG (photo, identité, apogée, note, 2-3 accords) —
   sans le nombre de bouteilles, ça ne regarde personne */
const partageEnCours = ref(false);
async function partager() {
  if (!b.value || partageEnCours.value) return;
  partageEnCours.value = true;
  try {
    const accords = platsPourBouteille(b.value, year);
    const r = await partagerBouteille(b.value, accords);
    cave.toast(r === "telecharge" ? "Carte téléchargée — partage-la comme tu veux" : "Bonne dégustation !");
  } catch {
    cave.toast("Partage impossible sur cet appareil");
  }
  partageEnCours.value = false;
}

/* Légende d'échelle de notation (70–100, comme le carnet de dégustation) */
const leg = computed(() => notePalier(noteVal.value));

/* Verrouillage du scroll de fond */
watch(() => !!cave.bouteilleOuverte, v => cave.overlay("fiche", v));
watch(acc, v => cave.overlay("fiche-acc", v));
</script>

<template>
  <div v-if="b" class="fixed inset-0 z-30 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4" @click.self="cave.closeFiche()">
    <div class="bg-white rounded-t-xl2 md:rounded-xl2 w-full max-w-md max-h-[92vh] overflow-y-auto">

      <!-- ===== Lecture ===== -->
      <div v-if="!edit" class="p-5">
        <div class="flex items-start justify-end">
          <button @click="startEdit" class="text-muted p-2 -m-2 mr-1" title="Modifier la fiche"><Ic name="pencil" cls="w-5 h-5" /></button>
          <button @click="cave.closeFiche()" class="close-x" title="Fermer"><Ic name="x" cls="w-4 h-4" /></button>
        </div>

        <img v-if="b.photo" :src="b.photo" alt="" class="w-full h-44 object-cover rounded-xl2 mt-2" />

        <div class="mt-2 p-4 bg-cream rounded-xl2 text-center">
          <p v-if="sn.domaine" class="font-serif text-2xl leading-tight">{{ sn.domaine }}</p>
          <p v-if="sn.cuvee" class="font-serif text-lg leading-snug mt-0.5">{{ sn.cuvee }}</p>
          <p class="text-sm mt-1.5 flex items-center justify-center gap-1.5">
            <span class="inline-block w-2 h-2 rounded-full shrink-0" :style="'background:' + (cave.CAT_COLORS[b.categorie] || '#8A7F75')"></span>
            <span>{{ b.categorie }}</span>
            <span v-if="b.cepage" class="text-muted">· {{ b.cepage }}</span>
            <span v-if="b.appellation" class="text-muted">· {{ b.appellation }}</span>
          </p>
        </div>

        <dl class="mt-3 text-sm">
          <div v-for="([k, v]) in [['Millésime', b.millesime ?? '—'], ...(cave.estSpiritueux(b) ? [['Mention', b.specificite || '—']] : [['Cépage', [b.cepage || '—', b.specificite].filter(Boolean).join(' · ')]]), ['Appellation', b.appellation || '—'], ['Région', [b.region, b.pays].filter(Boolean).join(', ') || '—'], ['Cave', b.cave || '—'], ['Format', b.format || 'Bouteille (75 cl)'], ['Prix', b.prix != null ? b.prix + ' €' : '—'], ['En stock', b.quantite + ' bouteille' + (b.quantite > 1 ? 's' : '')]]" :key="k" class="flex justify-between gap-2 py-1.5 border-b border-hairline last:border-0">
            <dt class="text-muted">{{ k }}</dt><dd class="text-right">{{ v }}</dd>
          </div>
        </dl>

        <div v-if="!cave.estSpiritueux(b)" class="mt-3 p-3 rounded-xl2 bg-riesling/20 border border-riesling/50">
          <div class="flex justify-between items-center">
            <p class="text-[10px] text-muted uppercase tracking-widest">Apogée</p>
            <p class="text-sm">{{ apo ? (year < apo.d ? apo.d + ' – ' + apo.f : year > apo.f ? 'passé l\'apogée' : apo.d + ' – ' + apo.f) : '—' }}</p>
          </div>
          <p v-if="apo && !apo.mine" class="text-[11px] text-muted mt-1">estimé : {{ apo.regle || 'règle' }}</p>
          <p v-else-if="apo && apo.mine" class="text-[11px] text-gold mt-1">ta valeur</p>
          <div class="flex gap-2 mt-2">
            <input v-model="apoD" type="number" placeholder="Début" class="w-1/2 bg-white border border-hairline rounded-lg px-2 py-1.5 text-xs" />
            <input v-model="apoF" type="number" placeholder="Fin" class="w-1/2 bg-white border border-hairline rounded-lg px-2 py-1.5 text-xs" />
            <button @click="saveApo" class="shrink-0 px-3 rounded-lg bg-cream border border-hairline text-xs">OK</button>
          </div>
        </div>

        <div class="mt-3 p-3 rounded-xl2 bg-accent-soft border border-accent/20">
          <div class="flex items-center justify-between">
            <p class="text-[10px] text-muted uppercase tracking-widest">Note (optionnel)</p>
            <p class="font-serif text-2xl leading-none"><span class="tabular-nums">{{ noteVal }}</span><span class="text-muted text-xs"> / 100</span></p>
          </div>
          <input v-model.number="noteVal" type="range" min="70" max="100" class="flex-1 w-full mt-2 accent-gold" aria-label="Note sur 100" />
          <p class="text-[12px] text-muted italic leading-snug mt-1"><b class="text-gold not-italic">{{ leg.palier }}</b> · {{ leg.texte }}</p>
          <p v-if="b.note != null" class="text-[10px] text-muted mt-1.5">Note enregistrée : <span class="tabular-nums">{{ b.note }}</span>/100</p>
          <button @click="saveNote" class="mt-2 w-full py-2 rounded-full border border-hairline text-xs text-muted bg-white">{{ b.note == null ? 'Enregistrer la note' : 'Mettre à jour la note' }}</button>
        </div>

        <p v-if="b.commentaire" class="mt-3 text-xs text-muted italic">"{{ b.commentaire }}"</p>

        <div class="mt-3 p-3 rounded-xl2 bg-gold/10 border border-gold/30">
          <p class="text-[10px] text-muted uppercase tracking-widest mb-2">Mettre de côté</p>
          <div class="flex flex-wrap gap-2">
            <button v-for="l in cave.listes" :key="l.id" @click="cave.toggleListe(l.id, b)" class="px-3 py-1.5 rounded-full text-xs border flex items-center gap-1.5" :class="(l.ids || []).includes(b.id) ? 'bg-accent text-white border-accent' : 'bg-white text-ink border-hairline'">
              <Ic :name="(l.ids || []).includes(b.id) ? 'check' : 'heart'" cls="w-3.5 h-3.5" /> {{ l.nom }}<span v-if="(l.ids || []).includes(b.id) && cave.listeQ(l, b.id) > 1"> ×{{ cave.listeQ(l, b.id) }}</span>
            </button>
            <template v-if="listeNewNom">
              <input v-model="flisteNom" placeholder="Nom de la liste…" class="px-3 py-1.5 rounded-full text-xs border border-gold bg-white w-40" />
              <button @click="newFicheListe" class="px-3 py-1.5 rounded-full text-xs bg-gold text-white">OK</button>
            </template>
            <button v-else @click="listeNewNom = true" class="px-3 py-1.5 rounded-full text-xs border border-dashed border-gold text-gold">+ Nouvelle liste</button>
          </div>
          <p v-if="b.quantite === 1 && cave.listesDe(b).length" class="text-[10px] text-muted mt-2">Une seule bouteille : elle ne peut être que dans « {{ cave.listesDe(b)[0].nom }} ».</p>
        </div>

        <button @click="acc = true" class="w-full py-2.5 mt-4 rounded-full bg-riesling/40 border border-riesling text-sm flex items-center justify-center gap-2" title="Les plats qui vont avec cette bouteille"><Ic name="sparkles" cls="w-5 h-5" /> Avec quoi la boire ?</button>
        <button @click="partager" :disabled="partageEnCours" class="w-full py-2.5 mt-2 rounded-full border border-hairline bg-white text-sm flex items-center justify-center gap-2" title="Générer une carte de la bouteille à partager (sans le nombre de bouteilles)"><Ic name="trayUp" cls="w-4 h-4" /> {{ partageEnCours ? 'Préparation…' : 'Partager la fiche' }}</button>

        <div class="flex gap-2 mt-4">
          <button @click="boire" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm flex items-center justify-center gap-2"><Ic name="glass" cls="w-5 h-5" /> Boire une bouteille</button>
          <button @click="supprimer" class="shrink-0 px-4 py-2.5 rounded-full border border-accent text-accent text-sm flex items-center gap-1.5" title="Supprimer cette bouteille de la cave"><Ic name="trash" cls="w-4 h-4" /> Supprimer</button>
        </div>
      </div>

      <!-- ===== Édition ===== -->
      <form v-else class="p-5" @submit.prevent="saveEdit">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] text-muted uppercase tracking-widest">Modifier</p>
            <p class="font-serif text-lg leading-tight">{{ sn.domaine }}</p>
          </div>
          <button type="button" @click="edit = false" class="close-x" title="Annuler"><Ic name="x" cls="w-4 h-4" /></button>
        </div>
        <div class="mt-4 space-y-2.5">
          <div>
            <input v-model="e.nom" placeholder="Domaine ou Spiritueux" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
            <p class="text-[10px] text-muted mt-1 ml-1">Nom</p>
          </div>
          <div class="flex gap-2 items-start">
            <div class="flex-1 min-w-0">
              <select v-model="e.categorie" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                <option v-for="c in cave.CATS" :key="c">{{ c }}</option>
              </select>
              <p class="text-[10px] text-muted mt-1 ml-1">Catégorie</p>
            </div>
            <div class="w-16 shrink-0">
              <input v-model.number="e.quantite" type="number" min="0" placeholder="Qté" class="w-full bg-cream border border-hairline rounded-lg px-2 py-2.5 text-sm text-center" title="Nombre de bouteilles" />
              <p class="text-[10px] text-muted mt-1 text-center">Bouteilles</p>
            </div>
          </div>
          <div class="flex gap-2 items-start">
            <div class="w-1/2 min-w-0">
              <input v-model.number="e.millesime" type="number" placeholder="Millésime" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Millésime</p>
            </div>
            <div class="w-1/2 min-w-0">
              <input v-model.number="e.prix" type="number" step="0.01" placeholder="Prix" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Prix (€)</p>
            </div>
          </div>
          <div>
            <input v-model="e.appellation" placeholder="Appellation" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
            <p class="text-[10px] text-muted mt-1 ml-1">Appellation</p>
          </div>
          <div v-if="e.categorie !== 'Spiritueux'" class="flex gap-2 items-start">
            <div class="flex-1 min-w-0">
              <select v-model="eCepageSel" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">                <option value="" disabled>Sélectionne…</option>
                <option v-for="c in CEPAGES" :key="c">{{ c }}</option>
                <option value="Assemblage">Assemblage</option>
                <option value="__autre__">Autre…</option>
              </select>
              <input v-if="eCepageSel === '__autre__'" v-model="e.cepage" placeholder="Cépage (saisie libre)" class="w-full mt-2 bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Cépage</p>
            </div>
            <div class="flex-1 min-w-0">
              <select v-model="e.specificite" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                <option value="">—</option>
                <option v-for="s in SPECIFICITES" :key="s">{{ s }}</option>
              </select>
              <p class="text-[10px] text-muted mt-1 ml-1">Spécificité (VT, SGN…)</p>
            </div>
          </div>
          <div v-else class="flex gap-2 items-start">
            <div class="flex-1 min-w-0">
              <select v-model="e.specificite" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                <option value="">—</option>
                <option v-for="m in SPIRIT_MENTIONS" :key="m">{{ m }}</option>
              </select>
              <p class="text-[10px] text-muted mt-1 ml-1">Mention (VS, VSOP, XO…)</p>
            </div>
          </div>
          <div class="flex gap-2 items-start">
            <div class="flex-1 min-w-0">
              <input v-model="e.region" placeholder="Région" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Région</p>
            </div>
          </div>
          <div class="flex gap-2 items-start">
            <div class="w-1/2 min-w-0">
              <input v-model="e.pays" placeholder="Pays" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Pays</p>
            </div>
            <div class="w-1/2 min-w-0">
              <template v-if="eNewCave">
                <input v-model="e.cave" placeholder="Nom de la cave" class="w-full bg-white border border-accent rounded-lg px-3 py-2.5 text-sm" />
              </template>
              <select v-else v-model="eCaveSel" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm">
                <option value="" disabled>Cave…</option>
                <option v-for="c in cave.cavesConnues" :key="c" :value="c">{{ c }}</option>
                <option value="__nouvelle__">Autre cave…</option>
              </select>
              <div class="flex items-center gap-1.5">
                <p class="text-[10px] text-muted mt-1 ml-1">Cave</p>
                <button v-if="eNewCave" type="button" @click="eNewCave = false; eCaveSel = e.cave || ''" title="Revenir à la liste" class="text-[10px] text-accent underline underline-offset-2 mt-1">Liste</button>
              </div>
            </div>
          </div>
          <div class="flex gap-2 items-start">
            <div class="flex-1 min-w-0">
              <input v-model="e.cuvee" placeholder="Cuvée" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Cuvée</p>
            </div>
            <div class="w-40 shrink-0">
              <select v-model="e.format" class="w-full bg-cream border border-hairline rounded-lg px-2 py-2.5 text-sm">
                <option v-for="f in cave.FORMATS" :key="f">{{ f }}</option>
              </select>
              <p class="text-[10px] text-muted mt-1 ml-1">Format</p>
            </div>
          </div>
          <div v-if="e.categorie !== 'Spiritueux'" class="flex gap-2 items-start">
            <div class="w-1/2 min-w-0">
              <input v-model.number="e.apoDebut" type="number" placeholder="Apogée dès" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Apogée dès</p>
            </div>
            <div class="w-1/2 min-w-0">
              <input v-model.number="e.apoFin" type="number" placeholder="Jusqu'à" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm" />
              <p class="text-[10px] text-muted mt-1 ml-1">Jusqu'à</p>
            </div>
          </div>
          <div>
            <textarea v-model="e.commentaire" rows="2" placeholder="Une occasion, un souvenir, une envie…" class="w-full bg-cream border border-hairline rounded-lg px-3 py-2.5 text-sm"></textarea>
            <p class="text-[10px] text-muted mt-1 ml-1">Commentaire</p>
          </div>

          <div class="p-3 bg-cream rounded-xl2">
            <p class="text-[10px] text-muted uppercase tracking-widest mb-1.5">Photo (facultative, visible uniquement dans la fiche)</p>
            <img v-if="e._photo || b.photo" :src="e._photo || b.photo" alt="" class="w-full h-36 object-cover rounded-lg" />
            <div class="flex gap-2 mt-2">
              <label class="flex-1 py-2 rounded-full border border-hairline bg-white text-xs flex items-center justify-center gap-1.5 cursor-pointer"><Ic name="camera" cls="w-4 h-4" /> Photo<input type="file" accept="image/*" class="hidden" @change="newPhoto" /></label>
            </div>
          </div>
          <p v-if="e.categorie !== 'Spiritueux'" class="text-[11px] text-muted">Sans apogée saisie, elle sera estimée automatiquement après enregistrement.</p>
        </div>
        <div class="flex gap-2 mt-4">
          <button type="button" @click="edit = false" class="flex-1 py-2.5 rounded-full border border-hairline text-muted text-sm">Annuler</button>
          <button type="submit" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm font-medium">Enregistrer</button>
        </div>
      </form>
    </div>

    <!-- ===== Avec quoi la boire ? ===== -->
    <div v-if="acc" class="fixed inset-0 z-40 bg-ink/40 flex items-end md:items-center justify-center" @click.self="acc = false">
      <div class="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-xl2 border border-hairline max-h-[85vh] overflow-y-auto overscroll-contain p-5">
        <div class="flex items-start justify-between gap-2 mb-1">
          <p class="text-[10px] text-muted uppercase tracking-widest">Avec quoi la boire ?</p>
          <button @click="acc = false" class="close-x" title="Fermer"><Ic name="x" cls="w-4 h-4" /></button>
        </div>
        <p class="font-serif text-lg mb-3">{{ b.nom }}{{ b.millesime ? " " + b.millesime : "" }}</p>
        <div v-for="(r, i) in accs" :key="i" class="rounded-xl2 border p-3 mb-2" :class="i === 0 ? 'border-riesling shadow-[0_6px_18px_rgb(217_197_137/0.35)]' : 'border-hairline'">
          <p class="text-sm font-medium">{{ accTxt(r.plat.nom) }}</p>
          <p class="text-xs text-muted mt-0.5">{{ accTxt(r.plat.desc) }}</p>
          <p class="text-xs mt-1.5 text-ink/70">{{ (r.pourquoi || []).map(accTxt).join(' · ') }}</p>
        </div>
        <p v-if="!accs.length" class="text-sm text-muted py-6 text-center">Aucun plat mis en avant pour ce profil — explore l'onglet Accords.</p>
        <button @click="acc = false" class="mt-2 w-full py-2.5 rounded-full border border-hairline text-sm text-muted">Fermer</button>
      </div>
    </div>
  </div>
</template>
