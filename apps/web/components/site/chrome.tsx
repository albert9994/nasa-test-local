"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [["Story", "/#story"], ["Margin", "/#margin"], ["Demo", "/#demo"], ["Data", "/#data"], ["Team", "/#team"]] as const;

export function SiteNav({ overlay = false }: { overlay?: boolean }) {
  const [solid, setSolid] = useState(!overlay);
  useEffect(() => {
    if (!overlay) return;
    const on = () => setSolid(window.scrollY > window.innerHeight * 3.9);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [overlay]);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-colors duration-500",
      solid ? "border-b border-line bg-bg/80 text-fg backdrop-blur-md" : "text-[#f1ead8]")}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2" aria-label="FieldShift home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.svg" alt="" className="size-7" />
          <span className="display text-2xl">Field<em className="text-gold">Shift</em></span>
        </Link>
        <ul className="hidden items-center gap-6 text-sm md:flex">
          {LINKS.map(([t, h]) => <li key={t}><a href={h} className="opacity-75 hover:opacity-100">{t}</a></li>)}
        </ul>
        <Link href="/app" className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-[#0b0c09] hover:brightness-110">Open the app</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 text-sm text-fg-muted sm:flex-row sm:justify-between sm:px-10">
        <div className="max-w-md">
          <p className="display text-2xl text-fg">Field<em className="text-gold">Shift</em></p>
          <p className="mt-2">A planning aid, not a guarantee. Built for NASA Space Apps 2026 (Field Shift challenge). Not endorsed by NASA.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/demo" className="hover:text-fg">Lite demo</Link>
          <Link href="/app" className="hover:text-fg">Full app</Link>
          <Link href="/sponsors" className="hover:text-fg">Sponsors</Link>
        </div>
        <p className="max-w-xs text-xs">
          Imagery: NASA GIBS (Blue Marble, Black Marble, MODIS NDVI). Weather: NASA POWER. Soil: ISRIC SoilGrids. Map: Esri World Imagery.
        </p>
      </div>
    </footer>
  );
}
