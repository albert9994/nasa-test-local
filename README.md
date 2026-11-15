# Hotar: How much climate change can your crop rotation absorb?

**NASA Space Apps 2026 · Challenge: Field Shift: Adapting Farms with NASA Data**

*Hotar* is Romanian for the boundary between two fields, the old marker stone at the edge of the land. The product measures
exactly that: how far a farm is from its limit. (Formerly FieldShift, after the challenge.)

Hotar will measure a farm's **Adaptation Margin**: the °C of warming and % of rain loss the current rotation can absorb
before the farm loses money more often than the farmer can accept. It will stress-test that rotation against three resilient
rotations it finds automatically, replay the worst local drought day by day, and print a plain-language plan. All of this
runs on 25 years of NASA data for the exact field.

## Status
🚧 Building from zero during the hackathon. Start with **[docs/team/README.md](docs/team/README.md)**.

## How we work (team)
- **Read first:** [CONTRIBUTING.md](CONTRIBUTING.md) (branches, PRs, commits) and [docs/team/README.md](docs/team/README.md) (who does what).
- **One short branch per task** → Pull Request → CI green → squash merge. Nobody pushes directly to `main`.
- **Tasks = GitHub Issues**, grouped by checkpoint (**Milestones CP0–CP6**) and labelled by area. Filter: `assignee:@me`.
- Secrets live only in `.env` (copy `.env.example`); never commit keys.

## Planned structure
```
web/            static app (HTML + JS modules + Leaflet), hosted on GitHub Pages
  js/engine/    simulation engine (S) + decision layer (L)
  js/ui/        UI modules (F, X)
  data/farms/   cached NASA "farm packs" built by the pipeline (D)
pipeline/       Python downloaders: NASA POWER, SoilGrids, MODIS, CMIP6, AppEEARS (D)
tests/          engine sanity scripts (S)
docs/           idea, plan, contracts, per-person tasks, science, data sources
assets/         logo, images (X)
```
An earlier throw-away prototype exists on Octa's laptop (not in this repo); ask if you get stuck.
