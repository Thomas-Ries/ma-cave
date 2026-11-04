<script setup>
/* Gestion du profil : avatar + code de déverrouillage optionnel (activable, modifiable, désactivable).
   Le code admin de Thomas débloque n'importe quel profil en cas d'oubli. */
import { ref, computed, watch } from "vue";
import { useCave } from "../stores/cave.js";
import { chercheVille, villeDepuis } from "../lib/soir.js";
import { inscrireBiometrie, verifierBiometrie, cleDe, supprimerCle, biometrieDispo, biomometriePrete, enPWA } from "../lib/face.js";
import Ic from "./Ic.vue";

const cave = useCave();
const props = defineProps({ open: Boolean, onAvatar: Function });
const emit = defineEmits(["close"]);
watch(() => props.open, v => cave.overlay("profil", v));

/* ---------- Avatar ---------- */
function changeAvatar(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  props.onAvatar && props.onAvatar(ev);
  ev.target.value = "";
}
function removeAvatar() {
  cave.askConfirm("Retirer ta photo de profil ?", "Retirer", () => {
    cave.setAvatar(null);
    cave.syncAvatar();
    cave.toast("Photo de profil retirée");
  });
}

/* ---------- Code ---------- */
const pinMode = ref(null); // null | "set" | "change"
const pin1 = ref("");
const pin2 = ref("");
const pinMsg = ref("");

watch(() => props.open, v => { if (v) { pinMode.value = null; pin1.value = ""; pin2.value = ""; pinMsg.value = ""; } });

const aPin = computed(() => cave.hasPin(cave.PROFIL));

/* ---------- Déverrouillage biométrique (Face ID / empreinte, 100 % natif) ---------- */
const bioMsg = ref("");    // message de confirmation / erreur inline
const bioErr = ref("");
const bioTest = ref("");   // résultat du test après activation
const bioOkState = ref(false);
const aBio = computed(() => !!cleDe(cave.PROFIL));
const bioDate = computed(() => {
  try { const v = JSON.parse(localStorage.getItem("ma-cave-bio-" + cave.PROFIL) || "null"); return v?.ts; } catch { return null; }
});
const bioDispo = ref(true);
const bioPlateforme = ref(true);   // l'appareil a une vraie biométrie (indépendant de la PWA)
const pwaInstallee = enPWA();
biomometriePrete().then(ok => { bioDispo.value = ok; });
try { window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(v => { bioPlateforme.value = v; }); } catch {}
function bioNom() { return /iPhone|iPad/i.test(navigator.userAgent) ? "Face ID" : "l'empreinte"; }
async function activerBio() {
  bioErr.value = ""; bioMsg.value = ""; bioTest.value = "";
  try {
    await inscrireBiometrie(cave.PROFIL);
    bioOkState.value = true;
    bioMsg.value = `✅ ${bioNom()} activé pour la cave de ${cave.PROFILS[cave.PROFIL]?.nom || cave.PROFIL}`;
    cave.toast(`Biométrie activée — teste pour vérifier`);
  } catch (e) {
    if (e?.bioIncompatible) bioErr.value = "Cet appareil n'a pas de biométrie (ou navigateur non compatible) — pas de QR code ni clé d'accès, on n'en veut pas.";
    else if (e?.name === "NotAllowedError") bioErr.value = "Inscription annulée — rien n'a été enregistré.";
    else bioErr.value = "Impossible d'inscrire la biométrie : " + (e?.name || e?.message || "erreur inconnue");
  }
}
async function testerBio() {
  bioTest.value = ""; bioErr.value = "";
  try {
    const id = await verifierBiometrie([cave.PROFIL]);
    bioTest.value = id ? "✅ Test réussi — ta cave s'ouvrira exactement comme ça" : "Pas de correspondance — refais l'inscription";
  } catch (e) {
    if (e?.name === "NotAllowedError") bioTest.value = "Test annulé";
    else bioTest.value = "Test impossible : " + (e?.name || "erreur");
  }
}
function confirmBioOff() {
  cave.askConfirm("Supprimer le déverrouillage biométrique ?", "Supprimer", () => {
    supprimerCle(cave.PROFIL);
    bioMsg.value = ""; bioTest.value = ""; bioOkState.value = false;
    bioErr.value = "";
    cave.toast("Déverrouillage biométrique supprimé");
    bioSuppr.value = true;
  });
}
const bioSuppr = ref(false);

