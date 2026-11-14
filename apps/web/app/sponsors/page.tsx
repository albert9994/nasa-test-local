import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/site/chrome";

export const metadata: Metadata = { title: "Sponsors", description: "FieldShift's free site is supported by sponsors." };

const TIERS = [
  ["Field partner", "Agricultural lenders, insurers and co-ops who want farmers to plan for a hotter climate."],
  ["Data partner", "Weather, soil and satellite data providers who extend coverage beyond NASA's open data."],
  ["Community partner", "Extension services, universities and farmer associations who bring FieldShift to the field."],
];

export default function SponsorsPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-28 sm:px-10">
        <p className="mb-4 text-xs uppercase tracking-[0.28em] text-gold">Sponsors</p>
        <h1 className="display max-w-3xl text-5xl sm:text-6xl">Free for every farmer.</h1>
        <p className="mt-5 max-w-2xl text-fg-muted">
          The FieldShift site stays free, supported by sponsors and clearly labelled ads. Advisers and agribusinesses who need the full
          stress-testing app pay an annual subscription. Sponsors never change the numbers: the engine and its sources are open.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {TIERS.map(([t, d]) => (
            <div key={t} className="rounded-[var(--radius)] border border-dashed border-line p-6">
              <p className="display text-3xl">{t}</p>
              <p className="mt-2 text-sm text-fg-muted">{d}</p>
              <p className="mt-6 text-xs uppercase tracking-[0.2em] text-gold">Your logo here</p>
            </div>
          ))}
        </div>
        <Link href="/" className="mt-12 inline-block text-sm text-gold">← Back to FieldShift</Link>
      </main>
      <SiteFooter />
    </>
  );
}
