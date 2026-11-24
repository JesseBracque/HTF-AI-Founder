import { defineConfig } from "vite";

// De popup wordt door Vite gebouwd; src/content.ts wordt daarna door esbuild
// als losse IIFE gebundeld (zie package.json → build).
export default defineConfig({
  // Relatieve paden, zodat popup.html ook vanuit chrome-extension:// werkt.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Zelfde minimum als het manifest (AbortSignal.timeout → Chrome 103).
    target: "chrome103",
    rollupOptions: {
      input: "popup.html",
    },
  },
});
