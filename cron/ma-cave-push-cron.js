/* Ma Cave — micro-worker CRON des rappels push (indépendant de la Pages)
 *
 * La Pages Function ne sait pas se déclencher seule : ce worker minuscule
 * appelle /api/push-cron chaque soir à 18 h UTC (19-20 h en France).
 *
 * Installation (dashboard Cloudflare, ~2 minutes, une seule fois) :
 *  1. Workers & Pages → Create → Worker → nom « ma-cave-push-cron » → Edit code :
 *     coller CE fichier → Deploy.
 *  2. Settings → Variables and Secrets → ajouter :
 *       PAGES_URL   = https://family-wine-cellar.pages.dev
 *       PUSH_SECRET = <la même valeur que PUSH_CRON_SECRET sur la Pages>
 *  3. Settings → Trigger Events → Cron Triggers → ajouter : 0 18 * * *
 *
 * Aucune donnée ne transite par ce worker : il se contente de réveiller la Pages. */
export default {
  async scheduled(event, env, ctx) {
    const url = (env.PAGES_URL || "https://family-wine-cellar.pages.dev") + "/api/push-cron";
    try {
      const res = await fetch(url, { method: "POST", headers: { "x-cron-secret": env.PUSH_SECRET || "" } });
      console.log("[cron push]", res.status, await res.text());
    } catch (e) {
      console.error("[cron push] échec :", String(e.message || e));
    }
  },
};
