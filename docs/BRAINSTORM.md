# FieldShift: Brainstorming (completat)

> **Într-o frază:** FieldShift le spune fermierilor **câtă schimbare climatică (și câte șocuri de piață) mai poate duce rotația lor actuală**,
> le arată ce rotație îi protejează mai bine, ținând cont de bugetul și utilajele lor, și le explică totul pe limba lor, printr-un asistent AI.

---

## Problema
**Fermierii nu sunt pregătiți pentru viitor.**
- Își aleg rotația după clima pe care *și-o amintesc*, dar clima s-a schimbat. Fiecare +1 °C taie ~7 % din recolta de porumb (Zhao et al. 2017).
- Seceta din 2024 a afectat 2–2,5 milioane ha în România (pierderi de €1,5–2 mld). Grâul a scăpat, floarea-soarelui nu (vezi `IMPACT_EVIDENCE.md`).
- Datele NASA există, dar fermierii nu le pot folosi: 70 % nu știu de munca NASA în agricultură, doar 28 % știu să folosească date satelitare (sondajul NASA Acres, 2024).
- Riscul nu vine doar din climă: **prețurile la recoltă și costurile cu inputurile** pot strica un an la fel de rău ca o secetă.

## Ce rezolvă aplicația noastră
* **Interfață ușor de folosit**: fermierul dă click pe teren și primește informații despre recolte, sol și climă, fără GIS și fără termeni tehnici.
* **Informații de piață**: prețuri istorice și curente pentru culturi, costuri de inputuri, iar stress-testul include și **șocuri de preț**.
* **Cât timp mai rezistă rotația actuală**: **Adaptation Margin** ("rotația ta duce +1,8 °C sau −22 % ploaie") + **"sigură până în ~2041"** din proiecțiile climatice NASA.
* **Soluții pentru terenurile nesănătoase**: scor de sănătate a solului, carbon organic, eroziune, plan de revitalizare (culturi de acoperire, leguminoase, mai puțin arat) și cât durează până se vede efectul.
* **Testezi și simulezi diferite rotații**: rotații construite de fermier + **3 rotații reziliente găsite automat**, fiecare testată pe 25 de ani de vreme reală.
* **Soluții după bugetul și utilajele fermierului**: optimizatorul păstrează doar rotațiile pe care fermierul și le permite (cost/ha, investiție) și pe care le poate lucra cu utilajele pe care le are.
* **(nou) Asistent AI care explică**: un LLM primește rezultatele simulării și le explică fermierului în română/engleză, răspunde la întrebări ("de ce a picat porumbul în 2012?") și scrie planul.

## Cui ne adresăm
| Public | Ce primește |
|---|---|
| **Fermieri mici și mijlocii** | Un număr clar (marja), 3 rotații mai sigure, plan pe înțelesul lor, varianta pe telefon |
| **Fermieri care vor să crească și să-și minimizeze riscul** | Simulări detaliate, stress-test climă + piață + buget, comparație de investiții (irigații, utilaje) |
| **Investitori** (fonduri agricole, bănci, asigurători) | Riscul pe mai multe ferme/regiuni, raport exportabil, "anul în care marja se termină" |
| *(bonus)* **Consultanți / ingineri agronomi** | Același instrument pentru mai mulți clienți |

---

## Arhitectura pe scurt: un singur motor, două produse
```
                  ┌──────────────────────────────────────────┐
                  │   fieldshift-core  (Rust crate)          │
                  │   simulator + stress test + optimizator  │
                  └───────────────┬───────────────┬──────────┘
                    compilat în WASM            compilat nativ
                                │                             │
            ┌───────────────────▼──────┐   ┌──────────▼───────────────────┐
            │  SITE (varianta light)   │   │  APLICAȚIA (varianta full)   │
            │  rulează în browser,     │   │  frontend + server Rust      │
            │  fără server, fără cont  │   │  (Axum): simulări mari,      │
            │                          │   │  date, LLM, conturi          │
            └──────────────────────────┘   └──────────┬───────────────────┘
                                                        │
                    ┌───────────────────────────────────▼─────────────┐
                    │ Date: NASA POWER, MODIS, SMAP, ECOSTRESS,       │
                    │ CMIP6, SoilGrids, prețuri (FAO / World Bank /   │
                    │ Euronext)  +  LLM API (al vostru)               │
                    └─────────────────────────────────────────────────┘
```
**De ce așa:** scriem simulatorul o singură dată în Rust. În site rulează **direct în browser** (WASM): instant, gratis de găzduit, merge pentru juriu chiar dacă serverul pică. În aplicație același cod rulează **pe server**, unde poate face simulări grele (mii de scenarii Monte Carlo, optimizare pe toată ferma) și unde stă cheia API a LLM-ului, în siguranță.

