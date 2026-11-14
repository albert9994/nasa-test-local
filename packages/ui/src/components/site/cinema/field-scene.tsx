"use client";
// Minimal 3D stage for the landing hero: a piece of land drawn as a cloud of points, one parcel lit up,
// and a satellite scan line sweeping across it. Scroll lifts the camera to a top-down, "from space" view.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

export interface Progress { get(): number }
export type StageTheme = "light" | "dark";

const LOOK = {
  light: { base: "#14201a", baseAlpha: 0.42, accent: "#1f5135", scan: "#2563a8", blend: THREE.NormalBlending },
  dark: { base: "#f2efe4", baseAlpha: 0.5, accent: "#e6b84a", scan: "#9cc4f5", blend: THREE.AdditiveBlending },
} as const;

/** The example parcel (same outline as the map preview), in world units on the x–z plane. */
const PARCEL: [number, number][] = [[-0.77, -0.56], [0.61, -0.69], [0.85, 0.29], [-0.43, 0.61], [-0.88, 0.11]];
const SIZE = 6;

const height = (x: number, z: number) =>
  0.13 * Math.sin(x * 1.3 + 0.5) * Math.cos(z * 1.1) + 0.06 * Math.sin(x * 2.7 - z * 1.9) + 0.025 * Math.sin(x * 5.1 + z * 4.3);

function inside(x: number, z: number) {
  let c = false;
  for (let i = 0, j = PARCEL.length - 1; i < PARCEL.length; j = i++) {
    const [xi, zi] = PARCEL[i], [xj, zj] = PARCEL[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

const vert = /* glsl */ `
  attribute float aIn;
  uniform float uTime; uniform float uScan; uniform float uPixel; uniform float uIntro;
  varying float vIn; varying float vScan; varying float vFade;
  void main() {
    vec3 p = position;
    float r = length(p.xz);
    float grow = smoothstep(r - 0.6, r, uIntro * 4.5);
    p.y = p.y * grow + 0.012 * sin(uTime * 0.8 + p.x * 2.0 + p.z * 1.5);
    vIn = aIn;
    vScan = exp(-pow((p.x - uScan) * 7.0, 2.0));
    p.y += vScan * 0.03;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = (1.0 - smoothstep(2.6, 3.0, max(abs(p.x), abs(p.z)))) * grow;
    gl_PointSize = (1.8 + aIn * 1.4 + vScan * 1.8) * uPixel * (3.2 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  uniform vec3 uBase; uniform vec3 uAccent; uniform vec3 uScanColor; uniform float uBaseAlpha;
  varying float vIn; varying float vScan; varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d);
    vec3 c = mix(uBase, uAccent, vIn);
    c = mix(c, uScanColor, vScan * (1.0 - vIn) * 0.8);
    float alpha = a * vFade * mix(uBaseAlpha + vScan * 0.5, 0.95, vIn);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(c, alpha);
  }`;

function Land({ theme, n, reduced }: { theme: StageTheme; n: number; reduced: boolean }) {
  const look = LOOK[theme];
  const { gl } = useThree();
  const geo = useMemo(() => {
    const pos = new Float32Array(n * n * 3), ins = new Float32Array(n * n);
    let k = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (i / (n - 1) - 0.5) * SIZE, z = (j / (n - 1) - 0.5) * SIZE;
      pos[k * 3] = x; pos[k * 3 + 1] = height(x, z); pos[k * 3 + 2] = z;
      ins[k] = inside(x, z) ? 1 : 0;
      k++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aIn", new THREE.BufferAttribute(ins, 1));
    return g;
  }, [n]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uScan: { value: -4 }, uPixel: { value: 1 }, uIntro: { value: 0 }, uBaseAlpha: { value: 0.3 },
      uBase: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() }, uScanColor: { value: new THREE.Color() },
    },
  }), []);
  const outline = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    PARCEL.forEach(([x, z], i) => {
      const [x2, z2] = PARCEL[(i + 1) % PARCEL.length];
      for (let s = 0; s < 24; s++) {
        const u = s / 24, px = x + (x2 - x) * u, pz = z + (z2 - z) * u;
        pts.push(new THREE.Vector3(px, height(px, pz) + 0.02, pz));
      }
    });
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ transparent: true, opacity: 0 }));
  }, []);
  useEffect(() => {
    mat.uniforms.uBase.value.set(look.base);
    mat.uniforms.uAccent.value.set(look.accent);
    mat.uniforms.uScanColor.value.set(look.scan);
    mat.uniforms.uBaseAlpha.value = look.baseAlpha;
    mat.blending = look.blend;
    mat.needsUpdate = true;
    (outline.material as THREE.LineBasicMaterial).color.set(look.accent);
  }, [mat, look, outline]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); outline.geometry.dispose(); (outline.material as THREE.Material).dispose(); }, [geo, mat, outline]);
  useFrame((state, dt) => {
    const u = mat.uniforms;
    const t = state.clock.elapsedTime;
    u.uTime.value = reduced ? 0 : t;
    u.uPixel.value = gl.getPixelRatio();
    u.uIntro.value = reduced ? 1 : Math.min(1, u.uIntro.value + dt * 0.35);
    // one sweep every 7 s, pausing off-field between passes
    u.uScan.value = reduced ? -4 : ((t % 7) / 7) * 9 - 4.5;
    (outline.material as THREE.LineBasicMaterial).opacity = Math.max(0, u.uIntro.value - 0.6) * 2;
  });
  return (
    <group>
      <points geometry={geo} material={mat} frustumCulled={false} />
      <primitive object={outline} />
    </group>
  );
}

