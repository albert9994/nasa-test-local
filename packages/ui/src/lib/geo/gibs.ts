// NASA GIBS MODIS Terra NDVI (16-day composites, WMTS, Web Mercator). Composites start on day 1 + 16k of each year.
export const NDVI_YEARS = Array.from({ length: 25 }, (_, i) => 2025 - i);

/** Start date (YYYY-MM-DD) of the 16-day composite that contains late July (peak season in the northern hemisphere). */
export function lateJulyComposite(year: number): string {
  const jan1 = Date.UTC(year, 0, 1);
  const target = Math.floor((Date.UTC(year, 6, 28) - jan1) / 864e5);
  const start = Math.floor(target / 16) * 16;
  return new Date(jan1 + start * 864e5).toISOString().slice(0, 10);
}
export const ndviTiles = (date: string) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDVI_16Day/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
