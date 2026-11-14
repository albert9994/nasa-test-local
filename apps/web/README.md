# apps/web: FieldShift site + app (Next.js 16, React 19, Tailwind 4)

```bash
pnpm install          # from the repo root
pnpm dev              # http://localhost:3000  (site: /, app: /app)
pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web build
```

> Next.js 16 differs from older docs: read `node_modules/next/dist/docs/` before using a new API (see AGENTS.md).

## Where things live (one owner per file, so PRs don't collide)
| Path | What | Owner / task |
|---|---|---|
| `lib/engine/types.ts` | C1/C2/C3/C10/C12 types + the `Engine` interface | Octa (mirrors 02_CONTRACTS.md) |
| `lib/engine/mock.ts` | **TypeScript mock engine** on real NASA POWER data, same API as the Rust one | Octa (replaced by WASM, A6/A8) |
| `lib/engine/index.ts` | `getEngine()` / `setEngine()`: switch mock → WASM worker → server here | O1 |
| `lib/data/packs.ts` | farm pack loader (`public/data/mock/farms/` until Luca's pipeline lands) | O1 |
| `lib/data/live.ts` | click-anywhere: NASA POWER + SoilGrids → pack in memory | O5 |
| `lib/store/app.ts` | Zustand store (farm, rotation, opts, results). New state → new slice file | O1 |
| `app/app/shell.tsx` | full app layout with slots | O1 |
| `components/app/*` | header, map, farm panel | O1 |
| `components/inputs/*` | rotation builder, sliders, profile | O2 |
| `components/hero/*` | Adaptation Margin hero + yearly chart | O3 |
| `components/replay/*` | drought replay | O4 |
| `components/explain/*` | AI explanation, FieldShift Score, plan | O7 |
| `app/page.tsx`, `app/(site)/*`, `components/site/*`, `components/three/*` | light site + 3D | O6 |
| `#compare`, `#frontier`, `#science`, `#marginYear` slots | Ionut's components | I3b, I5, I6, I7 |

`public/data/mock/farms/*.json` are real data (NASA POWER 2001–2025, SoilGrids, MODIS NDVI) for Iowa, Kansas and the Bărăgan,
cached by the old prototype. They follow C1, so the real packs can replace them 1:1.
