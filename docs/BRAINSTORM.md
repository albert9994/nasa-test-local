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
Aplicația și site-ul stau în **același monorepo** și folosesc același stack. Detaliile complete sunt în capitolul **„Stack complet"** de mai jos. Pe scurt:
- **Frontend:** **Next.js** (App Router) + **React** + **TypeScript**, **Tailwind CSS** + **shadcn/ui**
- **3D și hărți:** **Three.js** (prin **React Three Fiber**) + **MapLibre GL** / **deck.gl**
- **Motor:** **Rust** (`fieldshift-core`): WASM în browser + server **Axum**
- **Date:** **Postgres + PostGIS** (Supabase), cache **Redis**, pipeline **Python**
- **AI:** LLM-ul vostru prin backend; streaming cu **Vercel AI SDK**
- **Plăți:** **Stripe** (abonament anual)

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
- **Același proiect Next.js** ca aplicația, dar pagini **statice / ISR** (rapide, SEO bun, ieftin de găzduit pe Vercel). Rutele: `/` (landing), `/demo`, `/farm/[id]`, `/about`, `/sponsors`.
- Motorul Rust **WASM**, încărcat lazy doar pe `/demo`, într-un Web Worker.
- **Three.js** pentru hero-ul 3D al landing-ului (globul cu câmpuri, terenul fermei, „25 de sezoane" ca peisaj) și pentru animațiile din video.
- Fără cont; AI doar prin `/api/explain` (rate-limit); reclame + sponsori (vezi „Monetizare").

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

## Stack complet (aplicație + site)
### Organizare
| Ce | Alegere | De ce |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** (`apps/web` Next.js, `apps/server` Rust, `crates/*`, `packages/ui`, `pipeline/`) | Un singur repo, build-uri cache-uite, componente partajate între aplicație și site |
| Limbaje | **TypeScript** (frontend), **Rust** (motor + server), **Python** (date) | Fiecare unde e cel mai bun |

### Frontend (Next.js + React)
| Strat | Alegere | Pentru ce |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19** | Site-ul (static/ISR) și aplicația (dashboard) în același proiect; Server Components, API routes pentru proxy |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) + **lucide-react** (iconițe) | Componente accesibile, rapide de construit; temă light/dark |
| Animații | **Framer Motion** | Tranziții, numere care cresc, carduri |
| **3D** | **Three.js** prin **@react-three/fiber** + **@react-three/drei**; shadere GLSL pentru teren | Globul 3D cu fermele, **terenul fermei în 3D** din NASADEM (pantă, apă care se scurge), „25 de sezoane" ca peisaj 3D (ca ashMeteo), cadre pentru video |
| Hărți | **MapLibre GL** (+ **react-map-gl**) cu straturi **NASA GIBS**; **deck.gl** pentru straturi grele (hexagoane de risc, portofoliul investitorului) | Hărți vector rapide, gratuite |
| Grafice | **ECharts** (fan chart, heatmap, replay) sau **visx** (D3 în React) | Graficele quant (evantai, histograme, frontieră risc–randament) |
| Stare / date | **Zustand** (stare UI: rotație, slidere) + **TanStack Query** (apeluri server, cache) | Simplu, rapid, fără boilerplate |
| Formulare | **React Hook Form** + **Zod** (aceleași scheme validează și răspunsul LLM) | Profilul fermierului, buget, utilaje |
| Motor în browser | **WASM** din `fieldshift-wasm` (`wasm-pack`), rulat în **Web Worker** (prin **Comlink**) | Slidere instant fără să blocheze interfața |
| AI în UI | **Vercel AI SDK** (`useChat`, streaming) | Text care apare în timp real, chat cu tool calling |
| Limbi | **next-intl** (română, engleză) | Fermieri din RO + juriu internațional |
| PDF | **@react-pdf/renderer** | Planul fermierului, rapoarte pentru bancă/APIA |
| PWA | **Serwist** (service worker) | Instalabil pe telefon, merge și cu semnal slab |

### Backend și motor
| Strat | Alegere | Pentru ce |
|---|---|---|
| Motor | **Rust** `fieldshift-core` (simulator, stress, optimizator, quant, scor) | Un singur cod, browser + server |
| Server | **Rust + Axum** (`tokio`, `tower-http`, `reqwest`, `rayon`) | `/api/simulate`, `/api/stress`, `/api/quant`, `/api/score`, `/api/explain` |
| Reguli agronomice („scripturi") | **Rhai** (limbaj de scripting încorporat în Rust) | Moldo scrie reguli fără să recompileze motorul (vezi „Scorul FieldShift") |
| Joburi lungi | **tokio** tasks + coadă în Redis (sau **Apalis**) | Quant cu 10.000 de traiectorii, rapoarte PDF, actualizări de date |
| API docs | **utoipa** (OpenAPI generat din Rust) | Contract clar între frontend și server; API vândut la enterprise |

### Date, conturi, plăți
| Strat | Alegere | Pentru ce |
|---|---|---|
| Bază de date | **PostgreSQL + PostGIS** (pe **Supabase**) | Conturi, ferme, parcele (poligoane), scenarii, rezultate |
| Fișiere | **Supabase Storage** / **Cloudflare R2** | Pachete de date per fermă, rapoarte PDF |
| Cache + rate-limit | **Redis** (**Upstash**) | Cache pentru LLM și quant; limite pe planul gratuit |
| Autentificare | **Supabase Auth** (sau **Auth.js** / **Clerk**) | Email, Google; conturi de echipă pentru consultanți/investitori |
| Plăți | **Stripe Billing** (abonamente anuale, facturi, TVA UE prin Stripe Tax) | Planurile din „Monetizare" |
| Pipeline date | **Python** (xarray, rasterio, pandas, requests) + **GitHub Actions** programate (cron) | NASA POWER, MODIS, SMAP, ECOSTRESS, CMIP6, SoilGrids, prețuri |
| Format date | JSON pentru demo; **Parquet** / **Zarr** pentru volume mari | Rapid de citit din Rust (`arrow`/`polars`) |

### Calitate, operare, analiză
| Strat | Alegere |
|---|---|
| Teste | `cargo test` + **criterion** (motor), **Vitest** (frontend), **Playwright** (end-to-end) |
| CI/CD | **GitHub Actions**: `cargo test`, `wasm-pack build`, `pnpm build`, deploy |
| Hosting | **Vercel** (Next.js), **Fly.io** (server Rust), **Supabase** (DB) |
| Monitorizare | **Sentry** (erori frontend + Rust), **OpenTelemetry** + **Grafana** (opțional) |
| Analytics | **PostHog** (produs) sau **Plausible** (site, fără cookie-uri) |
| Reclame | **Google AdSense** sau rețele contextuale; **consimțământ cookie GDPR** (CMP certificat) |

> **Pentru hackathon** folosim doar: Next.js + React + Tailwind + shadcn, Three.js (hero 3D), MapLibre, ECharts, WASM, Axum, LLM.
> Conturile, Stripe, Postgres și reclamele sunt pentru după (le arătăm pe slide-ul de business).

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

## Scorul FieldShift: nu doar quant, ci o combinație
**Ideea:** niciun algoritm singur nu dă scorul. Scorul final al unei rotații este o **combinație transparentă** din 6 surse, fiecare
cu rolul ei, iar fermierul vede mereu **din ce e compus** (grafic „cascadă" cu fiecare contribuție).

### Cele 6 surse
| # | Sursă | Ce aduce | Cine o face |
|---|---|---|---|
| 1 | **Simulatorul fizic** (Rust) | Randament, apă, căldură, îngheț, profit pe 25 de ani reali; **Adaptation Margin** | Albert |
| 2 | **Algoritmul quant** (Rust) | Riscul viitorului 2026–2050: P(an prost), CVaR, probabilitate de faliment, anul în care se termină marja | Ionut |
| 3 | **Scripturi cu reguli agronomice** (Rhai, rulate de Rust) | Lucruri pe care un model numeric nu le „știe": pauza minimă între aceleași culturi (boli, dăunători, ex. floarea-soarelui max. 1 din 4–5 ani), leguminoase care lasă azot, reguli PAC (diversificarea culturilor, eco-scheme), compatibilitatea cu utilajele, culturi vandabile local, sol prea acid/sărat pentru o cultură | **Moldo** scrie regulile; Ionut le rulează |
| 4 | **Semnale din date** | Tendința NDVI a parcelei (MODIS), stres ECOSTRESS, umiditate SMAP, tendințe de preț: „terenul ăsta a performat sub vecini 4 ani la rând" | Luca, Moldo |
| 5 | **LLM-ul** (API-ul vostru) | **Judecată calitativă** pe contextul pe care doar fermierul îl știe, scris liber: „am contract cu o fabrică de ulei", „solul e tasat", „nu găsesc mână de lucru vara". Propune o **ajustare mică și justificată** + explicația | Albert (server), Luca (prompt) |
| 6 | **Feedback-ul fermierului** (în timp) | Recoltele reale introduse după sezon → recalibrează motorul pentru ferma lui | după hackathon |

### Cum se combină (formula)
1. Fiecare rotație primește **sub-scoruri 0–100**: **Reziliență climatică** (marjă, din 1), **Risc financiar** (CVaR + faliment, din 2), **Profitabilitate** (din 1–2),
   **Sănătatea solului** (carbon, eroziune, din 1 + 3), **Apă**, **Fezabilitate** (buget, utilaje, piață, din 3).
2. **Scorul de bază** = media ponderată a sub-scorurilor, cu **ponderile alese de fermier** (prioritățile din aplicație).
3. **Regulile (scripturile)** pot: **exclude** o rotație (ex. lipsește utilajul, încalcă pauza de boală), sau aplica **bonusuri/penalizări fixe** cu motiv scris („+5: leguminoasă înainte de grâu").
4. **LLM-ul** poate ajusta scorul doar **între −10 și +10 puncte**, numai cu o justificare legată de contextul fermierului.
   Răspunsul lui e **JSON validat** (Zod / serde): `{ "adjust": -6, "reason": "solul tasat reduce ...", "confidence": "medium" }`.
   Dacă LLM-ul nu răspunde sau iese din limite → ajustare 0.
5. **Scor de încredere** separat (scăzut / mediu / ridicat): cât de bune sunt datele (sol din SoilGrids vs. analiză reală, ani de NDVI) și cât de mult sunt de acord sursele 1, 2 și 4.
6. Rezultat: **Scor FieldShift 0–100 + încredere + cascada cu toate contribuțiile** + explicația LLM.

```
Scor = Σ ponderi_fermier × sub-scoruri (simulator + quant + date)
       ± reguli agronomice (scripturi, cu motiv)
       ± ajustare LLM (max ±10, cu motiv, validată)
       → afișat cu încredere + cascadă „de unde vine fiecare punct"
```

### De ce așa
- **Explicabil:** fiecare punct are o sursă; juriul și băncile văd că nu e „cutie neagră".
- **LLM-ul nu poate strica scorul:** are o limită, trebuie să justifice, iar numerele vin tot din motor.
- **Scripturile** prind experiența practică a lui Moldo (și, mai târziu, a consultanților) fără să recompilăm codul Rust.
- **Quant-ul** aduce riscul viitorului; **simulatorul** aduce fizica; **datele** aduc realitatea parcelei.

### Cum îl construim (hackathon)
- `score.rs` (Ionut): sub-scoruri + combinare + cascadă. `rules/*.rhai` (Moldo): 10–15 reguli. `/api/score` (Albert): rulează scorul de bază, cere ajustarea LLM, validează, returnează tot.
- În UI (Octa): „Scor 78/100 · încredere medie" + cascadă + butonul „De ce?".

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
    src/score.rs        # Scorul FieldShift: sub-scoruri, reguli, ajustare LLM, cascadă (Ionut)
    src/rules.rs        # rulează scripturile Rhai cu reguli agronomice (Ionut)
    src/explain.rs      # construiește "fișa de fapte" JSON pentru LLM
rules/                  # *.rhai: reguli agronomice (Moldo)
  fieldshift-wasm/      # wasm-bindgen: expune funcțiile pentru browser
  fieldshift-server/    # Axum: /api/simulate, /api/stress, /api/optimize, /api/explain, /api/chat
pipeline/               # Python: descarcă și pregătește datele NASA
apps/web/               # Next.js: site-ul light + aplicația (rute diferite)
packages/ui/            # componente React partajate (grafice, hărți, 3D)
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

## Monetizare
**Modelul:** site **gratuit** (susținut de sponsori + reclame) → aplicație **cu abonament anual**, poziționată ca un
**„Bloomberg Terminal pentru ferme"**: date, simulări, risc și analiză într-un singur loc, pentru oameni care iau decizii de bani.

### 1. Site-ul gratuit: sponsori + reclame
| Sursă | Cum arată | Reguli |
|---|---|---|
| **Sponsori** (principalul venit al site-ului) | Firme de semințe/inputuri, producători de utilaje, bănci agricole, asigurători, cooperative, programe UE/ONG de climă. „Powered by" pe landing, pagina `/sponsors`, rapoarte anuale sponsorizate („Riscul climatic în Bărăgan 2026") | **Sponsorii nu influențează niciodată recomandările sau scorul**; scris public în pagina de sponsori (altfel pierdem încrederea fermierilor) |
| **Reclame** | Contextuale, discrete: banner în landing și sub rezultate, **niciodată** în mijlocul simulării sau al planului | Etichetate „Publicitate"; consimțământ GDPR; fără tracking agresiv; fără reclame la pesticide/produse lângă recomandarea respectivă |
| **Granturi** | EU Horizon / Digital Europe, ESA BIC (incubator), fonduri de climă, AFIR/PNRR pentru digitalizare agricolă | Finanțează dezvoltarea fără să depindem de reclame |

Planul gratuit are: demo, click pe hartă, marjă, 3 rotații, replay, quant light (1.000 de viitoruri), o explicație AI pe zi, plan de 1 pagină.

### 2. Aplicația: abonament anual („terminal")
| Plan | Pentru cine | Preț orientativ | Ce primește |
|---|---|---|---|
| **Free** | Oricine | 0 € | Site-ul (mai sus) |
| **Farmer Pro** | Fermieri mici/mijlocii | **~149–299 €/an** (sau per hectar: ~0,5–1 €/ha/an, plafonat) | Conturi, ferme + parcele salvate, quant complet (10.000 de viitoruri), stress de piață și buget, filtre de utilaje, scorul complet, chat AI nelimitat, rapoarte PDF pentru bancă/APIA, alerte |
| **Advisor** | Consultanți, ingineri agronomi, cooperative | **~990–2.500 €/an** (per consultant, cu N ferme incluse) | Multi-client, branding propriu pe rapoarte, comparații între ferme, export |
| **Terminal (Enterprise)** | Bănci, asigurători, fonduri agricole, traderi, procesatori | **~10.000–30.000 €/an per loc** (ca un terminal Bloomberg, dar mult sub ~30.000 $/an al lor) | Portofoliu de ferme/regiuni pe hartă, risc agregat (VaR/CVaR pe portofoliu), „cine e aproape de limită", **API + export de date**, scenarii personalizate, SLA, onboarding |

De ce **anual**: fermierii gândesc pe sezon (un an agricol), bugetele băncilor/asigurătorilor sunt anuale, iar venitul recurent e previzibil.
Ofertă: **2 luni gratis** la plata anuală; perioadă de probă de 30 de zile pe un sezon de planificare.

### 3. Alte surse de venit (mai târziu)
- **API / licențiere de date**: scoruri de risc pe regiune pentru asigurători (prima de asigurare), bănci (scoring de credit), reasigurători.
- **White-label**: o bancă sau un asigurător oferă FieldShift clienților lor, cu brandul lor.
- **Rapoarte plătite**: „Raport de reziliență climatică" pentru credit, fonduri UE sau certificări.
- **Comision pe carbon**: parteneriate MRV pentru credite de carbon din creșterea carbonului în sol (dacă fermierul vrea).
- **Marketplace** (atenție la conflicte de interes): consultanți verificați, analize de sol, culturi de acoperire. Separat clar de recomandări.

### 4. Costuri de ținut sub control
| Cost | Cum îl ținem mic |
|---|---|
| **LLM** (cel mai variabil) | Cache pe fișa de fapte; răspunsuri scurte; limită pe Free; modele mai mici pentru explicații simple |
| **Compute** (quant 10k paths) | Rust + `rayon` e ieftin; cache pe (fermă, rotație, scenariu); calcul în browser (WASM) pe Free |
| **Date** | Datele NASA sunt **publice și gratuite**; SoilGrids e **CC BY 4.0** (uz comercial permis cu atribuire); unele modele CMIP6 au licență **CC BY-SA**, deci verificăm licența fiecărui set înainte de produsul plătit |
| **Hosting** | Vercel + Fly.io + Supabase: zeci de €/lună la început |

### 5. Unit economics (estimare grosieră, de validat)
- Farmer Pro la ~199 €/an; cost estimat ~10–20 €/utilizator/an (LLM + compute + hosting) → **marjă brută ~90 %**.
- Un singur client Terminal (~15.000 €/an) acoperă costurile pentru mii de utilizatori Free.
- **Ținte:** 1.000 de fermieri Pro + 20 de consultanți + 3 clienți Terminal ≈ **~290.000 €/an**.

### 6. Go-to-market (cum ajungem la fermieri)
1. **Site gratuit + conținut**: „Cât mai rezistă ferma ta?" distribuit prin asociații de fermieri, grupuri Facebook de agricultori, presă agricolă (Agrointeligența, Revista Fermierului).
2. **Consultanți și cooperative** ca multiplicatori (un consultant aduce 20–50 de ferme).
3. **Parteneriate cu bănci/asigurători**: ei plătesc Terminal-ul și le oferă clienților Farmer Pro gratuit (canal B2B2C).
4. **Space Apps → incubator** (ESA BIC, Innovation Labs) → granturi → primii clienți pilot.

### Pe slide-ul de business (pitch)
*„Site gratuit, susținut de sponsori și reclame. Aplicație cu abonament anual: Farmer Pro de la ~199 €/an, Terminal pentru bănci și asigurători de la ~10.000 €/an.
Datele NASA sunt gratuite; noi vindem decizia, nu datele."*

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
| Site Next.js + demo + hero 3D (Three.js) | Portofoliu pentru investitori, rapoarte PDF |
| **Scorul FieldShift** v1: sub-scoruri + 10–15 reguli Rhai + ajustare LLM ±10 + cascadă | Feedback-ul fermierului, reguli scrise de consultanți |
| Slide de business: free + sponsori/ads, abonament anual | Stripe, conturi, planurile Pro / Advisor / Terminal |

**Atenție la timp:** Rust → WASM adaugă câteva ore de setup (toolchain, `wasm-pack`, integrarea în frontend).
Recomandare: **Albert face scheletul Rust + WASM în primele 2–3 ore** (un "hello" care rulează în browser), apoi toată lumea construiește pe el.
Dacă la CP2 (T+11) WASM-ul încă nu merge, planul B e să rulăm motorul **doar pe server** (Axum), iar site-ul îl apelează prin API.

---

## Pitch într-un paragraf
*"FieldShift ia 25 de ani de date NASA pentru exact terenul tău și îți spune câtă schimbare climatică mai poate duce rotația ta, de exemplu +1,8 °C, și până în ce an. Îți simulează ferma pe 1.000 de viitoruri posibile, ca un fond de investiții, și îți arată riscul real. Îți testează rotația și la secete reale, la prăbușiri de preț și la scumpirea inputurilor. Îți găsește 3 rotații mai sigure pe care ți le permiți cu bugetul și utilajele tale. Iar un asistent AI îți explică totul pe limba ta, folosind doar cifrele calculate de simulator. Site-ul îți arată asta în 10 secunde; aplicația te lasă să-ți planifici ferma."*