---

## Aplicație (varianta completă)

### Features
**1. Ferma mea**
- Conturi + ferme salvate; mai multe parcele per fermă (desenezi parcela pe hartă).
- Pentru fiecare parcelă: sol (SoilGrids), pantă (NASADEM), climă 25 ani (NASA POWER), istoric NDVI (MODIS), umiditate sol (SMAP).
- Profilul fermierului: **buget** (cost maxim/ha, investiție maximă), **utilaje** (semănătoare păioase/prășitoare, combină cu header porumb/floare, irigații da/nu, câți mm de apă), culturi pe care le poate vinde local.

**2. Simulator (Rust)**
- Constructor de rotații (an cu an, + culturi de acoperire, + pârloagă).
- Simulare zilnică pe 25 de ani reali: apă în sol, fenologie, stres de căldură/îngheț/secetă, randament, profit, carbon în sol, eroziune.
- Pârghii: data semănatului, hibrid timpuriu/târziu, irigații, arat vs no-till.
- Calibrare pe recoltele reale ale fermierului.

**3. Stress test (Rust): "cât mai rezistă?"** (+ simularea viitorului cu motorul **quant**, secțiunea dedicată mai jos)
| Tip | Ce testează |
|---|---|
| **Climă** | ΔT × ΔP, **Adaptation Margin** (°C și % ploaie), harta frontierei de eșec, anul în care se termină marja (CMIP6 SSP2-4.5 / SSP5-8.5) |
| **Evenimente extreme** | Replay al celei mai grele secete locale (2007, 2012, 2022, 2024), val de căldură exact la înflorire, primăvară umedă + vară secetoasă |
| **Quant / Monte Carlo** | 1.000–10.000 de **viitoruri posibile 2026–2050** (vreme × prețuri × costuri) → fan chart, VaR/CVaR, probabilitatea de faliment, anul în care se termină marja (cu interval) |
| **Piață** | Preț recoltă −30 %, îngrășăminte +40 %, motorină +25 %, combinat cu secetă ("anul perfect de rău") |
| **Buget** | "Câți ani proști la rând poți duce cu rezerva de cash pe care o ai?" |

**4. Optimizator de rotații (Rust)**
- Caută sute–mii de rotații, filtrează după **buget + utilaje + culturi vandabile**, punctează după prioritățile fermierului (profit / mai puțini ani proști / sol / apă).
- Rezultat: **3 rotații** ("Echilibru", "Scut anti-secetă", "Constructor de sol") + ce investiție ar debloca o rotație mai bună ("cu 100 mm irigație câștigi +1,2 °C marjă").

**5. Sănătatea solului și revitalizare**
- Scor de sănătate (carbon organic, eroziune, diversitate, acoperire vie).
- **Plan de revitalizare** pentru parcele degradate: culturi de acoperire, leguminoase, gunoi de grajd, no-till, pe 3–5 ani, cu traiectoria carbonului și costul.
- Bonus: estimare de **credite de carbon** (cu incertitudine).

**6. Piață**
- Prețuri istorice și curente (lunar) pentru grâu, porumb, floarea-soarelui, soia, rapiță; costuri de inputuri.
- Profitul în simulare folosește prețul ales (istoric / curent / scenariu).
- Alerte: "prețul la floarea-soarelui e cu 15 % peste media pe 5 ani".

**7. Asistent AI (LLM, prin API-ul vostru)**: vezi secțiunea dedicată mai jos
- Butonul **"Explică-mi"** pe fiecare grafic și rezultat.
- **Chat** despre ferma ta: "Ce se întâmplă dacă pun floarea-soarelui în loc de porumb?" → LLM-ul rulează simulatorul și răspunde cu cifre reale.
- **Planul fermierului** scris automat, în română, printabil.

**8. Pentru investitori**
- Portofoliu: mai multe ferme/regiuni pe o hartă, colorate după marjă.
- Clasament: "cine e cel mai aproape de limită", risc agregat, export PDF/CSV.

**9. Rapoarte și export**
- PDF pentru bancă, asigurător sau APIA; CSV cu toate datele; link de partajare.

