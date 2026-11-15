# Deterministic Fallback Templates — 1-Page Printable Plan (`prompts/fallback_plan.md`, Contract C10)

Used by `/api/explain` (`mode = "plan"`) and `report.tsx` when the LLM API is offline or rate-limited. Every placeholder maps 1-to-1 to the C10 `FactSheet` object.

---

## English (`lang = "en"`)

```markdown
# Hotar Farm Adaptation Plan — {{farm.name}}
**Location:** {{farm.lat}}, {{farm.lon}} · **Soil:** {{farm.soil}} · **Baseline Climate:** {{farm.climate}}

## 1. Current Rotation Stress-Test: `{{rotation}}`
- **Bad-year rule:** {{rule.badYear}} (tolerance: {{rule.tolerance}})
- **Historical performance (24 NASA seasons):** {{today.badYears}} bad years · **{{today.meanNet}} $/ha** mean net income · Worst season: **{{today.worstYear}}** ({{worstYearWhy}})
- **Adaptation Margin:** **+{{margin.dT}} °C** warming headroom (`{{margin.dP}}` rain change) · Status: **{{margin.status}}** · Safe until **{{margin.safeUntil.ssp245}}** (SSP2-4.5) / **{{margin.safeUntil.ssp585}}** (SSP5-8.5)
- **Soil Health:** Score **{{soil.score}}/100** · Organic carbon trend **{{soil.carbonTrendPctYr}} %/yr** · Topsoil erosion **{{soil.erosionTHaYr}} t/ha/yr**

## 2. Recommended Resilient Rotations (Filtered for Your Farm)
1. **{{alternatives[0].label}} — `{{alternatives[0].rotation}}`**
   - Bad years: **{{alternatives[0].badYears}}** · Net income change: **{{alternatives[0].deltaNet}} $/ha** · Warming margin: **+{{alternatives[0].margin.dT}} °C** · Soil score: **{{alternatives[0].soilScore}}/100**
2. **{{alternatives[1].label}} — `{{alternatives[1].rotation}}`**
   - Bad years: **{{alternatives[1].badYears}}** · Net income change: **{{alternatives[1].deltaNet}} $/ha** · Warming margin: **+{{alternatives[1].margin.dT}} °C** · Soil score: **{{alternatives[1].soilScore}}/100**
3. **{{alternatives[2].label}} — `{{alternatives[2].rotation}}`**
   - Bad years: **{{alternatives[2].badYears}}** · Net income change: **{{alternatives[2].deltaNet}} $/ha** · Warming margin: **+{{alternatives[2].margin.dT}} °C** · Soil score: **{{alternatives[2].soilScore}}/100**

## 3. Practical Steps for the Next 3 Seasons
1. **Shift flowering away from peak July–August heat:** Introduce the top-ranked rotation (`{{alternatives[0].rotation}}`) on 25–50 % of your acreage next season to cut drought-year exposure.
2. **Capture biological nitrogen:** Where pea or soybean precedes a winter cereal, reduce synthetic starter nitrogen by 30–50 kg N/ha to lock in input-cost savings.
3. **Protect soil water storage:** Keep stubble on the field and establish winter rye cover before spring-sown crops to reduce runoff and erosion (**{{soil.erosionTHaYr}} t/ha/yr** baseline).

*Data sources: {{sources}}. Planning aid based on historical NASA observations and climate scenarios, not a guarantee.*
```

---

## Romanian (`lang = "ro"`)

```markdown
# Plan de Adaptare Hotar — {{farm.name}}
**Coordonate:** {{farm.lat}}, {{farm.lon}} · **Sol:** {{farm.soil}} · **Climă multianuală:** {{farm.climate}}

## 1. Diagnosticul Rotației Actuale: `{{rotation}}`
- **Regula de an prost:** {{rule.badYear}} (toleranță: {{rule.tolerance}})
- **Performanță istorică (24 sezoane NASA):** {{today.badYears}} ani proști · **{{today.meanNet}} $/ha** venit net mediu · Cel mai greu an: **{{today.worstYear}}** ({{worstYearWhy}})
- **Marja de Adaptare:** **+{{margin.dT}} °C** rezervă de încălzire (precipitații `{{margin.dP}}`) · Statut: **{{margin.status}}** · Sigură până în **{{margin.safeUntil.ssp245}}** (SSP2-4.5) / **{{margin.safeUntil.ssp585}}** (SSP5-8.5)
- **Sănătatea Solului:** Scor **{{soil.score}}/100** · Tendință carbon organic **{{soil.carbonTrendPctYr}} %/an** · Eroziune **{{soil.erosionTHaYr}} t/ha/an**

## 2. Cele 3 Rotații Reziliente Recomandate
1. **{{alternatives[0].label}} — `{{alternatives[0].rotation}}`**
   - Ani proști: **{{alternatives[0].badYears}}** · Diferență venit net: **{{alternatives[0].deltaNet}} $/ha** · Marjă încălzire: **+{{alternatives[0].margin.dT}} °C** · Scor sol: **{{alternatives[0].soilScore}}/100**
2. **{{alternatives[1].label}} — `{{alternatives[1].rotation}}`**
   - Ani proști: **{{alternatives[1].badYears}}** · Diferență venit net: **{{alternatives[1].deltaNet}} $/ha** · Marjă încălzire: **+{{alternatives[1].margin.dT}} °C** · Scor sol: **{{alternatives[1].soilScore}}/100**
3. **{{alternatives[2].label}} — `{{alternatives[2].rotation}}`**
   - Ani proști: **{{alternatives[2].badYears}}** · Diferență venit net: **{{alternatives[2].deltaNet}} $/ha** · Marjă încălzire: **+{{alternatives[2].margin.dT}} °C** · Scor sol: **{{alternatives[2].soilScore}}/100**

## 3. Pași Practici pentru Următoarele 3 Sezoane
1. **Evită arșița din iulie–august la înflorire:** Testează rotația recomandată (`{{alternatives[0].rotation}}`) pe 25–50 % din suprafață din sezonul următor.
2. **Valorifică azotul din leguminoase:** După mazăre sau soia, redu doza de azot chimic la păioasele de toamnă cu 30–50 kg s.a./ha.
3. **Păstrează apa în sol peste iarnă:** Menține resturile vegetale și introdu secara de acoperire înaintea culturilor de primăvară pentru a reduce eroziunea (**{{soil.erosionTHaYr}} t/ha/an** în prezent).

*Surse de date: {{sources}}. Instrument de planificare bazat pe observații NASA și scenarii climatice, nu o garanție.*
```
