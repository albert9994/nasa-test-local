"use client";
// Landing page (O6). Story: the question → the field heats up (scroll) → 2012 from space → one number per farm →
// 25 summers as a landscape → try it → how it works → NASA data on a globe → why it matters → team.
import Lenis from "lenis";
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LiteDemo } from "./lite-demo";
import { NdviCompare } from "./ndvi-compare";
import { SiteFooter, SiteNav } from "./chrome";
import { useHeatCurve, type HeatCurve } from "./use-heat-curve";

const CornField = dynamic(() => import("@/components/three/corn-field").then((m) => m.CornField), { ssr: false });
const Globe = dynamic(() => import("@/components/three/globe").then((m) => m.Globe), { ssr: false });
const ClimateRidge = dynamic(() => import("@/components/three/climate-ridge").then((m) => m.ClimateRidge), { ssr: false });

const FARMS = [
  { id: "iowa", short: "Iowa, USA", name: "Story County, Iowa", lat: 42.03, lon: -93.62, crops: "maize → soybean", worst: 2012 },
  { id: "kansas", short: "Kansas, USA", name: "Finney County, Kansas", lat: 37.95, lon: -100.85, crops: "winter wheat → fallow", worst: 2022 },
  { id: "baragan", short: "Bărăgan, Romania", name: "Bărăgan Plain, Romania", lat: 44.55, lon: 27.45, crops: "maize → winter wheat", worst: 2024 },
];

function useLenis() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.1 });
    let id = 0;
    const raf = (t: number) => { lenis.raf(t); id = requestAnimationFrame(raf); };
    id = requestAnimationFrame(raf);
    return () => { cancelAnimationFrame(id); lenis.destroy(); };
  }, []);
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-xs uppercase tracking-[0.28em] text-gold">{children}</p>;
}

// ---------------------------------------------------------------- hero: the field heats up
function Chapter({ p, range, children, className }: { p: MotionValue<number>; range: [number, number]; children: React.ReactNode; className?: string }) {
  const [a, b] = range, f = 0.06;
  const first = a === 0;
  const opacity = useTransform(p, first ? [0, b - f, b] : [a, a + f, b - f, b], first ? [1, 1, 0] : [0, 1, 1, 0]);
  const y = useTransform(p, [a, b], [first ? 0 : 30, -30]);
  return <motion.div style={{ opacity, y }} className={cn("absolute inset-x-0 px-4 sm:px-10", className)}>{children}</motion.div>;
}

