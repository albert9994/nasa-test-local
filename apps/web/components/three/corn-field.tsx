"use client";
// Hero scene: thousands of instanced corn plants (public/models/corn-lod.glb) swaying in the wind.
// `heat` (0 → 1) is driven by scroll: the field dries out, leaves droop and the sky turns to haze.
// The pointer pushes the plants aside (inspired by Resn's "Corn. Revolutionized." interactive leaf).
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Shader = Parameters<NonNullable<THREE.Material["onBeforeCompile"]>>[0];

const SKY = {
  cool: { top: new THREE.Color("#0d1420"), mid: new THREE.Color("#2a2f2a"), horizon: new THREE.Color("#e8b064") },
  hot: { top: new THREE.Color("#2a1408"), mid: new THREE.Color("#7a3a17"), horizon: new THREE.Color("#ffb070") },
};

function Plants({ heat, count }: { heat: React.RefObject<number>; count: number }) {
  const { scene } = useGLTF("/models/corn-lod.glb");
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pointer = useRef(new THREE.Vector3(0, -100, 0));
  const { camera } = useThree();

  const geometry = useMemo(() => {
    let g: THREE.BufferGeometry | null = null;
    scene.traverse((o) => { if (!g && (o as THREE.Mesh).isMesh) g = (o as THREE.Mesh).geometry; });
    return g!;
  }, [scene]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uHeat: { value: 0 }, uPointer: { value: new THREE.Vector3(0, -100, 0) },
  }), []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    m.onBeforeCompile = (s: Shader) => {
      Object.assign(s.uniforms, uniforms);
      s.vertexShader = s.vertexShader
        .replace("#include <common>", `#include <common>
          uniform float uTime; uniform float uHeat; uniform vec3 uPointer; varying float vDry;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float rnd = h21(ip.xz);
          vDry = smoothstep(0.0, 1.0, uHeat * (0.6 + 0.8 * rnd));
          float k = pow(clamp(position.y / 2.2, 0.0, 1.0), 2.0);
          float gust = sin(uTime * 0.6 + ip.x * 0.05) * 0.5 + 0.5;
          float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.21 + rnd * 6.28) * (0.08 + 0.12 * gust);
          // leaves droop when hot: the further from the stalk, the more they sag
          float r = length(position.xz);
          transformed.y -= vDry * 0.35 * r * (0.5 + position.y / 2.2);
          transformed.xz *= 1.0 - 0.18 * vDry;
          // pointer pushes plants away within ~3 m
          vec2 away = ip.xz - uPointer.xz; float d = length(away);
          float push = smoothstep(3.2, 0.0, d) * 0.9;
          vec2 dir = d > 0.001 ? away / d : vec2(0.0);
          transformed.x += k * (sway + dir.x * push);
          transformed.z += k * (sway * 0.4 + dir.y * push);`);
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", `#include <common>
          varying float vDry;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec3 dry = vec3(0.70, 0.52, 0.27);
          diffuseColor.rgb = mix(diffuseColor.rgb, dry * (0.8 + 0.3 * diffuseColor.g), vDry * 0.9);`);
    };
    return m;
  }, [uniforms]);

  useEffect(() => {
    if (!mesh.current) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const rows = Math.round(Math.sqrt(count / 2.2));
    const perRow = Math.ceil(count / rows);
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < perRow && i < count; c++, i++) {
      // rows run away from the camera; the camera stands in the aisle between the two middle rows
      const x = (r - rows / 2 + 0.5) * 0.76 + (Math.random() - 0.5) * 0.08;
      const z = -c * 0.32 + 5 + (Math.random() - 0.5) * 0.1;
      p.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      const sc = 0.82 + Math.random() * 0.3;
      s.set(sc, sc * (0.9 + Math.random() * 0.2), sc);
      mesh.current.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [count]);

  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  useFrame((state, dt) => {
    uniforms.uTime.value += dt;
    uniforms.uHeat.value = THREE.MathUtils.damp(uniforms.uHeat.value, heat.current ?? 0, 3, dt);
    ray.setFromCamera(state.pointer, camera);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (hit) pointer.current.lerp(hit, 0.15);
    uniforms.uPointer.value.copy(pointer.current);
  });

  return <instancedMesh ref={mesh} args={[geometry, material, count]} frustumCulled={false} />;
}

function Sky({ heat }: { heat: React.RefObject<number> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uHeat: { value: 0 },
    cTop: { value: SKY.cool.top.clone() }, cMid: { value: SKY.cool.mid.clone() }, cHor: { value: SKY.cool.horizon.clone() },
  }), []);
  useFrame((state, dt) => {
    const h = THREE.MathUtils.damp(uniforms.uHeat.value, heat.current ?? 0, 3, dt);
    uniforms.uHeat.value = h;
    uniforms.cTop.value.copy(SKY.cool.top).lerp(SKY.hot.top, h);
    uniforms.cMid.value.copy(SKY.cool.mid).lerp(SKY.hot.mid, h);
    uniforms.cHor.value.copy(SKY.cool.horizon).lerp(SKY.hot.horizon, h);
    const fog = state.scene.fog as THREE.Fog | null;
    if (fog) fog.color.copy(uniforms.cMid.value).lerp(uniforms.cHor.value, 0.45);
  });
  return (
    <mesh scale={200}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial ref={mat} side={THREE.BackSide} depthWrite={false} uniforms={uniforms}
        vertexShader={`varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
        fragmentShader={`uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cHor; uniform float uHeat; varying vec3 vP;
          void main(){ float y = vP.y; vec3 c = mix(cHor, cMid, smoothstep(0.0, 0.18, y)); c = mix(c, cTop, smoothstep(0.15, 0.7, y));
          float sun = pow(max(0.0, dot(normalize(vP), normalize(vec3(0.0, 0.08, -1.0)))), 180.0);
          c += vec3(1.0, 0.75, 0.45) * sun * (1.2 + uHeat);
          gl_FragColor = vec4(c, 1.0); }`} />
    </mesh>
  );
}

function Rig({ progress }: { progress: React.RefObject<number> }) {
  useFrame((state, dt) => {
    const p = progress.current ?? 0;
    const cam = state.camera;
    const tx = state.pointer.x * 0.35, ty = 1.55 + state.pointer.y * 0.12 + p * 1.6;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, tx, 2, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, ty, 2, dt);
    cam.position.z = THREE.MathUtils.damp(cam.position.z, 7.5 - p * 3, 2, dt);
    cam.lookAt(0, 1.1 - p * 0.4, -12);
  });
  return null;
}

export function CornField({ heat, progress, className }: {
  heat: React.RefObject<number>; progress: React.RefObject<number>; className?: string;
}) {
  const count = typeof window !== "undefined" && window.innerWidth < 768 ? 2600 : 7000;
  return (
    <Canvas className={className} dpr={[1, 1.6]} camera={{ position: [0, 1.55, 7.5], fov: 55, near: 0.1, far: 400 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}>
      <fog attach="fog" args={["#4a3a28", 8, 60]} />
      <hemisphereLight args={["#ffd9a0", "#2a2016", 1.3]} />
      <directionalLight position={[0, 4, -20]} intensity={2.2} color="#ffc27a" />
      <directionalLight position={[6, 8, 10]} intensity={0.5} color="#9fb4ff" />
      <Sky heat={heat} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -20]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#2a1f15" roughness={1} />
      </mesh>
      <Plants heat={heat} count={count} />
      <Rig progress={progress} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.55} luminanceThreshold={0.7} mipmapBlur />
        <Noise opacity={0.07} />
        <Vignette offset={0.25} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}

useGLTF.preload("/models/corn-lod.glb");
