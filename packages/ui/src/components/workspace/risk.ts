"use client";
// Risk badge per field: one quick run of the engine per field (base rotation + adaptation margin), done in the background.
import { create } from "zustand";
import { DEFAULT_OPTS, getEngine } from "@/lib/engine";
import type { Field } from "@/lib/store/farm";
import { loadFieldPack, packForField } from "./packs";
import type { RiskLevel } from "@/components/onboarding/field-map";

export interface FieldRisk { level: RiskLevel; pFail: number; marginDT: number; sig: string }
interface RiskStore {
  byId: Record<string, FieldRisk | undefined>;
  failed: Record<string, boolean | undefined>;
  refresh(fields: Field[], badYearsIn: number): void;
}

let queue: Promise<void> = Promise.resolve();

export const useRisk = create<RiskStore>((set, get) => ({
  byId: {}, failed: {},
  refresh(fields, badYearsIn) {
    for (const f of fields) {
      const sig = `${f.rotation.join(",")}|${f.centroid.lat},${f.centroid.lon}|${badYearsIn}`;
      if (get().byId[f.id]?.sig === sig) continue;
      queue = queue.then(async () => {
        try {
          const engine = getEngine();
          const { pack } = await loadFieldPack(f);
          const handle = await engine.prepareFarm(packForField(pack, f));
          const opts = { ...DEFAULT_OPTS, failShare: 1 / badYearsIn };
          const rot = f.rotation.map((crop) => ({ crop, cover: false }));
          const [base, margin] = await Promise.all([engine.simulateRotation(handle, rot, opts), engine.adaptationMargin(handle, rot, opts)]);
          // Same rule as the margin card: safe when the margin clears the 2050 projection by half a degree.
          const t2050 = pack.scenarios?.ssp245?.["2050"]?.dT ?? 2;
          const level: RiskLevel = margin.already ? "over" : margin.dTcapped || margin.dT > t2050 + 0.5 ? "safe" : "tight";
          set({ byId: { ...get().byId, [f.id]: { level, pFail: base.pFail, marginDT: margin.dT, sig } }, failed: { ...get().failed, [f.id]: false } });
        } catch (e) {
          console.warn("risk check failed for", f.name, e);
          set({ failed: { ...get().failed, [f.id]: true } });
        }
      });
    }
  },
}));
