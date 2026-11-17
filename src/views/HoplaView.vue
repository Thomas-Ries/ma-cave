<script setup>
/* Hopla ! — le sommelier conversationnel (v2.28). Onglet plein écran, thème
   sombre comme la fiche détail : fond #2B2724, bulles crème translucides,
   accent rouge. Le dialogue passe par /api/hopla (clé Mistral côté serveur).
   Chaque réponse peut être sauvegardée dans Le carnet (recettes). */
import { ref, nextTick, onMounted, computed } from "vue";
import { useCave } from "../stores/cave.js";
import { chargeHistorique, sauveHistorique, effaceHistorique, demandeHopla, ACCUEIL } from "../lib/hopla.js";
import { ajouteRecette } from "../lib/recettes.js";
import Ic from "../components/Ic.vue";

const cave = useCave();
const msgs = ref(chargeHistorique());
const q = ref("");
const occupe = ref(false);
const erreurs = ref(0);            /* erreurs consécutives : message plus explicite */
const sauvees = ref(new Set());    /* ids de messages déjà sauvegardés dans Le carnet */
const fil = ref(null);

const nbEnCave = computed(() => (cave.db.bouteilles || []).filter(b => (b.quantite || 0) > 0).length);

/* Message d'accueil hors historique : toujours là, jamais renvoyé au modèle */
const filVisible = computed(() => [{ id: "accueil", texte: ACCUEIL, role: "hopla", accueil: true }, ...msgs.value]);

const CHIPS = [
  "Que boire ce soir ?",
  "Un accord pour mon dîner de samedi",
  "Donne-moi une recette qui va avec un de mes vins",
  "Quelles bouteilles sont à l'apogée ?",
];

onMounted(() => scrollBas());

async function scrollBas() {
  await nextTick();
  if (fil.value) fil.value.scrollTop = fil.value.scrollHeight;
}

async function envoie(texte) {
  const t = (texte ?? q.value).trim();
  if (!t || occupe.value) return;
  q.value = "";
  occupe.value = true;
  msgs.value.push({ id: "m" + Date.now().toString(36), texte: t, role: "moi" });
  sauveHistorique(msgs.value);
  scrollBas();
  try {
    const reponse = await demandeHopla(cave, msgs.value);
    msgs.value.push({ id: "h" + Date.now().toString(36), texte: reponse, role: "hopla" });
    erreurs.value = 0;
  } catch (e) {
    erreurs.value++;
    const detail = String(e.message || e);
    msgs.value.push({
      id: "e" + Date.now().toString(36), role: "hopla", erreur: true,
      texte: !navigator.onLine
        ? "Je ne peux pas répondre hors ligne — Hopla a besoin du réseau."
        : detail.includes("MISTRAL_API_KEY")
          ? "Le serveur n'a pas encore sa clé Mistral : réglage à faire dans Cloudflare (variable MISTRAL_API_KEY)."
          : "Pas de réponse du sommelier (" + detail + "). Retentez dans un instant.",
    });
  }
  occupe.value = false;
  sauveHistorique(msgs.value);
  scrollBas();
}

function sauveDansCarnet(m) {
  if (sauvees.value.has(m.id)) return;
  ajouteRecette(m.texte, "");
  sauvees.value.add(m.id);
  cave.toast("Recette sauvegardée dans Le carnet");
}

function effaceTout() {
  cave.askConfirm({ titre: "Effacer la conversation ?", texte: "L'historique de Hopla ! sera vidé de cet appareil. Les recettes déjà sauvegardées dans Le carnet restent.", onOk: () => { effaceHistorique(); msgs.value = []; erreurs.value = 0; } });
}
</script>

<template>
  <section class="fixed inset-0 bg-ink flex flex-col z-10" style="padding-bottom: 96px">
    <!-- En-tête : bouteille Hopla -->
    <div class="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
      <div class="w-11 h-11 rounded-full flex items-end justify-center overflow-hidden shrink-0" style="background: rgba(245,240,232,.08)">
        <svg width="24" height="34" viewBox="0 0 44 84">
          <rect x="19" y="4" width="6" height="12" fill="#D9CFBE"/>
          <path d="M17 16 h10 c5 0 8 4 8 9 v46 c0 4 -3 7 -7 7 H16 c-4 0 -7 -3 -7 -7 V25 c0 -5 3 -9 8 -9 z" fill="#7A2E3E"/>
          <ellipse cx="22" cy="20" rx="9" ry="2.6" fill="#8F3A4C" opacity=".7"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-serif text-lg text-cream leading-tight">Hopla !</p>
        <p class="text-[11px] mt-0.5" :class="occupe ? 'text-riesling' : 'text-cream/60'">{{ occupe ? 'Consulte la cave…' : 'Le sommelier de votre cave · ' + nbEnCave + ' bouteilles' }}</p>
      </div>
      <button @click="effaceTout" class="w-9 h-9 rounded-full text-cream/70 flex items-center justify-center shrink-0" style="background: rgba(245,240,232,.08)" title="Effacer la conversation">
        <Ic name="trash" cls="w-4 h-4" />
      </button>
    </div>

    <!-- Fil de conversation -->
    <div ref="fil" class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5">
      <div v-for="m in filVisible" :key="m.id" class="max-w-[86%]" :class="m.role === 'moi' ? 'self-end' : 'self-start'">
        <div class="px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-line"
             :class="m.role === 'moi' ? 'bg-accent text-cream rounded-br-md' : (m.erreur ? 'bg-riesling/25 text-cream rounded-bl-md border border-riesling/40' : 'bg-cream/10 text-cream rounded-bl-md')">
          {{ m.texte }}
        </div>
        <!-- Sauvegarde recette : seulement sur les réponses de Hopla -->
        <button v-if="m.role === 'hopla' && !m.accueil && !m.erreur" @click="sauveDansCarnet(m)"
                class="mt-1.5 flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px]"
                :class="sauvees.has(m.id) ? 'text-riesling' : 'text-cream/60 active:bg-cream/10'">
          <Ic name="bookOpen" cls="w-3.5 h-3.5" :class="sauvees.has(m.id) ? 'fill-current' : ''" />
          {{ sauvees.has(m.id) ? 'Dans Le carnet' : 'Sauver dans Le carnet' }}
        </button>
      </div>
      <div v-if="occupe" class="self-start bg-cream/10 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-cream/70 animate-bounce" style="animation-delay:0s"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-cream/70 animate-bounce" style="animation-delay:.15s"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-cream/70 animate-bounce" style="animation-delay:.3s"></span>
      </div>
    </div>

    <!-- Suggestions quand la conversation est vierge -->
    <div v-if="!msgs.length" class="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
      <button v-for="c in CHIPS" :key="c" @click="envoie(c)"
              class="px-3.5 py-2 rounded-full border border-cream/25 text-cream text-xs active:bg-cream/10">{{ c }}</button>
    </div>

    <!-- Barre de saisie -->
    <div class="px-4 pt-2 pb-3 flex gap-2 shrink-0">
      <input v-model="q" @keydown.enter="envoie()" placeholder="Demandez à Hopla…"
             class="flex-1 rounded-full px-4 py-3 text-sm outline-none" style="background: rgba(43,39,36,.55); color: #F5F0E8; border: 1px solid rgba(245,240,232,.18)" />
      <button @click="envoie()" :disabled="occupe || !q.trim()"
              class="w-12 h-12 rounded-full bg-accent flex items-center justify-center shrink-0 disabled:opacity-40" title="Envoyer">
        <Ic name="share" cls="w-5 h-5 text-cream rotate-90" />
      </button>
    </div>
  </section>
</template>
