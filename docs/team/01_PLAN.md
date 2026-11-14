# 01 · The plan: who does what, together, and when

## The team
| Person | Main focus | Also | Task IDs | File |
|---|---|---|---|---|
| **Albert** | Lead + engine core (water/crop simulation code) | NASA satellite layers (AppEEARS), submission | `A1…` | [ALBERT.md](ALBERT.md) |
| **Moldo** | Agronomy: the practical side (crops, rotations, farm economics, "does this make sense to a farmer?") | NDVI + yield data, soil health | `M1…` | [MOLDO.md](MOLDO.md) |
| **Luca** | Data pipeline (weather, soil, climate projections) + validation numbers | Story: persona, copy, deck | `LU1…` | [LUCA.md](LUCA.md) |
| **Ionut** | Bridge between science and UI: decision layer (margin, frontier, optimizer) + charts + design system | Validation panel, video graphics | `I1…` | [IONUT.md](IONUT.md) |
| **Octa** | Frontend lead: app shell, inputs, results, drought replay, live click, farmer mode, plan, deploy | **The video** | `O1…` | [OCTA.md](OCTA.md) |

Nobody does "one thing". Everyone works in **2–3 workstreams**, always paired with someone:

| Workstream | Owner (final say) | Works with | What it produces |
|---|---|---|---|
| **Engine** (simulation) | Albert | Moldo (agronomy rules + parameters), Ionut (decision layer on top) | `web/js/engine/` |
| **Data** (NASA pipelines) | Luca | Moldo (NDVI, yields, farm presets), Albert (AppEEARS) | `pipeline/`, `web/data/` |
| **App** (frontend) | Octa | Ionut (charts, design system, cards, frontier, panels) | `web/` UI |
| **Story** (pitch, deck, video) | Luca (deck) · Octa (video) | Ionut (design), Moldo (farmer realism), Albert (pitch) | deck, video, copy |
| **Integration + submission** | Albert | Octa (backup merger) | `main`, checkpoints, submission |

Albert already made the **GitHub repo** and the **Google Drive**. Use GitHub for code and docs, Drive for everything else
(see "Google Drive" below).

## Clock
All times are **T+hours from kickoff**. Write the real clock times at kickoff:

| T0 | CP0 T+1 | CP1 T+3 | CP2 T+11 | CP3 T+21.5 | CP4 T+25 FREEZE | CP5 T+31 | CP6 submit (deadline −2 h) |
|---|---|---|---|---|---|---|---|
| ____ | ____ | ____ | ____ | ____ | ____ | ____ | ____ |

If the real deadline is shorter, shrink every phase proportionally and drop stretch tasks first.

## Sleep shifts (at least 2 people awake at all times)
| Shift | Who sleeps | When | Awake and merging |
|---|---|---|---|
| 1 | **Luca, Octa** | ≈T+11.5 → T+15.5 | Albert (merges), Moldo, Ionut |
| 2 | **Albert, Moldo, Ionut** | ≈T+15.5 → T+19.5 | Octa (merges), Luca |
| — | Naps after CP5 if the submission is ready | | |

## Sync rhythm (short, standing, timed)
| Sync | Who | When | 10-minute agenda |
|---|---|---|---|
| **Checkpoint stand-up** | everyone, run by Albert | CP0–CP5 | read the checklist; done / fallback / blocked |
| **Engine sync** | Albert + Moldo (+ Ionut) | T+4.5, T+8.5, T+13.5 | parameters, rules, sanity numbers |
| **Data sync** | Luca + Moldo + Albert | T+2.5, T+10, T+17.5 | which layers are in, what's missing |
| **UI sync** | Octa + Ionut | T+3, T+7.5, T+13.5, T+20.5 | layout, components, who touches which file |
| **Story sync** | Luca + Octa + Ionut + Moldo | T+4, T+21.5, T+26 | persona, storyboard, deck, video |

Rule: when you finish something that unblocks someone, post in the team chat
**"`LU1 done → A7, O1 unblocked` + file path"**. Blocked > 30 min → tell Albert.

---

