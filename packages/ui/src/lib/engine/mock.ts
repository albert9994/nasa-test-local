// MOCK ENGINE (TypeScript). Same API as the Rust engine (C3), so the UI can be built before WASM lands.
// It runs on the real NASA POWER weather in the pack with a deliberately simple model:
// one soil bucket, Hargreaves–Samani ET0, stage yield response, heat at flowering + extreme degree-days.
// Numbers are plausible, not validated. Albert's Rust engine (A7/A8) replaces this: see lib/engine/index.ts.
import type {
  Constraints, CropId, Engine, FactSheet, FarmHandle, FarmPack, FrontierResult, MarginResult,
  MarginYearResult, Opts, PickResult, QuantParams, QuantResult, RankedRotation, Rotation, RotationResult,
  ReasonCode, ScenarioPoint, SeasonResult, Weights,
} from "./types";

interface CropParams {
  name: string; sow: number; len: number; flower: [number, number];
  yPot: number; price: number; cost: number; heatT: number; ky: number;
  kc: [number, number, number]; legume?: boolean; equipment?: string;
}
export const CROPS: Record<CropId, CropParams> = {
  maize:     { name: "Maize",        sow: 120, len: 150, flower: [0.45, 0.62], yPot: 11.5, price: 190, cost: 950, heatT: 35, ky: 1.25, kc: [0.4, 1.2, 0.6], equipment: "corn_header" },
  soybean:   { name: "Soybean",      sow: 135, len: 130, flower: [0.45, 0.65], yPot: 3.7,  price: 420, cost: 620, heatT: 35, ky: 0.85, kc: [0.4, 1.15, 0.5], legume: true },
  wheat:     { name: "Winter wheat", sow: -80, len: 265, flower: [0.72, 0.82], yPot: 6.5,  price: 230, cost: 700, heatT: 32, ky: 1.05, kc: [0.4, 1.15, 0.4], equipment: "grain_drill" },
  barley:    { name: "Barley",       sow: -75, len: 250, flower: [0.72, 0.82], yPot: 5.6,  price: 200, cost: 600, heatT: 31, ky: 1.0,  kc: [0.4, 1.15, 0.3], equipment: "grain_drill" },
  sorghum:   { name: "Sorghum",      sow: 140, len: 130, flower: [0.45, 0.62], yPot: 6.5,  price: 175, cost: 580, heatT: 38, ky: 0.9,  kc: [0.4, 1.0, 0.55] },
  sunflower: { name: "Sunflower",    sow: 110, len: 130, flower: [0.45, 0.62], yPot: 2.7,  price: 430, cost: 540, heatT: 36, ky: 0.95, kc: [0.35, 1.05, 0.35], equipment: "sunflower_header" },
  pea:       { name: "Pea",          sow: 85,  len: 100, flower: [0.45, 0.62], yPot: 3.3,  price: 300, cost: 500, heatT: 30, ky: 1.15, kc: [0.5, 1.15, 0.3], legume: true, equipment: "grain_drill" },
  millet:    { name: "Millet",       sow: 150, len: 100, flower: [0.45, 0.62], yPot: 2.6,  price: 260, cost: 340, heatT: 39, ky: 0.8,  kc: [0.3, 1.0, 0.3] },
  fallow:    { name: "Fallow",       sow: 0,   len: 0,   flower: [0, 0],       yPot: 0,    price: 0,   cost: 60,  heatT: 99, ky: 0,    kc: [0, 0, 0] },
};
export const cropName = (c: CropId) => CROPS[c]?.name ?? c;
export const rotationLabel = (r: Rotation) =>
  r.map((s) => cropName(s.crop).toLowerCase() + (s.cover ? " + rye" : "")).join(" → ");

interface Farm { pack: FarmPack; years: number[]; taw: number; soilName: string; climate: string }
const farms = new Map<FarmHandle, Farm>();

