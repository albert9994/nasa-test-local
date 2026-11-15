// Saved fields (localStorage). The Free plan keeps 1; the desktop app has no such limit.
import { encodeLand, decodeLand } from "./url-state";
import type { Land } from "./land";

const KEY = "hotar.saved-fields";
export const FREE_FIELD_LIMIT = 1;
export interface SavedField { id: string; name: string; savedAt: number; land: string }

export function listSaved(): SavedField[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((s) => s && typeof s.land === "string") : [];
  } catch { return []; }
}
export function landOf(s: SavedField): Land | null { return decodeLand(s.land); }

/** Returns "limit" when the Free plan is full (and `replace` is false). */
export function saveField(name: string, land: Land, replace = false): "ok" | "limit" {
  let list = listSaved();
  if (list.length >= FREE_FIELD_LIMIT && !replace) return "limit";
  if (replace) list = [];
  list.push({ id: `f${Date.now().toString(36)}`, name, savedAt: Date.now(), land: encodeLand(land) });
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { return "limit"; }
  return "ok";
}
export function removeSaved(id: string) {
  try { window.localStorage.setItem(KEY, JSON.stringify(listSaved().filter((s) => s.id !== id))); } catch { /* ignore */ }
}
