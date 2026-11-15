"use client";
// Minimal cinematic landing hero: a piece of land as a point cloud with a satellite scan (3D, lazy-loaded), big quiet type.
// Followed by MarginBand: the one number the product is about.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocalePath, useSiteEnv } from "../env";
import { btn } from "../nav";
import { useSiteTheme } from "../theme";
import { HEAT_DAYS, HOT_YEAR } from "./heat";

const FieldScene = lazy(() => import("./field-scene"));

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function useWebGL() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try { setOk(!!document.createElement("canvas").getContext("webgl2")); } catch { /* no webgl */ }
  }, []);
  return ok;
}

const ease = [0.16, 1, 0.3, 1] as const;
const rise = (delay: number) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.1, delay, ease } });

export function HeroCinema() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const { theme } = useSiteTheme();
  const reduced = !!useReducedMotion();
  const gl = useWebGL();
  const [dense, setDense] = useState(true);
  useEffect(() => { setDense(!matchMedia("(max-width: 767px)").matches); }, []);
  const [active, setActive] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} id="top" className="grain relative overflow-hidden bg-[var(--stage)] text-fg">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(45%_50%_at_68%_62%,var(--glow),transparent_75%)]" />
      {gl && (
        <SceneBoundary>
          <Suspense fallback={null}>
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2.4, ease }}>
              <FieldScene progress={scrollYProgress} theme={theme} active={active} reduced={reduced} dense={dense} />
            </motion.div>
          </Suspense>
        </SceneBoundary>
      )}
      {/* keep the copy readable over the points */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--stage)] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[var(--stage)] lg:via-[var(--stage)]/40" />

      <div className="relative z-[2] mx-auto flex min-h-[100svh] max-w-7xl items-end px-4 pb-28 pt-24 sm:px-8 lg:items-center lg:pb-16">
        <motion.div style={{ opacity: fade }} className="max-w-2xl">
          <motion.p {...rise(0.1)} className="kicker text-fg-muted">{t("site.heroEyebrow")}</motion.p>
          <h1 className="headline mt-6 text-[clamp(3.6rem,9vw,8.5rem)]">
            <motion.span {...rise(0.2)} className="block">{t("site.cineTitleA")}</motion.span>
            <motion.span {...rise(0.32)} className="block text-fg-subtle">{t("site.cineTitleB")}</motion.span>
          </h1>
          <motion.p {...rise(0.45)} className="mt-8 max-w-md text-pretty text-lg leading-relaxed text-fg-muted">{t("site.heroTitle")}</motion.p>
          <motion.div {...rise(0.55)} className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link href={p("/map")} className={btn("primary", "lg")}>{t("site.heroCta")}<ArrowRight className="size-4" /></Link>
            <Link href={`${p()}#how`} className="text-sm font-medium text-fg-muted underline-offset-8 hover:text-fg hover:underline">{t("site.heroCta2")}</Link>
          </motion.div>
        </motion.div>
      </div>

      <motion.div style={{ opacity: fade }} className="absolute inset-x-0 bottom-0 z-[2]">
        <div className="mx-auto flex max-w-7xl items-center gap-6 border-t border-line px-4 py-5 sm:px-8">
          <p className="kicker text-fg-subtle">{t("site.heroTrust")}</p>
        </div>
      </motion.div>
    </section>
  );
}

/** One number, full screen: the adaptation margin, with the 25-year record that backs it. */
export function MarginBand() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  const hot = HEAT_DAYS.filter((d) => d >= HOT_YEAR).length;
  const max = Math.max(...HEAT_DAYS);
  const inView = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-15% 0px" } };
  return (
    <section className="grain relative overflow-hidden border-t border-line bg-[var(--stage)] text-fg">
      <div className="relative z-[2] mx-auto max-w-7xl px-4 py-28 sm:px-8 sm:py-40">
        <motion.p {...inView} transition={{ duration: 1, ease }} className="kicker text-[var(--accent-ink)]">{t("site.cine3Kicker")}</motion.p>
        <div className="mt-8 grid items-end gap-12 lg:grid-cols-[1.2fr_1fr]">
          <motion.div {...inView} transition={{ duration: 1.1, delay: 0.1, ease }}>
            <h2 className="headline text-[clamp(2.4rem,4.5vw,4rem)] text-fg-muted">{t("site.cine3Title")}</h2>
            <p className="headline mt-2 text-[clamp(6rem,17vw,15rem)] leading-[0.85]">{t("site.cine3Value")}</p>
            <p className="kicker mt-6 text-fg-subtle">{t("site.cine3Example")}</p>
          </motion.div>
          <motion.div {...inView} transition={{ duration: 1.1, delay: 0.25, ease }}>
            <p className="max-w-md text-pretty text-lg leading-relaxed text-fg-muted">{t("site.cine3Body")}</p>
            <Link href={p("/map")} className={cn(btn("primary", "lg"), "mt-8")}>{t("site.cine3Cta")}<ArrowRight className="size-4" /></Link>
          </motion.div>
        </div>

        {/* 25 summers: one bar per year, hot years in the heat colour */}
        <motion.figure {...inView} transition={{ duration: 1.2, delay: 0.2, ease }} className="mt-24">
          <div className="flex h-28 items-end gap-[3px] sm:gap-1.5" aria-hidden>
            {HEAT_DAYS.map((d, i) => (
              <motion.span key={i} className={cn("flex-1 origin-bottom rounded-[2px]", d >= HOT_YEAR ? "bg-heat" : "bg-line-strong")}
                style={{ height: `${Math.max(4, (d / max) * 100)}%` }}
                initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.3 + i * 0.03, ease }} />
            ))}
          </div>
          <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-3 text-sm text-fg-muted">
            <span className="num text-xs text-fg-subtle">2001</span>
            <span>{t("site.cineBars", { hot })}</span>
            <span className="num text-xs text-fg-subtle">2025</span>
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