function soilTexture(pack: FarmPack): { taw: number; name: string } {
  const g = (p: "sand" | "clay") => {
    const s = pack.soil?.[p]; if (!s) return null;
    const vals = Object.values(s).map((v) => v?.mean).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b) / vals.length : null;
  };
  const sand = g("sand"), clay = g("clay");
  if (sand == null || clay == null) return { taw: 170, name: "loam (default)" };
  const name = clay > 35 ? "clay loam" : sand > 55 ? "sandy loam" : clay > 27 ? "silty clay loam" : "loam";
  // plant-available water over ~1.2 m root zone, mm
  const taw = Math.max(90, Math.min(230, 200 - (sand - 30) * 1.6 + (clay > 40 ? -15 : 0)));
  return { taw, name };
}

const DAY = (w: FarmPack["weather"][string], d: number) => Math.min(d, w.tmax.length - 1);

function season(f: Farm, crop: CropId, year: number, opts: Opts, prev: CropId | null, prevCover: boolean, trace: boolean): SeasonResult {
  const c = CROPS[crop];
  const price = opts.prices[crop] ?? f.pack.meta.prices?.[crop] ?? c.price;
  const cost = (opts.costs[crop] ?? f.pack.meta.costs?.[crop] ?? c.cost);
  const empty = (): SeasonResult => ({
    crop, year, sow: 0, harvest: 0, yield: 0, net: -cost, matured: true, eta: 0, etp: 0, irr: 0, rain: 0, runoff: 0, drain: 0,
    stressDays: 0, heatDays: 0, factors: { water: 1, heat: 1, frost: 1, duration: 1, rotation: 1 }, trace: null,
  });
  if (crop === "fallow") return empty();

  const len = Math.round(c.len * opts.maturity);
  let sow = c.sow + opts.sowShift;
  // winter crops start in the previous calendar year
  const startYear = sow < 0 ? year - 1 : year;
  const w0 = f.pack.weather[String(startYear)] ?? f.pack.weather[String(year)];
  const w1 = f.pack.weather[String(year)];
  if (!w0 || !w1) return empty();
  if (sow < 0) sow = w0.tmax.length + sow;

  const get = (i: number) => {
    // i = day index from the sowing day
    let d = sow + i, w = w0;
    if (w0 !== w1 && d >= w0.tmax.length) { d -= w0.tmax.length; w = w1; }
    d = DAY(w, d);
    return { tmax: w.tmax[d] + opts.dT, tmin: w.tmin[d] + opts.dT, prcp: Math.max(0, w.prcp[d] * (1 + opts.dP)), rad: w.rad?.[d] ?? 18 };
  };

  // starting soil water: fuller after fallow, a bit drier after a rye cover
  const cap = f.taw * (["maize", "sorghum", "sunflower", "wheat", "barley"].includes(crop) ? 1.45 : 1.15); // roots reach the subsoil store
  let s = cap * (prev === "fallow" ? 0.95 : 0.8) - (prevCover ? 10 : 0);
  let etp = 0, eta = 0, rain = 0, runoff = 0, drain = 0, stressDays = 0, heatDays = 0, edd = 0, irr = 0, frostHit = 0;
  const stageEt = [0, 0, 0, 0], stageEta = [0, 0, 0, 0];
  const tr = trace ? { idx: [] as number[], fill: [] as number[], ks: [] as number[], tmax: [] as number[], stage: [] as number[], heat: c.heatT } : null;
  for (let i = 0; i < len; i++) {
    const x = get(i), fr = i / len;
    const stage = fr < c.flower[0] ? 0 : fr < c.flower[1] ? 1 : fr < 0.85 ? 2 : 3;
    const kc = fr < 0.2 ? c.kc[0] : fr < 0.75 ? c.kc[1] : c.kc[2];
    const tmean = (x.tmax + x.tmin) / 2;
    const et0 = Math.max(0, 0.0135 * (tmean + 17.8) * (x.rad / 2.45));
    const etc = kc * et0;
    const ro = x.prcp > 25 ? (x.prcp - 25) * 0.4 : 0;
    s += x.prcp - ro; rain += x.prcp; runoff += ro;
    if (s > cap) { drain += s - cap; s = cap; }
    if (opts.irrigCap > irr && s < cap * 0.4) { const add = Math.min(25, opts.irrigCap - irr); s += add; irr += add; }
    const ks = Math.min(1, s / (cap * 0.5));
    const a = etc * ks;
    s = Math.max(0, s - a);
    etp += etc; eta += a; stageEt[stage] += etc; stageEta[stage] += a;
    if (ks < 0.6) stressDays++;
    if (x.tmax > c.heatT && stage === 1) heatDays++;
    if (x.tmax > 32) edd += x.tmax - 32;
    if (x.tmin < -2 && stage >= 1 && stage <= 2) frostHit++;
    if (tr) { tr.idx.push(i); tr.fill.push(s / cap); tr.ks.push(ks); tr.tmax.push(x.tmax); tr.stage.push(stage); }
  }
  const kyS = [0.15, 0.45, 0.3, 0.05].map((k) => k * c.ky);
  let water = 1;
  for (let st = 0; st < 4; st++) if (stageEt[st] > 0) water *= Math.max(0, 1 - kyS[st] * (1 - stageEta[st] / stageEt[st]));
  const heat = Math.max(0.3, 1 - 0.03 * heatDays) * Math.exp(-0.0015 * edd);
  const frost = Math.max(0.5, 1 - 0.05 * frostHit);
  const duration = Math.max(0.7, Math.min(1.08, 0.75 + 0.25 * opts.maturity));
  let rotation = 1;
  if (prev && CROPS[prev].legume && !c.legume) rotation *= 1.08;
  if (prev === crop) rotation *= 0.9;
  if (prev === "fallow") rotation *= 1.05;
  const calib = (f.pack.meta.calib?.[crop] ?? 1) * opts.fieldFactor;
  const y = c.yPot * water * heat * frost * duration * rotation * calib;
  const net = y * price - cost - irr * 0.5 - (prevCover ? 0 : 0);
  return {
    crop, year, sow, harvest: (sow + len) % 365, yield: +y.toFixed(2), net: Math.round(net), matured: true,
    eta: Math.round(eta), etp: Math.round(etp), irr, rain: Math.round(rain), runoff: Math.round(runoff), drain: Math.round(drain),
    stressDays, heatDays,
    factors: { water: +water.toFixed(3), heat: +heat.toFixed(3), frost: +frost.toFixed(3), duration: +duration.toFixed(3), rotation: +rotation.toFixed(3) },
    trace: tr,
  };
}

