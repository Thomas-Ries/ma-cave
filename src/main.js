import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router.js";
import "./style.css";

/* Service worker : celui de la v1 (vanilla) est retiré — il servait des vieux
   fichiers en cache. Le nouveau sw.js est notification-only : AUCUN cache
   de fichiers, uniquement les notifications programmées de l'app. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(async rs => {
    for (const r of rs) { if (r.scope && r.active && !r.scriptURL.includes("/sw.js")) { try { await r.unregister(); } catch {} } }
    try { await navigator.serviceWorker.register("/sw.js"); } catch {}
  }).catch(() => {});
}

const app = createApp(App);
app.use(createPinia());
app.use(router);

/* Les erreurs de rendu s'affichent en console au lieu de laisser une page blanche muette */
app.config.errorHandler = (err, inst, info) => {
  console.error("[Ma Cave] Erreur :", info, err);
};
app.mount("#app");
