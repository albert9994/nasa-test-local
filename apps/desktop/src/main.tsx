import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "maplibre-gl/dist/maplibre-gl.css";
import "./main.css";
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerSource from "maplibre-gl/dist/maplibre-gl-worker.mjs?raw";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { hydrateLocale } from "@/lib/i18n";
import { useWorkerEngine } from "@/lib/engine";
import { useNativeEngine } from "@/lib/engine/tauri";
import { setApiUrl } from "@/lib/platform/api-url";
import { invoke } from "@tauri-apps/api/core";
import { installHost } from "./tauri-host";
import App from "./App";

// Vite cannot find MapLibre's worker on its own (dev pre-bundling and the Tauri bundle), so hand it the worker source as a blob.
setWorkerUrl(URL.createObjectURL(new Blob([maplibreWorkerSource], { type: "text/javascript" })));

async function boot() {
  installHost();
  hydrateLocale();
  // Local AI advisor: the app embeds the Hotar API when ~/.hotar/ai.env configures an LLM (see src-tauri/src/ai.rs).
  try { setApiUrl(await invoke<string | null>("ai_server_url")); } catch { /* not in Tauri, or built without it */ }
  // Native Rust engine when this build has it (cargo feature `native-engine`); otherwise the TypeScript engine in a Web Worker.
  if (!(await useNativeEngine())) await useWorkerEngine();
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
}
void boot();
