# Albert: Lead + Rust engine core + server

**You are:** the integrator (repo, checkpoints, merges, submission) and the person who builds the **Rust foundation**:
the workspace, the WASM build, the core simulation (season + rotation), and the **Axum server** that hosts heavy runs and the LLM endpoint.
Moldo gives you the agronomy (crops, rules); Ionut builds stress tests and the optimizer on top of your engine; Octa consumes it in the browser.
**You own:** `crates/fieldshift-core/src/{lib,season,rotation,soil,explain}.rs` · `crates/fieldshift-wasm/` · `crates/fieldshift-server/` · Rust tests ·
`docs/team/*`, `docs/CHALLENGE.md`, `docs/SUBMISSION.md`, `docs/SCIENCE.md`, `README.md` · merges to `main`.
**Your partners:** Moldo (engine pair) · Ionut (Rust stress/optimizer) · Octa (WASM in the UI, server API) · Luca (data, LLM prompt).
**Sleep:** shift 2, ≈T+15.5 → T+19.5 (Octa merges meanwhile).

## Your tasks in order
| # | Task | With | Needs / start when | Done when | Unblocks | Est. | By |
|---|---|---|---|---|---|---|---|
| A1 | **Rust + WASM skeleton** (repo and Drive already exist): Cargo workspace with `fieldshift-core`, `fieldshift-wasm`, `fieldshift-server`; `wasm-pack build --target web` → `packages/engine-wasm/`; a "hello" function called from the page; Axum `GET /api/health`; folder skeleton below; README with build commands; Drive folders | Octa (checks it loads in the page) | T0 | Every teammate built it and saw "hello from Rust" in the browser | **everyone**, O1 | 2 h | T+2 |
| A2 | **Choose demo farms**: 3 contrasting places + 1 from your home region; rain-fed fields only (check on satellite imagery) | **Moldo** (M1) | T0 (in parallel with A1) | Farms in `docs/CHALLENGE.md` + chat | **LU1, A4, M3** | 30 m | CP0 |
| A3 | **Kickoff stand-up** (15 min): roles, clock table, chat rules; paste the official challenge statement into `docs/CHALLENGE.md` | everyone | A2 (A1 may still be finishing) | Clock times written in 01_PLAN.md | — | 30 m | **CP0** |
| A4 | **Submit AppEEARS requests** (Earthdata): `SPL4SMGP` root-zone soil moisture, `ECO_L4T_ESI` ESI, `NASADEM_NC` elevation; farms + a 3×3 grid at ~30 m; 2015–2025 (Moldo merges later as a stretch, M11) | — | A2 | Request IDs in chat | M11 | 30 m | **CP1** |
| A5 | **Contracts sign-off**: walk everyone through `02_CONTRACTS.md` (C3 Rust API, C9 server, C10 LLM) | everyone | CP0 | Everyone OK'd in chat | all | 30 m | **CP1** |
| A6 | **Rust stub**: every C3 export in `fieldshift-wasm` returning fake-but-plausible results, built to `packages/engine-wasm/`; `apps/web/public/data/mock/api/*.json` for C9 | Ionut | A1 + A5 | Octa calls `fs.simulateRotation(...)` from the page | **I3, O2** | 45 m | **CP1** |
| A7 | **Season simulator** `season.rs` + `soil.rs`: farm prep, sowing rule, GDD, roots + **subsoil store**, rain → runoff → soil → drainage, ET0 × Kc → water stress, stage yield response, heat (flowering + season-long extreme heat), frost, season length, `$`; trace option. `cargo test` smoke tests per farm (Iowa: 2012 among the worst years) | Moldo (parameters, engine syncs) | **LU1** · M2 (draft maize line first) · LU3 (Iowa default soil until then) | Believable Iowa yields; < 0.2 ms per season native | **A8, O4** | 5 h | T+8.5 |
| A8 | **Rotation layer** `rotation.rs`: phases × years; carry-over (legume N, same-crop penalty, soil water, fallow, rye cover) per Moldo's M3; farm net, `pFail`, `fails`, `worstYear`, `traced`. Export through WASM (replace the stub) | Moldo | A7 + **M3** | WASM `simulateRotation` < 5 ms; stub gone | **I3, I4, O3, M6, M7** | 2 h | **T+10.5** |
| A9 | **CP2 live demo** + cut list. **Plan B decision:** if WASM is flaky, the UI switches to the server API (C9) | everyone | CP2 items | Decision + cut list in chat | sleep shift 1 | 30 m | **CP2** |
| A10 | **Server + LLM endpoint**: Axum `/api/simulate`, `/api/stress`, `/api/optimize` (same crate, `rayon` for parallel runs) **`/api/score`** (base score + Rhai rules from `score.rs`, then a bounded ±10 LLM adjustment as validated JSON, C12) and **`/api/explain`**: build the fact sheet (`explain.rs`, C10), call **your LLM API** (key from env), stream SSE, check every number in the answer exists in the fact sheet, fall back to Luca's templates; rate limit + cache; deploy (Fly.io / Render / Shuttle) | Luca (prompt), Octa (UI) | A8 + LU4 prompt draft | Deployed URL answers `/api/explain` for every farm | **O7**, O6 | 3 h | T+14.5 |
| A11 | **Engine hardening**: `cargo test` on all farms, `criterion` benchmark, edge cases (no soil/NDVI, southern hemisphere, tropics), `cargo clippy` clean | Ionut | A10 | Tests green; benchmark in README | CP3 | 1 h | T+15.5 |
| — | *Sleep ≈T+15.5 → T+19.5* | | | | | | |
| A12 | **CP3 stand-up**: every feature on screen? | everyone | — | CP3 decided | — | 15 m | **CP3** |
| A13 | **Submission text** `docs/SUBMISSION.md`: summary, description, NASA + partner data, tools (Rust/WASM, LLM), **AI-use disclosure** (LLM explanations + AI-assisted code/docs) | Luca (numbers) | **LU8 + LU9** | Reviewed by Luca | **A17** | 2 h | T+23.5 |
| A14 | **`docs/SCIENCE.md`**: equations, every parameter cited, limitations | **Moldo** (M9) | A13 | Reviewed by Moldo | M9, A16 | 1.5 h | **CP4** |
| A15 | **Feature freeze**: check CP4, tag `v1.0-freeze` (app + site + server), announce "bug fixes only" | Octa | CP4 items | Tag pushed; server redeployed from the tag | **O8, O9** | 30 m | **CP4** |
| A16 | **Rehearse the pitch** 3× (you present; Moldo answers agronomy; Luca runs slides; someone plays a hostile judge) | Moldo, Luca | LU10 + M9 | Under the time limit | CP5 | 3 h | **CP5** |
| A17 | **Submit**: form + links (video, repo, site, app); everything opened in incognito on a phone | Octa | **O9 + A13** | Confirmation screenshot in chat | — | 45 m | **CP6** |
| — | **Ongoing:** review/merge PRs within 30 min; `cargo test` + open the site after every merge | Octa (backup) | from CP0 | `main` always builds and loads | all | — | — |

