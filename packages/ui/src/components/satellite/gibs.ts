// NASA GIBS (Global Imagery Browse Services) layer catalogue for the satellite control.
// Layer ids and tile matrix sets verified against https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/ (tiles return 200).
// GIBS publishes no SMAP *L3* soil-moisture layer; the L4 analysed surface soil moisture (9 km model+SMAP) is available.

export interface GibsLayer {
  id: string;
  /** i18n key suffix under satellite.layer_* */
  key: string;
  matrix: string; // GoogleMapsCompatible_LevelN
  maxZoom: number;
  ext: "png" | "jpg";
  cadenceDays: number; // 0 = daily
  /** First date with data (YYYY-MM-DD) and a lag (days) behind "today" until imagery is published. */
  start: string;
  lagDays: number;
  /** Legend: CSS gradient + end labels (i18n-free numbers). null for true colour. */
  legend: { gradient: string; min: string; max: string; unit: string } | null;
  opacity: number;
  source: string;
}

export const GIBS_LAYERS: GibsLayer[] = [
  {
    id: "MODIS_Terra_L3_NDVI_16Day", key: "ndvi", matrix: "GoogleMapsCompatible_Level9", maxZoom: 9, ext: "png",
    cadenceDays: 16, start: "2000-02-18", lagDays: 20,
    legend: { gradient: "linear-gradient(90deg,#a8855f,#e8d9a8,#a9d27b,#3e8e4f,#0b5d2a)", min: "0", max: "1", unit: "NDVI" },
    opacity: 0.75, source: "NASA GIBS · MODIS Terra MOD13Q1",
  },
  {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor", key: "truecolor", matrix: "GoogleMapsCompatible_Level9", maxZoom: 9, ext: "jpg",
    cadenceDays: 0, start: "2000-02-24", lagDays: 1, legend: null, opacity: 1, source: "NASA GIBS · MODIS Terra",
  },
  {
    id: "MODIS_Terra_Land_Surface_Temp_Day", key: "lst", matrix: "GoogleMapsCompatible_Level7", maxZoom: 7, ext: "png",
    cadenceDays: 0, start: "2000-02-24", lagDays: 2,
    legend: { gradient: "linear-gradient(90deg,#2c4a9a,#5aa9d6,#f2e394,#f08a3c,#a3191a)", min: "-25", max: "45", unit: "°C" },
    opacity: 0.75, source: "NASA GIBS · MODIS Terra MOD11",
  },
  {
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", key: "viirs", matrix: "GoogleMapsCompatible_Level9", maxZoom: 9, ext: "jpg",
    cadenceDays: 0, start: "2015-11-24", lagDays: 1, legend: null, opacity: 1, source: "NASA GIBS · VIIRS Suomi NPP",
  },
  {
    id: "SMAP_L4_Analyzed_Surface_Soil_Moisture", key: "smap", matrix: "GoogleMapsCompatible_Level6", maxZoom: 6, ext: "png",
    cadenceDays: 0, start: "2015-04-01", lagDays: 4,
    legend: { gradient: "linear-gradient(90deg,#b5651d,#e8d6a0,#8ecae6,#1d6fb8,#0b2f6b)", min: "0", max: "0.5", unit: "m³/m³" },
    opacity: 0.75, source: "NASA GIBS · SMAP L4",
  },
];

export function gibsTileUrl(l: GibsLayer, date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l.id}/default/${date}/${l.matrix}/{z}/{y}/{x}.${l.ext}`;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Latest date a layer has imagery for, given "today" (injected for tests). */
export function latestDate(l: GibsLayer, now = Date.now()): string {
  return snapDate(l, iso(now - l.lagDays * 864e5));
}

/** MODIS 16-day composites start on day 1 + 16k of each year; other layers are daily. */
export function snapDate(l: GibsLayer, date: string): string {
  if (l.cadenceDays !== 16) return date;
  const y = Number(date.slice(0, 4));
  const jan1 = Date.UTC(y, 0, 1);
  const doy0 = Math.floor((Date.parse(date) - jan1) / 864e5);
  return iso(jan1 + Math.floor(doy0 / 16) * 16 * 864e5);
}

export function clampDate(l: GibsLayer, date: string, now = Date.now()): string {
  const max = latestDate(l, now);
  const d = date > max ? max : date < l.start ? l.start : date;
  return snapDate(l, d);
}
