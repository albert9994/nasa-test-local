import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, "../../packages/ui/src");

// Tauri expects a fixed dev port (see src-tauri/tauri.conf.json `devUrl`) and fails if it is taken.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": ui },
    // packages/ui has its own node_modules; make sure React & friends exist exactly once.
    dedupe: ["react", "react-dom", "zustand", "maplibre-gl", "react-map-gl"],
  },
  // Models, data packs and brand assets are shared with the website.
  publicDir: path.resolve(here, "../web/public"),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: [path.resolve(here, "../..")] },
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // packages/ui is shared with Next.js, which inlines process.env.*; do the same here.
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
    "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(process.env.VITE_API_URL ?? ""),
  },
  worker: { format: "es" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2500,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
