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
import { MobileApp } from "@/components/mobile/mobile-app";
import { installHost } from "./mobile-host";

setWorkerUrl(URL.createObjectURL(new Blob([maplibreWorkerSource], { type: "text/javascript" })));

async function boot() {
  installHost();
  hydrateLocale();
  // Native Rust engine inside the Tauri app (same commands as desktop); the engine in a Web Worker elsewhere.
  if (!(await useNativeEngine())) await useWorkerEngine();
  createRoot(document.getElementById("root")!).render(<StrictMode><MobileApp /></StrictMode>);
}
void boot();
