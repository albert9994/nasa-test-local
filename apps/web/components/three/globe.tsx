"use client";
// NASA Blue Marble + Black Marble globe (NASA GIBS imagery in public/textures) with the demo farms pinned.
import { OrbitControls, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface GlobePin { id: string; name: string; lat: number; lon: number }

const toVec = (lat: number, lon: number, r: number) => {
  const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
};

function Earth({ pins, active }: { pins: GlobePin[]; active?: string }) {
  const [day, night] = useTexture(["/textures/earth-day.jpg", "/textures/earth-night.jpg"]);
  day.colorSpace = THREE.SRGBColorSpace; night.colorSpace = THREE.SRGBColorSpace;
  day.anisotropy = 8;
  const group = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({ uDay: { value: day }, uNight: { value: night }, uSun: { value: new THREE.Vector3(-1, 0.3, 0.6).normalize() } }), [day, night]);
  useFrame((_, dt) => { if (group.current) group.current.rotation.y += dt * 0.04; });
  return (
    <group ref={group} rotation={[0.35, 1.9, 0]}>
      <mesh>
        <sphereGeometry args={[1, 96, 64]} />
        <shaderMaterial uniforms={uniforms}
          vertexShader={`varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
          fragmentShader={`uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN;
            void main(){ float l = dot(normalize(vN), uSun); float k = smoothstep(-0.15, 0.25, l);
              vec3 d = texture2D(uDay, vUv).rgb * (0.25 + 0.95 * max(l, 0.0));
              vec3 n = texture2D(uNight, vUv).rgb * vec3(1.0, 0.8, 0.55) * 1.4;
              gl_FragColor = vec4(mix(n, d, k), 1.0);
              #include <colorspace_fragment>
            }`} />
      </mesh>
      {/* atmosphere */}
      <mesh scale={1.08}>
        <sphereGeometry args={[1, 64, 32]} />
        <shaderMaterial transparent side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending}
          vertexShader={`varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
          fragmentShader={`varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0,0,1.0)), 3.0); gl_FragColor = vec4(0.95, 0.72, 0.35, 1.0) * i * 1.6; }`} />
      </mesh>
      {pins.map((p) => {
        const v = toVec(p.lat, p.lon, 1.002), on = p.id === active;
        return (
          <group key={p.id} position={v} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize())}>
            <mesh position={[0, on ? 0.09 : 0.05, 0]}>
              <cylinderGeometry args={[0.003, 0.003, on ? 0.18 : 0.1, 6]} />
              <meshBasicMaterial color="#e8b64c" />
            </mesh>
            <mesh position={[0, on ? 0.18 : 0.1, 0]}>
              <sphereGeometry args={[on ? 0.022 : 0.014, 16, 8]} />
              <meshBasicMaterial color={on ? "#fff1d6" : "#e8b64c"} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function Globe({ pins, active, className }: { pins: GlobePin[]; active?: string; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 2]} camera={{ position: [0, 0, 3.1], fov: 40 }} gl={{ antialias: true, alpha: true }}>
      <Earth pins={pins} active={active} />
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.5} />
    </Canvas>
  );
}
