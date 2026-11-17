import { createRouter, createWebHashHistory } from "vue-router";
import CeSoirView from "./views/CeSoirView.vue";
import CaveView from "./views/CaveView.vue";
import CarnetView from "./views/CarnetView.vue";
import AccordsView from "./views/AccordsView.vue";
import BuesView from "./views/BuesView.vue";
import EnviesView from "./views/EnviesView.vue";
import StatsView from "./views/StatsView.vue";
import CoeursView from "./views/CoeursView.vue";

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/soir" },
    { path: "/soir", component: CeSoirView },
    { path: "/cave", component: CaveView },
    { path: "/carnet", component: CarnetView },
    { path: "/accords", component: AccordsView },
    { path: "/bues", component: BuesView },
    { path: "/coeurs", component: CoeursView },
    { path: "/envies", component: EnviesView },
    { path: "/stats", component: StatsView }
  ]
});
