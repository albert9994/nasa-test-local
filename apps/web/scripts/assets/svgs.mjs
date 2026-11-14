// SVG assets: brand (logo, wordmark), line icons for crops and data, topographic + field-row backgrounds, grain.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------- value noise + fBm ----------
function makeNoise(seed) {
  const p = new Uint8Array(512); const perm = [...Array(256).keys()];
  let s = seed;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const h = (x, y) => p[p[x & 255] + (y & 255)] / 255;
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y) => { let v = 0, amp = 0.5, f = 1; for (let o = 0; o < 4; o++) { v += amp * n(x * f, y * f); amp *= 0.5; f *= 2; } return v; };
}

// ---------- marching squares → polyline segments joined into paths ----------
function contours(field, cols, rows, levels, cell) {
  const segs = [];
  const at = (x, y) => field[y * cols + x];
  for (const L of levels) {
    for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
      const a = at(x, y), b = at(x + 1, y), c = at(x + 1, y + 1), d = at(x, y + 1);
      const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const lerp = (v1, v2) => (L - v1) / (v2 - v1);
      const T = [(x + lerp(a, b)) * cell, y * cell], R = [(x + 1) * cell, (y + lerp(b, c)) * cell];
      const B = [(x + lerp(d, c)) * cell, (y + 1) * cell], Lf = [x * cell, (y + lerp(a, d)) * cell];
      const map = { 1: [[Lf, B]], 2: [[B, R]], 3: [[Lf, R]], 4: [[T, R]], 5: [[Lf, T], [B, R]], 6: [[T, B]], 7: [[Lf, T]],
        8: [[Lf, T]], 9: [[T, B]], 10: [[T, R], [Lf, B]], 11: [[T, R]], 12: [[Lf, R]], 13: [[B, R]], 14: [[Lf, B]] };
      for (const sgm of map[idx]) segs.push({ L, sgm });
    }
  }
  return segs;
}
const r1 = (v) => Math.round(v);

function topo({ w, h, seed, levels = 14, scale = 0.012 }) {
  const cell = 14, cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
  const n = makeNoise(seed), field = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) field[y * cols + x] = n(x * cell * scale, y * cell * scale);
  const ls = [...Array(levels)].map((_, i) => 0.2 + (i / levels) * 0.6);
  const segs = contours(field, cols, rows, ls, cell);
  const byLevel = new Map();
  for (const { L, sgm } of segs) { const k = ls.indexOf(L); (byLevel.get(k) ?? byLevel.set(k, []).get(k)).push(`M${r1(sgm[0][0])} ${r1(sgm[0][1])}L${r1(sgm[1][0])} ${r1(sgm[1][1])}`); }
  const paths = [...byLevel.entries()].map(([k, d]) =>
    `<path d="${d.join("")}" stroke-opacity="${(k % 4 === 0 ? 0.55 : 0.25).toFixed(2)}" stroke-width="${k % 4 === 0 ? 1.1 : 0.7}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="currentColor" stroke-linecap="round">${paths}</g></svg>`;
}

