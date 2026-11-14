"use client";
import { useEffect, useMemo, useState } from "react";
import { useFormat, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CropId, FarmPack } from "@/lib/engine/types";
import { computeImpact, defaultRotationFor, ROTATION_PRESETS, type Impact } from "@/lib/geo/impact";
import { findAnalog, townName } from "@/lib/geo/analog";
import type { ClimateStats } from "@/lib/geo/stats";
import { InfoTip } from "./info-tip";

const RISK_STYLE = {
  safe: { chip: "bg-ok text-white", box: "bg-ok-soft", dot: "bg-ok" },
  tight: { chip: "bg-warn text-white", box: "bg-warn-soft", dot: "bg-warn" },
  over: { chip: "bg-danger text-white", box: "bg-danger-soft", dot: "bg-danger" },
} as const;

/** "How you could be affected": typical rotation → traffic light, plain sentence, bad years today vs ~2050, climate analog. */
export function ImpactCard({ pack, stats }: { pack: FarmPack; stats: ClimateStats }) {
  const t = useT();
  const f = useFormat();
  const initial = useMemo(() => {
    const d = defaultRotationFor(pack).join("-");
    return ROTATION_PRESETS.find((p) => p.crops.join("-") === d)?.id ?? ROTATION_PRESETS[0].id;
  }, [pack]);
  const [preset, setPreset] = useState(initial);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => setPreset(initial), [initial]);

  useEffect(() => {
    let alive = true;
    const crops = ROTATION_PRESETS.find((p) => p.id === preset)!.crops;
    setImpact(null); setError(false);
    const id = setTimeout(() => {
      computeImpact(pack, crops).then((r) => alive && setImpact(r)).catch(() => alive && setError(true));
    }, 30);
    return () => { alive = false; clearTimeout(id); };
  }, [pack, preset]);

  const rotName = (crops: CropId[]) => crops.map((c) => t(`crops.${c}`).toLowerCase()).join(" → ");
  const deg = (v: number) => `${f.num(v, 1)} °C`;
  const analog = useMemo(() => impact ? findAnalog(pack.meta.lat, pack.meta.lon, stats.summerTemp, impact.dT2050) : null, [pack, stats.summerTemp, impact]);

  let sentence = "";
  if (impact) {
    const v = { rot: rotName(impact.rotation), dT: deg(impact.marginT), dT2050: deg(impact.dT2050), bad: impact.badToday, total: impact.years };
    sentence = t(impact.risk === "over" ? "mapTool.sentenceOver" : impact.risk === "tight" ? "mapTool.sentenceTight" : impact.marginCapped ? "mapTool.sentenceSafeCapped" : "mapTool.sentenceSafe", v);
  }
  const style = impact ? RISK_STYLE[impact.risk] : null;

  return (
    <section data-tour="impact" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">{t("mapTool.impactTitle")}</h3>
        <InfoTip text={t("mapTool.srcImpact")} align="right" />
      </div>
      <p className="mt-1 text-sm text-fg-muted">{t("mapTool.impactIntro")}</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("mapTool.rotationLabel")}>
        {ROTATION_PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => setPreset(p.id)}
            className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors", preset === p.id ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg")}>
            {t(`mapTool.rot_${p.id.replaceAll("-", "_")}`)}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{t("mapTool.impactError")}</p>}
      {!impact && !error && <p className="mt-4 animate-pulse text-sm text-fg-muted">{t("mapTool.impactRunning")}</p>}
      {impact && style && (
        <div className="mt-4 space-y-4">
          <div className={cn("rounded-xl p-4", style.box)}>
            <div className="flex items-center justify-between gap-3">
              <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", style.chip)}>{t(`common.risk_${impact.risk}`)}</span>
              {impact.risk !== "over" && (
                <span className="text-right text-xs text-fg-muted">{t("mapTool.marginLabel")}: <span className="num font-medium text-fg">{impact.marginCapped ? ">" : ""}{t("mapTool.marginValue", { dT: deg(impact.marginT) })}</span></span>
              )}
            </div>
            <p className="mt-3 text-[15px] leading-relaxed">{sentence}</p>
            <p className="mt-2 flex items-center gap-1 text-xs text-fg-muted">{t("mapTool.srcScenario")}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([["badYearsToday", impact.badToday], ["badYears2050", impact.bad2050]] as const).map(([k, n]) => (
              <div key={k} className="rounded-xl border border-line p-3">
                <p className="flex items-center gap-1 text-xs text-fg-muted">{t(`mapTool.${k}`)}{k === "badYearsToday" && <InfoTip text={t("mapTool.badYearDef")} />}</p>
                <p className={cn("num mt-1 text-xl font-semibold", n > impact.years * 0.2 ? "text-danger" : n > 0 ? "text-warn" : "text-ok")}>{t("mapTool.badYearsValue", { n, total: impact.years })}</p>
                <div className="mt-2 flex gap-[2px]" aria-hidden>
                  {Array.from({ length: impact.years }, (_, i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < n ? "bg-danger" : "bg-line")} />)}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-line p-4">
            <p className="flex items-center gap-1 text-xs font-medium text-fg-muted">{t("mapTool.analogTitle")}<InfoTip text={t("mapTool.srcAnalog")} /></p>
            {analog ? (
              <>
                <p className="mt-1.5 text-sm leading-relaxed">{t("mapTool.analogLine", { town: townName(analog.town, t.locale), country: analog.town.country, t: f.num(analog.town.summerT, 0), now: f.num(stats.summerTemp, 0) })}</p>
                <p className="mt-1 text-xs text-fg-subtle">{t("mapTool.analogApprox")}</p>
              </>
            ) : <p className="mt-1.5 text-sm text-fg-muted">{t("mapTool.analogNone")}</p>}
          </div>
          <p className="text-xs text-fg-subtle">{t("mapTool.impactNote")}</p>
        </div>
      )}
    </section>
  );
}
