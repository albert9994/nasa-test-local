"use client";
// Farm profile for the desktop app: the farm, its fields and the farmer's profile. Persisted through the host adapter
// (Tauri store in the desktop app, localStorage elsewhere). Separate from `app.ts`, which holds the analysis of ONE field.
import { create } from "zustand";
import type { CropId, Equipment } from "@/lib/engine/types";
import { getHost } from "./farm-storage";

/** Minimal GeoJSON polygon (lon/lat), so packages/ui needs no extra typings. */
export interface Polygon { type: "Polygon"; coordinates: number[][][] }
export interface LatLon { lat: number; lon: number }
export interface Field {
  id: string;
  name: string;
  areaHa: number;
  centroid: LatLon;
  /** GeoJSON polygon (lon/lat). Optional: a field may be only a point + hectares. */
  geometry?: Polygon;
  /** Crop planned/grown this year. */
  crop: CropId;
  /** Crops of the last 3 years, oldest first (null = unknown). */
  history: (CropId | null)[];
  /** The rotation the analysis starts from (derived from history + crop, editable later). */
  rotation: CropId[];
  /** Bundled demo data pack id (e.g. "baragan"); otherwise a live pack is built from the centroid. */
  packId?: string;
}
export interface Profile {
  /** Max spend, USD per hectare (engine currency); null = no limit. */
  budgetPerHa: number | null;
  equipment: Equipment[];
  sellable: CropId[];
  /** "I can live with 1 bad year in N". */
  badYearsIn: number;
}
export interface Place { name: string; lat: number; lon: number }
export type Theme = "light" | "dark";

export interface FarmData {
  onboarded: boolean;
  demo: boolean;
  name: string;
  place: Place | null;
  fields: Field[];
  profile: Profile;
  theme: Theme;
}

export const DEFAULT_PROFILE: Profile = { budgetPerHa: null, equipment: [], sellable: [], badYearsIn: 5 };
export const FARM_CROPS: CropId[] = ["maize", "wheat", "sunflower", "soybean", "barley", "sorghum", "pea", "millet", "fallow"];
export const EQUIPMENT: Equipment[] = ["row_planter", "grain_drill", "corn_header", "sunflower_header", "irrigation"];

const KEY = "farm.v1";
const uid = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Smallest repeating block of a crop sequence: [maize, wheat, maize, wheat] -> [maize, wheat]. */
export function minimalPeriod<T>(seq: T[]): T[] {
  for (let p = 1; p <= Math.floor(seq.length / 2); p++) {
    if (seq.length % p === 0 && seq.every((v, i) => v === seq[i % p])) return seq.slice(0, p);
  }
  return seq;
}

export function deriveRotation(history: (CropId | null)[], crop: CropId): CropId[] {
  const seq = [...history.filter((c): c is CropId => !!c), crop];
  const r = minimalPeriod(seq);
  return r.length >= 2 ? r : [...r, r[0] === "wheat" ? "maize" : "wheat"]; // the engine wants a real rotation
}

