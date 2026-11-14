// Host adapter for the desktop app: persistence, pack cache, file saving, external links.
// packages/ui never imports Tauri packages (the website bundles this code too). The desktop app calls `setHost()` at boot
// with an implementation backed by tauri-plugin-store / -fs / -dialog / -opener. Outside Tauri the defaults below are used
// (localStorage for small values and packs, a browser download for files).

export interface Host {
  /** True when running inside the Tauri webview. */
  tauri: boolean;
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvRemove(key: string): Promise<void>;
  /** Large JSON blobs (farm data packs) so the app works offline after first load. */
  cacheGet(key: string): Promise<string | null>;
  cacheSet(key: string, value: string): Promise<void>;
  /** Ask the user where to save, then write. Resolves to the saved path/name, or null if cancelled. */
  saveFile(suggestedName: string, content: string | Uint8Array, mime?: string): Promise<string | null>;
  openUrl(url: string): Promise<void>;
}

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const ls = {
  get(k: string) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* quota or blocked */ } },
  remove(k: string) { try { window.localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const browserHost: Host = {
  tauri: false,
  kvGet: async (k) => ls.get(`fieldshift.${k}`),
  kvSet: async (k, v) => ls.set(`fieldshift.${k}`, v),
  kvRemove: async (k) => ls.remove(`fieldshift.${k}`),
  cacheGet: async (k) => ls.get(`fieldshift.cache.${k}`),
  cacheSet: async (k, v) => ls.set(`fieldshift.cache.${k}`, v),
  async saveFile(name, content, mime = "text/plain") {
    const blob = new Blob([content as BlobPart], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return name;
  },
  async openUrl(url) { window.open(url, "_blank", "noopener"); },
};

let host: Host = browserHost;
export const getHost = () => host;
export function setHost(h: Host) { host = h; }
