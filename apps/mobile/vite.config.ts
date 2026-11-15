import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, "../../packages/ui/src");
// `tauri ios dev` / `tauri android dev` set this to the machine's LAN address so the phone can reach the dev server.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": ui },
    dedupe: ["react", "react-dom", "zustand", "maplibre-gl", "react-map-gl"],
  },
  // Data packs, crop icons and brand assets are shared with the website.
  publicDir: path.resolve(here, "../web/public"),
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1431 } : undefined,
    fs: { allow: [path.resolve(here, "../..")] },
    watch: { ignored: ["**/src-tauri/**"] },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
    "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(process.env.VITE_API_URL ?? ""),
  },
  worker: { format: "es" },
  build: {
    // iOS 15 WKWebView / Android 10 WebView.
    target: ["es2022", "safari15"],
    chunkSizeWarningLimit: 2500,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