### Stack
| Strat | Alegere | De ce |
|---|---|---|
| **Motor** | **Rust**: crate `fieldshift-core` (simulator, stress test, optimizator) | Rapid, sigur, același cod pentru browser și server |
| Paralelism | `rayon` pe server (quant cu 10.000 de traiectorii, optimizator) | Mii de scenarii în câteva secunde |
| Quant | `rand` + `rand_distr` + `rand_chacha` (seed fix, rezultate reproductibile) | Monte Carlo determinist, explicabil de LLM |
| Serializare | `serde` + `serde_json` (formatele din `02_CONTRACTS.md`) | Același JSON pentru frontend, server și LLM |
| **Backend** | **Rust + Axum** (`tokio`, `tower-http` CORS, `reqwest` pentru NASA POWER/SoilGrids/LLM), cache `moka` | Același limbaj ca motorul; un singur binar |
| Date grele | Pipeline **Python** (xarray pentru CMIP6, AppEEARS, MODIS) → fișiere JSON/Parquet pe care serverul le citește | Python e cel mai rapid de scris pentru date NetCDF/GeoTIFF; nu rescriem ce merge |
| Bază de date | **SQLite** în hackathon (`sqlx`); **Postgres + PostGIS** mai târziu | Ferme, parcele, scenarii salvate |
| **LLM** | API-ul vostru, apelat **doar din backend** (`/api/explain`, `/api/chat`), streaming SSE | Cheia API nu ajunge niciodată în browser |
| **Frontend** | **SvelteKit** sau **React + Vite + TypeScript** (alegeți ce știe Octa cel mai bine) | Componente pentru dashboard-uri complexe |
| Hartă | **MapLibre GL** + straturi NASA GIBS | Hărți rapide, vector, gratis |
| Grafice | **ECharts** sau **Observable Plot / D3** | Heatmap, linii, animații pentru replay |
| Motor în browser | **WASM** (`wasm-bindgen` + `wasm-pack`) pentru slidere instant fără server | Same engine, offline |
| Mobil | PWA (instalabil pe telefon); mai târziu **Tauri 2** (Rust) pentru desktop/mobil nativ | Fermierii sunt pe telefon |
| Hosting | Backend: **Fly.io / Render / Shuttle**; frontend: **Vercel / Netlify** | Gratuit sau ieftin, deploy rapid |

---

## Site (varianta light)

### Features
- **Landing page** cu povestea: problema → numărul (marja) → demo → cum funcționează → date NASA → echipa.
- **Demo instant, fără cont:** alegi o fermă demo (Iowa, Kansas, Bărăgan + una din zona voastră) **sau dai click oriunde pe hartă**.
- **„Viitorul fermei tale" (quant light):** fan chart 2026–2050 cu 1.000 de viitoruri posibile + "șansa să ai un an prost în 2035".
- **Simulator light în browser (Rust → WASM):**
  - rotația ta (2–3 culturi);
  - sliderele de climă (+°C, −% ploaie) cu rezultat instant;
  - **Adaptation Margin** + "sigur până în ~20XX";
  - 3 rotații reziliente (optimizator mai mic, ~250 de variante);
  - **replay-ul secetei** (animația cu rezervorul de apă), pentru wow.
- **Explicație AI scurtă:** un paragraf generat pentru ferma aleasă, prin backend, cu limită de cereri. Fallback: text din șablon dacă LLM-ul nu răspunde.
- **Plan printabil** de o pagină.
- Call to action: **"Deschide aplicația completă"** (stress test de piață, buget, utilaje, chat, conturi).

### Ce NU are site-ul (rămâne în aplicație)
Conturi, ferme salvate, mai multe parcele, Monte Carlo, stress test de piață/buget, filtre de utilaje, chat cu AI, portofoliu pentru investitori, rapoarte PDF.

### Stack
| Strat | Alegere |
|---|---|
| Framework | **Astro** (site static, rapid, SEO bun) cu "insule" interactive în Svelte/React |
| Motor | Același `fieldshift-core`, compilat **WASM** și încărcat lazy doar pe pagina de demo |
| Date | Pachetele JSON ale fermelor demo, puse static; NASA POWER live din browser pentru click pe hartă |
| Hartă / grafice | MapLibre GL + aceleași componente de grafic ca aplicația |
| AI | Un singur endpoint `/api/explain` pe backend-ul aplicației (rate-limit, cache) |
| Hosting | **GitHub Pages / Netlify / Vercel** (gratis); link-ul pentru juriu |