function interp(curve: HeatCurve | null, dT: number) {
  if (!curve) return null;
  const pts = curve.points;
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].dT < dT) i++;
  const a = pts[i], b = pts[i + 1], t = Math.min(1, Math.max(0, (dT - a.dT) / (b.dT - a.dT)));
  return { bad: Math.round(a.badYears + t * (b.badYears - a.badYears)), net: a.meanNet + t * (b.meanNet - a.meanNet) };
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const heat = useRef(0), progress = useRef(0);
  const [dT, setDT] = useState(0);
  const curve = useHeatCurve("iowa");
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progress.current = v;
    const h = Math.min(1, Math.max(0, (v - 0.22) / 0.62));
    heat.current = h;
    setDT(+(h * 3).toFixed(1));
  });
  const now = interp(curve, dT);
  const limit = curve?.margin && !curve.margin.already ? curve.margin.dT : null;
  const crossed = limit != null && dT >= limit;
  const hudOpacity = useTransform(scrollYProgress, [0.16, 0.24, 0.9, 0.97], [0, 1, 1, 0]);

  return (
    <section ref={ref} className="relative h-[420vh]" aria-label="How much hotter can your farm get?">
      <div className="sticky top-0 h-dvh overflow-hidden bg-[#0b0c09] text-[#f1ead8]">
        <CornField heat={heat} progress={progress} className="!absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" />
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <Chapter p={scrollYProgress} range={[0, 0.2]}>
            <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[#e8b64c]">NASA Space Apps 2026 · Field Shift</p>
            <h1 className="display max-w-5xl text-[13vw] sm:text-[8.5vw] lg:text-[7.2rem]">
              How much hotter can your farm get <em className="text-[#e8b64c]">before it fails?</em>
            </h1>
            <p className="mt-6 max-w-xl text-base text-[#f1ead8]/80 sm:text-lg">
              FieldShift replays 25 years of NASA satellite and weather data on your field, turns up the heat, and finds the point
              where your crop rotation stops paying. Then it finds rotations that hold.
            </p>
            <p className="mt-10 text-xs uppercase tracking-[0.25em] text-[#f1ead8]/60">Scroll to turn up the heat ↓</p>
          </Chapter>
          <Chapter p={scrollYProgress} range={[0.22, 0.45]}>
            <h2 className="display max-w-3xl text-5xl sm:text-7xl">This is Story County, Iowa.</h2>
            <p className="mt-4 max-w-lg text-lg text-[#f1ead8]/80">Maize, then soybean. The heart of the Corn Belt. We replay every summer from 2001 to 2025 with NASA POWER weather and SoilGrids soil.</p>
          </Chapter>
          <Chapter p={scrollYProgress} range={[0.45, 0.7]}>
            <h2 className="display max-w-3xl text-5xl sm:text-7xl">Now add heat to every one of those days.</h2>
            <p className="mt-4 max-w-lg text-lg text-[#f1ead8]/80">Hot days at flowering and dry soil in July: the 2012 story, again and again. Watch the bad years add up.</p>
          </Chapter>
          <Chapter p={scrollYProgress} range={[0.7, 0.94]}>
            <h2 className="display max-w-4xl text-5xl sm:text-7xl">
              The point where it breaks is the <em className="text-[#e8b64c]">Adaptation Margin.</em>
            </h2>
            <p className="mt-4 max-w-lg text-lg text-[#f1ead8]/80">
              {limit != null
                ? `For this farm: about +${limit.toFixed(1)} °C. Beyond that, bad years come more often than the farmer can live with (1 in 5).`
                : "One number every farmer can understand: how much more climate your rotation can take."}
            </p>
          </Chapter>
        </div>

        <motion.div style={{ opacity: hudOpacity }} className="absolute bottom-6 left-4 right-4 sm:left-10 sm:right-auto sm:w-[420px]">
          <div className="rounded-2xl border border-white/15 bg-black/45 p-4 backdrop-blur-md">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f1ead8]/60">Warmer than today</p>
                <p className={cn("num text-4xl transition-colors", crossed ? "text-[#ef6a4c]" : "text-[#e8b64c]")}>+{dT.toFixed(1)} °C</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f1ead8]/60">Bad years</p>
                <p className="num text-4xl">{now ? now.bad : "–"}<span className="text-lg text-[#f1ead8]/50">/{curve?.years ?? 25}</span></p>
              </div>
            </div>
            <div className="relative mt-3 h-1.5 rounded-full bg-white/10">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#8fbf6a] via-[#e8b64c] to-[#ef6a4c]" style={{ width: `${(dT / 3) * 100}%` }} />
              {limit != null && limit <= 3 && (
                <div className="absolute -top-1.5 h-4.5 w-0.5 bg-white" style={{ left: `${(limit / 3) * 100}%` }} title="Adaptation Margin" />
              )}
            </div>
            <p className="mt-2 text-xs text-[#f1ead8]/60">
              {crossed ? "Past the farmer's limit: more than 1 bad year in 5." : limit != null ? `Limit at +${limit.toFixed(1)} °C (white line).` : "Computing on NASA data…"}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- one number per farm
function MiniCurve({ curve }: { curve: HeatCurve }) {
  const w = 240, h = 70, max = curve.years;
  const pts = curve.points.map((p) => [(p.dT / 4) * w, h - (p.badYears / max) * h] as const);
  const lim = (1 / 5) * max;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[70px] w-full overflow-visible" aria-hidden>
      <line x1={0} x2={w} y1={h - (lim / max) * h} y2={h - (lim / max) * h} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 4" />
      <path d={`M${pts.map((p) => p.join(" ")).join("L")}`} fill="none" stroke="var(--heat)" strokeWidth={2} />
      {!curve.margin.already && <circle cx={(Math.min(4, curve.margin.dT) / 4) * w} cy={h - (lim / max) * h} r={4} fill="var(--gold)" />}
    </svg>
  );
}

function FarmCard({ farm }: { farm: (typeof FARMS)[number] }) {
  const curve = useHeatCurve(farm.id);
  const m = curve?.margin;
  return (
    <Link href={`/farm/${farm.id}`} className="group flex flex-col rounded-[var(--radius)] border border-line bg-bg-elev p-6 transition-colors hover:border-gold">
      <p className="text-xs uppercase tracking-[0.2em] text-fg-muted">{farm.short}</p>
      <p className="mt-1 text-sm text-fg-muted">{farm.crops}</p>
      <p className="display mt-6 text-6xl">{m ? (m.already ? "Over" : m.dTcapped ? ">+6 °C" : `+${m.dT.toFixed(1)} °C`) : "…"}</p>
      <p className="mt-1 text-sm text-fg-muted">{m ? (m.already ? "already past its limit" : `and ${Math.round(Math.abs(m.dP) * 100)}${m.dPcapped ? "+" : ""} % less rain`) : "computing on NASA data"}</p>
      <div className="mt-6 text-fg">{curve && <MiniCurve curve={curve} />}</div>
      <p className="mt-2 text-xs text-fg-muted">Bad years as it warms (0 → +4 °C). Dashed: the 1-in-5 limit.</p>
      <p className="mt-4 text-sm text-gold opacity-0 transition-opacity group-hover:opacity-100">See this farm →</p>
    </Link>
  );
}