function rotation(f: Farm, rot: Rotation, opts: Opts, traceYear?: number): RotationResult {
  const n = rot.length, years = f.years.filter((y) => f.pack.weather[String(y - 1)] || CROPS[rot[0].crop].sow >= 0);
  const farmNet: number[] = [], yieldByCrop: Partial<Record<CropId, number[]>> = {};
  let waterUse = 0; let traced: SeasonResult[] | null = null;
  years.forEach((y, i) => {
    // every phase of the rotation is on some field every year (phases × years)
    let sum = 0;
    const tr: SeasonResult[] = [];
    for (let k = 0; k < n; k++) {
      const step = rot[(i + k) % n], prevStep = rot[(i + k - 1 + n) % n];
      const r = season(f, step.crop, y, opts, n > 1 ? prevStep.crop : step.crop, prevStep.cover, y === traceYear);
      sum += r.net; waterUse += r.eta;
      (yieldByCrop[step.crop] ??= []).push(r.yield);
      if (y === traceYear) tr.push(r);
    }
    farmNet.push(Math.round(sum / n));
    if (y === traceYear) traced = tr;
  });
  const fails = farmNet.filter((v) => v < opts.failNet).length;
  const meanNet = Math.round(farmNet.reduce((a, b) => a + b, 0) / Math.max(1, farmNet.length));
  const minNet = Math.min(...farmNet);
  const crops = rot.map((s) => s.crop);
  const share = (pred: (c: CropId) => boolean) => crops.filter(pred).length / n;
  const covers = rot.filter((s) => s.cover).length / n;
  const soilScore = Math.round(Math.max(5, Math.min(95,
    45 + 18 * covers + 14 * share((c) => !!CROPS[c].legume) - 14 * share((c) => c === "maize") - 8 * share((c) => c === "fallow") + 6 * (new Set(crops).size - 1))));
  const slope = f.pack.meta.slope ?? 1.5;
  const erosion = +(slope * (0.9 - 0.45 * covers + 0.6 * share((c) => c === "fallow" || c === "soybean"))).toFixed(2);
  return {
    years, farmNet, meanNet, minNet, worstYear: years[farmNet.indexOf(minNet)], pFail: fails / Math.max(1, farmNet.length), fails,
    yieldByCrop, soilScore, socChangePct: +((soilScore - 50) / 60).toFixed(2), erosion,
    waterUse: Math.round(waterUse / Math.max(1, years.length * n)), traced,
  };
}