/** A roughly circular polygon of `ha` hectares around a point (used when the farmer places a field by clicking). */
export function circlePolygon(c: LatLon, ha: number, n = 40): Polygon {
  const r = Math.sqrt((Math.max(ha, 0.01) * 10000) / Math.PI); // metres
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([c.lon + Math.cos(a) * dLon, c.lat + Math.sin(a) * dLat]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

/** Area of a lon/lat polygon in hectares (equirectangular, fine for field sizes). */
export function polygonAreaHa(poly: Polygon): number {
  const ring = poly.coordinates[0];
  if (!ring || ring.length < 4) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  return Math.abs(a / 2) / 10000;
}

export function polygonCentroid(poly: Polygon): LatLon {
  const ring = poly.coordinates[0].slice(0, -1);
  return { lon: ring.reduce((s, p) => s + p[0], 0) / ring.length, lat: ring.reduce((s, p) => s + p[1], 0) / ring.length };
}

export function newField(p: { name: string; centroid: LatLon; areaHa: number; crop: CropId; history: (CropId | null)[]; geometry?: Polygon; packId?: string }): Field {
  return {
    id: uid(), name: p.name, areaHa: p.areaHa, centroid: p.centroid, crop: p.crop, history: p.history,
    geometry: p.geometry ?? circlePolygon(p.centroid, p.areaHa), rotation: deriveRotation(p.history, p.crop), packId: p.packId,
  };
}

/** Demo farm in Ialomița (Bărăgan plain), backed by the bundled `baragan` data pack. */
export function demoFarm(locale: "ro" | "en"): Pick<FarmData, "name" | "place" | "fields" | "profile" | "demo"> {
  const ro = locale === "ro";
  const base = { lat: 44.55, lon: 27.45 };
  const mk = (name: string, dLat: number, dLon: number, ha: number, crop: CropId, history: CropId[]) =>
    newField({ name, centroid: { lat: base.lat + dLat, lon: base.lon + dLon }, areaHa: ha, crop, history, packId: "baragan" });
  return {
    demo: true,
    name: ro ? "Ferma demo, Ialomița" : "Demo farm, Ialomița",
    place: { name: ro ? "Ialomița, România" : "Ialomița, Romania", ...base },
    fields: [
      mk(ro ? "Lanul de la drum" : "Roadside field", 0.012, -0.02, 62, "maize", ["wheat", "maize", "wheat"]),
      mk(ro ? "Lanul Mare" : "North field", -0.015, 0.018, 95, "sunflower", ["wheat", "sunflower", "wheat"]),
      mk(ro ? "Lanul de la canal" : "Canal field", -0.004, -0.03, 38, "soybean", ["maize", "wheat", "maize"]),
    ],
    profile: { budgetPerHa: 700, equipment: ["row_planter", "grain_drill", "corn_header", "sunflower_header"], sellable: ["maize", "wheat", "sunflower", "soybean"], badYearsIn: 5 },
  };
}

interface FarmStore extends FarmData {
  hydrated: boolean;
  selectedId: string | null;
  hydrate(): Promise<void>;
  /** Called at the end of onboarding (or when the demo farm is chosen). */
  complete(d: Partial<Pick<FarmData, "name" | "place" | "fields" | "profile" | "demo">>): void;
  addField(f: Field): void;
  updateField(id: string, patch: Partial<Field>): void;
  removeField(id: string): void;
  select(id: string | null): void;
  setProfile(p: Partial<Profile>): void;
  setTheme(t: Theme): void;
  /** Wipe the farm and show the onboarding again. */
  reset(): void;
}

const empty: FarmData = { onboarded: false, demo: false, name: "", place: null, fields: [], profile: DEFAULT_PROFILE, theme: "light" };

function snapshot(s: FarmStore): FarmData {
  return { onboarded: s.onboarded, demo: s.demo, name: s.name, place: s.place, fields: s.fields, profile: s.profile, theme: s.theme };
}
function applyTheme(t: Theme) {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
}

export const useFarm = create<FarmStore>((set, get) => {
  const save = () => { void getHost().kvSet(KEY, JSON.stringify(snapshot(get()))).catch(() => { /* disk error: keep working in memory */ }); };
  return {
    ...empty, hydrated: false, selectedId: null,
    async hydrate() {
      if (get().hydrated) return;
      try {
        const raw = await getHost().kvGet(KEY);
        if (raw) {
          const d = JSON.parse(raw) as Partial<FarmData>;
          set({ ...empty, ...d, profile: { ...DEFAULT_PROFILE, ...d.profile }, selectedId: d.fields?.[0]?.id ?? null });
        }
      } catch { /* corrupt file: start fresh */ }
      applyTheme(get().theme);
      set({ hydrated: true });
    },
    complete(d) {
      const fields = d.fields ?? [];
      set({ ...empty, ...d, fields, profile: { ...DEFAULT_PROFILE, ...d.profile }, onboarded: true, theme: get().theme, selectedId: fields[0]?.id ?? null });
      save();
    },
    addField(f) { set({ fields: [...get().fields, f], selectedId: f.id }); save(); },
    updateField(id, patch) { set({ fields: get().fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }); save(); },
    removeField(id) {
      const fields = get().fields.filter((f) => f.id !== id);
      set({ fields, selectedId: get().selectedId === id ? fields[0]?.id ?? null : get().selectedId });
      save();
    },
    select(selectedId) { set({ selectedId }); },
    setProfile(p) { set({ profile: { ...get().profile, ...p } }); save(); },
    setTheme(theme) { applyTheme(theme); set({ theme }); save(); },
    reset() { set({ ...empty, theme: get().theme, selectedId: null }); save(); },
  };
});
