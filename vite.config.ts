import { defineConfig } from "vite";

// Vite configuration.
// Docs: https://vite.dev/config/
export default defineConfig({
  // Relative base so the built game works when served from a subpath
  // (e.g. GitHub Pages project sites at /simul/).
  base: "./",
  server: {
    open: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