### Aplicație vs. Site
| | **Site (light)** | **Aplicație (full)** |
|---|---|---|
| Cont | nu | da |
| Unde rulează simulatorul | browser (WASM) | browser (WASM) + server (Rust nativ) |
| Ferme | demo + click pe hartă | ferme salvate, mai multe parcele |
| Stress test | climă (marjă, sliders, replay) | climă + extreme + Monte Carlo + piață + buget |
| Optimizator | ~250 variante, prioritățile fermierului | mii de variante + buget + utilaje + piață |
| AI | o explicație scurtă | "Explică-mi" peste tot + chat cu simulatorul + plan |
| Pentru | juriu, fermieri curioși, presă | fermieri, consultanți, investitori |

---

## Simularea viitorului: motorul **quant** (Rust, `quant.rs`)
**Ideea:** ca la un fond de investiții care își testează portofoliul pe mii de scenarii de piață, noi testăm **ferma** pe mii de **viitoruri posibile**
(vreme × prețuri × costuri), an de an, 2026–2050. Nu prezicem *un* viitor; arătăm **distribuția** viitorurilor și riscul.

### Ce simulăm pe fiecare traiectorie (path)
| Componentă | Model | Calibrat pe |
|---|---|---|
| **Vremea** | **Block bootstrap** din sezoanele reale 2001–2025 (păstrează secetele și valurile de căldură reale, nu inventăm vreme), deplasate pe traiectoria CMIP6 (ΔT(t), ΔP(t)), cu incertitudinea dintre modele eșantionată per traiectorie (p10–p90) | NASA POWER + NEX-GDDP-CMIP6 |
| **Prețurile** | Log-preț **Ornstein–Uhlenbeck** (revenire la medie, tipic pentru cereale) per cultură, corelat între culturi (Cholesky) și **negativ corelat cu recolta regională** (an prost regional → preț mai mare: hedge natural) | Prețuri lunare FAO / World Bank / Euronext 2000–2025 (Moldo, M12) |
| **Costurile** | Drift (inflație) + **salturi rare** (jump-diffusion), ca scumpirea îngrășămintelor din 2022 | Indici de cost, bugete fermă |
| **Ferma** | Același simulator Rust (sezon + rotație) rulat pe fiecare an al traiectoriei, cu rezerva de cash a fermierului | Profilul fermierului |

### Ce iese (metrici „de quant", explicate pe înțelesul fermierului)
| Metrică | Ce înseamnă pentru fermier |
|---|---|
| **Fan chart** venit 2026–2050 (p10 / p50 / p90) | "În 8 din 10 viitoruri venitul tău e în banda asta" |
| **P(an prost)** pe fiecare an | "În 2035 ai 31 % șanse să pierzi bani" |
| **VaR 95 % / CVaR 95 %** (expected shortfall) | "Într-un an foarte prost (1 din 20) pierzi în medie 410 €/ha" |
| **Probabilitatea de faliment** (ruin) | "Cu rezerva de 500 €/ha, în 18 % din viitoruri rămâi fără bani înainte de 2040" |
| **Max drawdown** | Cea mai mare scădere de la vârf, de câți ani proști la rând să te temi |
| **Anul în care se termină marja** (distribuție) | "Rotația ta rezistă probabil până în ~2034 (între 2030 și 2041)" |
| **Scor ajustat la risc** (medie ÷ deviație) | Compară rotațiile pe "profit pentru riscul asumat", ca un Sharpe ratio |
| *(roadmap)* **Frontiera risc–randament** | Fiecare rotație e un punct (venit așteptat vs. CVaR); amestecul de culturi pe parcele = un **portofoliu** diversificat |

### Cum îl construim
- `quant.rs` (Ionut), parametri în `data/quant_params.json` (Moldo, M12), seed fix (`rand_chacha`): **aceleași cifre la fiecare rulare**, deci LLM-ul le poate explica reproductibil.
- **Browser (WASM):** 1.000 de traiectorii într-un Web Worker, ~1–2 s. **Server:** 10.000 de traiectorii cu `rayon`.
- Rezultatul intră în **fișa de fapte** pentru LLM: *"Cu rotația ta, în jumătate din viitoruri marja se termină până în 2034; cu grâu → sorg → mazăre, abia după 2045."*
- **Onestitate:** sunt probabilități pe scenarii, nu predicții. UI-ul și LLM-ul o spun mereu.

### De ce contează pentru juriu și pentru investitori
- Transformă "climate risk" într-un limbaj pe care băncile, asigurătorii și investitorii îl folosesc deja: **VaR, probabilitate de default, scenarii**.
- E o diferențiere clară față de celelalte echipe (care fac "recomandă o rotație").