const withShift = (o: Opts, dT: number, dP: number): Opts => ({ ...o, dT: o.dT + dT, dP: (1 + o.dP) * (1 + dP) - 1 });

function margin(f: Farm, rot: Rotation, opts: Opts): MarginResult {
  const p = (dT: number, dP: number) => rotation(f, rot, withShift(opts, dT, dP)).pFail;
  const base = p(0, 0);
  if (base > opts.failShare) return { already: true, basePFail: base, dT: 0, dTcapped: false, dP: 0, dPcapped: false };
  const bisect = (fn: (x: number) => number, hi: number) => {
    if (fn(hi) <= opts.failShare) return { v: hi, capped: true };
    let lo = 0, h = hi;
    for (let i = 0; i < 9; i++) { const m = (lo + h) / 2; if (fn(m) > opts.failShare) h = m; else lo = m; }
    return { v: lo, capped: false };
  };
  const t = bisect((x) => p(x, 0), 6), r = bisect((x) => p(0, -x), 0.7);
  return { already: false, basePFail: base, dT: +t.v.toFixed(2), dTcapped: t.capped, dP: -+r.v.toFixed(3), dPcapped: r.capped };
}

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (rnd: () => number) => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const quantile = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

export const DEFAULT_SERIES: ScenarioPoint[] = [
  { year: 2030, dT: 0.9, dP: -0.01 }, { year: 2040, dT: 1.4, dP: -0.03 }, { year: 2050, dT: 2.0, dP: -0.04 },
  { year: 2060, dT: 2.4, dP: -0.05 }, { year: 2070, dT: 2.8, dP: -0.06 }, { year: 2080, dT: 3.1, dP: -0.07 }, { year: 2090, dT: 3.4, dP: -0.08 },
];
function interpSeries(series: ScenarioPoint[], year: number): ScenarioPoint {
  const s = [{ year: 2020, dT: 0, dP: 0 }, ...series];
  for (let i = 1; i < s.length; i++) if (year <= s[i].year) {
    const a = s[i - 1], b = s[i], t = (year - a.year) / (b.year - a.year);
    return { year, dT: a.dT + t * (b.dT - a.dT), dP: a.dP + t * (b.dP - a.dP) };
  }
  return { ...s[s.length - 1], year };
}

const ROT_KEY = (r: Rotation) => r.map((s) => s.crop + (s.cover ? "+" : "")).join("-");
const canon = (r: Rotation) => { const ks = r.map((_, i) => ROT_KEY([...r.slice(i), ...r.slice(0, i)])); return ks.sort()[0]; };

