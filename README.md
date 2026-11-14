# FieldShift: How much climate change can your crop rotation absorb?

**NASA Space Apps 2026 · Challenge: Field Shift: Adapting Farms with NASA Data**

FieldShift will measure a farm's **Adaptation Margin**: the °C of warming and % of rain loss the current rotation can absorb
before the farm loses money more often than the farmer can accept. It will stress-test that rotation against three resilient
rotations it finds automatically, replay the worst local drought day by day, and print a plain-language plan. All of this
runs on 25 years of NASA data for the exact field.

## Status
🚧 Building from zero during the hackathon. Start with **[docs/team/README.md](docs/team/README.md)**.

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