---

## Motorul în Rust: cum îl organizăm
```
crates/
  fieldshift-core/      # fără I/O: doar matematică, determinist, testat
    src/crops.rs        # biblioteca de culturi (Moldo)
    src/soil.rs         # SoilGrids → apă disponibilă, CN, eroziune
    src/season.rs       # simularea zilnică a unui sezon (Albert)
    src/rotation.rs     # rotații, carry-over, economie
    src/soil_health.rs  # carbon, eroziune, scor (Moldo)
    src/stress.rs       # marjă, frontieră, extreme, șocuri de piață (Ionut)
    src/quant.rs        # motorul quant: Monte Carlo pe vreme × prețuri × costuri, metrici de risc (Ionut)
    src/optimize.rs     # optimizator + filtre buget/utilaje (Ionut)
    src/explain.rs      # construiește "fișa de fapte" JSON pentru LLM
  fieldshift-wasm/      # wasm-bindgen: expune funcțiile pentru browser
  fieldshift-server/    # Axum: /api/simulate, /api/stress, /api/optimize, /api/explain, /api/chat
pipeline/               # Python: descarcă și pregătește datele NASA
web/                    # frontend aplicație
site/                   # Astro, site-ul light
```
- **API-ul motorului** rămâne cel din `02_CONTRACTS.md` (C2/C3); doar că acum e Rust, cu `serde` pe aceleași structuri JSON.
  Frontend-ul nu știe dacă rezultatul vine din WASM sau de pe server.
- **Teste:** `cargo test` cu "smoke tests" pe fermele demo (Iowa 2012 trebuie să fie printre cei mai răi ani etc.) + benchmark (`criterion`): o rotație pe 24 de ani < 2 ms nativ.
- **Determinism:** aceleași date → aceleași cifre (seed fix la Monte Carlo), ca explicațiile LLM să fie reproductibile.

---

## Stratul AI: cum ar trebui să funcționeze LLM-ul
**Regula de aur:** **LLM-ul nu calculează nimic.** Rust calculează, LLM-ul **explică**. Așa nu inventează cifre.

### Fluxul
1. Motorul Rust rulează simularea / stress testul.
2. `explain.rs` construiește o **fișă de fapte** (JSON mic, ~1–2 KB), de exemplu:
   ```json
   { "farm": "Bărăgan, 44.55N 27.45E", "rotation": "porumb → grâu",
     "margin": { "dT": 0.0, "status": "deja peste limită", "bad_years": "8 din 24" },
     "worst_year": { "year": 2007, "why": ["secetă la înflorire", "14 zile > 35 °C"] },
     "best_alternative": { "rotation": "grâu → sorg → mazăre", "bad_years": "0 din 24", "profit_delta_eur_ha": 116 },
     "soil": { "score": 39, "carbon_trend_pct_yr": -0.54 },
     "budget_ok": true, "equipment_missing": [],
     "sources": ["NASA POWER", "SoilGrids", "MODIS NDVI"] }
   ```
3. Backend-ul trimite fișa + întrebarea fermierului + limba la **API-ul vostru LLM**, cu un prompt de sistem strict.
4. Răspunsul vine **în streaming** în interfață, cu cifrele evidențiate și un link "de unde vine cifra asta?".

### Prompt de sistem (schiță)
- Ești consultantul agronom al fermierului. Vorbești simplu, scurt, în limba cerută.
- **Folosești doar cifrele din fișa de fapte.** Dacă o cifră lipsește, spui că nu o ai; nu o estimezi.
- Explici *de ce* (căldură la înflorire, sol care ține puțină apă, rotație fără leguminoase) și *ce poate face* (2–3 pași concreți, cu costul lor).
- Spui mereu că e un instrument de planificare, nu o garanție.

### Funcționalități AI
| Funcționalitate | Unde | Cum |
|---|---|---|
| **"Explică-mi"** pe orice rezultat | site + aplicație | fișă de fapte → explicație de 3–5 propoziții |
| **Planul fermierului** | aplicație (site: varianta scurtă) | fișă completă → plan pe 3 ani, printabil |
| **Chat "ce-ar fi dacă…"** | aplicație | **tool calling**: LLM-ul poate apela `simulate(rotation, dT, dP)`, `stress(...)`, `optimize(...)` pe serverul Rust și răspunde cu rezultatele reale |
| **Rezumat pentru investitor** | aplicație | portofoliu → riscuri principale, ferme de urmărit |
| **Multilingv** | ambele | română, engleză (+ maghiară, ucraineană pentru regiunea noastră, mai târziu) |

