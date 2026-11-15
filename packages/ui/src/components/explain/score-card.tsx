"use client";
// Hotar Score card (C12): big score, confidence, sub-score bars, SVG waterfall. Server first, client fallback.
import { useEffect, useMemo, useState } from "react";
import type { ScoreResult } from "@/lib/engine/types";
import { useT } from "@/lib/i18n";
import { useReasons } from "@/lib/i18n/reasons";
import { useApp } from "@/lib/store/app";
import { useNames } from "@/components/field/hooks";
import { cn } from "@/lib/utils";
import { fetchScore } from "./api";
import { computeScore } from "./score";

const SUB: { key: keyof ScoreResult["subscores"]; color: string }[] = [
  { key: "climate", color: "var(--heat)" },
  { key: "financialRisk", color: "var(--data)" },
  { key: "profit", color: "var(--primary)" },
  { key: "soil", color: "var(--soil)" },
  { key: "water", color: "var(--water)" },
  { key: "feasibility", color: "var(--leaf)" },
];

export function Waterfall({ steps }: { steps: [string, number][] }) {
  const t = useT();
  // base → rules → llm → final; deltas float from the running total
  const W = 320, H = 150, pad = 22, bw = 46;
  const max = Math.max(100, ...steps.map((s) => s[1]));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  let run = 0;
  const bars = steps.map(([name, v], i) => {
    const total = name === "base" || name === "final";
    const from = total ? 0 : run, to = total ? v : run + v;
    if (total) run = v; else run = to;
    const x = 12 + i * ((W - 24 - bw) / Math.max(1, steps.length - 1));
    const top = y(Math.max(from, to)), h = Math.max(2, Math.abs(y(from) - y(to)));
    const color = total ? (name === "final" ? "var(--primary)" : "var(--fg-subtle)") : v >= 0 ? "var(--leaf)" : "var(--heat)";
    return { name, v, x, top, h, color, total };
  });
  const label = (n: string) => { const k = `explain.wf_${n}`; const s = t(k); return s === k ? n : s; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="w-full" aria-label={`${t("explain.wf_aria")}: ${steps.map(([n, v]) => `${label(n)} ${v}`).join(", ")}`}>
      <line x1="8" x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      {bars.map((b) => (
        <g key={b.name}>
          <rect x={b.x} y={b.top} width={bw} height={b.h} rx="4" fill={b.color} />
          <text x={b.x + bw / 2} y={b.top - 5} textAnchor="middle" className="num" fontSize="12" fill="var(--fg)">
            {b.total ? b.v : `${b.v > 0 ? "+" : b.v < 0 ? "−" : ""}${Math.abs(b.v)}`}
          </text>
          <text x={b.x + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">{label(b.name)}</text>
        </g>
      ))}
    </svg>
  );
}

export function useScore(): { score: ScoreResult | null; source: "server" | "client" | null } {
  const base = useApp((s) => s.base);
  const margin = useApp((s) => s.margin);
  const rotation = useApp((s) => s.rotation);
  const opts = useApp((s) => s.opts);
  const farmId = useApp((s) => s.farmId);
  const { rotation: label } = useNames();
  const text = label(rotation);
  const local = useMemo(
    () => (base && margin && rotation.length ? computeScore({ label: text, rotation, base, margin }) : null),
    [base, margin, rotation, text],
  );
  const [remote, setRemote] = useState<ScoreResult | null>(null);
  useEffect(() => {
    setRemote(null);
    if (!local) return;
    let alive = true;
    fetchScore({ farmId, rotation, opts }).then((r) => { if (alive) setRemote(r); });
    return () => { alive = false; };
  }, [local, farmId, rotation, opts]);
  if (remote) return { score: remote, source: "server" };
  return local ? { score: local, source: "client" } : { score: null, source: null };
}

/** Engine rules carry a code (localised in reasons.ts); the client-side fallback rules have `explain.rule_<id>`; else the English reason. */
function ruleText(t: ReturnType<typeof useT>, reasons: ReturnType<typeof useReasons>, r: ScoreResult["rules"][number]) {
  if (r.code) return reasons.rule(r);
  const k = `explain.rule_${r.id}`; const s = t(k);
  return s === k ? r.reason : s;
}

export function ScoreCard() {
  const t = useT();
  const reasons = useReasons();
  const { score, source } = useScore();
  if (!score) return <p className="text-sm text-fg-muted">{t("explain.score_computing")}</p>;
  const tone = score.score >= 70 ? "text-ok" : score.score >= 45 ? "text-warn" : "text-danger";
  return (
    <section aria-label={t("explain.score_title")} className="grid gap-5 @2xl:grid-cols-2" data-tour="score-card">
      <div>
        <div className="flex items-end gap-4">
          <span className={cn("display num text-7xl", tone)}>{score.score}</span>
          <div className="pb-1 text-sm text-fg-muted">
            <div>{t("explain.score_of")} · {t("explain.score_title")}</div>
            <div>{t("explain.score_confidence")} <strong className="text-fg">{t(`explain.conf_${score.confidence}`)}</strong></div>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {SUB.map((s) => (
            <li key={s.key} className="grid grid-cols-[110px_1fr_28px] items-center gap-2 text-xs">
              <span className="text-fg-muted">{t(`explain.sub_${s.key}`)}</span>
              <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" role="presentation" aria-hidden>
                <rect width="100" height="8" rx="4" fill="var(--surface-2)" />
                <rect width={Math.max(2, score.subscores[s.key])} height="8" rx="4" fill={s.color} />
              </svg>
              <span className="num text-right">{score.subscores[s.key]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-sm font-medium">{t("explain.built")}</h4>
        <Waterfall steps={score.waterfall} />
        <ul className="mt-1 space-y-1 text-xs text-fg-muted">
          {score.rules.map((r) => (
            <li key={r.id}><span className={cn("num", r.delta >= 0 ? "text-ok" : "text-danger")}>{r.delta > 0 ? "+" : "−"}{Math.abs(r.delta)}</span> {ruleText(t, reasons, r)}</li>
          ))}
          {score.llm ? <li><span className="num">{score.llm.delta > 0 ? "+" : "−"}{Math.abs(score.llm.delta)}</span> {t("explain.llm_adjust")}: {score.llm.reason}</li> : null}
        </ul>
        <p className="mt-2 text-[11px] text-fg-muted">
          {source === "server" ? t("explain.score_from_server") : t("explain.score_from_client")}. {t("explain.score_weights")} {t("explain.score_note")}
        </p>
      </div>
    </section>
  );
}
