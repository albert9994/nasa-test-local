"use client";
import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  Bell, Bot, Check, ChevronDown, Download, FileText, Gauge, Layers, Laptop, Minus, Monitor, MousePointerClick, Pentagon, Satellite, Sprout, ThermometerSun,
  Database, Globe, Mountain, CloudRain, Droplets, type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocalePath, useSiteEnv } from "./env";
import { btn } from "./nav";
import { ProductPreview } from "./product-preview";

/** Fades and lifts its children in once they scroll into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }} transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

export function Section({ id, className, children, tone }: { id?: string; className?: string; children: ReactNode; tone?: "alt" }) {
  return (
    <section id={id} className={cn("scroll-mt-16", tone === "alt" && "border-y border-line bg-surface", className)}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-32">{children}</div>
    </section>
  );
}
function Heading({ kicker, title, sub, center }: { kicker?: string; title: string; sub?: string; center?: boolean }) {
  return (
    <Reveal className={cn("max-w-3xl", center && "mx-auto text-center")}>
      {kicker && <p className="kicker mb-4 text-[var(--accent-ink)]">{kicker}</p>}
      <h2 className="headline text-balance text-[clamp(2.5rem,5.5vw,4.75rem)]">{title}</h2>
      {sub && <p className={cn("mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-fg-muted", center && "mx-auto")}>{sub}</p>}
    </Reveal>
  );
}

// ---------- how it works ----------
export function HowItWorks() {
  const t = useT();
  const steps: [LucideIcon, string][] = [[Pentagon, "how1"], [Database, "how2"], [Gauge, "how3"]];
  return (
    <Section id="how">
      <Heading kicker={t("site.kHow")} title={t("site.howTitle")} sub={t("site.howSub")} />
      <ol className="mt-16 grid gap-px overflow-hidden border-y border-line md:grid-cols-3 md:border-x-0">
        {steps.map(([Icon, k], i) => (
          <li key={k} className={cn("relative py-10 md:px-8 md:py-4", i > 0 && "border-t border-line md:border-l md:border-t-0", i === 0 && "md:pl-0")}>
            <Reveal delay={i * 0.12}>
              <span className="headline block text-[6.5rem] leading-none text-transparent [-webkit-text-stroke:1.5px_var(--line-strong)]">0{i + 1}</span>
              <span className="mt-6 flex items-center gap-3 text-primary"><Icon className="size-5" /><span className="h-px flex-1 bg-line" /></span>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{t(`site.${k}T`)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t(`site.${k}B`)}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ---------- showcase (the free map) ----------
export function Showcase() {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  return (
    <section id="showcase" className="grain relative overflow-hidden border-y border-line bg-[var(--stage)]">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_45%_at_50%_62%,var(--glow),transparent_70%)]" />
      <div className="relative z-[2] mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-32">
        <Heading center kicker={t("site.kShow")} title={t("site.showTitle")} sub={t("site.showSub")} />
        <div ref={ref} className="mx-auto mt-14 max-w-5xl [perspective:1400px]">
          <motion.div style={{ rotateX, scale, transformOrigin: "50% 100%" }}><ProductPreview /></motion.div>
        </div>
      </div>
    </section>
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
      <Heading kicker={t("site.kFeat")} title={t("site.featTitle")} sub={t("site.featSub")} />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([Icon, k, tag], i) => (
          <Reveal key={k} delay={(i % 4) * 0.07} className="h-full">
          <div className="group flex h-full flex-col rounded-2xl border border-line bg-bg p-6 transition-[border-color,transform,box-shadow] duration-500 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_24px_50px_-28px_var(--glow)]">
            <div className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-lg bg-surface text-primary ring-1 ring-line"><Icon className="size-5" /></span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", tag === "tagFree" ? "bg-ok-soft text-ok" : tag === "tagPro" ? "bg-data-soft text-data" : "bg-surface-2 text-fg-muted")}>{t(`site.${tag}`)}</span>
            </div>
            <h3 className="mt-4 font-semibold tracking-tight">{t(`site.${k}T`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{t(`site.${k}B`)}</p>
          </div>
          </Reveal>
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
      <Heading kicker={t("site.kData")} title={t("site.dataTitle")} sub={t("site.dataSub")} />
      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
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
      <Heading center kicker={t("site.kPrice")} title={t("site.priceTitle")} sub={t("site.priceSub")} />
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
/** Installers are served by the website itself (scripts/fetch-installers.mjs copies them from the GitHub release). */
export const DESKTOP_VERSION = "2.1.0";
const DL = { mac: "/downloads/FieldShift-mac-apple-silicon.dmg", macIntel: "/downloads/FieldShift-mac-intel.dmg", win: "/downloads/FieldShift-windows-setup.exe" };
export function DesktopDownload() {
  const t = useT();
  return (
    <section id="download" className="scroll-mt-16 px-4 py-20 sm:px-6 sm:py-28">
      <Reveal className="grain relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-line bg-[var(--stage)] p-8 sm:p-14">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_80%_at_85%_20%,var(--glow),transparent_70%)]" />
        <div className="relative z-[2] grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <span className="grid size-12 place-items-center rounded-xl border border-line bg-surface text-primary"><Laptop className="size-6" /></span>
            <h2 className="headline mt-7 text-balance text-[clamp(2.4rem,5vw,4.25rem)]">{t("site.dlTitle")}</h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">{t("site.dlSub")}</p>
          </div>
          <div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <a href={DL.mac} download className={cn(btn("primary", "lg"), "flex-1")}><Download className="size-4" />{t("site.dlMac")}</a>
              <a href={DL.win} download className={cn(btn("outline", "lg"), "flex-1")}><Monitor className="size-4" />{t("site.dlWin")}</a>
            </div>
            <p className="mt-3 text-sm text-fg-muted">
              <a href={DL.macIntel} download className="underline underline-offset-4 hover:text-fg">{t("site.dlMacIntel")}</a>
              <span className="mx-2 text-fg-subtle">·</span>
              <span>{t("site.dlVersion", { v: DESKTOP_VERSION })}</span>
            </p>
            <p className="mt-4 text-sm text-fg-muted">{t("site.dlNote")}</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ---------- FAQ ----------
export function Faq() {
  const t = useT();
  return (
    <Section id="faq" tone="alt">
      <Heading kicker={t("site.kFaq")} title={t("site.faqTitle")} />
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
    <section className="grain relative overflow-hidden border-t border-line bg-[var(--stage)]">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_100%,var(--glow),transparent_70%)]" />
      <Reveal className="relative z-[2] mx-auto max-w-5xl px-4 py-28 text-center sm:px-6 sm:py-40">
        <h2 className="headline mx-auto text-balance text-[clamp(2.8rem,7.5vw,6.5rem)]">{t("site.ctaTitle")}</h2>
        <p className="mt-6 text-lg text-fg-muted">{t("site.ctaBody")}</p>
        <Link href={p("/map")} className={cn(btn("primary", "lg"), "mt-10")}>{t("site.heroCta")}</Link>
      </Reveal>
    </section>
  );
}
