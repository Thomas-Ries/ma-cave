<script setup>
/* Racine : splash → « Qui boit ce soir ? » → (code du profil s'il en a un) → nav 5 onglets */
import { ref, watch, onMounted, nextTick, provide } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useCave } from "./stores/cave.js";
import { photoFromFile } from "./util.js";
import { rattrapeRappels } from "./lib/notifs.js";
import Ic from "./components/Ic.vue";
import FicheModal from "./components/FicheModal.vue";
import FicheBueModal from "./components/FicheBueModal.vue";

const cave = useCave();
cave.initDark(); /* mode sombre persisté par appareil */
const router = useRouter();
const route = useRoute();

const phase = ref("splash"); // splash | qui | lock | app
const splashOut = ref(false);
const profilAVerifier = ref(null); // profil dont on attend le code
const pin = ref("");
const pinErr = ref(false);
const lockEl = ref(null);
const flashKey = ref(null);
let flashTimer = null;

function flash(k) {
  flashKey.value = k;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashKey.value = null; }, 170);
}

onMounted(async () => {
  /* Splash : 3 s d'entrée en scène (bulles, pop, barre), puis fondu 450 ms */
  await new Promise(r => setTimeout(r, 3000));
  splashOut.value = true;
  await new Promise(r => setTimeout(r, 450));
  /* Plus de code global : directement le choix du profil (proposé à chaque session) */
  phase.value = "qui";
});

function pressKey(k) {
  if (pinErr.value) { pin.value = ""; pinErr.value = false; }
  if (k === "del") { pin.value = pin.value.slice(0, -1); return; }
  if (pin.value.length >= 4) return;
  flash(k);
  pin.value += k;
  if (pin.value.length === 4) {
    setTimeout(() => {
      const id = profilAVerifier.value;
      if (id && cave.verifyPin(pin.value, id)) { cave.markUnlocked(id); entrerProfil(id); }
      else pinErr.value = true;
    }, 120);
  }
}
function onKeyPin(ev) {
  const k = ev.key;
  if (/^[0-9]$/.test(k)) pressKey(k);
  else if (k === "Backspace") pressKey("del");
}

function choisirProfil(id) {
  /* Code défini pour ce profil et pas encore validé cette session → pavé */
  if (cave.hasPin(id) && !cave.unlockedOnce(id)) {
    profilAVerifier.value = id;
    pin.value = "";
    pinErr.value = false;
    phase.value = "lock";
    nextTick(() => lockEl.value?.focus());
    return;
  }
  entrerProfil(id);
}

function entrerProfil(id) {
  profilAVerifier.value = null;
  pin.value = "";
  pinErr.value = false;
  cave.useProfil(id);
  cave.pullAvatar();
  cave.pullSoirPrefs();
  cave.pullListes();
  cave.pullBues();
  cave.pullEnvies();
  phase.value = "app";
  cave.autoPull().then(st => {
    const prenom = cave.PROFILS[id].nom;
    cave.toast(st === "ok" || st === "fresh" ? `Salut ${prenom}, on est synchro` : `Salut ${prenom}, petit souci de synchro : ${cave.derniereRaison || 'retente plus tard'}`);
  }); cave.flushQueue(); cave.autoBackup();
  cave.notifApogees(); cave.notifListes(); rattrapeRappels();
}

provide("openFiche", (id, retour) => cave.openFiche(id, retour));
provide("onAvatar", onAvatar);

/* File d'attente Notion : vidée dès que le réseau revient, et re-essayée toutes
   les 5 minutes tant qu'il reste des actions (ex. « boire une bouteille ») à envoyer. */
window.addEventListener("online", () => cave.flushQueue());
setInterval(() => { if (navigator.onLine && cave.queueLen()) cave.flushQueue(); }, 5 * 60 * 1000);

/* Popin de confirmation : verrouille aussi le scroll de fond */
watch(() => cave.askConf, v => cave.overlay("ask", !!v));

const TABS = [
  { id: "cave", icon: "cave", label: "Cave", path: "/" },
  { id: "apogees", icon: "clock", label: "Apogées", path: "/apogees" },
  { id: "accords", icon: "sparkles", label: "Accords", path: "/accords" },
  { id: "bues", icon: "archive", label: "Bues", path: "/bues" },
  { id: "stats", icon: "chart", label: "Stats", path: "/stats" }
];