// ---------------------------------------------------------------- climate ridge
function RidgeSection() {
  const [farm, setFarm] = useState("iowa");
  const f = FARMS.find((x) => x.id === farm)!;
  const [year, setYear] = useState(f.worst);
  useEffect(() => setYear(f.worst), [f.worst]);
  return (
    <section className="relative overflow-hidden border-y border-line bg-[#0b0c09] py-24 text-[#f1ead8]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Kicker>25 summers, one landscape</Kicker>
          <h2 className="display text-5xl sm:text-6xl">Every ridge is a year of heat.</h2>
          <p className="mt-5 max-w-md text-[#f1ead8]/75">
            NASA POWER daily maximum temperature for {f.name}, 2001 to 2025, as terrain: left to right is January to December,
            back to front is 2001 to 2025. Peaks are heatwaves. Drag to turn it.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {FARMS.map((x) => (
              <button key={x.id} onClick={() => setFarm(x.id)}
                className={cn("rounded-full border px-4 py-1.5 text-sm", x.id === farm ? "border-[#e8b64c] bg-[#e8b64c] text-[#0b0c09]" : "border-white/20 hover:border-[#e8b64c]")}>
                {x.short}
              </button>
            ))}
          </div>
          <label className="mt-8 block text-sm text-[#f1ead8]/70">
            Highlight year <span className="num ml-2 text-2xl text-[#e8b64c]">{year}</span>
            <input type="range" min={2001} max={2025} value={year} onChange={(e) => setYear(+e.target.value)} className="mt-2 block w-full accent-[#e8b64c]" />
          </label>
        </div>
        <div className="relative aspect-[4/3] w-full">
          <ClimateRidge farm={farm} year={year} className="!absolute inset-0" />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page
const STEPS = [
  { icon: "satellite", t: "NASA data in", d: "25 years of daily weather (POWER), soil (SoilGrids), crop greenness (MODIS), soil moisture (SMAP) and climate projections (NEX-GDDP-CMIP6) for the exact field." },
  { icon: "chart", t: "Simulated in Rust", d: "A crop and soil-water model replays every season for every rotation, in your browser via WebAssembly, in milliseconds." },
  { icon: "thermometer", t: "Stress tested", d: "We add heat and remove rain until the rotation fails: that is the Adaptation Margin. A quant engine runs 1,000 possible futures to 2050." },
  { icon: "spark", t: "Explained in plain words", d: "An AI explains the result using only the engine's numbers, and suggests rotations that fit the farmer's budget and machines." },
];
const DATA = [
  ["NASA POWER", "daily weather 2001–2025: temperature, rain, sun, humidity, root-zone wetness"],
  ["MODIS NDVI", "how green the crops really were, every 16 days (validation)"],
  ["SoilGrids 250 m", "sand, clay, carbon and density of the soil, layer by layer"],
  ["SMAP + ECOSTRESS", "soil moisture and crop water stress from orbit"],
  ["NEX-GDDP-CMIP6", "downscaled climate projections to 2050 and beyond"],
  ["NASA GIBS + NASADEM", "satellite imagery and terrain for every field on the map"],
];
const STATS = [
  ["~500 M", "small farms worldwide; 4 in 5 are exposed to worsening climate hazards"],
  ["−10 %", "US maize yield for every +1 °C of global warming (Zhao et al., PNAS 2017)"],
  ["€1.5–2 bn", "lost by Romanian farmers in the 2024 drought; winter wheat came through"],
  ["52 % / 28 %", "of US farmers see value in satellite data / know how to use it (NASA Acres survey)"],
];
const TEAM = [
  ["Albert", "Lead · Rust engine · server"],
  ["Ionut", "Stress test · quant · design"],
  ["Moldo", "Agronomy · crops · rules"],
  ["Luca", "Data pipeline · story · AI prompts"],
  ["Octa", "Frontend · 3D · the video"],
];

export function Landing() {
  useLenis();
  return (
    <>
      <SiteNav overlay />
      <main>
        <Hero />

        <section id="story" className="relative overflow-hidden py-24 sm:py-32">
          <div className="pointer-events-none absolute inset-0 text-fg opacity-[0.07]" style={{ backgroundImage: "url(/bg/topo.svg)", backgroundSize: "cover" }} />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
            <div>
              <Kicker>2012, seen from space</Kicker>
              <h2 className="display text-5xl sm:text-6xl">The summer the Corn Belt turned brown.</h2>
              <p className="mt-5 max-w-md text-fg-muted">
                A flash drought and weeks above 35 °C cut the US corn harvest by 13 %, the lowest yields since 1995.
                NASA satellites saw it field by field. FieldShift asks the next question: how often will 2012 come back, and which rotations survive it?
              </p>
            </div>
            <NdviCompare />
          </div>
        </section>

        <section id="margin" className="mx-auto max-w-7xl px-4 py-24 sm:px-10">
          <Kicker>One number per farm</Kicker>
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <h2 className="display max-w-3xl text-5xl sm:text-6xl">How much more climate can each rotation take?</h2>
            <p className="max-w-md text-fg-muted">Computed live in your browser from NASA data for three very different farms. Click one to dig in.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {FARMS.map((f) => <FarmCard key={f.id} farm={f} />)}
          </div>
        </section>

        <RidgeSection />

        <section id="demo" className="mx-auto max-w-7xl px-4 py-24 sm:px-10">
          <Kicker>Try it</Kicker>
          <h2 className="display mb-10 max-w-3xl text-5xl sm:text-6xl">Turn up the heat on a real farm.</h2>
          <LiteDemo />
        </section>

        <section id="how" className="border-y border-line bg-bg-elev/60 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-10">
            <Kicker>How it works</Kicker>
            <h2 className="display max-w-3xl text-5xl sm:text-6xl">The engine computes. The AI only explains.</h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line md:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.t} className="flex flex-col gap-4 bg-bg p-6">
                  <div className="flex items-center justify-between">
                    <span className="num text-xs text-fg-muted">0{i + 1}</span>
                    <span className="size-7 bg-gold" style={{ mask: `url(/icons/${s.icon}.svg) center/contain no-repeat`, WebkitMask: `url(/icons/${s.icon}.svg) center/contain no-repeat` }} aria-hidden />
                  </div>
                  <h3 className="display text-3xl">{s.t}</h3>
                  <p className="text-sm text-fg-muted">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="data" className="relative overflow-hidden bg-[#0b0c09] py-24 text-[#f1ead8]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-10 lg:grid-cols-2">
            <div className="relative order-2 aspect-square w-full max-w-[640px] lg:order-1">
              <Globe pins={FARMS} active="iowa" className="!absolute inset-0" />
            </div>
            <div className="order-1 lg:order-2">
              <Kicker>Built on NASA open data</Kicker>
              <h2 className="display text-5xl sm:text-6xl">Any field on Earth, from orbit.</h2>
              <p className="mt-5 max-w-md text-[#f1ead8]/75">Click anywhere on the map in the app and FieldShift builds that field&apos;s history in seconds, straight from NASA&apos;s public APIs.</p>
              <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
                {DATA.map(([k, v]) => (
                  <li key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
                    <span className="w-48 shrink-0 text-sm font-medium text-[#e8b64c]">{k}</span>
                    <span className="text-sm text-[#f1ead8]/70">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="why" className="mx-auto max-w-7xl px-4 py-24 sm:px-10">
          <Kicker>Why it matters</Kicker>
          <h2 className="display max-w-4xl text-5xl sm:text-6xl">The data exists. Farmers can&apos;t use it yet.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map(([n, d]) => (
              <div key={n} className="border-t border-line pt-5">
                <p className="display text-5xl text-gold">{n}</p>
                <p className="mt-3 text-sm text-fg-muted">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-fg-muted">Sources in docs/IMPACT_EVIDENCE.md. Diverse rotations cut drought-year yield losses by 14–90 % (Bowles et al., One Earth 2020).</p>
        </section>

        <section id="team" className="border-t border-line py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-10">
            <Kicker>Team</Kicker>
            <h2 className="display text-5xl sm:text-6xl">Five people, one weekend.</h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {TEAM.map(([n, r]) => (
                <li key={n} className="rounded-[var(--radius)] border border-line p-5">
                  <p className="display text-3xl">{n}</p>
                  <p className="mt-1 text-sm text-fg-muted">{r}</p>
                </li>
              ))}
            </ul>
            <div className="mt-16 flex flex-col items-start gap-4 rounded-[var(--radius)] bg-gold p-8 text-[#0b0c09] sm:flex-row sm:items-center sm:justify-between">
              <p className="display text-4xl">Find your farm&apos;s margin.</p>
              <Link href="/app" className="rounded-full bg-[#0b0c09] px-6 py-3 text-sm font-medium text-[#f1ead8]">Open the full app →</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
