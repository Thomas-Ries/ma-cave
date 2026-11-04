import { createRouter, createWebHashHistory } from "vue-router";
import CaveView from "./views/CaveView.vue";
import ApogeesView from "./views/ApogeesView.vue";
import AccordsView from "./views/AccordsView.vue";
import BuesView from "./views/BuesView.vue";
import EnviesView from "./views/EnviesView.vue";
import StatsView from "./views/StatsView.vue";

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: CaveView },
    { path: "/apogees", component: ApogeesView },
    { path: "/accords", component: AccordsView },
    { path: "/bues", component: BuesView },
    { path: "/envies", component: EnviesView },
    { path: "/stats", component: StatsView }
  ]
});
