// Shared vocabulary + farmer glossary. RO is the primary language; keep wording plain (a farmer, not a scientist).
export const common = {
  en: {
    appName: "FieldShift",
    language: "Language",
    next: "Next", back: "Back", skip: "Skip", done: "Done", close: "Close", cancel: "Cancel", save: "Save",
    loading: "Loading…", retry: "Try again", learnMore: "Learn more", source: "Source", illustrative: "Illustrative",
    beta: "Beta", today: "Today", year: "Year", years: "years", perHa: "per hectare",
    badYear: "bad year", badYears: "bad years",
    badYearsOutOf: "{n} bad years out of {total}",
    adaptationMargin: "Adaptation margin",
    marginShort: "How much more heat and drought your crops can take before bad years become too frequent.",
    planningAid: "Planning aid, not a guarantee.",
    approxFx: "Currency converted at approximate rates.",
    hotter: "Hotter", drier: "Less rain",
    risk_safe: "Safe", risk_tight: "Tight", risk_over: "Over the limit",
  },
  ro: {
    appName: "FieldShift",
    language: "Limbă",
    next: "Înainte", back: "Înapoi", skip: "Sari peste", done: "Gata", close: "Închide", cancel: "Renunță", save: "Salvează",
    loading: "Se încarcă…", retry: "Încearcă din nou", learnMore: "Află mai mult", source: "Sursă", illustrative: "Ilustrativ",
    beta: "Beta", today: "Azi", year: "An", years: "ani", perHa: "la hectar",
    badYear: "an prost", badYears: "ani proști",
    badYearsOutOf: "{n} ani proști din {total}",
    adaptationMargin: "Marja de adaptare",
    marginShort: "Câtă căldură și secetă în plus pot duce culturile tale până când anii proști devin prea deși.",
    planningAid: "Ajutor de planificare, nu o garanție.",
    approxFx: "Valută convertită la un curs aproximativ.",
    hotter: "Mai cald", drier: "Mai puțină ploaie",
    risk_safe: "În siguranță", risk_tight: "La limită", risk_over: "Peste limită",
  },
};

export const crops = {
  en: {
    maize: "Maize", soybean: "Soybean", wheat: "Winter wheat", barley: "Barley", sorghum: "Sorghum",
    sunflower: "Sunflower", pea: "Pea", millet: "Millet", fallow: "Fallow", rapeseed: "Rapeseed", rye: "Rye cover crop",
  },
  ro: {
    maize: "Porumb", soybean: "Soia", wheat: "Grâu de toamnă", barley: "Orz", sorghum: "Sorg",
    sunflower: "Floarea-soarelui", pea: "Mazăre", millet: "Mei", fallow: "Ogor (pârloagă)", rapeseed: "Rapiță", rye: "Secară (cultură de acoperire)",
  },
};

export const units = {
  en: { ha: "ha", tPerHa: "t/ha", mm: "mm", celsius: "°C", days: "days", perYear: "per year" },
  ro: { ha: "ha", tPerHa: "t/ha", mm: "mm", celsius: "°C", days: "zile", perYear: "pe an" },
};

/** Short, plain explanations shown in "?" tooltips. */
export const glossary = {
  en: {
    ndvi: "NDVI: how green and dense the crop is, measured from satellites (0 = bare soil, 0.8+ = lush).",
    soilWater: "Plant-available water: how much rain the soil can hold for the roots.",
    heatDays: "Heat days: days above 35 °C. Around flowering they cut yields hard.",
    rotation: "Rotation: the order of crops on a field over the years.",
    cmip6: "Climate projections from NASA NEX-GDDP-CMIP6: many climate models, downscaled to ~25 km.",
    var95: "Bad-case income: in 1 year out of 20 you would earn less than this.",
    ruin: "Risk of running out of cash reserve over the period.",
  },
  ro: {
    ndvi: "NDVI: cât de verde și deasă e cultura, măsurat din satelit (0 = sol gol, peste 0,8 = foarte bogată).",
    soilWater: "Apa utilă din sol: câtă apă din ploaie poate ține solul pentru rădăcini.",
    heatDays: "Zile caniculare: zile cu peste 35 °C. În perioada înfloririi scad mult recolta.",
    rotation: "Rotația: ordinea culturilor pe o parcelă, de la an la an.",
    cmip6: "Proiecții climatice NASA NEX-GDDP-CMIP6: multe modele climatice, la rezoluție de ~25 km.",
    var95: "Venit în anul rău: într-un an din 20 ai câștiga mai puțin de atât.",
    ruin: "Riscul de a rămâne fără rezerva de bani în perioada analizată.",
  },
};