/* ---------- Préférences du soir (suggestion « Ce soir ») ---------- */
const prefs = ref(cave.soirPrefs());
const geoEnCours = ref(false);
const villeSaisie = ref("");
const enAttente = ref(null); /* { lat, lon, ville } en attente de validation */
function majPrefs(patch) { prefs.value = { ...prefs.value, ...patch }; cave.setSoirPrefs(prefs.value); cave.syncSoirPrefs(); }
/* Toggle maître : éteindre la suggestion du soir éteint aussi ses 3 critères (apogée,
   saison, météo) — on ne veut plus de la fonctionnalité. Le matin, chaque critère
   reste individuel : rallumer le bandeau ne force rien. */
function toggleSoir() {
  if (prefs.value.bandeauSoir === false) majPrefs({ bandeauSoir: true });
  else majPrefs({ bandeauSoir: false, apogee: false, saison: false, meteo: false });
}
async function maPosition() {
  if (!navigator.geolocation) { cave.toast("Géolocalisation non disponible — saisis ta ville"); return; }
  geoEnCours.value = true;
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    const ville = await villeDepuis(lat, lon);
    geoEnCours.value = false;
    enAttente.value = { lat, lon, ville: ville || "position détectée" };
  }, () => { geoEnCours.value = false; cave.toast("Position refusée — saisis ta ville à la place"); }, { timeout: 10000 });
}
async function chercherVille() {
  const nom = (villeSaisie.value || "").trim();
  if (!nom) return;
  geoEnCours.value = true;
  const r = await chercheVille(nom);
  geoEnCours.value = false;
  if (!r) { cave.toast("Ville introuvable — vérifie l'orthographe"); return; }
  enAttente.value = r;
}
function validerPosition() { if (!enAttente.value) return; majPrefs({ lat: enAttente.value.lat, lon: enAttente.value.lon, ville: enAttente.value.ville }); enAttente.value = null; villeSaisie.value = ""; cave.toast("Position enregistrée — la météo guidera le choix du soir"); }
function refuserPosition() { enAttente.value = null; }
function oubliePosition() { majPrefs({ lat: null, lon: null, ville: "" }); cave.toast("Position retirée"); }
const canSavePin = computed(() => /^[0-9]{4}$/.test(pin1.value) && pin1.value === pin2.value);

