// Client-side explanation (template fallback) + the registry that maps numbers in a text back to fact-sheet fields (C10).
// Rule: only numbers that exist in the fact sheet are written here. The engine computes; the text only restates.
import type { FactSheet } from "@/lib/engine/types";

export type Lang = "en" | "ro";

export const DISCLAIMER: Record<Lang, string> = {
  en: "Planning aid, not a guarantee.",
  ro: "Ajutor de planificare, nu o garanție.",
};

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const money = (v: number) => `$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const signedMoney = (v: number) => `${v < 0 ? "−" : "+"}${money(v)}`;
const years = (s: string) => Number(s.split("/")[1]) || 0;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildTemplate(f: FactSheet, lang: Lang): string {
  const en = lang === "en";
  const out: string[] = [];

  // 1. What the margin means
  const m = f.margin;
  if (m.status === "already_over") {
    out.push(en
      ? `${cap(f.rotation)} on ${f.farm.name} already breaks your risk rule today: ${f.today.badYears} years ended with ${f.rule.badYear.replace("net <", "net below")}, while you accept ${f.rule.tolerance}. Mean net is ${money(f.today.meanNet)}/ha. There is no climate margin left, so the plan should change before the weather does.`
      : `${cap(f.rotation)} la ${f.farm.name} depășește deja regula ta de risc: ${f.today.badYears} ani au avut net sub prag (${f.rule.badYear}), iar tu accepți ${f.rule.tolerance}. Marja netă medie este ${money(f.today.meanNet)}/ha. Nu mai există marjă climatică, deci planul trebuie schimbat înainte de vreme.`);
  } else {
    const dP = m.dP !== 0 ? (en ? ` or a ${n1(m.dP).replace("-", "−")} % rain change` : ` sau o schimbare a ploii de ${n1(m.dP).replace("-", "−")} %`) : "";
    out.push(en
      ? `${cap(f.rotation)} on ${f.farm.name} can absorb about +${n1(m.dT)} °C of warming${dP} before bad years pass your rule (${f.rule.tolerance}). Today ${f.today.badYears} years are bad and mean net is ${money(f.today.meanNet)}/ha. On the moderate scenario it stays inside the rule until ${m.safeUntil.ssp245}.`
      : `${cap(f.rotation)} la ${f.farm.name} poate absorbi circa +${n1(m.dT)} °C încălzire${dP} înainte ca anii răi să depășească regula ta (${f.rule.tolerance}). Azi ${f.today.badYears} ani sunt răi, iar marja netă medie este ${money(f.today.meanNet)}/ha. În scenariul moderat rămâne în regulă până în ${m.safeUntil.ssp245}.`);
  }

  // 2. Why the worst year was bad
  if (f.worstYearWhy.length) {
    out.push(en
      ? `The worst year was ${f.today.worstYear}. Why: ${f.worstYearWhy.join("; ")}.`
      : `Cel mai slab an a fost ${f.today.worstYear}. De ce: ${f.worstYearWhy.join("; ")}.`);
  } else {
    out.push(en ? `The worst year was ${f.today.worstYear}.` : `Cel mai slab an a fost ${f.today.worstYear}.`);
  }

  // 3. Two or three concrete steps
  const alts = f.alternatives.slice(0, 3);
  if (alts.length) {
    const steps = alts.map((a, i) => {
      const gap = a.missingEquipment.length
        ? (en ? ` (needs: ${a.missingEquipment.join(", ")})` : ` (necesită: ${a.missingEquipment.join(", ")})`)
        : a.fitsBudget ? "" : (en ? " (over budget)" : " (peste buget)");
      return en
        ? `${i + 1}. ${a.label}: switch to ${a.rotation}. Bad years ${a.badYears}, mean net ${signedMoney(a.deltaNet)}/ha vs today, margin +${n1(a.margin.dT)} °C, soil score ${a.soilScore}${gap}.`
        : `${i + 1}. ${a.label}: treci la ${a.rotation}. Ani răi ${a.badYears}, marjă netă medie ${signedMoney(a.deltaNet)}/ha față de azi, marjă +${n1(a.margin.dT)} °C, scor sol ${a.soilScore}${gap}.`;
    });
    out.push((en ? "What you can do:\n" : "Ce poți face:\n") + steps.join("\n"));
  }

  out.push(DISCLAIMER[lang]);
  return out.join("\n\n");
}

// ---------- number registry ----------
export interface NumberRef { field: string; value: string; explain: Record<Lang, string> }

/** Maps every number we know to the fact-sheet field it comes from, with a plain-language "where from". */
export function numberRegistry(f: FactSheet): { needle: string; ref: NumberRef }[] {
  const out: { needle: string; ref: NumberRef }[] = [];
  const seen = new Set<string>();
  const add = (needle: string, field: string, en: string, ro: string) => {
    if (needle.length < 2 || !/\d/.test(needle) || seen.has(needle)) return;
    seen.add(needle);
    out.push({ needle, ref: { field, value: needle, explain: { en, ro } } });
  };
  const num = (v: number, field: string, en: string, ro: string) => {
    const a = Math.abs(v);
    const forms = [n1(a), String(Math.round(a)), Math.round(a).toLocaleString("en-US"), a.toFixed(2)];
    forms.forEach((s) => add(s, field, en, ro));
  };
  const nYears = years(f.today.badYears);
  const w = nYears ? `${nYears} years of NASA POWER weather` : "NASA POWER weather";
  const wr = nYears ? `${nYears} ani de vreme NASA POWER` : "vremea NASA POWER";

  add(f.today.badYears, "today.badYears", `Years below your risk threshold, simulated on ${w}.`, `Anii sub pragul tău de risc, simulați pe ${wr}.`);
  num(f.today.meanNet, "today.meanNet", `Mean net margin per hectare over ${w}.`, `Marja netă medie pe hectar, pe ${wr}.`);
  num(f.today.worstYear, "today.worstYear", `The year with the lowest simulated net in ${w}.`, `Anul cu cea mai mică marjă netă simulată în ${wr}.`);
  num(f.margin.dT, "margin.dT", "Warming (°C) the rotation absorbs before bad years pass your rule, found by the stress search.", "Încălzirea (°C) pe care o absoarbe rotația înainte ca anii răi să depășească regula, găsită prin căutarea de stres.");
  num(f.margin.dP, "margin.dP", "Rain change (%) the rotation absorbs before bad years pass your rule.", "Schimbarea ploii (%) pe care o absoarbe rotația înainte ca anii răi să depășească regula.");
  add(f.margin.safeUntil.ssp245, "margin.safeUntil.ssp245", "Year the margin is used up on the moderate climate scenario (SSP2-4.5, NEX-GDDP-CMIP6).", "Anul în care marja se consumă în scenariul climatic moderat (SSP2-4.5, NEX-GDDP-CMIP6).");
  add(f.margin.safeUntil.ssp585, "margin.safeUntil.ssp585", "Year the margin is used up on the hot climate scenario (SSP5-8.5, NEX-GDDP-CMIP6).", "Anul în care marja se consumă în scenariul climatic cald (SSP5-8.5, NEX-GDDP-CMIP6).");
  f.alternatives.forEach((a, i) => {
    add(a.badYears, `alternatives[${i}].badYears`, `Bad years for "${a.label}", simulated on the same weather years.`, `Ani răi pentru „${a.label}”, simulați pe aceiași ani de vreme.`);
    num(a.deltaNet, `alternatives[${i}].deltaNet`, `Change in mean net per hectare for "${a.label}" versus the current rotation.`, `Schimbarea marjei nete medii pe hectar pentru „${a.label}” față de rotația actuală.`);
    num(a.margin.dT, `alternatives[${i}].margin.dT`, `Warming margin (°C) of "${a.label}".`, `Marja de încălzire (°C) pentru „${a.label}”.`);
    num(a.soilScore, `alternatives[${i}].soilScore`, `Soil score (0–100) of "${a.label}" from the soil model (SoilGrids inputs).`, `Scor sol (0–100) pentru „${a.label}” din modelul de sol (date SoilGrids).`);
  });
  num(f.soil.score, "soil.score", "Soil score (0–100) of the current rotation, from the soil model (SoilGrids inputs).", "Scorul de sol (0–100) al rotației actuale, din modelul de sol (date SoilGrids).");
  num(f.soil.carbonTrendPctYr, "soil.carbonTrendPctYr", "Soil carbon trend, % per year.", "Tendința carbonului din sol, % pe an.");
  num(f.soil.erosionTHaYr, "soil.erosionTHaYr", "Estimated erosion, tonnes per hectare per year.", "Eroziune estimată, tone pe hectar pe an.");
  if (f.market) {
    num(f.market.pricePct, "market.pricePct", "Crop price shock (%) used in the market stress test.", "Șocul de preț (%) folosit în testul de stres de piață.");
    add(f.market.badYearsUnderShock, "market.badYearsUnderShock", "Bad years when the price shock is applied.", "Ani răi când se aplică șocul de preț.");
  }
  if (f.quant) {
    num(f.quant.pBadYear2035, "quant.pBadYear2035", `Probability of a bad year in 2035 across ${f.quant.paths} simulated paths (scenario probability, not a forecast).`, `Probabilitatea unui an rău în 2035 pe ${f.quant.paths} traiectorii simulate (probabilitate de scenariu, nu prognoză).`);
    num(f.quant.cvar95, "quant.cvar95", "Average loss in the worst 5 % of simulated outcomes.", "Pierderea medie în cele mai rele 5 % dintre rezultatele simulate.");
    num(f.quant.pRuin, "quant.pRuin", "Probability of running out of cash reserve in the simulation.", "Probabilitatea de a epuiza rezerva de numerar în simulare.");
    if (f.quant.marginYearP50 != null) num(f.quant.marginYearP50, "quant.marginYearP50", "Median year the margin is used up across simulated paths.", "Anul median în care marja se consumă pe traiectoriile simulate.");
  }
  // longest needles first so "8/24" wins over "24"
  return out.sort((a, b) => b.needle.length - a.needle.length);
}

export type Segment = { text: string; ref?: NumberRef };

/** Splits a text into plain and highlighted (known-number) segments. */
export function segmentText(text: string, reg: { needle: string; ref: NumberRef }[]): Segment[] {
  const hits: { s: number; e: number; ref: NumberRef }[] = [];
  for (const { needle, ref } of reg) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(needle, from);
      if (i < 0) break;
      from = i + needle.length;
      const before = text[i - 1] ?? "", after = text[i + needle.length] ?? "", after2 = text[i + needle.length + 1] ?? "";
      if (/[\d.,/]/.test(before)) continue;
      if (/\d/.test(after) || (/[.,]/.test(after) && /\d/.test(after2)) || after === "/") continue;
      if (hits.some((h) => i < h.e && i + needle.length > h.s)) continue;
      hits.push({ s: i, e: i + needle.length, ref: { ...ref, value: needle } });
    }
  }
  hits.sort((a, b) => a.s - b.s);
  const segs: Segment[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.s > pos) segs.push({ text: text.slice(pos, h.s) });
    segs.push({ text: text.slice(h.s, h.e), ref: h.ref });
    pos = h.e;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) });
  return segs;
}
