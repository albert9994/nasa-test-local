"use client";
// App state (Zustand). Shared by the full app (/app) and the lite demo on the site.
// Owners: Octa (O1). If your task needs more state, add it in a separate slice file next to this one
// (e.g. lib/store/replay.ts) instead of editing this file, so parallel PRs don't conflict.
import { create } from "zustand";
import { loadIndex, loadPack } from "@/lib/data/packs";
import {
  DEFAULT_OPTS, DEFAULT_WEIGHTS, getEngine,
  type Constraints, type FarmHandle, type FarmIndexEntry, type FarmPack, type MarginResult,
  type Opts, type PickResult, type Rotation, type RotationResult, type Weights,
} from "@/lib/engine";

export type Mode = "farmer" | "expert";

interface AppState {
  index: FarmIndexEntry[];
  farmId: string | null;
  pack: FarmPack | null;
  handle: FarmHandle | null;
  loading: boolean;
  error: string | null;

  rotation: Rotation;
  opts: Opts;
  weights: Weights;
  constraints: Constraints;
  mode: Mode;

  base: RotationResult | null;
  margin: MarginResult | null;
  picks: PickResult[];
  computing: boolean;

  init(): Promise<void>;
  selectFarm(id: string): Promise<void>;
  /** Live "click anywhere" farms (O5) come in as a pack built in memory. */
  usePack(pack: FarmPack): Promise<void>;
  setRotation(r: Rotation): void;
  setOpts(p: Partial<Opts>): void;
  setWeights(p: Partial<Weights>): void;
  setConstraints(p: Partial<Constraints>): void;
  setMode(m: Mode): void;
  recompute(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let run = 0;

export const useApp = create<AppState>((set, get) => ({
  index: [],
  farmId: null,
  pack: null,
  handle: null,
  loading: false,
  error: null,

  rotation: [],
  opts: DEFAULT_OPTS,
  weights: DEFAULT_WEIGHTS,
  constraints: { equipment: [], sellable: [] },
  mode: "farmer",

  base: null,
  margin: null,
  picks: [],
  computing: false,

  async init() {
    if (get().index.length) return;
    try {
      const index = await loadIndex();
      set({ index });
      if (!get().farmId && index[0]) await get().selectFarm(index[0].id);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  async selectFarm(id) {
    set({ loading: true, error: null, farmId: id });
    try {
      await get().usePack(await loadPack(id));
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  async usePack(pack) {
    set({ loading: true, error: null });
    const handle = await getEngine().prepareFarm(pack);
    set({
      pack, handle, farmId: pack.meta.id, loading: false,
      rotation: pack.meta.rotation.map((crop) => ({ crop, cover: false })),
      opts: { ...DEFAULT_OPTS }, picks: [],
    });
    get().recompute();
  },

  setRotation(rotation) { set({ rotation }); get().recompute(); },
  setOpts(p) { set({ opts: { ...get().opts, ...p } }); get().recompute(); },
  setWeights(p) { set({ weights: { ...get().weights, ...p } }); get().recompute(); },
  setConstraints(p) { set({ constraints: { ...get().constraints, ...p } }); get().recompute(); },
  setMode(mode) { set({ mode }); },

  recompute() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const { handle, rotation, opts, weights, constraints, pack } = get();
      if (!handle || !rotation.length) return;
      const my = ++run;
      set({ computing: true });
      const fs = getEngine();
      const [base, margin] = await Promise.all([
        fs.simulateRotation(handle, rotation, opts),
        fs.adaptationMargin(handle, rotation, opts),
      ]);
      if (my !== run) return;
      set({ base, margin });
      const pool = pack?.meta.cropPool ?? ["maize", "soybean", "wheat", "sorghum", "sunflower", "pea", "barley", "fallow"];
      const ranked = await fs.optimize(handle, pool, opts, weights, rotation, constraints);
      const picks = await fs.pickThree(ranked, rotation);
      if (my !== run) return;
      set({ picks, computing: false });
    }, 60);
  },
}));
