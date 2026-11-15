"use client";
// O4: drought replay. One shared calendar (Oct 1 of the previous year to Dec 31), a panel per rotation,
// an animated soil-water tank per crop, Tmax with the heat threshold, and MODIS NDVI vs the median year.
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useF, useNames } from "@/components/field/hooks";
import { pickKey } from "@/components/field/numbers";
import { useT } from "@/lib/i18n";
import { getEngine, type Rotation, type SeasonResult } from "@/lib/engine";
import { useApp } from "@/lib/store/app";
import { useReplay } from "@/lib/store/replay";
import { axisDays, doyOf, startDay } from "./calendar";
import { ReplayControls } from "./controls";
import { CropCard } from "./crop-card";
import { NdviChart } from "./ndvi-chart";

/** Days of the calendar per real second at 1× (the whole 15-month year plays in ~15 s). */
const DAYS_PER_SEC = 30;

interface PanelData { id: string; rot: Rotation; seasons: SeasonResult[] }

function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

export function DroughtReplay() {
  const t = useT();
  const handle = useApp((s) => s.handle);
  const farmId = useApp((s) => s.farmId);
  const pack = useApp((s) => s.pack);
  const base = useApp((s) => s.base);
  const rotation = useApp((s) => s.rotation);
  const opts = useApp((s) => s.opts);
  const picks = useApp((s) => s.picks);

  const { year: chosen, day, playing, speed } = useReplay();
  const { setYear, setDay, play, pause, setSpeed, restart, resetFor } = useReplay.getState();
  const reduced = usePrefersReducedMotion();

  useEffect(() => { resetFor(farmId); }, [farmId, resetFor]);

  const years = base?.years ?? [];
  const year = chosen != null && years.includes(chosen) ? chosen : base?.worstYear ?? years[years.length - 1] ?? null;
  const days = year ? axisDays(year) : 0;

  // ---- traced seasons for the current rotation and every pick (debounced: sliders recompute often)
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [busy, setBusy] = useState(false);
  const picksKey = picks.map((p) => p.label + p.rot.map((s) => s.crop + s.cover).join()).join("|");
  useEffect(() => {
    if (!handle || !year || !rotation.length) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const fs = getEngine();
        const targets = [{ id: "current", rot: rotation }, ...picks.map((p) => ({ id: p.label, rot: p.rot }))];
        const res = await Promise.all(targets.map((tg) => fs.simulateRotation(handle, tg.rot, opts, year)));
        if (cancelled) return;
        setPanels(targets.map((tg, i) => ({ ...tg, seasons: res[i].traced ?? [] })));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
    // picksKey stands in for `picks` (the array identity changes on every recompute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, rotation, opts, picksKey, year]);

  // ---- animation loop
  const acc = useRef(0);
  useEffect(() => {
    if (!playing || !days) return;
    if (useReplay.getState().day >= days - 1) setDay(0);
    acc.current = useReplay.getState().day;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc.current += dt * DAYS_PER_SEC * useReplay.getState().speed;
      if (acc.current >= days - 1) { setDay(days - 1); pause(); return; }
      const d = Math.floor(acc.current);
      if (d !== useReplay.getState().day) setDay(d);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, days, setDay, pause]);

  // autoplay once when the replay scrolls into view (never with reduced motion)
  const root = useRef<HTMLDivElement>(null);
  const auto = useRef(false);
  const ready = panels.length > 0;
  useEffect(() => {
    if (reduced || !ready || auto.current || !root.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !auto.current && useReplay.getState().day === 0) { auto.current = true; play(); }
    }, { threshold: 0.35 });
    io.observe(root.current);
    return () => io.disconnect();
  }, [reduced, ready, play]);

  // shared Tmax scale so every chart is comparable
  const tmaxDomain = useMemo<[number, number]>(() => {
    let lo = Infinity, hi = -Infinity;
    for (const p of panels) for (const s of p.seasons) if (s.trace) {
      for (const v of s.trace.tmax) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      hi = Math.max(hi, s.trace.heat);
    }
    return Number.isFinite(lo) ? [Math.floor(Math.min(lo, 0)) - 1, Math.ceil(hi) + 2] : [0, 45];
  }, [panels]);

  const onToggle = () => (playing ? pause() : play());
  const onDay = (d: number) => { pause(); setDay(d); }; // jump on scrub

  if (!pack || !base || !year) {
    return <Card><h3 className="display text-2xl">{t("replay.title")}</h3><p className="mt-2 text-sm text-fg-muted">{t("replay.pick_farm")}</p></Card>;
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5" data-tour="replay">
      <div ref={root} className="flex flex-col gap-3">
        <div>
          <h3 className="display text-2xl">{t("replay.title")}</h3>
          <p className="mt-1 text-sm text-fg-muted">
            {t("replay.intro", { year, worst: year === base.worstYear ? t("replay.intro_worst") : "" })}
          </p>
        </div>
        <ReplayControls
          years={years} year={year} days={days} day={Math.min(day, days - 1)} playing={playing} speed={speed} worstYear={base.worstYear}
          onYear={setYear} onDay={onDay} onToggle={onToggle} onRestart={restart} onSpeed={setSpeed}
        />
        <NdviChart ndvi={pack.ndvi} year={year} doy={doyOf(year, day)} />
        <div className={cn("flex flex-col gap-3 transition-opacity", busy && "opacity-60")}>
          {panels.map((p) => (
            <Panel key={p.id} panel={p} year={year} days={days} day={day} tmaxDomain={tmaxDomain} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function Panel({ panel, year, days, day, tmaxDomain }: { panel: PanelData; year: number; days: number; day: number; tmaxDomain: [number, number] }) {
  const t = useT();
  const f = useF();
  const nm = useNames();
  const seasons = useMemo(
    () => [...panel.seasons].sort((a, b) => startDay(year, a.sow) - startDay(year, b.sow)),
    [panel.seasons, year],
  );
  const done = seasons.every((s) => !s.trace || day >= startDay(year, s.sow) + s.trace.fill.length - 1);
  const net = seasons.length ? Math.round(seasons.reduce((a, s) => a + s.net, 0) / seasons.length) : 0;
  const names = nm.rotation(panel.rot);
  const label = panel.id === "current" ? t("replay.your_rotation") : t(`analysis.pick_${pickKey(panel.id)}`);
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-3">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{label}</h4>
          <p className="truncate text-xs text-fg-muted">{names}</p>
        </div>
        <div className={cn("num text-sm transition-opacity duration-500", done ? "opacity-100" : "opacity-0", net < 0 ? "text-danger" : "text-ok")}>
          {t("replay.farm_income", { amount: f.money(net) })}
        </div>
      </header>
      <div className="grid gap-2 @xl:grid-cols-2 @5xl:grid-cols-3">
        {seasons.map((s, i) => (
          <CropCard key={`${s.crop}-${i}`} season={s} year={year} days={days} day={day} tmaxDomain={tmaxDomain} />
        ))}
      </div>
    </section>
  );
}
