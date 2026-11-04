<script setup>
import { ICONS } from "../icons.js";
const props = defineProps({ name: String, cls: { type: String, default: "w-5 h-5" }, sw: { type: [String, Number], default: 1.5 } });
</script>
<template>
  <svg :class="cls" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="sw" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="ICONS[name] || ''" /></svg>
</template>
