// Minimal GLB (glTF 2.0 binary) writer for Node: no DOM, no FileReader.
// Each mesh: { name, geometry: THREE.BufferGeometry (position, normal, optional color, index), material: { color, roughness, metalness } }
import { writeFileSync } from "node:fs";

const pad4 = (n) => (n + 3) & ~3;

export function writeGLB(path, meshes, extras = {}) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [], accessors = [], gltfMeshes = [], nodes = [], materials = [];

  const addView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const start = offset;
    chunks.push(bytes);
    offset += bytes.byteLength;
    const padding = pad4(offset) - offset;
    if (padding) { chunks.push(new Uint8Array(padding)); offset += padding; }
    bufferViews.push({ buffer: 0, byteOffset: start, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    return bufferViews.length - 1;
  };
  const addAccessor = (typed, type, componentType, target, withBounds) => {
    const view = addView(typed, target);
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const acc = { bufferView: view, componentType, count: typed.length / size, type };
    if (withBounds) {
      const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity);
      for (let i = 0; i < typed.length; i++) { const k = i % size; min[k] = Math.min(min[k], typed[i]); max[k] = Math.max(max[k], typed[i]); }
      acc.min = min; acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  for (const m of meshes) {
    const g = m.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const attributes = {
      POSITION: addAccessor(new Float32Array(g.attributes.position.array), "VEC3", 5126, 34962, true),
      NORMAL: addAccessor(new Float32Array(g.attributes.normal.array), "VEC3", 5126, 34962, false),
    };
    if (g.attributes.color) attributes.COLOR_0 = addAccessor(new Float32Array(g.attributes.color.array), "VEC3", 5126, 34962, false);
    const prim = { attributes, mode: 4 };
    if (g.index) prim.indices = addAccessor(new Uint32Array(g.index.array), "SCALAR", 5125, 34963, false);
    const mat = m.material ?? {};
    materials.push({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: [...(mat.color ?? [1, 1, 1]), 1],
        metallicFactor: mat.metalness ?? 0,
        roughnessFactor: mat.roughness ?? 0.8,
      },
      doubleSided: mat.doubleSided ?? true,
    });
    prim.material = materials.length - 1;
    gltfMeshes.push({ name: m.name, primitives: [prim] });
    nodes.push({ name: m.name, mesh: gltfMeshes.length - 1, ...(m.translation ? { translation: m.translation } : {}) });
  }

  const json = {
    asset: { version: "2.0", generator: "fieldshift scripts/assets" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i), extras }],
    nodes, meshes: gltfMeshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: offset }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(pad4(jsonBytes.length)).fill(0x20);
  jsonPadded.set(jsonBytes);
  jsonBytes = jsonPadded;
  const bin = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) { bin.set(c, p); p += c.byteLength; }

  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonBytes, 20);
  const b = 20 + jsonBytes.length;
  dv.setUint32(b, bin.length, true); dv.setUint32(b + 4, 0x004e4942, true); out.set(bin, b + 8);
  writeFileSync(path, out);
  return total;
}