let nextId = 0;
export const mockEngine: Engine = {
  kind: "mock",
  async prepareFarm(pack) {
    const id = `${pack.meta.id}#${nextId++}`;
    const years = Object.keys(pack.weather).map(Number).sort((a, b) => a - b);
    const { taw, name } = soilTexture(pack);
    const ann = years.map((y) => pack.weather[String(y)]);
    const tm = ann.flatMap((w) => w.tmax.map((t, i) => (t + w.tmin[i]) / 2));
    const pr = ann.map((w) => w.prcp.reduce((a, b) => a + b, 0));
    farms.set(id, { pack, years, taw, soilName: name,
      climate: `${(tm.reduce((a, b) => a + b, 0) / tm.length).toFixed(1)} °C, ${Math.round(pr.reduce((a, b) => a + b, 0) / pr.length)} mm/yr` });
    return id;
  },
  async simulateSeason(h, crop, year, opts, trace = false) { return season(get(h), crop, year, opts, null, false, trace); },
  async simulateRotation(h, rot, opts, traceYear) { return rotation(get(h), rot, opts, traceYear); },
  async adaptationMargin(h, rot, opts) { return margin(get(h), rot, opts); },
  async frontier(h, rot, opts): Promise<FrontierResult> {
    const f = get(h), dTs = [...Array(11)].map((_, i) => i * 0.5), dPs = [...Array(11)].map((_, i) => -i * 0.05);
    return { dTs, dPs, grid: dPs.map((dp) => dTs.map((dt) => +rotation(f, rot, withShift(opts, dt, dp)).pFail.toFixed(3))) };
  },
  async optimize(h, pool, opts, w, baseline, c: Constraints): Promise<RankedRotation[]> {
    const f = get(h), seen = new Set<string>(), cands: Rotation[] = [];
    const crops = pool.filter((x) => (c.sellable.length ? c.sellable.includes(x) || x === "fallow" : true));
    const push = (r: Rotation) => { const k = canon(r); if (!seen.has(k)) { seen.add(k); cands.push(r); } };
    for (const a of crops) for (const cov of [false, true]) {
      push([{ crop: a, cover: cov }]);
      for (const b of crops) if (b !== a) {
        push([{ crop: a, cover: cov }, { crop: b, cover: false }]);
        for (const d of crops) if (d !== b && d !== a) push([{ crop: a, cover: cov }, { crop: b, cover: false }, { crop: d, cover: false }]);
      }
    }
    const stressOpts = withShift(opts, 2, -0.2);
    const ranked = cands.slice(0, 260).map((rot) => {
      const base = rotation(f, rot, opts), stress = rotation(f, rot, stressOpts);
      const costOk = !c.maxCostPerHa || rot.every((s) => (CROPS[s.crop].cost) <= c.maxCostPerHa!);
      const equipOk = rot.every((s) => !CROPS[s.crop].equipment || c.equipment.length === 0 || c.equipment.includes(CROPS[s.crop].equipment as never));
      const parts = {
        profit: Math.max(0, Math.min(100, 50 + base.meanNet / 8)),
        stability: Math.max(0, 100 - 250 * stress.pFail),
        soil: base.soilScore,
        water: Math.max(0, 100 - base.waterUse / 6),
      };
      const W = w.profit + w.stability + w.soil + w.water || 1;
      const score = Math.round((parts.profit * w.profit + parts.stability * w.stability + parts.soil * w.soil + parts.water * w.water) / W);
      return { rot, base, stress, score, parts, viable: costOk && equipOk && base.meanNet > -50 && !rot.every((s) => s.crop === "fallow") };
    });
    void baseline;
    return ranked.sort((a, b) => b.score - a.score);
  },
  async pickThree(ranked, baseline): Promise<PickResult[]> {
    const ok = ranked.filter((r) => r.viable && canon(r.rot) !== canon(baseline));
    const used = new Set<string>();
    const take = (sorted: RankedRotation[], label: PickResult["label"], why: string): PickResult | null => {
      const r = sorted.find((x) => !used.has(canon(x.rot))); if (!r) return null; used.add(canon(r.rot));
      return { rot: r.rot, label, why, base: r.base, stress: r.stress };
    };
    return [
      take(ok, "Best balance", "Highest overall score for your priorities"),
      take([...ok].sort((a, b) => a.stress.pFail - b.stress.pFail || b.stress.meanNet - a.stress.meanNet), "Drought shield", "Fewest bad years at +2 °C and 20 % less rain"),
      take([...ok].sort((a, b) => b.base.soilScore - a.base.soilScore || b.base.meanNet - a.base.meanNet), "Soil builder", "Builds soil carbon and cuts erosion"),
    ].filter((p): p is PickResult => !!p);
  },
  async marginYear(h, rot, opts, series): Promise<MarginYearResult> {
    const m = margin(get(h), rot, opts);
    const s = series.length ? series : DEFAULT_SERIES;
    if (m.already) return { year: "now", path: s };
    for (let y = 2026; y <= 2090; y++) if (interpSeries(s, y).dT >= m.dT) return { year: y, path: s };
    return { year: null, path: s };
  },
  async marketShock(h, rot, opts, { pricePct, inputPct }) {
    const f = get(h), prices: Opts["prices"] = {}, costs: Opts["costs"] = {};
    for (const s of rot) {
      prices[s.crop] = (opts.prices[s.crop] ?? f.pack.meta.prices?.[s.crop] ?? CROPS[s.crop].price) * (1 + pricePct / 100);
      costs[s.crop] = (opts.costs[s.crop] ?? f.pack.meta.costs?.[s.crop] ?? CROPS[s.crop].cost) * (1 + inputPct / 100);
    }
    return rotation(f, rot, { ...opts, prices, costs });
  },
  async quantSimulate(h, rots, opts, p: QuantParams): Promise<QuantResult[]> {
    const f = get(h), series = f.pack.scenarios?.[p.ssp]?.series ?? DEFAULT_SERIES;
    const years = [...Array(p.toYear - p.fromYear + 1)].map((_, i) => p.fromYear + i);
    return rots.map((rot) => {
      // pre-compute the rotation at a few warming levels, then sample real seasons (bootstrap) along the trajectory
      const levels = [0, 1, 2, 3].map((dt) => rotation(f, rot, withShift(opts, dt, -0.02 * dt)).farmNet);
      const rnd = mulberry32(p.seed);
      const paths: number[][] = [];
      for (let k = 0; k < p.paths; k++) {
        let logP = 0; const spread = 0.6 + 0.8 * rnd(); const path: number[] = [];
        for (const y of years) {
          const dT = interpSeries(series, y).dT * spread, lv = Math.min(2.999, dT);
          const lo = Math.floor(lv), t = lv - lo;
          const j = Math.floor(rnd() * levels[0].length);
          const net = levels[lo][j] * (1 - t) + levels[lo + 1][j] * t;
          logP = logP * 0.55 + 0.24 * gauss(rnd);
          const revenueShare = 1.6;
          path.push(Math.round(net + (Math.exp(logP) - 1) * Math.abs(net + 700) * revenueShare * 0.35));
        }
        paths.push(path);
      }
      const col = (i: number) => paths.map((pp) => pp[i]);
      const all = paths.flat();
      const var95 = quantile(all, 0.05);
      const tail = all.filter((v) => v <= var95);
      const mean = all.reduce((a, b) => a + b, 0) / all.length;
      const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length);
      const pBad = years.map((_, i) => col(i).filter((v) => v < opts.failNet).length / p.paths);
      const ruin = paths.filter((pp) => { let cash = p.cashReserve; for (const v of pp) { cash += Math.min(0, v); if (cash < 0) return true; } return false; }).length / p.paths;
      const my = paths.map((pp) => { for (let i = 0; i < years.length - 4; i++) if (pp.slice(i, i + 5).filter((v) => v < opts.failNet).length >= 2) return years[i]; return null; });
      const myN = my.filter((v): v is number => v != null);
      const q = (qq: number) => (myN.length / my.length > qq ? quantile(myN, qq / (myN.length / my.length)) : null);
      return {
        rotation: rot, years,
        income: { p10: years.map((_, i) => quantile(col(i), 0.1)), p50: years.map((_, i) => quantile(col(i), 0.5)), p90: years.map((_, i) => quantile(col(i), 0.9)) },
        pBadYear: pBad, var95: Math.round(var95), cvar95: Math.round(tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length)),
        pRuin: +ruin.toFixed(3), maxDrawdownP50: 0,
        marginYear: { p10: q(0.1), p50: q(0.5), p90: q(0.9) },
        meanAnnual: Math.round(mean), sdAnnual: Math.round(sd), riskAdjusted: +(mean / (sd || 1)).toFixed(2),
      };
    });
  },
  async factSheet(h, rot, opts, picks): Promise<FactSheet> {
    const f = get(h), base = rotation(f, rot, opts), m = margin(f, rot, opts);
    const worst = base.worstYear;
    const wr = rotation(f, rot, opts, worst).traced ?? [];
    const why: string[] = [];
    const codes: ReasonCode[] = [];
    for (const s of wr) {
      if (s.factors.water < 0.75) {
        why.push(`${cropName(s.crop).toLowerCase()}: drought (${s.stressDays} stress days)`);
        codes.push({ code: "drought", crop: s.crop, stressDays: s.stressDays });
      }
      if (s.heatDays > 0) {
        why.push(`${cropName(s.crop).toLowerCase()}: ${s.heatDays} days above ${CROPS[s.crop].heatT} °C at flowering`);
        codes.push({ code: "heat_flowering", crop: s.crop, days: s.heatDays });
      }
    }
    const series = f.pack.scenarios?.ssp245?.series ?? DEFAULT_SERIES;
    const my = await mockEngine.marginYear(h, rot, opts, series);
    const n = base.years.length;
    return {
      farm: { name: f.pack.meta.name, lat: f.pack.meta.lat, lon: f.pack.meta.lon, soil: f.soilName, climate: f.climate },
      rotation: rotationLabel(rot),
      rule: { badYear: `net < ${opts.failNet} $/ha`, tolerance: `1 year in ${Math.round(1 / opts.failShare)}` },
      today: { badYears: `${base.fails}/${n}`, meanNet: base.meanNet, worstYear: worst },
      margin: { dT: m.dT, dP: m.dP, status: m.already ? "already_over" : m.dT < 1 ? "tight" : "safe",
        safeUntil: { ssp245: String(my.year ?? "after 2090"), ssp585: String(my.year ?? "after 2090") } },
      worstYearWhy: why.slice(0, 3),
      worstYearWhyCodes: codes.slice(0, 3),
      alternatives: picks.map((p) => ({
        label: p.label, rotation: rotationLabel(p.rot), badYears: `${p.base.fails}/${n}`, deltaNet: p.base.meanNet - base.meanNet,
        margin: { dT: margin(f, p.rot, opts).dT }, soilScore: p.base.soilScore, fitsBudget: true, missingEquipment: [],
      })),
      soil: { score: base.soilScore, carbonTrendPctYr: base.socChangePct, erosionTHaYr: base.erosion },
      sources: ["NASA POWER", "SoilGrids", "MODIS NDVI", "NEX-GDDP-CMIP6 (mock trajectory)"],
    };
  },
};

function get(h: FarmHandle): Farm {
  const f = farms.get(h); if (!f) throw new Error(`unknown farm handle ${h}`); return f;
}
