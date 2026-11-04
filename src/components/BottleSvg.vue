/* Pastille illustrée : bouteille SVG à la couleur de la catégorie (spiritueux = flasque) */
<script setup>
import { computed } from "vue";
const props = defineProps({ cat: { type: String, default: "Rouge" }, size: { type: Number, default: 34 } });
const COLORS = { Rouge: "#7A2E3E", Blanc: "#A8842C", "Rosé": "#D98A96", "Champagne": "#C4A35A", "Crémant": "#8FBF9F", Effervescent: "#4A7856", Moelleux: "#C48B3F", Spiritueux: "#7A8B2E" };
const color = computed(() => COLORS[props.cat] || "#7A2E3E");
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 34 34" fill="none">
    <rect width="34" height="34" rx="8" fill="#FFFFFF" stroke="#E7E0D8" />
    <template v-if="cat === 'Spiritueux'">
      <rect x="13" y="12" width="8" height="14" rx="1.5" :fill="color" />
      <rect x="14.5" y="4" width="5" height="8" :fill="color" />
    </template>
    <path v-else d="M10 12 L10 24 A6 4 0 0 0 22 24 L22 12 C22 10 20 10 20 8 L20 3 L14 3 L14 8 C14 10 12 10 12 12 Z" :fill="color" />
    <rect x="14" y="1.5" width="6" height="3" rx="1" fill="#2B2724" />
  </svg>
</template>
