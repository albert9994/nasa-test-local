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
import { installHost } from "./tauri-host";
import App from "./App";

// Vite cannot find MapLibre's worker on its own (dev pre-bundling and the Tauri bundle), so hand it the worker source as a blob.
setWorkerUrl(URL.createObjectURL(new Blob([maplibreWorkerSource], { type: "text/javascript" })));

async function boot() {
  installHost();
  hydrateLocale();
  // Native Rust engine when this build has it (cargo feature `native-engine`); otherwise the TypeScript engine in a Web Worker.
  if (!(await useNativeEngine())) await useWorkerEngine();
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
}
void boot();