function go(t) { cave.TAB = t.id; router.push(t.path); }
watch(route, r => { const t = TABS.find(x => x.path === r.path); if (t) cave.TAB = t.id; }, { immediate: true });

function onAvatar(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  photoFromFile(f, data => { cave.setAvatar(data); cave.syncAvatar(); cave.toast("Photo de profil mise à jour"); }, 256);
  ev.target.value = "";
}
</script>

<template>
  <!-- Splash : entrée en scène fun, thème cave -->
  <div v-if="phase === 'splash'" class="fixed inset-0 z-[998] bg-cream flex flex-col items-center justify-center px-8 transition-opacity duration-[450ms] overflow-hidden" :class="splashOut ? 'opacity-0' : 'opacity-100'">
    <!-- bulles riesling -->
    <span class="absolute w-2.5 h-2.5 rounded-full bg-riesling splash-bubble" style="left:24%; bottom:18%;"></span>
    <span class="absolute w-1.5 h-1.5 rounded-full bg-riesling/70 splash-bubble" style="left:70%; bottom:14%; animation-delay:.7s;"></span>
    <span class="absolute w-2 h-2 rounded-full bg-riesling/80 splash-bubble" style="left:58%; bottom:24%; animation-delay:1.4s;"></span>
    <span class="absolute w-1 h-1 rounded-full bg-riesling/60 splash-bubble" style="left:34%; bottom:10%; animation-delay:2s;"></span>

    <div class="relative">
      <span class="absolute inset-0 rounded-full bg-accent/20 splash-ring"></span>
      <div class="relative w-20 h-20 rounded-full bg-accent text-white flex items-center justify-center mb-5 shadow-lg splash-pop"><Ic name="glass" cls="w-10 h-10" /></div>
    </div>
    <h1 class="font-serif text-4xl splash-rise">Ma Cave</h1>
    <p class="text-center text-[10px] text-muted mt-3 tracking-[0.14em] uppercase splash-rise-2">Ma cave · Mes bouteilles · Mon rythme</p>
    <div class="mt-9 w-32 h-1.5 rounded-full bg-hairline overflow-hidden splash-rise-2"><div class="h-full w-1/2 bg-riesling rounded-full splashbar"></div></div>
  </div>

  <!-- Verrou (code du profil choisi) -->
  <div v-else-if="phase === 'lock'" ref="lockEl" tabindex="0" class="fixed inset-0 bg-cream flex flex-col items-center justify-center px-8 z-[996] outline-none" @keydown="onKeyPin">
    <div class="w-full max-w-xs text-center">
      <div class="w-14 h-14 mx-auto rounded-full bg-accent text-white flex items-center justify-center mb-5"><Ic name="lock" cls="w-7 h-7" /></div>
      <h2 class="font-serif text-xl mb-1">Cave de {{ cave.PROFILS[profilAVerifier]?.nom || "…" }}</h2>
      <p class="text-xs text-muted mb-8">Entre ton code pour ouvrir</p>
    </div>
    <div class="flex justify-center gap-3 mb-8" :class="pinErr ? 'animate-pulse' : ''">
      <span v-for="i in 4" :key="i" class="w-3 h-3 rounded-full border" :class="[pin.length >= i ? 'bg-ink border-ink' : 'bg-white border-hairline', pinErr ? 'border-red' : '']"></span>
    </div>
    <div class="grid grid-cols-3 gap-3">
      <button v-for="k in ['1','2','3','4','5','6','7','8','9']" :key="k" @click="pressKey(k)" class="lock-key w-16 h-14 rounded-xl2 bg-white border border-hairline font-serif text-xl" :class="flashKey === k ? 'flash' : ''">{{ k }}</button>
      <span></span>
      <button @click="pressKey('0')" class="lock-key w-16 h-14 rounded-xl2 bg-white border border-hairline font-serif text-xl" :class="flashKey === '0' ? 'flash' : ''">0</button>
      <button @click="pressKey('del')" class="lock-key w-16 h-14 rounded-xl2 bg-white border border-hairline text-muted flex items-center justify-center" title="Effacer"><Ic name="x" cls="w-5 h-5" /></button>
    </div>
    <p v-if="pinErr" class="text-xs text-red mt-4">Ce code ne correspond pas</p>
    <p v-else class="text-[10px] text-muted mt-4">Ou saisis ton code au clavier</p>
    <button @click="phase = 'qui'; profilAVerifier = null" class="mt-6 text-xs text-muted underline underline-offset-2">Autre profil</button>
  </div>

  <!-- Choix du profil (après le code) — design v2 -->
  <div v-else-if="phase === 'qui'" class="fixed inset-0 z-[997] bg-cream flex flex-col items-center justify-center px-8">
    <div class="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center mb-4 shadow-md"><Ic name="glass" cls="w-8 h-8" /></div>
    <h2 class="font-serif text-2xl mb-1">Ma Cave</h2>
    <p class="text-xs text-muted mb-8">Qui boit ce soir ?</p>
    <div class="w-full max-w-xs space-y-3">
      <button v-for="p in Object.values(cave.PROFILS)" :key="p.id" @click="choisirProfil(p.id)" class="w-full bg-white rounded-xl2 border border-hairline p-4 flex items-center gap-4 transition active:scale-[0.98]">
        <img v-if="cave.avatarDe(p.id)" :src="cave.avatarDe(p.id)" alt="" class="w-14 h-14 rounded-full object-cover border border-hairline" />
        <span v-else class="w-14 h-14 rounded-full bg-accent-soft text-accent flex items-center justify-center font-serif text-xl">{{ p.nom.slice(0, 1) }}</span>
        <span class="font-serif text-lg">{{ p.nom }}</span>
        <Ic v-if="cave.hasPin(p.id)" name="lock" cls="w-3.5 h-3.5 text-muted" />
        <Ic name="chevR" cls="w-5 h-5 text-muted ml-auto" />
      </button>
    </div>
  </div>

  <!-- App -->
  <div v-else class="max-w-2xl mx-auto pb-28">
    <router-view />

    <!-- Badge de synchro en cours (léger, en surimpression, n'occulte rien) -->
    <div v-if="cave.busy" class="fixed top-3 inset-x-0 z-[60] flex justify-center pointer-events-none" role="status" aria-live="polite">
      <div class="px-4 py-2 rounded-full bg-white/95 border border-hairline text-ink text-sm font-medium flex items-center gap-2.5 shadow">
        <span class="sync-spin inline-block w-3.5 h-3.5 rounded-full border-2 border-riesling border-t-accent"></span><span>Synchronisation en cours…</span>
      </div>
    </div>

    <!-- Nav basse (haute, icônes lisibles) -->
    <nav class="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-hairline">
      <div class="max-w-2xl mx-auto grid grid-cols-5">
        <button v-for="t in TABS" :key="t.id" @click="go(t)" class="py-3.5 flex flex-col items-center gap-1 relative" :class="cave.TAB === t.id ? 'text-accent' : 'text-muted'">
          <Ic :name="t.icon" cls="w-7 h-7" />
          <span class="text-[11px]">{{ t.label }}</span>
          <span v-if="t.id === 'apogees' && cave.apoAlerte && cave.apogeeStats.boire > 0" class="absolute top-2 right-[22%] w-2.5 h-2.5 rounded-full bg-accent"></span>
        </button>
      </div>
    </nav>

    <FicheModal />
    <FicheBueModal />

    <!-- Toasts -->
    <div class="fixed bottom-28 inset-x-0 z-40 pointer-events-none flex flex-col items-center">
      <transition-group name="toast">
        <div v-for="t in cave.toasts" :key="t.id" class="mx-4 mb-2 px-4 py-2.5 bg-white/95 border border-hairline text-ink text-sm rounded-full shadow">{{ t.txt }}</div>
      </transition-group>
    </div>

    <!-- Popin confirmation -->
    <div v-if="cave.askConf" class="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6" @click.self="cave.askConf = null">
      <div class="bg-white rounded-xl2 p-5 w-full max-w-xs">
        <p class="font-serif text-lg">{{ cave.askConf.titre }}</p>
        <p class="text-sm text-muted mt-1">{{ cave.askConf.texte }}</p>
        <div class="flex gap-2 mt-4">
          <button @click="cave.askConf = null" class="flex-1 py-2.5 rounded-full border border-hairline text-sm">Annuler</button>
          <button @click="cave.askConf.onOk(); cave.askConf = null" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">{{ cave.askConf.btn || 'Confirmer' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