## Everyone's timeline at a glance
```
T+   0     2     4     6     8    10    12    14    16    18    20    22    24    26    28    30
Albert  A1-A5|A6|---A7 season sim---|-A8 rot-|A9|-A10 AppEEARS-|A11|zzzz sleep zzzz|A13 text|A14|A15|--A16 rehearse--|
Moldo   --M1--|---M2 crops---|-M3 rules/€-|--M4 NDVI--|-M5 yields-|-M6 soil-|-M7 tune-|zzzz|--M8--|---M9 Q&A---|--M10--|
Luca    |-LU1 POWER-|LU2|--LU3 soil--|--LU4 copy--|-LU5 CMIP6↓-|LU6|zzzz sleep zzzz|-LU7-|-LU8 valid-|LU9|--LU10 deck--|LU11|
Ionut   ---I1 design---|--I2 charts--|--I3 margin--|I3b|---I4 optim---|-I5 cards-|zzzz|-I6 2050-|-I7 panel-|I8|-I9 video gfx-|
Octa    |----O1 shell----|---O2 inputs---|---O3 hero+yearly---|zzzz sleep zzzz|--O4 replay--|-O5 live-|-O6 farmer-|-O7 plan-|O8|--O9 VIDEO--|
```

---

## Checkpoints (gates)
A checkpoint **passes** when every item is done, or Albert explicitly accepts the fallback written next to it.

### CP0 · T+1 · "Kickoff done"
- [ ] A1 repo skeleton + stack + Pages; Drive folders created
- [ ] A2/M1 demo farms chosen (coordinates + usual rotation)
- [ ] Everyone has cloned the repo, opened the empty page, and read 00_IDEA.md + their own file

### CP1 · T+3 · "Foundations"
- [ ] A4 AppEEARS requests **submitted** (queue takes hours)
- [ ] A5 [02_CONTRACTS.md](02_CONTRACTS.md) signed off
- [ ] A6 `engine.stub.js` merged (Ionut and Octa build on it)
- [ ] LU1 first real pack (Iowa weather) merged · *fallback: the mock pack*
- [ ] I1 wireframe + design tokens; LU2 persona started
- [ ] O1 app shell shows the map with farm markers (work in progress is fine)

### CP2 · T+11 · "First full loop": Albert demos it live
- [ ] A7 season simulator + A8 rotation layer merged; smoke test prints yields for every farm
- [ ] M2 crop library + M3 rotation rules and farm economics merged
- [ ] LU3 soil in all packs · M4 NDVI in ≥ 1 pack
- [ ] I3 margin + frontier running on the **real** engine · O2 inputs · O3 hero margin + yearly chart
- [ ] LU4 copy · LU5 CMIP6 downloads running · LU6 deck skeleton
- [ ] A9 cut list written · *fallback if the engine is late: demo on the stub; Ionut helps Albert*

### CP3 · T+21.5 · "All features in"
- [ ] I4 optimizer + I5 compare cards · I3b frontier heatmap
- [ ] O4 drought replay · O5 live click anywhere
- [ ] M6 soil-health metrics · M7 sanity-tuned yields · M5 county yields
- [ ] LU7 2050 scenarios in packs · I6 "safe until ~20XX" + real 2050 markers · *fallback: illustrative markers, labelled*
- [ ] LU8 validation numbers (`summary.json`)
- [ ] A10 SMAP/ECOSTRESS/slope merged · *fallback: badges say "requested"*

### CP4 · T+25 · FEATURE FREEZE
- [ ] O6 farmer mode · O7 printable plan · I7 validation + data panel · LU9 data-source list
- [ ] M9 Q&A draft · A14 SCIENCE.md
- [ ] A15 `main` tagged `v1.0-freeze` → O8 deployed; smoke test passes
- [ ] **After this: bug fixes only.** New ideas go on the deck's "Future work" slide.

### CP5 · T+31 · "Story locked"
- [ ] O9 video final, uploaded · LU10 deck final · A13 submission text final · M9 Q&A final
- [ ] A16 two full rehearsals (Albert presents, Moldo answers farmer/agronomy questions)

### CP6 · deadline − 2 h · "Submitted"
- [ ] A17 form submitted; every link opened in incognito **on a phone**

---

