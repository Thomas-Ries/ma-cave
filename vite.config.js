import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "face-api": "face-api.js" } },
  build: { target: "es2019" },
});