function fieldRows({ w, h }) {
  // perspective crop rows converging to a horizon, like a field seen from the tractor seat
  const vx = w / 2, vy = h * 0.18, lines = [];
  for (let i = -40; i <= 40; i++) {
    const x = vx + i * (w / 26);
    lines.push(`<line x1="${r1(vx + i * 6)}" y1="${vy}" x2="${r1(x)}" y2="${h}" stroke-opacity="${(0.12 + 0.3 * (1 - Math.abs(i) / 40)).toFixed(2)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax slice"><g stroke="currentColor" stroke-width="1">${lines.join("")}</g></svg>`;
}

const grain = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

// ---------- brand ----------
const mark = (stroke = "#e8b64c", bg = "none") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${bg !== "none" ? `<rect width="64" height="64" rx="16" fill="${bg}"/>` : ""}<g fill="none" stroke="${stroke}" stroke-width="4.2" stroke-linecap="round"><path d="M12 48c13-2 21-12 23-30"/><path d="M22 52c11-3 19-12 22-27"/><path d="M33 54c7-3 13-9 17-18"/><circle cx="47" cy="15" r="5" stroke-width="3.4"/></g></svg>`;
const wordmark = (fill = "#f1ead8", accent = "#e8b64c") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 72"><g fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"><path d="M8 58c13-2 21-12 23-30"/><path d="M18 62c11-3 19-12 22-27"/><path d="M29 64c7-3 13-9 17-18"/><circle cx="43" cy="25" r="5" stroke-width="3.2"/></g><text x="64" y="52" font-family="Instrument Serif, Georgia, serif" font-size="50" fill="${fill}" letter-spacing="-0.5">Field<tspan font-style="italic" fill="${accent}">Shift</tspan></text></svg>`;

// ---------- icons (24×24, stroke = currentColor) ----------
const icon = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  maize: icon(`<path d="M12 22V3"/><path d="M12 9c-3-1-5-3-6-6 3 0 5 2 6 4"/><path d="M12 14c3-1 5-3 6-6-3 0-5 2-6 4"/><path d="M14 12c2 1 2.5 4 1.5 6-1.6-.6-2.6-2.4-2.6-4"/><path d="M12 17c-3-1-5-1-7 1"/>`),
  wheat: icon(`<path d="M12 22V8"/><path d="M12 8c-1.6-1-2-3-1-5 1.6 1 2 3 1 5zM12 8c1.6-1 2-3 1-5-1.6 1-2 3-1 5"/><path d="M12 12c-2-.4-3-2-3-3.6 2 .4 3 2 3 3.6zM12 12c2-.4 3-2 3-3.6-2 .4-3 2-3 3.6"/><path d="M12 16c-2-.4-3-2-3-3.6 2 .4 3 2 3 3.6zM12 16c2-.4 3-2 3-3.6-2 .4-3 2-3 3.6"/>`),
  soybean: icon(`<path d="M12 22v-8"/><ellipse cx="12" cy="8" rx="3.2" ry="5"/><ellipse cx="6.5" cy="12.5" rx="2.6" ry="4" transform="rotate(-40 6.5 12.5)"/><ellipse cx="17.5" cy="12.5" rx="2.6" ry="4" transform="rotate(40 17.5 12.5)"/>`),
  sorghum: icon(`<path d="M12 22V9"/><circle cx="12" cy="5" r="2.2"/><circle cx="9.6" cy="7.2" r="1.8"/><circle cx="14.4" cy="7.2" r="1.8"/><path d="M12 15c-3-1-5-3-6-5M12 18c3-1 5-3 6-5"/>`),
  sunflower: icon(`<circle cx="12" cy="8" r="2.4"/><path d="M12 2.5v1.6M12 12v1.6M6.5 8h1.6M15.9 8h1.6M8.1 4.1l1.1 1.1M14.8 10.8l1.1 1.1M8.1 11.9l1.1-1.1M14.8 5.2l1.1-1.1"/><path d="M12 14v8M12 18c-2-2-4-2-5-1"/>`),
  pea: icon(`<path d="M5 18c4 0 12-5 14-12-5 1-12 6-14 12z"/><circle cx="10" cy="14" r="1.2"/><circle cx="13" cy="11.5" r="1.2"/><circle cx="15.8" cy="9" r="1.2"/>`),
  barley: icon(`<path d="M12 22V9"/><path d="M12 9l-2-6M12 9l2-6M12 12l-3-3M12 12l3-3M12 15l-3-3M12 15l3-3"/>`),
  millet: icon(`<path d="M12 22V10"/><path d="M12 10c-3 0-4-4-3-7 3 1 4 4 3 7z"/><path d="M9 3l-1-1M11 2V1M13 3l1-1"/>`),
  fallow: icon(`<path d="M3 18h18M3 14h18"/><path d="M6 10c2-2 4-2 6 0s4 2 6 0"/>`),
  rye: icon(`<path d="M7 22V10M12 22V7M17 22V11"/><path d="M7 10l-1.5-2M7 10l1.5-2M12 7l-1.5-2M12 7l1.5-2M17 11l-1.5-2M17 11l1.5-2"/>`),
  thermometer: icon(`<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>`),
  drop: icon(`<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>`),
  sun: icon(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
  satellite: icon(`<path d="M13 7l4 4-6 6-4-4z"/><path d="M15 5l2-2 4 4-2 2M9 15l-2 2M5 11l-2 2 4 4 2-2"/><path d="M17.5 14.5a4 4 0 0 1-3 3M19.5 16a7 7 0 0 1-3.5 3.5"/>`),
  soil: icon(`<path d="M3 8h18M3 13h18M3 18h18"/><circle cx="7" cy="10.5" r=".6"/><circle cx="15" cy="15.5" r=".6"/><circle cx="11" cy="20" r=".6"/><path d="M12 8V3M12 5l-2-2M12 5l2-2"/>`),
  globe: icon(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`),
  chart: icon(`<path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/><circle cx="19" cy="6" r="1.2"/>`),
  shield: icon(`<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>`),
  spark: icon(`<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>`),
};

export function buildSvgs(root) {
  const out = {};
  const w = (p, s) => { writeFileSync(join(root, p), s); out[p] = s.length; };
  w("brand/mark.svg", mark());
  w("brand/mark-dark-bg.svg", mark("#e8b64c", "#0b0c09"));
  w("brand/favicon.svg", mark("#e8b64c", "#0b0c09"));
  w("brand/wordmark-light.svg", wordmark("#f1ead8", "#e8b64c"));
  w("brand/wordmark-dark.svg", wordmark("#16170f", "#b9811f"));
  w("bg/topo.svg", topo({ w: 1600, h: 1000, seed: 42 }));
  w("bg/topo-tall.svg", topo({ w: 900, h: 1600, seed: 7, levels: 12 }));
  w("bg/field-rows.svg", fieldRows({ w: 1600, h: 900 }));
  w("bg/grain.svg", grain);
  for (const [k, v] of Object.entries(ICONS)) w(`icons/${k}.svg`, v);
  return out;
}
