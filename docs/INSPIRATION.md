# Inspiration & competitors: who does something similar, and what to steal

Checked 14 Nov 2026. Items marked *(from memory)* were not re-checked today; open them before quoting anything on a slide.

---

## 1. Closest competitors (climate × crop rotation × farm decisions)
Know these for the judges' "how is this different?" question.

| Tool | What it does | What to steal | How Hotar differs |
|---|---|---|---|
| **[EDF Ag Credit Risk tool](https://agcreditrisk.edf.org/)** (Environmental Defense Fund + 4 lenders) | Projects weather → crop yields → farm profit and **credit risk** to mid-century for Nebraska, Iowa, South Dakota, Alberta, Saskatchewan. A custom scenario picks county, farm size, **crop rotation** and risk level | **5-tab story flow**: Intro → Weather → Crop yield → Profit & risk → Next steps (Octa/Ionut: our page order). **Full dataset download** (a trust signal) | Built for lenders, 5 regions, county-level model farms. Ours: **any field on Earth**, live NASA data, one "margin" number, optimizer, drought replay |
| **[RotationARM](https://era.dpi.qld.gov.au/id/eprint/15651/1/1-s2.0-S0168169926003200-main.pdf)** (Queensland DPI, Australia) | Rotation risk tool on **APSIM**, backed by **22.9 million pre-run simulations** + cost/benefit across 24 sites | Pre-computing many simulations; showing how **sowing rules / cropping intensity** change risk (our levers) | 24 sites in one country, research-grade. Ours runs live for any point, in the browser |
| **[AgroApps Risk & Rate](https://agritechobservatory.review.fao.org/en/agroapps-risk-rate)** (FAO Agritech Observatory) | Cloud app: crop model under future climate scenarios + cultivation plans → yield, revenue, profitability, CO₂ | Showing **CO₂ / emissions** next to profit (Moldo: soil-carbon framing) | — |
| **[AquaPlan](https://www.manchester.ac.uk/discover/news/manchester-scientists-launch-new-interactive-tool-for-agricultural-water-management-and-climate-risk-assessment/)** (Univ. of Manchester) | Interactive tool: yields and **water demand** under management practices × climate scenarios | The **water availability** angle (our irrigation lever) | — |
| **[AgroClimate](https://prod-01-alb-toolkit-climate.woc.noaa.gov/tool/agroclimate%E2%80%94tools-managing-climate-risk-agriculture)** (US Southeast; NOAA Climate Toolkit) | Crop models + historic, current and forecast climate to compare probable outcomes | "Compare probable outcomes" framing | Seasonal forecasts, not long-term adaptation |
| **[CropClimate](https://news.unl.edu/newsrooms/unltoday/article/tool-uses-climate-forecasts-crop-models-to-supply-data-to-farmers)** (Univ. of Nebraska) | Free tool: pre-planting decisions (land allocation, variety, planting date) from seasonal forecasts | Variety and planting-date levers | — |
| **[Agroclimate Future Explorer](https://geopard.tech/agroclimate-explorer/)** (GeoPard) | Explore future agro-climate for a location | Check its UI before the pitch | — |
| **[Caribbean Farm Planning Tool](https://caribbeanclimatehub.org/farm-planning-tool/)** | Climate-informed farm planning for small farmers | Simple, low-literacy-friendly wording (Luca: copy) | — |
| **[CalClimateAg tool](https://calclimateag.org/online-tool-helps-farmers-reduce-climate-related-risks/)** | Online tool to reduce climate-related farm risks | — | — |

**Pitch line from this:** *"Tools like EDF's and RotationARM prove farmers and lenders want rotation-level climate risk, but they
cover a handful of regions. Hotar does it for any field on Earth, with NASA data, in the browser, and boils it down to one number."*

**Cautionary tale:** **ClimateAi** wound down in 2025, two years after **Gro Intelligence** shut down
([AgFunderNews](https://agfundernews.com/climate-resilience-platform-climateai-winds-down-operations)). Lesson: insight alone
doesn't keep a product alive; it has to drive a decision a farmer actually makes. Our printable plan + "make this my rotation" answer that.

---

## 2. Best data utilisation
| Platform | Data story | What to steal |
|---|---|---|
| **[OneSoil](https://onesoil.ai/about)**: [map of 60M fields](https://medium.com/onesoil/60-million-fields-and-27-crops-how-we-made-the-onesoil-map-61fe5f3bbb00) | Free app used by 300K+ farmers; AI field boundaries + crop type from satellites; map rendered with [Mapbox for 65M fields](https://www.casestudies.com/company/mapbox/case-study/onesoil-customer-case-study). Won **Bronze, Information is Beautiful Awards 2019** (Maps, Places & Spaces) + Product Hunt Golden Kitty 2018 | **Best design + data combo in ag.** Free-first; the map *is* the product. (Octa: map polish; idea: click a field → its boundary) |
| **[EOSDA Crop Monitoring](https://eos.com/ndvi/)** | Vegetation, productivity, soil moisture, rain, temperature history per field; **typical NDVI ranges for 20 crops** | Show NDVI against a "normal for this crop" band (Octa/Ionut: replay NDVI chart) |
| **[GEOGLAM Crop Monitor / NASA Harvest](https://nasaharvest.org/news/a-hrefhttpsnasaharvestorgnewsgeoglam-crop-monitor-develops-special-reports-providing-rapid-access-crop-conditiongeoglam-crop-monitor-provides-rapid-access-to-crop-condition-informationa)** | Monthly consensus crop conditions for 93 % of global farmland; [CMET dashboard](https://spac.umd.edu/news/story/umds-nasa-harvest-team-releases-new-open-access-agricultural-monitoring-tool) shows EO data from planting to today; [AGMET indicators](https://www.nasaharvest.org/news/a-hrefhttpsnasaharvestorgindexphpnewsnasa-harvest-geoglam-releases-new-agrometeorological-earth-observations-indicators-toolnew-agrometeorological-earth-observations-indicators-toola) | **NASA-affiliated**: cite it as the "global" counterpart of our field view. Their "season so far vs normal" charts = our replay |
| **OpenET** ([NASA slides](https://disasters.nasa.gov/sites/default/files/2021-08/AppsWeek2021_Day3_PlenarySession_Agriculture.pdf)) | Field-scale evapotranspiration from satellites; farmers use it to plan irrigation | Possible extra data layer (stretch): validate our modelled water use (Albert/Luca) |
| **[Probable Futures](https://www.woodwellclimate.org/probable-futures-climate-education-initiative/)** (Woodwell Climate) | Climate-model maps at **1.5 / 2 / 2.5 / 3 °C of warming**; heat, precipitation, dryness; [praised for simplicity](https://flowingdata.com/2021/10/28/mapping-the-probable-heat-around-the-world): click a grid cell for values, camera button to save the view, built-in quick tour | **Warming-level framing** ("at +2 °C…") is exactly our slider; copy the **quick tour** + **"save this view"** button (Octa: farmer plan / share) |
| **[Regrow Ag](https://regrow.ag/platform)** | Measure/report/reduce on-farm emissions; *PlanAI* forecasts multi-year regenerative strategies; big food-company customers | Multi-year **regenerative** framing → our soil-health score. Shows who would pay (supply chains) |
| **Terion (Indigo Ag + CIBO)** ([Indigo](https://www.indigoag.com/anheuser-busch)) | Neutral data infrastructure for digital ag + carbon markets | Roadmap slide: carbon-credit estimate from soil carbon gain |
| **Climate FieldView** (Bayer) *(from memory)* | The dominant US field-data platform (machine + satellite data) | Shows how farmers expect a field dashboard to look |

---

## 3. Best design / award winners (look and feel)
| Site | Award | Why look | For |
|---|---|---|---|
| **[Pioneer: Corn Revolutionized](https://awwwards.com/sites/pioneer-corn-revolutionized)** by Resn × Bader Rutter | **Awwwards Site of the Year** ([LBB](https://lbbonline.com/news/resn-and-bader-rutter-win-awwwards-site-of-the-year-for-pioneer-corn-revolutionized)); SOTD score 8.18 | **Agriculture won the best website of the year.** Cinematic scroll storytelling about corn genetics | Octa (video pacing), Ionut (motion), Luca (story arc) |
| **[2°C Earth](https://www.awwwards.com/sites/2degc-earth)** by Jingqi Fan | **Awwwards Site of the Month, Sept 2020** ([link](https://awwwards.com/2degc-earth-by-jingqi-fanwins-site-of-the-month-september-2020.html)) | Five places threatened by +2 °C, told visually | Video + deck: "+2 °C" made tangible |
| **[ashMeteo](https://meteo.ashwyn.studio)** | **CSS Winner Site of the Day** + CSS Design Awards kudos (UI, UX, Innovation); Awwwards nominee ([Three.js forum](https://discourse.threejs.org/t/ashmeteo-simply-3d-meteo-history/91650)) | 30 years of ERA5 weather for any place as a 3D landscape; **a single ~168 KB file**; location search via OpenStreetMap | **Closest design cousin**: "any place on Earth + decades of weather". Idea: a 3D "25 seasons" strip for the video intro (Ionut, stretch) |
| **[Cellular Agriculture Society](https://www.awwwards.com/sites/cellular-agriculture-society)** | Awwwards SOTD, 30 Mar 2020 | **3-colour palette**, calm science-org look | Ionut: restraint in the palette |
| **[Rain Forest Food](https://immersive-g.com/projects/rain-forest-food)** by Immersive Garden | Immersive Garden case study | Organic, immersive food-from-nature storytelling | Video mood |
| **[Agropole](https://awwwards.com/sites/agropole)**, **[RF Agriculture](https://www.awwwards.com/sites/rfagriculture)**, **[Alpine Bio](https://www.awwwards.com/sites/alpine-bio)**, **[Diesel Farm](https://awwwards.com/sites/diesel-farm)** | Awwwards-listed ag sites | Mood board for an agriculture brand that isn't "green clip-art" | Ionut (brand) |
| **[Our Reddening Globe](https://www.informationisbeautifulawards.com/showcase/5974-our-reddening-globe-visualize-climate-change-data-with-a-3d-globe)** | Information is Beautiful showcase | 3D globe of warming data | Video opener idea |
| **Windy.com** and **earth.nullschool.net** *(from memory)* | Widely praised weather visualisations | Smooth, instant layer switching; time scrubbing | Octa: replay scrubber feel |
| **NASA Worldview / Eyes on the Earth** *(from memory)* | NASA's own data viewers | Using NASA GIBS layers credibly | Octa: map overlay |

---

## 4. Concrete takeaways, by person
- **Octa (frontend + video):**
  - EDF's tab order as our page flow.
  - Probable Futures' quick tour + "save this view".
  - Windy-style scrubber for the replay.
  - Pioneer-style pacing for the video.
- **Ionut (design + charts):**
  - 3-colour restraint (Cellular Agriculture Society).
  - OneSoil's clean map styling.
  - EOSDA's "normal range" band on the NDVI chart.
  - Optional ashMeteo-like 3D strip.
- **Luca (story + deck):**
  - Competitor slide: EDF / RotationARM / FAO tools → "few regions, research-grade" vs Hotar "any field, one number".
  - The 2°C Earth tone for the video.
- **Moldo (agronomy):**
  - Read RotationARM's paper for which sowing rules and intensity changes matter.
  - Regrow's "regenerative strategy" language.
- **Albert (lead + engine):**
  - The ClimateAi/Gro lesson for Q&A ("it ends in a decision").
  - OpenET as a future validation layer.
  - EDF's dataset download as a trust feature.

## 5. Still worth checking (not done yet)
- The Awwwards Site of the Day archive filtered by "agriculture" / "data visualization" for 2025–2026 winners.
- Past **Space Apps global winners in agriculture** (2024–2025), so we don't look like a repeat:
  [2025 winners](https://www.spaceappschallenge.org/2025/meet-the-2025-global-winners/).
- The other 2026 Field Shift teams' public repos (e.g. [FarmStack](https://github.com/anirban-islam/farmstack),
  [EARTH.exe](https://github.com/rzprince/NASA-SPACE-APPS-Challenge-2026)): they pitch "recommend a rotation / resilience score".
  Our "Adaptation Margin + stress test" angle is different. Make that explicit in the pitch.