### Siguranță și cost
- Cheia API **doar pe server**; rate-limit per IP pe site; cache pe (fermă, rotație, scenariu).
- **Fallback fără AI:** text generat din șablon, ca aplicația să funcționeze și fără LLM.
- Validare: dacă răspunsul conține o cifră care nu e în fișa de fapte, o marcăm sau regenerăm.
- La submisie: declarăm folosirea AI (cerință Space Apps).

---

## Date (ce folosim, de unde)
| Date | Sursă | Pentru |
|---|---|---|
| Vreme zilnică 2001–2025 | **NASA POWER** | motorul de simulare |
| Umiditate sol | **SMAP L4** (NASA), POWER GWETROOT | apa la semănat |
| Vegetație | **MODIS NDVI** (NASA) | validare, replay |
| Stres evaporativ | **ECOSTRESS ESI** (NASA, 70 m) | validare la nivel de parcelă |
| Relief / pantă | **NASADEM** (NASA) | scurgere, eroziune |
| Proiecții climatice | **NEX-GDDP-CMIP6** (NASA) | "sigur până în 20XX" |
| Sol | **SoilGrids** (ISRIC) | apă disponibilă, carbon, eroziune |
| Hărți | **NASA GIBS** | straturi de satelit |
| Prețuri recolte | FAO GIEWS FPMA, World Bank "Pink Sheet", Euronext (MATIF, cu întârziere), INS/MADR | profit, stress de piață |
| Costuri | bugete ISU / K-State, MADR / ASAS pentru România | profit, filtre de buget |
| Recolte oficiale | USDA NASS, INS TEMPO, Eurostat | calibrare și validare |

---

## Ce facem în hackathon vs. ce e roadmap
| În weekend (demo pentru juriu) | Roadmap (slide-ul "Next") |
|---|---|
| `fieldshift-core` în Rust: sezon, rotație, marjă, frontieră, replay, optimizator mic | Extreme compuse, CO₂, quantile mapping CMIP6 zilnic |
| **Motor quant**: 1.000 de viitoruri 2026–2050 în browser (10.000 pe server), fan chart, VaR/CVaR, probabilitate de faliment | Frontieră risc–randament pentru tot portofoliul de parcele; optimizare mean-CVaR |
| WASM în site: slidere instant, click oriunde | Aplicație nativă (Tauri 2) pentru telefon |
| Server Axum minim: `/api/explain` (+ `/api/simulate` dacă e timp) | Conturi, PostGIS, ferme cu multe parcele |
| "Explică-mi" + plan scris de LLM din fișa de fapte | Chat cu tool calling, mai multe limbi |
| Stress de piață simplu: slider de preț ±30 % | Prețuri live, alerte, futures |
| Filtru de buget (cost max/ha) + listă simplă de utilaje | Catalog complet de utilaje, ROI pentru investiții |
| Scor de sănătate a solului + cultură de acoperire | Plan de revitalizare pe 5 ani + credite de carbon |
| Site Astro + demo | Portofoliu pentru investitori, rapoarte PDF |

**Atenție la timp:** Rust → WASM adaugă câteva ore de setup (toolchain, `wasm-pack`, integrarea în frontend).
Recomandare: **Albert face scheletul Rust + WASM în primele 2–3 ore** (un "hello" care rulează în browser), apoi toată lumea construiește pe el.
Dacă la CP2 (T+11) WASM-ul încă nu merge, planul B e să rulăm motorul **doar pe server** (Axum), iar site-ul îl apelează prin API.

---

## Pitch într-un paragraf
*"FieldShift ia 25 de ani de date NASA pentru exact terenul tău și îți spune câtă schimbare climatică mai poate duce rotația ta, de exemplu +1,8 °C, și până în ce an. Îți simulează ferma pe 1.000 de viitoruri posibile, ca un fond de investiții, și îți arată riscul real. Îți testează rotația și la secete reale, la prăbușiri de preț și la scumpirea inputurilor. Îți găsește 3 rotații mai sigure pe care ți le permiți cu bugetul și utilajele tale. Iar un asistent AI îți explică totul pe limba ta, folosind doar cifrele calculate de simulator. Site-ul îți arată asta în 10 secunde; aplicația te lasă să-ți planifici ferma."*
