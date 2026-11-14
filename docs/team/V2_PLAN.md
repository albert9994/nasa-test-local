# FieldShift v2: what changed and who does what

## Product (decided by Octa, 14 Nov)
FieldShift is a **SaaS for farmers and advisers**, not a hackathon demo. No team or hackathon content in the product.
- **Web (free):** SaaS landing page + **free map tool**: search a place, **select a piece of land** (draw it, click a farmland
  parcel, or drop a circle), see simple information and processed NASA data for it, and how it could be affected.
- **Desktop app (paid, Mac/Windows, Tauri 2):** the full workspace: farm + fields, stress test, futures (quant), rotations
  optimizer + FieldShift Score, drought replay, satellite layers (incl. Prithvi-EO-2.0 crop map), AI advisor, PDF report, alerts.
- **RO + EN everywhere** (Romanian first), a **walkthrough** for first-time farmers, a **light agri-SaaS look**.
- **Only real data** is shown as real; anything else is labelled "Illustrative".

## Architecture
```
crates/fieldshift-core     unified Rust engine (simulator, stress, optimizer, quant, score + Rhai rules, fact sheet)
crates/fieldshift-wasm     wasm-bindgen exports (C3) → packages/engine-wasm (web)
crates/fieldshift-server   Axum API: explain (LLM), score, data proxies (CMIP6, HLS, IMERG, SMAP…)
apps/web                   Next.js: /ro, /en landing + /[locale]/map free tool
apps/desktop               Tauri 2 + Vite; Rust commands call fieldshift-core natively
packages/ui                shared React (design system, i18n, map, panels, walkthrough). `@/` = packages/ui/src
pipeline/                  Python data pipeline (packs, CMIP6, yields, NDVI, Prithvi precompute)
```
- Design tokens: `packages/ui/src/styles/theme.css` (bg #F7F6F1, primary field green #1F5135, data blue #2563A8, heat #C2410C).
- i18n: `packages/ui/src/lib/i18n` → `useT()("namespace.key")`; add a namespace file per feature in `messages/`.
- Walkthrough: `packages/ui/src/components/tour/tour.tsx` (`data-tour="id"` targets).
- Engine in the UI: `getEngine()` (TS mock today → WASM in the browser → native Tauri commands on desktop).

## Workstreams (each = 1 issue, 1 branch, 1 PR; Octa's session integrates)
| ID | What | Builds on |
|---|---|---|
| A1 | Unified Rust engine: Albert's simulator + Ion's stress/optimizer/score/rules + Moldo's crops/soil health/rules, wasm-bindgen, Axum | albert, ion, moldy |
| A2 | Monorepo, shared UI package, light design system, i18n, walkthrough | main |
| A3 | Real data: NEX-GDDP-CMIP6 deltas, Romanian farms (Ialomița, Vaslui, Dolj), INS/NASS yields, data catalog | LUCA, moldy |
| B1 | Web: SaaS landing + free map tool (land selection, field snapshot, "how you could be affected") | A2, A3 |
| B2 | Desktop app (Tauri): onboarding walkthrough, farm/fields workspace, native engine, installers | A1, A2 |
| B3 | Field analysis panels (overview, risk, stress, futures, rotations, replay, satellite, report) on the new design + i18n | A2 |
| B4 | Best simulator + quant (Penman–Monteith, monthly CMIP6 deltas, CO₂, stationary bootstrap, t-copula prices, CRN, VaR/CVaR, ruin) | A1 |
| B5 | Satellite + AI layers: GIBS (NDVI, LST), HLS NDVI series, Prithvi-EO-2.0 crop map (precomputed), WorldCereal/CDL | A3 |
| B6 | AI advisor (evidence packet, number check + judge, RO/EN) + weather alerts + "what needs attention today" | A1 |

## Teammates
Your branches (`albert`, `ion`, `LUCA`, `moldy`) are being **integrated, not overwritten**: A1 and A3 take your code into PRs that credit you.
If you keep working, please branch from `main` after A1/A2/A3 merge and pick up one of the follow-ups listed in the PRs, so we don't duplicate work.
