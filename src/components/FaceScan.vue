<script setup>
/* Scanner facial : ouvre la caméra frontale, cherche un visage, et émet le
   descripteur. Réutilisé pour l'inscription (ProfilSheet) et l'identification
   au démarrage (App). Tout reste sur l'appareil. */
import { ref, onMounted, onBeforeUnmount } from "vue";
import { visageDepuisVideo } from "../lib/face.js";
import Ic from "./Ic.vue";

const props = defineProps({ titre: String, note: String, mode: { type: String, default: "enroll" } });
const emit = defineEmits(["ok", "close"]);

const etat = ref("cam"); // cam | erreur
const msg = ref("Ouverture de la caméra…");
const videoEl = ref(null);
let stream = null, timer = null, fini = false;

onMounted(demarrer);

async function demarrer() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 480 }, audio: false });
    videoEl.value.srcObject = stream;
    await videoEl.value.play();
    msg.value = "Premier usage : téléchargement du modèle…";
    boucle();
  } catch {
    msg.value = "Caméra indisponible";
    etat.value = "erreur";
  }
}

async function boucle() {
  if (fini) return;
  timer = setTimeout(boucle, 500);
  if (document.hidden || !videoEl.value) return;
  try {
    const desc = await visageDepuisVideo(videoEl.value);
    if (fini) return;
    if (msg.value !== "Cadre ton visage") msg.value = "Cadre ton visage";
    if (desc) { fini = true; emit("ok", desc); }
  } catch { /* modèle encore en cours de téléchargement : on réessaie */ }
}

onBeforeUnmount(() => {
  fini = true;
  clearTimeout(timer);
  stream?.getTracks().forEach(t => t.stop());
});

function fermer() { emit("close"); }
</script>

<template>
  <div class="fixed inset-0 z-[70] bg-ink/60 flex items-center justify-center p-6" @click.self="fermer">
    <div class="bg-white rounded-xl2 p-5 w-full max-w-xs text-center">
      <p class="font-serif text-lg mb-1">{{ titre || "Reconnaissance faciale" }}</p>
      <p class="text-xs text-muted mb-4">{{ note || "Cadre ton visage, rien ne quitte ton appareil" }}</p>
      <div class="relative mx-auto w-44 h-44 rounded-full overflow-hidden bg-cream border border-hairline">
        <video ref="videoEl" autoplay muted playsinline class="w-full h-full object-cover" style="transform: scaleX(-1);"></video>
        <span class="absolute inset-3 rounded-full border-2 border-accent/70 pointer-events-none"></span>
      </div>
      <p class="text-xs mt-4" :class="etat === 'erreur' ? 'text-red' : 'text-muted'">{{ msg }}</p>
      <button @click="fermer" class="mt-4 w-full py-2.5 rounded-full border border-hairline text-sm">{{ mode === "identify" ? "Choisir mon profil" : "Annuler" }}</button>
    </div>
  </div>
</template>
