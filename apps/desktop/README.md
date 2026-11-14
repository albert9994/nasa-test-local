# FieldShift Desktop (Tauri 2)

The paid desktop app (macOS + Windows): first-run onboarding, farm/fields workspace, field analysis, guided tour.
Vite + React 19 + Tailwind 4 in `src/`, Tauri 2 shell in `src-tauri/`. All UI lives in `packages/ui` (`@/` = `packages/ui/src`),
shared with the website; `publicDir` is `apps/web/public` (data packs, models, icons).

## Run

```bash
pnpm install                              # from the repo root
pnpm --filter desktop dev --port 3112     # UI only, in any browser (data kept in localStorage)
pnpm --filter desktop tauri dev           # the real app (Rust toolchain needed, https://rustup.rs)
pnpm --filter desktop tauri build         # installers: .dmg (macOS) / .msi + -setup.exe (Windows)
pnpm --filter desktop tauri build --debug --bundles app   # quick macOS .app
```

`pnpm --filter desktop build` is the Vite build only (that is what `pnpm -r build` in CI runs).
Installers are built in CI: `.github/workflows/desktop.yml` (tag `v*` or manual dispatch, unsigned).

## What is where

| Path | What |
|---|---|
| `src/main.tsx` | boot: Tauri host adapter, locale, engine choice, render |
| `src/tauri-host.ts` | persistence (tauri-plugin-store), pack cache on disk (plugin-fs, app data dir), save dialog, links |
| `packages/ui/src/components/onboarding` | 6-step first-run walkthrough (RO/EN) + the map component with the LandPicker swap point |
| `packages/ui/src/components/workspace` | sidebar, farm map, field analysis, add-field dialog, report, guided tour |
| `packages/ui/src/lib/store/farm.ts` | farm profile store (farm, fields, profile), persisted through the host adapter |
| `packages/ui/src/lib/engine/tauri.ts` | `Engine` adapter that calls Tauri commands + `useNativeEngine()` |
| `src-tauri/src/native.rs` | native engine commands (cargo feature `native-engine`) |

Farm data is stored by the Tauri store plugin (`fieldshift.json` in the app data folder); data packs of custom fields are
cached as files in `<app data>/packs/` so the app works offline after the first load. Demo-farm packs ship inside the app.

## Switching the native Rust engine on

By default the app uses the TypeScript engine (Web Worker). The native engine runs `fieldshift-core` in Rust.

1. `crates/fieldshift-core` must exist and expose `call(method, json) -> Result<json, String>` (see the contract in
   `src-tauri/src/native.rs`; adapt `dispatch` there if the crate exposes typed functions instead).
2. In `src-tauri/Cargo.toml` uncomment the `fieldshift-core` dependency and switch the feature line to
   `native-engine = ["dep:fieldshift-core"]`.
3. Build: `pnpm --filter desktop tauri build -- --features native-engine` (or `tauri dev -- --features native-engine`).
   In CI, run the "Desktop installers" workflow manually and tick `native_engine`.

At start-up the UI calls the `engine_info` command. If it succeeds, every `Engine` call goes through Tauri commands
(`simulate_rotation`, `optimize`, `quant_simulate`, ...); if it fails (feature off, core missing) the app silently keeps
the TypeScript engine. The sidebar shows which one is active.

## Notes

- `src-tauri/Cargo.toml` has an empty `[workspace]` table on purpose: it is not part of the root cargo workspace (`crates/*`).
- Icons are generated from `src-tauri/icon-source.svg` with `pnpm tauri icon src-tauri/icon-source.svg`.
- The webview needs internet only for map tiles, place search (Nominatim) and live NASA POWER / SoilGrids data for custom
  fields; everything fetched for a field is cached on disk.
