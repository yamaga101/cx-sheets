import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.src.json";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: ".",
    emptyOutDir: false,
  },
});
