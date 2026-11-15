// Host adapter for the mobile app (Tauri 2 on iOS / Android): persistence, pack cache, sharing files, links.
// Outside Tauri (the dev server in a phone browser, or installed as a web app) it falls back to the browser host.
import { load, type Store } from "@tauri-apps/plugin-store";
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { browserHost, setHost, type Host } from "@/lib/store/farm-storage";

let store: Promise<Store> | null = null;
const getStore = () => (store ??= load("fieldshift.json", { autoSave: 200, defaults: {} }));

const CACHE_DIR = "packs";
const base = { baseDir: BaseDirectory.AppData };
const safe = (k: string) => k.replace(/[^a-zA-Z0-9._-]/g, "_");

async function ensureCacheDir() {
  if (!(await exists(CACHE_DIR, base))) await mkdir(CACHE_DIR, { ...base, recursive: true });
}

/** Phones have no "Save as…": hand the file to the system share sheet (Files, Mail, WhatsApp…), else download it. */
async function shareFile(name: string, content: string | Uint8Array, mime = "text/plain"): Promise<string | null> {
  const file = new File([content as BlobPart], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return name; } catch { return null; /* cancelled */ }
  }
  return browserHost.saveFile(name, content, mime);
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
  saveFile: shareFile,
  openUrl: (url) => openUrl(url),
};

export function installHost() {
  setHost("__TAURI_INTERNALS__" in window ? host : { ...browserHost, saveFile: shareFile });
}
