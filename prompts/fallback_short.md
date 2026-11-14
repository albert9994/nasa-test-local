# Deterministic Fallback Templates — Short Explanation (`prompts/fallback_short.md`, Contract C10)

Used by `/api/explain` (`mode = "short"`) and the browser UI whenever the LLM API is unreachable, times out, or fails number-verification against the C10 `factSheet`.

---

## English (`lang = "en"`)

### When `margin.status == "already_over"`
On **{{farm.name}}** ({{farm.soil}}, {{farm.climate}}), your current **{{rotation}}** rotation had **{{today.badYears}}** money-losing years ({{rule.badYear}}) over the past 24 NASA weather seasons — already exceeding your **{{rule.tolerance}}** tolerance — with an average net income of **{{today.meanNet}} $/ha**. The worst season was **{{today.worstYear}}** ({{worstYearWhy}}), and your soil health score stands at **{{soil.score}}/100** (organic carbon trend **{{soil.carbonTrendPctYr}} %/yr**, erosion **{{soil.erosionTHaYr}} t/ha/yr**). Switching to **{{alternatives[0].label}} ({{alternatives[0].rotation}})** reduces bad years to **{{alternatives[0].badYears}}**, changes average net income by **{{alternatives[0].deltaNet}} $/ha**, and expands your warming margin to **+{{alternatives[0].margin.dT}} °C** (soil score **{{alternatives[0].soilScore}}/100**). Data sources: {{sources}}. This is a scenario-based planning aid, not a guarantee.

### When `margin.status == "tight"` or `margin.status == "safe"`
On **{{farm.name}}** ({{farm.soil}}, {{farm.climate}}), your **{{rotation}}** rotation experienced **{{today.badYears}}** bad years ({{rule.badYear}}) across 24 historical seasons, averaging **{{today.meanNet}} $/ha** net income, and can absorb **+{{margin.dT}} °C** of warming (`{{margin.dP}}` rainfall shift) before exceeding your **{{rule.tolerance}}** limit (safe until **{{margin.safeUntil.ssp245}}** under SSP2-4.5). Its toughest year was **{{today.worstYear}}** ({{worstYearWhy}}), with a current soil health score of **{{soil.score}}/100** (carbon trend **{{soil.carbonTrendPctYr}} %/yr**, erosion **{{soil.erosionTHaYr}} t/ha/yr**). To gain more headroom, **{{alternatives[0].label}} ({{alternatives[0].rotation}})** achieves **{{alternatives[0].badYears}}** bad years, shifts net income by **{{alternatives[0].deltaNet}} $/ha**, and provides **+{{alternatives[0].margin.dT}} °C** of warming margin (soil score **{{alternatives[0].soilScore}}/100**). Data sources: {{sources}}. This is a scenario-based planning aid, not a guarantee.

---

## Romanian (`lang = "ro"`)

### When `margin.status == "already_over"`
Pentru **{{farm.name}}** ({{farm.soil}}, {{farm.climate}}), rotația actuală **{{rotation}}** a înregistrat **{{today.badYears}}** ani proști ({{rule.badYear}}) în ultimele 24 de sezoane NASA — depășind deja pragul tău de **{{rule.tolerance}}** — cu un venit net mediu de **{{today.meanNet}} $/ha**. Cel mai dificil an a fost **{{today.worstYear}}** ({{worstYearWhy}}), iar scorul de sănătate a solului este **{{soil.score}}/100** (tendință carbon organic **{{soil.carbonTrendPctYr}} %/an**, eroziune **{{soil.erosionTHaYr}} t/ha/an**). Trecerea la **{{alternatives[0].label}} ({{alternatives[0].rotation}})** scade numărul de ani proști la **{{alternatives[0].badYears}}**, modifică venitul mediu cu **{{alternatives[0].deltaNet}} $/ha** și crește marja de încălzire la **+{{alternatives[0].margin.dT}} °C** (scor sol **{{alternatives[0].soilScore}}/100**). Surse de date: {{sources}}. Acesta este un instrument de planificare bazat pe scenarii, nu o garanție.

### When `margin.status == "tight"` or `margin.status == "safe"`
Pentru **{{farm.name}}** ({{farm.soil}}, {{farm.climate}}), rotația **{{rotation}}** a avut **{{today.badYears}}** ani proști ({{rule.badYear}}) în 24 de sezoane istorice, cu un venit net mediu de **{{today.meanNet}} $/ha**, și poate absorbi **+{{margin.dT}} °C** încălzire (variație precipitații `{{margin.dP}}`) înainte de a depăși limita de **{{rule.tolerance}}** (sigură până în **{{margin.safeUntil.ssp245}}** pe scenariul SSP2-4.5). Cel mai greu an a fost **{{today.worstYear}}** ({{worstYearWhy}}), iar sănătatea solului este **{{soil.score}}/100** (tendință carbon **{{soil.carbonTrendPctYr}} %/an**, eroziune **{{soil.erosionTHaYr}} t/ha/an**). Pentru o rezervă mai mare, varianta **{{alternatives[0].label}} ({{alternatives[0].rotation}})** obține **{{alternatives[0].badYears}}** ani proști, o diferență de venit de **{{alternatives[0].deltaNet}} $/ha** și o marjă de **+{{alternatives[0].margin.dT}} °C** (scor sol **{{alternatives[0].soilScore}}/100**). Surse de date: {{sources}}. Acesta este un instrument de planificare bazat pe scenarii, nu o garanție.
