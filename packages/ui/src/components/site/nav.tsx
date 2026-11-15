"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocalePath, useSiteEnv } from "./env";
import { Logo } from "./logo";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme";

const EASE = [0.16, 1, 0.3, 1] as const;

export const btn = (variant: "primary" | "outline" | "ghost" = "primary", size: "sm" | "md" | "lg" = "md") =>
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors",
    size === "sm" && "h-9 px-4 text-sm", size === "md" && "h-10 px-5 text-sm", size === "lg" && "h-12 px-7 text-base",
    variant === "primary" && "bg-primary text-primary-fg hover:bg-primary-hover",
    variant === "outline" && "border border-line-strong bg-surface text-fg hover:bg-surface-2",
    variant === "ghost" && "text-fg-muted hover:bg-surface-2 hover:text-fg",
  );

/** `overlay`: floats transparently over a full-bleed hero and turns solid once the page scrolls. */
export function SiteNav({ overlay = false }: { overlay?: boolean }) {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  const [open, setOpen] = useState(false);
  const links = [
    ["navProduct", "#product"], ["navHow", "#how"], ["navData", "#data"], ["navPricing", "#pricing"], ["navFaq", "#faq"],
  ] as const;
  const close = () => setOpen(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!overlay) return;
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [overlay]);
  // full-screen menu: lock page scroll and close on Escape while it is open
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);
  const clear = (overlay && !scrolled) || open;
  return (
    <>
    <header className={cn("top-0 z-50 border-b transition-[background-color,border-color] duration-500",
      overlay ? "fixed inset-x-0" : "sticky", clear ? "border-transparent bg-transparent" : "border-line bg-bg/80 backdrop-blur-md")}>
      <div className={cn("mx-auto flex h-16 items-center gap-6 px-4 sm:px-6", overlay ? "max-w-7xl sm:px-8" : "max-w-6xl")}>
        <Link href={p()} aria-label="Hotar" onClick={close}><Logo /></Link>
        <nav className="ml-2 hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {links.map(([k, h]) => (
            <Link key={k} href={`${p()}${h}`} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">{t(`site.${k}`)}</Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          <LocaleSwitcher />
          <Link href={p("/signin")} className={btn("ghost", "sm")}>{t("site.navSignin")}</Link>
          <Link href={p("/map")} className={btn("primary", "sm")}>{t("site.navTry")}</Link>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <LocaleSwitcher />
          <button type="button" aria-expanded={open} aria-controls="site-menu" aria-label={open ? t("site.navClose") : t("site.navMenu")} onClick={() => setOpen(!open)}
            className="relative grid size-10 place-items-center overflow-hidden rounded-full border border-line bg-surface">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={open ? "x" : "m"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>
    </header>
    <AnimatePresence>
      {open && (
        <motion.div key="menu" id="site-menu" role="dialog" aria-modal="true" aria-label={t("site.navMenu")}
          className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[var(--stage)] px-4 pb-8 pt-24 sm:px-6 lg:hidden"
          initial={{ clipPath: "circle(0% at calc(100% - 2.5rem) 2rem)" }}
          animate={{ clipPath: "circle(150% at calc(100% - 2.5rem) 2rem)" }}
          exit={{ clipPath: "circle(0% at calc(100% - 2.5rem) 2rem)" }}
          transition={{ duration: 0.7, ease: EASE }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_80%_100%,var(--glow),transparent_70%)]" />
          <nav className="relative z-[2] flex flex-col" aria-label="Mobile">
            {links.map(([k, h], i) => (
              <motion.div key={k} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.06, ease: EASE }}>
                <Link href={`${p()}${h}`} onClick={close} className="group flex items-baseline gap-4 border-b border-line py-4">
                  <span className="kicker text-fg-subtle">0{i + 1}</span>
                  <span className="headline text-[clamp(2.6rem,12vw,3.6rem)] transition-colors group-hover:text-[var(--accent-ink)]">{t(`site.${k}`)}</span>
                </Link>
              </motion.div>
            ))}
          </nav>
          <motion.div className="relative z-[2] mt-auto flex flex-col gap-3 pt-10 sm:flex-row"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.6, delay: 0.5, ease: EASE }}>
            <Link href={p("/map")} onClick={close} className={cn(btn("primary", "lg"), "w-full sm:flex-1")}>{t("site.navTry")}<ArrowRight className="size-4" /></Link>
            <Link href={p("/signin")} onClick={close} className={cn(btn("outline", "lg"), "w-full bg-transparent sm:flex-1")}>{t("site.navSignin")}</Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
