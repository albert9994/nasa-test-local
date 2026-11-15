// Tauri implementation of the host adapter used by packages/ui (farm persistence, pack cache, saving files, links).
import { load, type Store } from "@tauri-apps/plugin-store";
import { BaseDirectory, exists, mkdir, readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { browserHost, setHost, type Host } from "@/lib/store/farm-storage";

let store: Promise<Store> | null = null;
const getStore = () => (store ??= load("hotar.json", { autoSave: 200, defaults: {} }));

const CACHE_DIR = "packs";
const base = { baseDir: BaseDirectory.AppData };
const safe = (k: string) => k.replace(/[^a-zA-Z0-9._-]/g, "_");

async function ensureCacheDir() {
  if (!(await exists(CACHE_DIR, base))) await mkdir(CACHE_DIR, { ...base, recursive: true });
}

const host: Host = {
  tauri: true,
  async kvGet(k) { return ((await (await getStore()).get<string>(k)) ?? null); },
  async kvSet(k, v) { await (await getStore()).set(k, v); },
  async kvRemove(k) { await (await getStore()).delete(k); },
  async cacheGet(k) {
    try { return await readTextFile(`${CACHE_DIR}/${safe(k)}.json`, base); } catch { return null; }
  },
  async cacheSet(k, v) {
    await ensureCacheDir();
    await writeTextFile(`${CACHE_DIR}/${safe(k)}.json`, v, base);
  },
  async saveFile(name, content) {
    const ext = name.split(".").pop() ?? "html";
    const path = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return null;
    await writeFile(path, typeof content === "string" ? new TextEncoder().encode(content) : content);
    return path;
  },
  openUrl: (url) => openUrl(url),
};

/** Installs the Tauri host when running inside the desktop app; falls back to the browser host (dev server in a tab). */
export function installHost() {
  setHost("__TAURI_INTERNALS__" in window ? host : browserHost);
}
