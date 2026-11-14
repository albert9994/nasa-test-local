// Shapes from docs/team/02_CONTRACTS.md (C1, C2, C3, C10, C12).
// The UI only talks to the `Engine` interface, so the mock (today), the Rust WASM build (A6/A8)
// and the server (C9, plan B) are interchangeable.

export type CropId =
  | "maize" | "soybean" | "wheat" | "barley" | "sorghum"
  | "sunflower" | "pea" | "millet" | "fallow";

// ---------- C1 · farm pack ----------
export interface FarmMeta {
  id: string; name: string; lat: number; lon: number;
  elev?: number; slope?: number; rotation: CropId[]; note?: string;
  cropPool?: CropId[];
  costs?: Partial<Record<CropId, number>>; prices?: Partial<Record<CropId, number>>;
  calib?: Partial<Record<CropId, number>>; sources?: Record<string, string>;
}
export interface WeatherYear {
  tmax: number[]; tmin: number[]; prcp: number[];
  gwet?: number[]; rad?: number[]; rh?: number[]; wind?: number[];
}
export type SoilDepth = "0-5cm" | "5-15cm" | "15-30cm" | "30-60cm" | "60-100cm";
export type SoilProp = Partial<Record<SoilDepth, { mean: number; [k: string]: number }>>;
export interface ScenarioPoint { year: number; dT: number; dP: number }
export interface Scenarios {
  source?: string; models?: string[]; season?: string;
  ssp245?: { "2050": ScenarioStat; series: ScenarioPoint[] };
  ssp585?: { "2050": ScenarioStat; series: ScenarioPoint[] };
}
export interface ScenarioStat { dT: number; dT_p10: number; dT_p90: number; dP: number; dP_p10: number; dP_p90: number }
export interface FarmPack {
  meta: FarmMeta;
  weather: Record<string, WeatherYear>;
  soil?: Partial<Record<"sand" | "clay" | "silt" | "soc" | "bdod" | "phh2o", SoilProp>>;
  ndvi?: Record<string, [number, number | null][]>;
  scenarios?: Scenarios;
}
export type FarmIndexEntry = Pick<FarmMeta, "id" | "name" | "lat" | "lon" | "slope" | "rotation" | "note">;

// ---------- C2 · rotation + options ----------
export interface RotationStep { crop: CropId; cover: boolean }
export type Rotation = RotationStep[];
export interface Opts {
  dT: number; dP: number;
  sowShift: number; maturity: number; irrigCap: number;
  fieldFactor: number;
  failNet: number; failShare: number;
  prices: Partial<Record<CropId, number>>; costs: Partial<Record<CropId, number>>;
}
export interface Weights { profit: number; stability: number; soil: number; water: number }
export type Equipment = "row_planter" | "grain_drill" | "corn_header" | "sunflower_header" | "irrigation";
export interface Constraints {
  maxCostPerHa?: number; maxInvestment?: number;
  equipment: Equipment[]; sellable: CropId[];
}

export const DEFAULT_OPTS: Opts = {
  dT: 0, dP: 0, sowShift: 0, maturity: 1, irrigCap: 0, fieldFactor: 1,
  failNet: 0, failShare: 0.2, prices: {}, costs: {},
};
export const DEFAULT_WEIGHTS: Weights = { profit: 3, stability: 3, soil: 2, water: 1 };

