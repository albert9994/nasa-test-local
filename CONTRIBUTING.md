# Contributing

- **`main` always works.** Nobody pushes to `main` directly.
- **One short branch per task** → Pull Request → CI green → **squash merge** → delete the branch.
- Keep PRs small (aim for < 300 lines) and describe how you checked them.

## Workflow

```bash
git switch main && git pull
git switch -c <name>/<short-description>
# small commits ...
git push -u origin HEAD
gh pr create --fill
```

If `main` moved under you: `git fetch origin && git rebase origin/main`, then `git push --force-with-lease` (your own
branch only, never `main`).

## Checks (CI runs the same)

```bash
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
pnpm --filter @hotar/ui typecheck && pnpm --filter @hotar/ui test
pnpm --filter web build && pnpm --filter desktop build
ruff check pipeline && python -m pytest pipeline/tests
```

## What never goes into the repo

- **API keys, tokens, passwords.** The LLM key lives only in `~/.hotar/ai.env` or a local `.env` (see `.env.example`).
- Large raw data (CMIP6 NetCDF, GeoTIFFs): only the processed JSON packs are committed (< 1 MB per farm).
- Build output (`target/`, `.next/`, `node_modules/`, the generated `packages/engine-wasm/`), already in `.gitignore`.

## Tools

`gh` (GitHub CLI); VS Code with the extensions in `.vscode/extensions.json`; Rust via `rustup` plus
`rustup target add wasm32-unknown-unknown` and `cargo install wasm-pack`; Node 22 with `pnpm` (`corepack enable`);
Python 3.11+.
