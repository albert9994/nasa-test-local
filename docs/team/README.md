# Team folder: start here

We build FieldShift **from zero** this weekend. (An earlier throw-away prototype exists on Octa's laptop, not in this repo. Ask Octa only if you're stuck.)

| File | Read it if you are | What it is |
|---|---|---|
| [00_IDEA.md](00_IDEA.md) | everyone, first | The idea, the pitch line, why it wins, the NASA data plan |
| [01_PLAN.md](01_PLAN.md) | everyone | Who works with whom, timeline at a glance, sleep shifts, sync rhythm, **checkpoints CP0–CP6**, dependency map, file ownership, Drive folders |
| [02_CONTRACTS.md](02_CONTRACTS.md) | everyone who writes code or data | Exact formats passed between people + the mocks to build on while you wait |
| [ALBERT.md](ALBERT.md) | Albert | Lead + engine core + NASA satellite layers + submission |
| [MOLDO.md](MOLDO.md) | Moldo | Agronomy (crops, rotations, economics, realism) + NDVI and yield data + soil health |
| [LUCA.md](LUCA.md) | Luca | Data pipeline (weather, soil, climate projections) + validation numbers + persona, copy, deck |
| [IONUT.md](IONUT.md) | Ionut | Design system + charts + decision layer (margin, frontier, optimizer) + cards/panels + video graphics |
| [OCTA.md](OCTA.md) | Octa | Frontend lead (shell, inputs, hero, replay, live click, farmer mode, plan, deploy) + **the video** |

Feature ideas, judging, pitch and Q&A: [../MASTER_PLAN.md](../MASTER_PLAN.md).
Competitors and design inspiration (with what each person should steal): [../INSPIRATION.md](../INSPIRATION.md).

**How to use your file:** do the rows top to bottom. *With* = who you pair with. *Needs / start when* = what must be done first.
When you finish a row that *Unblocks* someone, post `"<ID> done → <who> unblocked"` + the file path in the team chat.

## Pairs at a glance
| Pair | Builds together | Sync times |
|---|---|---|
| **Albert + Moldo** | the simulation engine (Albert codes the loop, Moldo supplies crops, rules, economics, tuning) | T+4.5, T+8.5, T+13.5 |
| **Octa + Ionut** | the app (Octa: page, inputs, hero, replay, live, farmer mode, plan; Ionut: CSS, charts, margin/optimizer, cards, frontier, panels) | T+3, T+7.5, T+13.5, T+20.5 |
| **Luca + Moldo (+ Albert)** | the data (weather, soil, climate: Luca · NDVI, yields, presets: Moldo · satellite layers: Albert) and validation | T+2.5, T+10, T+17.5 |
| **Luca + Octa + Ionut + Moldo** | the story (persona, copy, deck, video, farmer realism) | T+4, T+21.5, T+26 |

## Who waits for whom (quick view)
| If this is late… | …these are stuck | Fallback |
|---|---|---|
| **A2/M1** farms (T+1) | LU1 weather, A4 AppEEARS | start with Iowa; add the others later |
| **A6** stub engine (CP1) | I3, O2 | Ionut/Octa write a 10-line fake of the C3 functions |
| **LU1** first real pack (T+2.5) | A7 engine, O1 real farm | mock pack (LU0) |
| **M2** crop library (T+4.5) | A7 | Albert starts with a draft maize line |
| **I1** design system (CP1) | O1 look, O6 farmer mode | Octa uses plain defaults; restyle later |
| **A7/A8** real engine (CP2) | I3, I4, O3, O4, M6, M7 | demo on the stub; Ionut takes A8 |
| **M4/M5/M7** NDVI, yields, tuning | LU8 validation → I7, LU10, A13 | NDVI-only validation |
| **LU7** projections (T+17.5) | I6 "safe until 20XX" | illustrative markers, labelled |
| **A15** freeze (T+25) | O8 → LU11 → O9 video → A17 | Luca's backup capture |