// camera: low, raking view at the top of the page → high, almost top-down as you scroll away
const FROM = { pos: new THREE.Vector3(2.3, 2.5, 4.6), look: new THREE.Vector3(-1.25, -0.5, 0.2) };
const TO = { pos: new THREE.Vector3(0.6, 5.6, 1.4), look: new THREE.Vector3(-0.9, 0, 0) };
// portrait screens: the field sits above the copy instead of beside it
const FROM_P = { pos: new THREE.Vector3(0.3, 4.9, 6.3), look: new THREE.Vector3(0.28, 0, 1.7) };
const TO_P = { pos: new THREE.Vector3(0.2, 8.5, 2.6), look: new THREE.Vector3(0, 0, 1.4) };

function Rig({ progress, reduced }: { progress: Progress; reduced: boolean }) {
  const { camera, pointer, size } = useThree();
  const pos = useMemo(() => new THREE.Vector3(), []), look = useMemo(() => new THREE.Vector3(), []);
  const cur = useRef(FROM.look.clone());
  useFrame((state, dt) => {
    const p = THREE.MathUtils.smoothstep(progress.get(), 0, 1);
    const [a, b] = size.width < size.height ? [FROM_P, TO_P] : [FROM, TO];
    pos.lerpVectors(a.pos, b.pos, p);
    look.lerpVectors(a.look, b.look, p);
    if (!reduced) {
      const a = state.clock.elapsedTime * 0.04;
      pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(a) * 0.25);
      pos.x += pointer.x * 0.15; pos.y += pointer.y * 0.08;
    }
    camera.position.lerp(pos, 1 - Math.exp(-5 * dt));
    cur.current.lerp(look, 1 - Math.exp(-5 * dt));
    camera.lookAt(cur.current);
  });
  return null;
}

export interface FieldSceneProps { progress: Progress; theme: StageTheme; active: boolean; reduced: boolean; dense: boolean }

export default function FieldScene({ progress, theme, active, reduced, dense }: FieldSceneProps) {
  return (
    <Canvas frameloop={active ? "always" : "never"} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
      camera={{ fov: 32, position: FROM.pos.toArray(), near: 0.05, far: 30 }} aria-hidden>
      <Land theme={theme} n={dense ? 230 : 140} reduced={reduced} />
      <Rig progress={progress} reduced={reduced} />
    </Canvas>
  );
}
