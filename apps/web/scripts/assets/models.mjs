// Procedural low-poly crop models → public/models/*.glb
// corn.glb (hero plant, separate nodes per leaf so the page can animate them), corn-lod.glb (merged, for instancing
// thousands of plants), wheat.glb, soybean.glb. Vertex colours carry the shading, so no textures are needed.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { writeGLB } from "./glb.mjs";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function paint(geo, colorAt) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    colorAt(c, pos.getX(i), pos.getY(i), pos.getZ(i), i);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
const strip = (g) => { // keep only attributes every merged geometry shares
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(k)) g.deleteAttribute(k);
  return g.index ? g : g;
};

// A curved, tapering leaf ribbon from the stalk at height y0, pointing to angle `az`.
function leaf({ y0, len, width, az, droop, segs = 10, twist = 0.4 }) {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const out = len * t;
    const y = y0 + len * 0.55 * t - droop * t * t * len;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * (1 - 0.15 * t);
    const tw = twist * t;
    for (const s of [-1, 1]) {
      const lx = out, lz = s * w * 0.5 * Math.cos(tw), ly = y + s * w * 0.5 * Math.sin(tw) * 0.4;
      pos.push(Math.cos(az) * lx - Math.sin(az) * lz, ly, Math.sin(az) * lx + Math.cos(az) * lz);
    }
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const GREEN_DARK = new THREE.Color("#3f6b24"), GREEN_LIGHT = new THREE.Color("#8fbf6a"), STRAW = new THREE.Color("#d9b56a");
const GOLD = new THREE.Color("#e8b64c"), HUSK = new THREE.Color("#a9c46c"), SILK = new THREE.Color("#8a5a2b");

function cornParts(height = 2.2, detail = 1) {
  const parts = [];
  const stalk = new THREE.CylinderGeometry(0.018, 0.032, height, Math.max(5, 8 * detail), Math.max(4, 10 * detail));
  stalk.translate(0, height / 2, 0);
  paint(stalk, (c, x, y) => c.copy(GREEN_DARK).lerp(GREEN_LIGHT, y / height * 0.7));
  parts.push({ name: "stalk", geometry: stalk, color: [1, 1, 1] });
  const n = detail >= 1 ? 11 : 7;
  for (let i = 0; i < n; i++) {
    const y0 = 0.18 + (i / n) * height * 0.78;
    const g = leaf({ y0, len: 0.55 + 0.35 * Math.sin(Math.PI * (i + 1) / (n + 1)), width: 0.075, az: i * 2.4 + rnd() * 0.4,
      droop: 0.9 + rnd() * 0.5, segs: detail >= 1 ? 12 : 5, twist: 0.6 * rnd() });
    paint(g, (c, x, y, z, k) => c.copy(GREEN_DARK).lerp(GREEN_LIGHT, 0.35 + 0.5 * (k % 2) * 0.4 + 0.25 * (Math.hypot(x, z) / 0.9)));
    parts.push({ name: `leaf_${i}`, geometry: g });
  }
  // ear: husked cob leaning out of the stalk
  const ear = new THREE.CapsuleGeometry(0.045, 0.2, 4 * detail, Math.max(6, 10 * detail));
  ear.rotateZ(0.35); ear.translate(0.07, height * 0.52, 0);
  paint(ear, (c, x, y) => c.copy(HUSK).lerp(GOLD, Math.max(0, (y - height * 0.5) * 3)));
  parts.push({ name: "ear", geometry: ear });
  // tassel: a few thin spikes on top
  const tassels = [];
  for (let i = 0; i < 7; i++) {
    const t = new THREE.ConeGeometry(0.006, 0.28, 3);
    t.translate(0, 0.14, 0); t.rotateZ(i === 0 ? 0 : 0.5 + rnd() * 0.3); t.rotateY((i / 7) * Math.PI * 2);
    t.translate(0, height, 0);
    tassels.push(strip(t));
  }
  const tassel = mergeGeometries(tassels.map((g) => g.toNonIndexed()));
  paint(tassel, (c) => c.copy(STRAW).lerp(SILK, 0.3));
  parts.push({ name: "tassel", geometry: tassel });
  return parts;
}

function wheatParts() {
  const parts = [];
  for (let s = 0; s < 5; s++) {
    const h = 0.85 + rnd() * 0.15, lean = (rnd() - 0.5) * 0.18, az = rnd() * Math.PI * 2;
    const stem = new THREE.CylinderGeometry(0.004, 0.006, h, 5, 6);
    stem.translate(0, h / 2, 0);
    const head = new THREE.CapsuleGeometry(0.014, 0.09, 3, 6);
    head.translate(0, h + 0.05, 0);
    const awns = [];
    for (let a = 0; a < 10; a++) {
      const aw = new THREE.CylinderGeometry(0.0008, 0.0008, 0.09, 3);
      aw.translate(0, 0.045, 0); aw.rotateZ(0.25); aw.rotateY(a * 0.63); aw.translate(0, h + 0.03 + (a % 5) * 0.018, 0);
      awns.push(aw.toNonIndexed());
    }
    const g = mergeGeometries([stem.toNonIndexed(), head.toNonIndexed(), ...awns]);
    g.rotateZ(lean); g.rotateY(az); g.translate((rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.06);
    paint(g, (c, x, y) => c.copy(new THREE.Color("#8aa65a")).lerp(STRAW, Math.min(1, y / h * 1.3)));
    parts.push({ name: `stem_${s}`, geometry: g });
  }
  return parts;
}

function soyParts() {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.006, 0.01, 0.6, 5, 4); stem.translate(0, 0.3, 0);
  paint(stem, (c) => c.copy(GREEN_DARK));
  parts.push({ name: "stem", geometry: stem });
  const leaves = [];
  for (let i = 0; i < 14; i++) {
    const y = 0.12 + (i / 14) * 0.45, az = i * 2.39;
    for (let k = -1; k <= 1; k++) {
      const l = new THREE.CircleGeometry(0.05, 7); l.scale(1, 1.6, 1); l.rotateX(-Math.PI / 2 + 0.5);
      l.translate(0, 0, 0.09); l.rotateY(az + k * 0.5); l.translate(0, y, 0);
      leaves.push(l.toNonIndexed());
    }
  }
  const g = mergeGeometries(leaves);
  paint(g, (c, x, y) => c.copy(GREEN_DARK).lerp(GREEN_LIGHT, 0.3 + y));
  parts.push({ name: "leaves", geometry: g });
  return parts;
}

const prep = (parts) => parts.map((p) => ({ name: p.name, geometry: strip(p.geometry.index ? p.geometry.toNonIndexed() : p.geometry), material: { roughness: 0.75 } }));
const merged = (parts, name) => {
  const g = mergeGeometries(parts.map((p) => strip(p.geometry.index ? p.geometry.toNonIndexed() : p.geometry)));
  g.computeVertexNormals();
  return [{ name, geometry: g, material: { roughness: 0.8 } }];
};

export function buildModels(outDir) {
  const out = {};
  seed = 7; out["corn.glb"] = writeGLB(`${outDir}/corn.glb`, prep(cornParts(2.2, 1)));
  seed = 11; out["corn-lod.glb"] = writeGLB(`${outDir}/corn-lod.glb`, merged(cornParts(2.2, 0.5), "corn"));
  seed = 13; out["wheat.glb"] = writeGLB(`${outDir}/wheat.glb`, merged(wheatParts(), "wheat"));
  seed = 17; out["soybean.glb"] = writeGLB(`${outDir}/soybean.glb`, merged(soyParts(), "soybean"));
  return out;
}
