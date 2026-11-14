"use client";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocalePath, useSiteEnv } from "./env";
import { Logo } from "./logo";
import { LocaleSwitcher } from "./locale-switcher";

export const btn = (variant: "primary" | "outline" | "ghost" = "primary", size: "sm" | "md" | "lg" = "md") =>
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors",
    size === "sm" && "h-9 px-4 text-sm", size === "md" && "h-10 px-5 text-sm", size === "lg" && "h-12 px-7 text-base",
    variant === "primary" && "bg-primary text-primary-fg hover:bg-primary-hover",
    variant === "outline" && "border border-line-strong bg-surface text-fg hover:bg-surface-2",
    variant === "ghost" && "text-fg-muted hover:bg-surface-2 hover:text-fg",
  );

export function SiteNav() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  const [open, setOpen] = useState(false);
  const links = [
    ["navProduct", "#product"], ["navHow", "#how"], ["navData", "#data"], ["navPricing", "#pricing"], ["navFaq", "#faq"],
  ] as const;
  const close = () => setOpen(false);
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href={p()} aria-label="FieldShift" onClick={close}><Logo /></Link>
        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map(([k, h]) => (
            <Link key={k} href={`${p()}${h}`} className="rounded-full px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">{t(`site.${k}`)}</Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <LocaleSwitcher />
          <Link href={p("/signin")} className={btn("ghost", "sm")}>{t("site.navSignin")}</Link>
          <Link href={p("/map")} className={btn("primary", "sm")}>{t("site.navTry")}</Link>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <LocaleSwitcher />
          <button type="button" aria-expanded={open} aria-label={open ? t("site.navClose") : t("site.navMenu")} onClick={() => setOpen(!open)}
            className="grid size-10 place-items-center rounded-full border border-line bg-surface">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-bg px-4 pb-5 pt-2 lg:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {links.map(([k, h]) => (
              <Link key={k} href={`${p()}${h}`} onClick={close} className="border-b border-line py-3 text-base">{t(`site.${k}`)}</Link>
            ))}
          </nav>
          <div className="mt-4 flex gap-2">
            <Link href={p("/signin")} onClick={close} className={cn(btn("outline"), "flex-1")}>{t("site.navSignin")}</Link>
            <Link href={p("/map")} onClick={close} className={cn(btn("primary"), "flex-1")}>{t("site.navTry")}</Link>
          </div>
        </div>
      )}
    </header>
  );
}