## Dependency map
```mermaid
flowchart LR
  A2[A2+M1 farms] --> LU1[LU1 POWER packs] & A4[A4 AppEEARS]
  A5[A5 contracts] --> A6[A6 stub] --> I3[I3 margin+frontier] & O2[O2 inputs]
  LU1 --> A7[A7 season sim] & O1[O1 shell]
  M2[M2 crops] --> A7
  LU3[LU3 soil] --> A7
  M3[M3 rules+economics] --> A8[A8 rotation layer]
  A7 --> A8 --> I3 & I4[I4 optimizer] & O3[O3 hero+yearly] & M6[M6 soil health] & M7[M7 sanity tune]
  I1[I1 design] --> O1 & O6[O6 farmer mode]
  I2[I2 charts] --> O3 & I3b[I3b frontier UI] & O4[O4 replay] & I7[I7 validation panel]
  I3 --> O3 & I3b
  M6 --> I4 --> I5[I5 compare cards]
  A7 --> O4
  M4[M4 NDVI] --> O4 & LU8[LU8 validation]
  M5[M5 yields] --> M7 --> LU8
  LU5[LU5 CMIP6 download] --> LU7[LU7 scenarios] --> I6[I6 marginYear + 2050 UI]
  LU8 --> I7 & LU10[LU10 deck] & A13[A13 submission text]
  LU9[LU9 sources] --> I7 & A13 & LU10
  LU4[LU4 copy] --> O3 & O6 & O7[O7 plan]
  M8[M8 farmer tips] --> O7
  A4 --> A10[A10 SMAP/ESI/slope]
  A15[A15 freeze] --> O8[O8 deploy] --> LU11[LU11 QA] --> O9[O9 VIDEO] --> A17[A17 SUBMIT]
  LU2[LU2 persona+storyboard] --> O9
  A13 --> A17
```

### Critical paths (Albert checks these at every checkpoint)
1. **Engine:** `LU1 + M2 + LU3 → A7 → A8 → I3 → O3 → CP2`. Albert codes it; Moldo feeds parameters fast; Ionut takes over A8 if A7 runs late.
2. **Validation:** `M4 + M5 → M7 → LU8 → I7 / LU10 / A13`. This earns the *Validity* score.
3. **Projections:** `LU5 (downloads during Luca's sleep) → LU7 → I6`.
4. **Video:** `A15 freeze → O8 → LU11 → O9 → A17`. Octa records **only from the frozen build**.
5. **AppEEARS:** `A4 → (queue) → A10`. Has a fallback, but A4 must be submitted before CP1.

## Who owns which files (one owner each; others open a PR and tag the owner)
| Person | Files |
|---|---|
| Albert | `web/js/engine/season.js`, `rotation.js`, `index.js`, `engine.stub.js` · `pipeline/appeears/` · `tests/` · `docs/team/*`, `docs/CHALLENGE.md`, `docs/SUBMISSION.md`, `docs/SCIENCE.md`, `README.md` |
| Moldo | `web/js/engine/crops.js`, `web/js/engine/soilhealth.js` · `pipeline/presets.json` (farms + economics) · `pipeline/ndvi/`, `pipeline/yields/` · `web/data/validation/<farm>.json` · `docs/QA.md` |
| Luca | `pipeline/power/`, `pipeline/soil/`, `pipeline/cmip6/`, `pipeline/build_packs.py` · `web/data/farms/*`, `web/data/layers/*` (assembly) · `web/data/validation/summary.json` · `docs/DATA_SOURCES.md`, `docs/STORY.md` |
| Ionut | `web/css/*` · `web/js/charts.js` · `web/js/engine/decision.js` · `web/js/ui/compare.js`, `frontier.js`, `marginyear.js`, `science.js` · `assets/brand/` |
| Octa | `web/index.html`, `web/js/app.js` · `web/js/ui/inputs.js`, `hero.js`, `yearly.js`, `replay.js`, `farmer.js`, `report.js` · `web/js/data/*` (loading + live fetch) · deployment · video |

- Branch per task (`lu1-power`, `a7-season`, `o4-replay`…), small PRs. Albert merges (Octa while Albert sleeps). **`main` must always load.**
- Exception: during a sleep shift, the merger may make an urgent fix in a sleeping person's file and tells them on wake-up.

## Google Drive (Albert's): suggested folders
`01 Research` (papers, crop sources, price sources: Moldo, Luca) · `02 Design` (wireframes, persona, brand: Ionut, Luca) ·
`03 Deck` (Luca) · `04 Video` (raw captures, music, edits: Octa) · `05 Screenshots` (everyone) · `06 Submission` (Albert).