function savePin() {
  if (!canSavePin.value) {
    pinMsg.value = /^[0-9]{4}$/.test(pin1.value) ? "Les deux codes ne sont pas identiques." : "Le code doit faire 4 chiffres.";
    return;
  }
  cave.setPin(pin1.value, cave.PROFIL);
  cave.markUnlocked(cave.PROFIL);
  const t = pinMode.value === "change" ? "Code mis à jour" : "Code activé";
  pinMode.value = null; pin1.value = ""; pin2.value = "";
  cave.toast(t);
}
function disablePin() {
  cave.clearPin(cave.PROFIL);
  pinMode.value = null; pin1.value = ""; pin2.value = "";
  cave.toast("Code désactivé");
}
function confirmDisable() {
  cave.askConfirm("Désactiver le code de cette cave ?", "Désactiver", disablePin);
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-end" role="dialog">
    <div class="absolute inset-0 bg-ink/40" @click="emit('close')"></div>
    <div class="relative w-full bg-cream rounded-t-3xl border-t border-hairline px-5 pt-3 pb-8 max-h-[85vh] overflow-y-auto">
      <div class="w-10 h-1 rounded-full bg-hairline mx-auto mb-4"></div>

      <div class="flex items-start justify-between">
        <div>
          <p class="text-[10px] text-muted uppercase tracking-widest">Profil</p>
          <h3 class="font-serif text-lg">Cave de {{ cave.PROFILS[cave.PROFIL].nom }}</h3>
        </div>
        <button @click="emit('close')" class="close-x" title="Fermer"><Ic name="x" cls="w-4 h-4" /></button>
      </div>

      <!-- Avatar -->
      <p class="text-[10px] text-muted uppercase tracking-widest mb-2 mt-4">Photo de profil</p>
      <div class="bg-white border border-hairline rounded-xl2 p-4 flex items-center gap-4">
        <img v-if="cave.avatarDe(cave.PROFIL)" :src="cave.avatarDe(cave.PROFIL)" alt="" class="w-16 h-16 rounded-full object-cover border border-hairline" />
        <span v-else class="w-16 h-16 rounded-full bg-accent-soft text-accent flex items-center justify-center font-serif text-2xl">{{ cave.PROFILS[cave.PROFIL].nom.slice(0, 1) }}</span>
        <div class="flex-1">
          <label class="w-full py-2 rounded-full border border-hairline bg-cream text-xs flex items-center justify-center gap-1.5 cursor-pointer">
            <Ic name="camera" cls="w-4 h-4" /> {{ cave.avatarDe(cave.PROFIL) ? "Changer la photo" : "Ajouter une photo" }}
            <input type="file" accept="image/*" class="hidden" @change="changeAvatar" />
          </label>
          <button v-if="cave.avatarDe(cave.PROFIL)" @click="removeAvatar" class="w-full mt-2 py-2 rounded-full border border-hairline text-xs text-muted flex items-center justify-center gap-1.5"><Ic name="x" cls="w-4 h-4" /> Retirer la photo</button>
          <p class="text-[10px] text-muted mt-2">Elle se synchronise sur tous tes appareils.</p>
        </div>
      </div>

      <!-- Apparence : mode sombre -->
      <p class="text-[10px] text-muted uppercase tracking-widest mb-2 mt-5">Apparence</p>
      <button @click="cave.toggleDark()" class="w-full bg-white border border-hairline rounded-xl2 p-4 flex items-center justify-between">
        <span class="flex items-center gap-2 text-sm"><Ic name="moon" cls="w-4 h-4" /> Mode sombre « cave »</span>
        <span class="w-10 h-6 rounded-full border flex items-center transition-colors shrink-0" :class="cave.darkOn ? 'bg-accent border-accent' : 'bg-hairline border-hairline'">
          <span class="block w-4 h-4 rounded-full bg-white transition-transform" :class="cave.darkOn ? 'translate-x-5' : 'translate-x-1'"></span>
        </span>
      </button>
      <button @click="majPrefs({ bandeauApogee: prefs.bandeauApogee === false })" class="w-full mt-2 bg-white border border-hairline rounded-xl2 p-4 flex items-center justify-between">
        <span class="flex items-center gap-2 text-sm"><Ic name="clock" cls="w-4 h-4" /> Bandeau « à boire cette année »</span>
        <span class="w-10 h-6 rounded-full border flex items-center transition-colors shrink-0" :class="prefs.bandeauApogee !== false ? 'bg-accent border-accent' : 'bg-hairline border-hairline'">
          <span class="block w-4 h-4 rounded-full bg-white transition-transform" :class="prefs.bandeauApogee !== false ? 'translate-x-5' : 'translate-x-1'"></span>
        </span>
      </button>

      <!-- Le soir : préférences de la suggestion quotidienne -->
      <p class="text-[10px] text-muted uppercase tracking-widest mb-2 mt-5">Le soir, propose-moi…</p>
      <div class="bg-white border border-hairline rounded-xl2 overflow-hidden">
        <button @click="toggleSoir" class="w-full p-4 flex items-center justify-between border-b border-hairline">
          <span class="flex items-center gap-2 text-sm"><Ic name="glass" cls="w-4 h-4" /> Proposer chaque soir une bouteille</span>
          <span class="w-10 h-6 rounded-full border flex items-center transition-colors shrink-0" :class="prefs.bandeauSoir !== false ? 'bg-accent border-accent' : 'bg-hairline border-hairline'"><span class="block w-4 h-4 rounded-full bg-white transition-transform" :class="prefs.bandeauSoir !== false ? 'translate-x-5' : 'translate-x-1'"></span></span>
        </button>
        <button @click="majPrefs({ apogee: !prefs.apogee })" class="w-full p-4 flex items-center justify-between border-b border-hairline">
          <span class="flex items-center gap-2 text-sm"><Ic name="clock" cls="w-4 h-4" /> Priorité aux apogées dépassées</span>
          <span class="w-10 h-6 rounded-full border flex items-center transition-colors shrink-0" :class="prefs.apogee ? 'bg-accent border-accent' : 'bg-hairline border-hairline'"><span class="block w-4 h-4 rounded-full bg-white transition-transform" :class="prefs.apogee ? 'translate-x-5' : 'translate-x-1'"></span></span>
        </button>
        <button @click="majPrefs({ saison: !prefs.saison })" class="w-full p-4 flex items-center justify-between border-b border-hairline">
          <span class="flex items-center gap-2 text-sm"><Ic name="sparkles" cls="w-4 h-4" /> Adapter à la saison</span>
          <span class="w-10 h-6 rounded-full border flex items-center transition-colors shrink-0" :class="prefs.saison ? 'bg-accent border-accent' : 'bg-hairline border-hairline'"><span class="block w-4 h-4 rounded-full bg-white transition-transform" :class="prefs.saison ? 'translate-x-5' : 'translate-x-1'"></span></span>
        </button>
        <button @click="majPrefs({ meteo: !prefs.meteo })" class="w-full p-4 flex items-center justify-between">
          <span class="flex items-center gap-2 text-sm"><Ic name="snow" cls="w-4 h-4" /> Adapter à la météo du jour</span>
          <span class="w-10 h-6 rounded-full border flex items-center transition-colors shrink-0" :class="prefs.meteo ? 'bg-accent border-accent' : 'bg-hairline border-hairline'"><span class="block w-4 h-4 rounded-full bg-white transition-transform" :class="prefs.meteo ? 'translate-x-5' : 'translate-x-1'"></span></span>
        </button>
        <div v-if="prefs.meteo" class="p-4 border-t border-hairline bg-cream">
          <template v-if="enAttente">
            <p class="text-sm mb-3">Position détectée : <span class="font-medium">{{ enAttente.ville }}</span></p>
            <div class="flex gap-2">
              <button @click="validerPosition" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">Valider</button>
              <button @click="refuserPosition" class="flex-1 py-2.5 rounded-full border border-hairline text-sm text-muted">Annuler</button>
            </div>
          </template>
          <template v-else>
            <p class="text-[11px] text-muted mb-2">{{ prefs.ville ? 'Météo de ' + prefs.ville : 'Aucune position — la météo ne pourra pas guider le choix' }}</p>
            <div class="flex gap-2">
              <button @click="maPosition" :disabled="geoEnCours" class="flex-1 py-2.5 rounded-full border border-accent/40 text-accent text-sm flex items-center justify-center gap-1.5"><Ic name="pin" cls="w-4 h-4" /> {{ geoEnCours ? 'Localisation…' : 'Ma position' }}</button>
              <template v-if="prefs.ville"><button @click="oubliePosition" class="px-3 py-2.5 rounded-full border border-hairline text-muted text-sm" title="Retirer la position">Retirer</button></template>
            </div>
            <button v-if="prefs.lat" @click="majPrefs({ voyage: !prefs.voyage })" class="w-full mt-2 py-2.5 rounded-full border text-xs flex items-center justify-center gap-1.5" :class="prefs.voyage ? 'border-accent text-accent bg-accent-soft' : 'border-hairline text-muted bg-white'" title="Météo de là où tu es, sans enregistrer la position">
              <Ic name="pin" cls="w-3.5 h-3.5" /> {{ prefs.voyage ? 'Suivre mes déplacements — actif' : 'Suivre mes déplacements quand je voyage' }}
            </button>
            <div v-if="!prefs.lat" class="flex gap-2 mt-2">
              <input v-model="villeSaisie" type="text" placeholder="…ou saisis ta ville" class="flex-1 bg-white border border-hairline rounded-full px-4 py-2 text-sm" @keyup.enter="chercherVille" />
              <button @click="chercherVille" :disabled="geoEnCours" class="px-4 py-2 rounded-full bg-accent text-white text-sm">OK</button>
            </div>
          </template>
        </div>
      </div>

      <!-- Déverrouillage biométrique -->
      <p class="text-[10px] text-muted uppercase tracking-widest mb-2 mt-5 flex items-center justify-between">Face ID / Empreinte
        <span v-if="aBio" class="px-2 py-0.5 rounded-full bg-accent-soft text-accent text-[10px] tracking-normal font-medium normal-case flex items-center gap-1"><Ic name="lock" cls="w-3 h-3" /> Activé</span>
      </p>
      <div class="bg-white rounded-xl2 p-4" :class="aBio ? 'border border-accent/50' : 'border border-hairline'">
        <div class="flex items-center gap-2 text-sm">
          <Ic name="user" cls="w-4 h-4" :class="aBio ? 'text-accent' : 'text-muted'" />
          <span v-if="aBio">Ta cave s'ouvre par {{ bioNom() }} au démarrage</span>
          <span v-else-if="bioDispo">Pas activé — la cave ouvre sur le choix du profil</span>
          <span v-else-if="!pwaInstallee">Uniquement dans l'app installée (écran d'accueil)</span>
          <span v-else-if="!bioPlateforme">Cet appareil n'a pas de biométrie</span>
          <span v-else>Biométrie indisponible sur cet appareil / navigateur</span>
        </div>
        <div v-if="bioDate" class="text-[11px] text-muted mt-1">Activé le {{ new Date(bioDate).toLocaleDateString('fr-FR') }}</div>
        <div v-if="bioDispo" class="flex gap-2 mt-3">
          <button v-if="!aBio" @click="activerBio" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">Activer {{ bioNom() }}</button>
          <template v-else>
            <button @click="testerBio" class="flex-1 py-2.5 rounded-full border border-accent/40 text-accent text-sm">Tester</button>
            <button @click="activerBio" class="flex-1 py-2.5 rounded-full border border-hairline text-sm">Refaire</button>
            <button @click="confirmBioOff" class="flex-1 py-2.5 rounded-full border border-hairline text-sm text-muted">Supprimer</button>
          </template>
        </div>
        <p v-if="bioMsg" class="text-[12px] text-accent font-medium mt-2">{{ bioMsg }}</p>
        <p v-if="bioTest" class="text-[12px] mt-2" :class="bioTest.startsWith('✅') ? 'text-accent font-medium' : 'text-red'">{{ bioTest }}</p>
        <p v-if="bioSuppr && !aBio" class="text-[12px] text-muted mt-2">Biométrie supprimée — la cave rouvre sur le choix du profil.</p>
        <p v-if="bioErr" class="text-[11px] text-red mt-2">{{ bioErr }}</p>
        <p v-if="!aBio && !pwaInstallee" class="text-[11px] text-muted mt-2 leading-relaxed">Sur Mac/PC ou dans le navigateur, la biométrie ne se propose pas : protège ta cave avec le code à 4 chiffres ci-dessous. Installe l'app sur l'écran d'accueil de ton iPhone/Android pour activer {{ bioNom() }}.</p>
        <p class="text-[10px] text-muted mt-3 leading-relaxed">C'est le système (Face ID sur iPhone, empreinte ou visage sur Android) qui vérifie — aucune donnée biométrique n'est stockée dans la cave, et un code protégé par PIN reste déverrouillable par biométrie.</p>
      </div>

      <!-- Code de déverrouillage -->
      <p class="text-[10px] text-muted uppercase tracking-widest mb-2 mt-5">Code de déverrouillage</p>
      <div class="bg-white border border-hairline rounded-xl2 p-4">
        <template v-if="!pinMode">
          <div class="flex items-center gap-2 text-sm">
            <Ic name="lock" cls="w-4 h-4" :class="aPin ? 'text-accent' : 'text-muted'" />
            <span v-if="aPin">Un code protège cette cave</span>
            <span v-else>Pas de code — la cave s'ouvre directement</span>
          </div>
          <div class="flex gap-2 mt-3">
            <button v-if="!aPin" @click="pinMode = 'set'; pinMsg = ''" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">Activer un code</button>
            <template v-else>
              <button @click="pinMode = 'change'; pinMsg = ''" class="flex-1 py-2.5 rounded-full border border-hairline text-sm">Modifier le code</button>
              <button @click="confirmDisable" class="flex-1 py-2.5 rounded-full border border-hairline text-sm text-muted">Désactiver</button>
            </template>
          </div>
        </template>
        <template v-else>
          <p class="font-serif text-base mb-1">{{ pinMode === "set" ? "Choisis un code à 4 chiffres" : "Nouveau code à 4 chiffres" }}</p>
          <p class="text-[11px] text-muted mb-3">Il sera demandé à l'ouverture de cette cave, à chaque session.</p>
          <div class="space-y-2 max-w-[220px] mx-auto">
            <input v-model="pin1" type="tel" inputmode="numeric" maxlength="4" placeholder="Code" class="w-full bg-cream border border-hairline rounded-full px-4 py-2.5 text-center tracking-[0.5em]" />
            <input v-model="pin2" type="tel" inputmode="numeric" maxlength="4" placeholder="Confirmer" class="w-full bg-cream border border-hairline rounded-full px-4 py-2.5 text-center tracking-[0.5em]" />
          </div>
          <p v-if="pinMsg" class="text-xs text-accent text-center mt-2">{{ pinMsg }}</p>
          <div class="flex gap-2 mt-4">
            <button @click="pinMode = null" class="flex-1 py-2.5 rounded-full border border-hairline text-sm">Annuler</button>
            <button @click="savePin" class="flex-1 py-2.5 rounded-full bg-accent text-white text-sm">Enregistrer</button>
          </div>
        </template>
      </div>

      <p class="text-center text-[10px] text-muted mt-3">Ma Cave · v2.9.72</p>
      <button @click="emit('close')" class="w-full mt-5 py-2.5 rounded-full bg-accent text-white text-sm">Terminé</button>
    </div>
  </div>

  <!-- Capture du visage (inscription) -->
</template>
