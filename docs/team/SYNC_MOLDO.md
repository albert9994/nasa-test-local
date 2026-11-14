# SYNC MOLDO → Echipă (Albert, Luca, Ionuț, Octa)

Toate livrabilele lui **Moldo** (`M1`–`M9`, `M11`, `M12` + `C13` Parcele clicabile din satelit & Catalogul complet de 12 resurse NASA/Parteneri) sunt gata, validate și pre-generate pe branch-ul `moldy`.

> [!IMPORTANT]
> **Zero Breaking Changes:** Niciun format din `02_CONTRACTS.md` nu a fost schimbat distructiv. Toate fișierele noi sau câmpurile suplimentare sunt **100% aditive (backward-compatible)**.

---

## 📋 Mesaj scurt de dat Copy-Paste pe chat-ul echipei (Discord / WhatsApp / Slack)

```text
🌱 UPDATE MOLDO (branch `moldy` gata de merge!):
Am terminat și pre-generat toate straturile și modulele mele (fără conflicte pe fișierele voastre):
✅ M1 + M3 (`pipeline/presets.json`, `data/equipment.json`, `apps/web/public/data/layers/{iowa,kansas,baragan,moldova}/meta.json`): cele 4 ferme demo + costuri/prețuri/utilaje + surse piață.
✅ M2 + M6 (`crates/fieldshift-core/data/crops.json`, `src/crops.rs`, `src/soil_health.rs`): toate cele 9 culturi + secară cover crop + formulele Rust pentru carbon (Q10 + Poeplau & Don) și eroziune RUSLE.
✅ M4 + M5 (`layers/*/ndvi.json` + `apps/web/public/data/validation/{iowa,kansas,baragan,moldova}.json`): 25 de sezoane MODIS NDVI + recoltele oficiale NASS/INS/Eurostat 2001–2025.
✅ M12 (`data/quant_params.json`): parametrii Ornstein-Uhlenbeck (vol 16–22%/an, revenire la medie, corelație preț-recoltă negativă, șoc îngrășăminte) gata pt Ionuț (`I6`).
✅ M8 (`rules/*.rhai` — 13 reguli + `docs/FARMER_TIPS.md`) & M9 (`docs/QA.md` — 12 întrebări juriu).
✅ M11 + C13 NOU (`layers/*/appeears.json`, `layers/*/parcels.json`, `data/nasa_resources.json`, `apps/web/lib/data/parcel_picker.ts`):
   1) Acoperim 100% din toate cele 12 resurse NASA + Parteneri (am adăugat HLS/Sentinel-2 10m, GPM IMERG JAXA, GRACE-FO ape subterane, CropCASMA/NASA Harvest).
   2) "Tap-Your-Field from Above" (fără coordonate!): fiecare fermă are 16 parcele reale (GeoJSON `parcels.json`) + `parcel_picker.ts` care detectează automat conturul parcelei și satul/comuna când fermierul apasă direct pe câmpul văzut din satelit!
Detalii per persoană în `docs/team/SYNC_MOLDO.md`.
```

---

## 🛠️ Ce trebuie să știe fiecare coleg (Integrare în 2 minute)

### 1. Pentru **Octa** (Frontend Map `O1` & Live Click `O5` + Plan `O7`)
- **Cum afișezi câmpurile văzute de sus fără coordonate (`O1` / `O5`):**
  1. Încarcă `apps/web/public/data/layers/<farmId>/parcels.json` (GeoJSON `FeatureCollection` cu 16 parcele/tarlale reale în jurul fiecărei ferme) și pune-l ca sursă `geojson` în MapLibre peste tile-urile satelitare la `zoom: 14.8`.
  2. Importă helper-ul deja scris în [`apps/web/lib/data/parcel_picker.ts`](../../apps/web/lib/data/parcel_picker.ts):
     - `SATELLITE_PARCEL_MAP_CONFIG` — îți dă URL-ul tile-urilor satelitare + culorile pentru conturul parcelelor (`good` verde, `watch` galben, `critical` roșu).
     - `resolveFieldAtClick(lat, lon, parcelsGeoJson)` — când fermierul apasă pe hartă (fie pe o parcelă demo, fie oriunde în lume!), îi returnează instant poligonul parcelei, suprafața în hectare (`areaHa`), panta și numele satului/comunei (`locality`, ex. *"Tarlaua T14 — Dragoș Vodă, Călărași · 22.8 ha"*), **fără să afișeze coordonate GPS**.
     - `searchVillageOrPlace(query)` — căutare după sat/comună pentru bara de search de deasupra hărții.
- **Pentru `O7` (Planul fermierului):** Textele în română și engleză „Ce să încerci prima dată" sunt în [`docs/FARMER_TIPS.md`](../FARMER_TIPS.md).

### 2. Pentru **Luca** (Data Pipeline `LU1`, Validare `LU8`, Surse `LU9`)
- Straturile `meta.json`, `ndvi.json`, `appeears.json` și `parcels.json` există deja în `apps/web/public/data/layers/{iowa,kansas,baragan,moldova}/`!
- În `pipeline/build_packs.py`, când îmbini straturile într-un pack `farms/<id>.json`, poți include opțional și `"parcels"` (sau frontend-ul îl citește direct din `layers/<id>/parcels.json`).
- Pentru **`LU8` (Validare)**: Recoltele oficiale 2001–2025 sunt gata în `apps/web/public/data/validation/{iowa,kansas,baragan,moldova}.json`, cu `longTermMean`, `worstYear` și `bestYear` deja calculate.
- Pentru **`LU9` (`docs/DATA_SOURCES.md`)**: Ai toate cele **12 surse NASA + Parteneri (ESA, JAXA, USDA, ISRIC)** documentate complet în [`data/nasa_resources.json`](../../data/nasa_resources.json).

### 3. Pentru **Albert** (Rust Core `A7/A8` & `SCIENCE.md` `A14`)
- În `crates/fieldshift-core/`:
  - [`crates/fieldshift-core/data/crops.json`](../../crates/fieldshift-core/data/crops.json) și [`crates/fieldshift-core/src/crops.rs`](../../crates/fieldshift-core/src/crops.rs) sunt gata (încărcare cu `include_str!` + `CropLibrary::carry_over_effect`).
  - [`crates/fieldshift-core/src/soil_health.rs`](../../crates/fieldshift-core/src/soil_health.rs) este gata și testat (`compute_soil_health` returnează `soilScore`, `socChangePct`, `erosion`).
- Când faci `Cargo.toml` pentru `fieldshift-core`, adaugă `pub mod crops; pub mod soil_health;` în `lib.rs`.

### 4. Pentru **Ionuț** (Optimizator `I4`, Quant `I6`, Science Panel `I7`)
- **`I4` (Optimizator & Filtre utilaje + Scor `C12`)**:
  - Ai [`data/equipment.json`](../../data/equipment.json) cu maparea utilajelor pe cultură.
  - Ai **13 reguli Rhai** în [`rules/*.rhai`](../../rules/), inclusiv regula `13_groundwater_irrigation_risk.rhai` bazată pe **NASA GRACE-FO**. Toate exportă `fn apply(rot, farm, profile) -> #{ exclude, delta, reason }` și merg atât dacă `rot` e listă de obiecte `{ crop, cover }`, cât și dacă e listă de string-uri.
- **`I6` (Quant Engine `quant.rs`)**:
  - Ai [`data/quant_params.json`](../../data/quant_params.json) complet calibrat pe 2001–2025 (`priceMean`, `vol`, `reversion`, `yieldCorr`, `priceCorr`, `inputs`).
- **`I7` (Panoul „Data behind every number")**:
  - Poți afișa direct tabelul din [`data/nasa_resources.json`](../../data/nasa_resources.json) (12 misiuni NASA + ESA + JAXA + ISRIC).