## Repo skeleton (A1)
```
Cargo.toml                      # Rust workspace
pnpm-workspace.yaml, turbo.json # JS monorepo (Turborepo)
crates/fieldshift-core/         # pure Rust, no I/O (serde for JSON)
crates/fieldshift-wasm/         # wasm-bindgen + serde-wasm-bindgen; wasm-pack build --target web --out-dir ../../packages/engine-wasm
crates/fieldshift-server/       # axum, tokio, tower-http (CORS), reqwest (LLM, NASA POWER), moka (cache), rayon
apps/web/                       # Next.js (Octa): light site (static routes) + full app (dashboard routes)
packages/engine-wasm/           # wasm-pack output, imported by the Next.js app
packages/ui/                    # shared React components (charts, map, 3D)
rules/                          # Rhai agronomy rules (Moldo)
pipeline/                       # Python data pipeline (Luca, Moldo)
prompts/                        # LLM prompts + fallback templates (Luca)
docs/  assets/
```
Crates: `serde`, `serde_json`, `wasm-bindgen`, `serde-wasm-bindgen`, `console_error_panic_hook`, `axum`, `tokio`, `tower-http`,
`reqwest` (with `stream`), `moka`, `rayon` (server only, not WASM), `criterion` (dev).
Setup: `rustup target add wasm32-unknown-unknown` · `cargo install wasm-pack`.

## Engine recipe for A7/A8 (agree details with Moldo at the T+4.5 engine sync)
1. Spring crops sow on the first day in their window when the 5-day mean temperature ≥ the sowing temperature; winter wheat on a fixed autumn day of the previous year; southern hemisphere: shift ~182 days.
2. GDD = max(0, min(Tmean, Tupper) − Tbase); stages by GDD fraction: vegetative < 0.45 ≤ flowering < 0.62 ≤ grain fill < 0.85 ≤ ripening.
3. Soil: Saxton & Rawls (2006) → plant-available water mm/m.
4. FAO-56 bucket; roots 0.15 m → max by mid-season; a **subsoil store** catches drainage and is taken up as roots deepen.
5. Starting soil water: off-season bucket since the previous harvest + **GWETROOT anomaly** nudge (it's model-relative).
6. ET0 Hargreaves with POWER solar radiation; ETc = Kc × ET0; Ks when depletion > p × TAW.
7. Yield = attainable × Π stages [1 − Ky (1 − ETa/ETc)] × heat × frost × season length × rotation × calibration.
8. Heat: acute at flowering + season-long extreme degree-days (Schlenker & Roberts 2009).
9. Climate shift: + ΔT to every daily Tmax/Tmin; × (1+ΔP) every rain day.
10. Performance: pre-allocated `Vec<f32>` per variable in the farm struct; no allocation inside the daily loop.

## Fallbacks
- WASM toolchain problems in hour 1 → keep going natively (`cargo test`); Octa uses the mock JSON (C9) until WASM works. Decide at CP1.
- A7 late at T+9 → Ionut takes A8; the CP2 demo runs on the stub.
- LLM API down or slow → `/api/explain` returns Luca's template text (C10); the demo never depends on the LLM.
- Server deploy fails → the site still works fully in WASM; explanations use templates.
