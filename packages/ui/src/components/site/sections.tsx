"use client";
import type { ReactNode } from "react";
import {
  Bell, Bot, Check, ChevronDown, Download, FileText, Gauge, Layers, Laptop, Minus, Monitor, MousePointerClick, Pentagon, Satellite, Sprout, ThermometerSun,
  Database, Globe, Mountain, CloudRain, Droplets, type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocalePath, useSiteEnv } from "./env";
import { btn } from "./nav";

export function Section({ id, className, children, tone }: { id?: string; className?: string; children: ReactNode; tone?: "alt" }) {
  return (
    <section id={id} className={cn("scroll-mt-16", tone === "alt" && "border-y border-line bg-surface", className)}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">{children}</div>
    </section>
  );
}
function Heading({ title, sub, center }: { title: string; sub?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-pretty text-lg text-fg-muted">{sub}</p>}
    </div>
  );
}

// ---------- how it works ----------
export function HowItWorks() {
  const t = useT();
  const steps: [LucideIcon, string][] = [[Pentagon, "how1"], [Database, "how2"], [Gauge, "how3"]];
  return (
    <Section id="how">
      <Heading title={t("site.howTitle")} sub={t("site.howSub")} />
      <ol className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map(([Icon, k], i) => (
          <li key={k} className="relative rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" /></span>
              <span className="num text-sm text-fg-subtle">0{i + 1}</span>
            </div>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">{t(`site.${k}T`)}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t(`site.${k}B`)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ---------- features ----------
const FEATURES: [LucideIcon, string, "tagFree" | "tagPro" | "tagSoon"][] = [
  [MousePointerClick, "f1", "tagFree"], [Gauge, "f2", "tagFree"], [ThermometerSun, "f3", "tagPro"], [Layers, "f4", "tagPro"],
  [Sprout, "f5", "tagPro"], [Bot, "f6", "tagPro"], [FileText, "f7", "tagPro"], [Bell, "f8", "tagSoon"],
];
export function Features() {
  const t = useT();
  return (
    <Section id="product" tone="alt">
      <Heading title={t("site.featTitle")} sub={t("site.featSub")} />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([Icon, k, tag]) => (
          <div key={k} className="flex flex-col rounded-2xl border border-line bg-bg p-5">
            <div className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-lg bg-surface text-primary ring-1 ring-line"><Icon className="size-5" /></span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", tag === "tagFree" ? "bg-ok-soft text-ok" : tag === "tagPro" ? "bg-data-soft text-data" : "bg-surface-2 text-fg-muted")}>{t(`site.${tag}`)}</span>
            </div>
            <h3 className="mt-4 font-semibold tracking-tight">{t(`site.${k}T`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{t(`site.${k}B`)}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------- data ----------
const DATA: [LucideIcon, string, "dataStatusMap" | "dataStatusDesktop" | "dataStatusSoon"][] = [
  [CloudRain, "d1", "dataStatusMap"], [Sprout, "d2", "dataStatusMap"], [Satellite, "d3", "dataStatusSoon"], [Droplets, "d4", "dataStatusSoon"],
  [CloudRain, "d5", "dataStatusSoon"], [ThermometerSun, "d6", "dataStatusDesktop"], [Mountain, "d7", "dataStatusSoon"], [Globe, "d8", "dataStatusMap"],
];
export function DataSources() {
  const t = useT();
  return (
    <Section id="data">
      <Heading title={t("site.dataTitle")} sub={t("site.dataSub")} />
      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        {DATA.map(([Icon, k, st]) => (
          <div key={k} className="flex gap-4 bg-surface p-5">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-data-soft text-data"><Icon className="size-[18px]" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold tracking-tight">{t(`site.${k}T`)}</h3>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", st === "dataStatusMap" ? "bg-ok-soft text-ok" : st === "dataStatusDesktop" ? "bg-data-soft text-data" : "bg-surface-2 text-fg-muted")}>{t(`site.${st}`)}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{t(`site.${k}B`)}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-fg-muted">{t("site.dataOther")}</p>
    </Section>
  );
}

// ---------- pricing ----------
export function PricingTiers() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  const tiers = [
    { k: "pFree", n: 4, cta: p("/map"), price: true },
    { k: "pPro", n: 5, cta: `${p()}#download`, hot: true },
    { k: "pAdv", n: 5, cta: `${p()}#download` },
  ];
  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-3">
        {tiers.map(({ k, n, cta, hot, price }) => (
          <div key={k} className={cn("relative flex flex-col rounded-2xl border bg-surface p-7", hot ? "border-primary shadow-[var(--shadow)] ring-1 ring-primary" : "border-line")}>
            {hot && <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-fg">{t("site.pPopular")}</span>}
            <h3 className="text-lg font-semibold">{t(`site.${k}Name`)}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t(`site.${k}Desc`)}</p>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight">{t(`site.${k}Price`)}</span>
              <span className="text-sm text-fg-muted">{t(`site.${k}Unit`)}</span>
            </p>
            <p className="mt-1 h-5 text-xs text-fg-subtle">{price ? "" : t("site.priceVat")}</p>
            <ul className="mt-6 space-y-3 text-sm">
              {Array.from({ length: n }, (_, i) => (
                <li key={i} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-ok" /><span>{t(`site.${k}${i + 1}`)}</span></li>
              ))}
            </ul>
            <Link href={cta} className={cn(btn(hot ? "primary" : "outline"), "mt-8 w-full")}>{t(`site.${k}Cta`)}</Link>
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-fg-muted">{t("site.priceNote")}</p>
    </div>
  );
}

export function PricingSection() {
  const t = useT();
  return (
    <Section id="pricing" tone="alt">
      <Heading center title={t("site.priceTitle")} sub={t("site.priceSub")} />
      <div className="mt-14"><PricingTiers /></div>
    </Section>
  );
}

export function PlanComparison() {
  const t = useT();
  const rows: [string, ReactNode, ReactNode, ReactNode][] = [
    ["cmpRow1", true, true, true], ["cmpRow2", true, true, true], ["cmpRow3", true, true, true],
    ["cmpRow4", t("site.cmpFree1"), t("site.cmpProN"), t("site.cmpAdvN")],
    ["cmpRow5", false, true, true], ["cmpRow6", false, true, true], ["cmpRow7", false, true, true], ["cmpRow8", false, true, true],
    ["cmpRow9", false, true, true], ["cmpRow10", false, true, true], ["cmpRow11", false, false, true],
  ];
  const cell = (v: ReactNode) => v === true ? <Check className="mx-auto size-4 text-ok" aria-label={t("site.cmpYes")} /> : v === false ? <Minus className="mx-auto size-4 text-fg-subtle" aria-label={t("site.cmpNo")} /> : <span className="text-sm">{v}</span>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{t("site.cmpTitle")}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th className="px-5 py-3 font-medium">{t("site.cmpFeature")}</th>
            {["pFreeName", "pProName", "pAdvName"].map((k) => <th key={k} className="px-4 py-3 text-center font-medium">{t(`site.${k}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b, c]) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="px-5 py-3 text-fg-muted">{t(`site.${k}`)}</td>
              {[a, b, c].map((v, i) => <td key={i} className="px-4 py-3 text-center">{cell(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- download ----------
export function DesktopDownload() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  return (
    <Section id="download">
      <div className="overflow-hidden rounded-3xl bg-primary p-8 text-primary-fg sm:p-12">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="grid size-12 place-items-center rounded-xl bg-white/10"><Laptop className="size-6" /></span>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{t("site.dlTitle")}</h2>
            <p className="mt-4 max-w-xl text-lg text-primary-fg/80">{t("site.dlSub")}</p>
          </div>
          <div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link href={`${p()}#download`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-base font-medium text-primary hover:bg-primary-soft"><Download className="size-4" />{t("site.dlMac")}</Link>
              <Link href={`${p()}#download`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/40 px-6 text-base font-medium hover:bg-white/10"><Monitor className="size-4" />{t("site.dlWin")}</Link>
            </div>
            <p className="mt-4 text-sm text-primary-fg/70">{t("site.dlNote")}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ---------- FAQ ----------
export function Faq() {
  const t = useT();
  return (
    <Section id="faq" tone="alt">
      <Heading title={t("site.faqTitle")} />
      <div className="mt-10 max-w-3xl divide-y divide-line rounded-2xl border border-line bg-bg">
        {Array.from({ length: 8 }, (_, i) => i + 1).map((i) => (
          <details key={i} className="group px-6 py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {t(`site.q${i}`)}<ChevronDown className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-5 pr-8 text-[15px] leading-relaxed text-fg-muted">{t(`site.a${i}`)}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function FinalCta() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  return (
    <Section>
      <div className="text-center">
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("site.ctaTitle")}</h2>
        <p className="mt-4 text-lg text-fg-muted">{t("site.ctaBody")}</p>
        <Link href={p("/map")} className={cn(btn("primary", "lg"), "mt-8")}>{t("site.heroCta")}</Link>
      </div>
    </Section>
  );
}
