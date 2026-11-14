"use client";
// "Climate ridge": 25 summers of NASA POWER daily max temperature as a landscape (public/models/climate-<farm>.glb,
// built by scripts/assets/build-all.mjs). Rows run 2001 (back) → 2025 (front); one row is highlighted.
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Shader = Parameters<NonNullable<THREE.Material["onBeforeCompile"]>>[0];

function Ridge({ farm, year }: { farm: string; year: number }) {
  const { scene } = useGLTF(`/models/climate-${farm}.glb`);
  const extras = scene.userData as { years?: number[]; size?: [number, number, number] };
  const years = extras.years ?? [];
  const depth = extras.size?.[1] ?? 3.2;
  const geometry = useMemo(() => {
    let g: THREE.BufferGeometry | null = null;
    scene.traverse((o) => { if (!g && (o as THREE.Mesh).isMesh) g = (o as THREE.Mesh).geometry; });
    return g!;
  }, [scene]);
  const uniforms = useMemo(() => ({ uZ: { value: 0 }, uBand: { value: depth / Math.max(1, years.length - 1) / 2 }, uTime: { value: 0 } }), [depth, years.length]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, flatShading: true });
    m.onBeforeCompile = (s: Shader) => {
      Object.assign(s.uniforms, uniforms);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPos = position;");
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vPos; uniform float uZ; uniform float uBand; uniform float uTime;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float on = 1.0 - smoothstep(uBand * 0.6, uBand * 1.4, abs(vPos.z - uZ));
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, diffuseColor.rgb * 1.35 + vec3(0.08, 0.05, 0.0), on);`);
    };
    return m;
  }, [uniforms]);
  const target = useRef(0);
  useEffect(() => {
    const r = Math.max(0, years.indexOf(year));
    target.current = -depth / 2 + (r * depth) / Math.max(1, years.length - 1);
  }, [year, years, depth]);
  useFrame((_, dt) => { uniforms.uZ.value = THREE.MathUtils.damp(uniforms.uZ.value, target.current, 6, dt); });
  return <mesh geometry={geometry} material={material} />;
}

export function ClimateRidge({ farm, year, className }: { farm: string; year: number; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 2]} camera={{ position: [3.4, 3.1, 5.4], fov: 36 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 2]} intensity={2.2} color="#ffe2b0" />
      <directionalLight position={[-4, 2, -3]} intensity={0.6} color="#7fa4ff" />
      <Ridge farm={farm} year={year} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.4} minPolarAngle={0.5} maxPolarAngle={1.25} />
    </Canvas>
  );
}

for (const f of ["iowa", "kansas", "baragan"]) useGLTF.preload(`/models/climate-${f}.glb`);
