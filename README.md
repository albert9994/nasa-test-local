# FieldShift: How much climate change can your crop rotation absorb?

**NASA Space Apps 2026 · Challenge: Field Shift: Adapting Farms with NASA Data**

FieldShift measures a farm's **Adaptation Margin**: the °C of warming and % of rain loss the current rotation can absorb
before the farm loses money more often than the farmer can accept. It stress-tests that rotation against three resilient
rotations it finds automatically within the farmer's budget and equipment, simulates 1,000+ stochastic futures (2026–2050),
replays the worst local drought day by day, and explains every result in plain Romanian/English through a fact-checked AI assistant.
All of this runs on 25 years of NASA Earth observation data for the exact field.

## Status
🚀 Active hackathon build. Start with **[docs/team/README.md](docs/team/README.md)** and **[docs/team/02_CONTRACTS.md](docs/team/02_CONTRACTS.md)**.

## Architecture & Repository Layout
```
Cargo.toml                      # Rust workspace (core, wasm, server)
pnpm-workspace.yaml, turbo.json # JS monorepo (Turborepo)
crates/fieldshift-core/         # Pure Rust engine: soil, season, rotation, soil_health, stress, optimize, quant, score, explain
crates/fieldshift-wasm/         # WASM bindings exporting C3 functions to packages/engine-wasm
crates/fieldshift-server/       # HTTP API server (/api/health, /api/simulate, /api/stress, /api/optimize, /api/score, /api/explain)
apps/web/                       # Next.js (App Router): light site (static routes) + full app (dashboard routes)
packages/engine-wasm/           # WASM output + JS/TS wrapper imported by the Next.js app
packages/ui/                    # Shared React components (charts, map, 3D)
rules/                          # Agronomic rules (Moldo)
pipeline/                       # Python NASA data pipeline (Luca, Moldo)
prompts/                        # LLM system prompts + deterministic fallback templates (Luca)
docs/                           # Idea, plan, contracts, per-person tasks, CHALLENGE.md, SCIENCE.md, SUBMISSION.md
assets/                         # Brand & visual assets
```

## Quick Start & Build Commands

### 1. Rust Engine & Tests
```bash
# Format check & strict Clippy lints
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings

# Run all unit, smoke, and integration tests
cargo test --workspace
```

### 2. WASM Build (`packages/engine-wasm`)
```bash
# Build with wasm-pack (for browser Web Worker consumption)
wasm-pack build crates/fieldshift-wasm --target web --out-dir ../../packages/engine-wasm
```

### 3. API & LLM Explanation Server (`fieldshift-server`)
```bash
# Copy environment variables
cp .env.example .env

# Start server on http://localhost:8787
cargo run -p fieldshift-server
```

## How we work (team)
- **Read first:** [CONTRIBUTING.md](CONTRIBUTING.md) (branches, PRs, commits) and [docs/team/README.md](docs/team/README.md) (who does what).
- **Contracts:** [docs/team/02_CONTRACTS.md](docs/team/02_CONTRACTS.md) defines all C1–C12 JSON and function contracts.
- **Secrets:** Live only in `.env` (copy `.env.example`); never commit keys.