// ---------- C3 · engine results ----------
export interface SeasonTrace {
  idx: number[]; fill: number[]; ks: number[]; tmax: number[]; stage: number[]; heat: number;
}
export interface SeasonResult {
  crop: CropId; year: number; sow: number; harvest: number;
  yield: number; net: number; matured: boolean;
  eta: number; etp: number; irr: number; rain: number; runoff: number; drain: number; stressDays: number;
  heatDays: number;
  factors: { water: number; heat: number; frost: number; duration: number; rotation: number };
  trace: SeasonTrace | null;
}
export interface RotationResult {
  years: number[]; farmNet: number[]; meanNet: number; minNet: number; worstYear: number;
  pFail: number; fails: number;
  yieldByCrop: Partial<Record<CropId, number[]>>;
  soilScore: number; socChangePct: number; erosion: number; waterUse: number;
  traced: SeasonResult[] | null;
}
export interface MarginResult {
  already: boolean; basePFail: number;
  dT: number; dTcapped: boolean; dP: number; dPcapped: boolean;
}
export interface FrontierResult { dTs: number[]; dPs: number[]; grid: number[][] }
export interface RankedRotation {
  rot: Rotation; base: RotationResult; stress: RotationResult;
  score: number; parts: Record<string, number>; viable: boolean;
}
export type PickLabel = "Best balance" | "Drought shield" | "Soil builder";
export interface PickResult { rot: Rotation; label: PickLabel; why: string; base: RotationResult; stress: RotationResult }
export interface MarginYearResult { year: number | null | "now"; path: ScenarioPoint[] }
export interface QuantParams { paths: number; fromYear: number; toYear: number; ssp: "ssp245" | "ssp585"; cashReserve: number; seed: number }
export interface QuantResult {
  rotation: Rotation; years: number[];
  income: { p10: number[]; p50: number[]; p90: number[] };
  pBadYear: number[]; var95: number; cvar95: number; pRuin: number; maxDrawdownP50: number;
  marginYear: { p10: number | null; p50: number | null; p90: number | null };
  meanAnnual: number; sdAnnual: number; riskAdjusted: number;
}

// ---------- C10 · LLM fact sheet ----------
export interface FactSheet {
  farm: { name: string; lat: number; lon: number; soil: string; climate: string };
  rotation: string;
  rule: { badYear: string; tolerance: string };
  today: { badYears: string; meanNet: number; worstYear: number };
  margin: { dT: number; dP: number; status: "safe" | "tight" | "already_over"; safeUntil: { ssp245: string; ssp585: string } };
  worstYearWhy: string[];
  alternatives: {
    label: string; rotation: string; badYears: string; deltaNet: number;
    margin: { dT: number }; soilScore: number; fitsBudget: boolean; missingEquipment: string[];
  }[];
  soil: { score: number; carbonTrendPctYr: number; erosionTHaYr: number };
  market?: { pricePct: number; badYearsUnderShock: string };
  quant?: { paths: number; horizon: string; pBadYear2035: number; cvar95: number; pRuin: number; marginYearP50: number | null };
  sources: string[];
}

// ---------- C12 · FieldShift Score ----------
export interface ScoreResult {
  rotation: string; score: number; confidence: "low" | "medium" | "high";
  subscores: { climate: number; financialRisk: number; profit: number; soil: number; water: number; feasibility: number };
  weights: Record<string, number>; base: number;
  rules: { id: string; delta: number; reason: string }[];
  excludedBy: string | null;
  llm: { delta: number; reason: string; confidence: string } | null;
  waterfall: [string, number][];
}

// ---------- the interface the UI uses ----------
export type FarmHandle = string;
export interface Engine {
  kind: "mock" | "wasm" | "server";
  prepareFarm(pack: FarmPack): Promise<FarmHandle>;
  simulateSeason(h: FarmHandle, crop: CropId, year: number, opts: Opts, trace?: boolean): Promise<SeasonResult>;
  simulateRotation(h: FarmHandle, rot: Rotation, opts: Opts, traceYear?: number): Promise<RotationResult>;
  adaptationMargin(h: FarmHandle, rot: Rotation, opts: Opts): Promise<MarginResult>;
  frontier(h: FarmHandle, rot: Rotation, opts: Opts): Promise<FrontierResult>;
  optimize(h: FarmHandle, pool: CropId[], opts: Opts, w: Weights, baseline: Rotation, c: Constraints): Promise<RankedRotation[]>;
  pickThree(ranked: RankedRotation[], baseline: Rotation): Promise<PickResult[]>;
  marginYear(h: FarmHandle, rot: Rotation, opts: Opts, series: ScenarioPoint[]): Promise<MarginYearResult>;
  marketShock(h: FarmHandle, rot: Rotation, opts: Opts, shock: { pricePct: number; inputPct: number }): Promise<RotationResult>;
  quantSimulate(h: FarmHandle, rots: Rotation[], opts: Opts, p: QuantParams): Promise<QuantResult[]>;
  factSheet(h: FarmHandle, rot: Rotation, opts: Opts, picks: PickResult[]): Promise<FactSheet>;
}
