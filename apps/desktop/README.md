# Hotar Desktop (Tauri 2)

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

Farm data is stored by the Tauri store plugin (`hotar.json` in the app data folder); data packs of custom fields are
cached as files in `<app data>/packs/` so the app works offline after the first load. Demo-farm packs ship inside the app.

## Server URL (`VITE_API_URL`)
The AI advisor and the server-side Hotar Score use the Axum server (`crates/hotar-server`). Point the app at it with a Vite env
var at dev/build time; empty (default) means offline mode: template text instead of the AI answer, score computed locally.

```bash
VITE_API_URL=https://api.example.com pnpm --filter desktop dev --port 3116
VITE_API_URL=https://api.example.com pnpm --filter desktop tauri build
```

`vite.config.ts` maps `VITE_API_URL` onto `process.env.NEXT_PUBLIC_API_URL`, which `packages/ui/src/lib/platform/api-url.ts` reads, so web
and desktop share the same code path and fallback. Satellite layers and the weather alerts work without the server (NASA GIBS, Open-Meteo).

## Native Rust engine

The desktop app runs `hotar-core` natively (rayon on all cores): every `Engine` method is a Tauri command in
`src-tauri/src/native.rs`, with farms kept in a registry in Tauri state and heavy calls on `spawn_blocking`. The cargo feature
`native-engine` is on by default (`--no-default-features` builds the shell without it).

At start-up the UI calls `engine_info` (`{kind:"native", version, threads}`); on success the engine kind is `native` (header badge,
sidebar) and Monte-Carlo runs 10 000 paths (WASM keeps 1 000). If a command fails the call is retried on the WASM/TypeScript worker
engine, and a broken bridge switches to it for good. `src-tauri` has its own `[workspace]` and `Cargo.lock`, so the root
`cargo test --workspace` is unaffected; run `cargo test --release` in `src-tauri` for the native tests and the 10 000-path timing.
