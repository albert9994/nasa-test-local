import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/site/chrome";
import { LiteDemo } from "@/components/site/lite-demo";

export const metadata: Metadata = { title: "Demo", description: "Turn up the heat on a real farm and see its Adaptation Margin." };

export default function DemoPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-28 sm:px-10">
        <p className="mb-4 text-xs uppercase tracking-[0.28em] text-gold">Lite demo</p>
        <h1 className="display mb-10 max-w-3xl text-5xl sm:text-6xl">How much hotter can this farm get?</h1>
        <LiteDemo />
      </main>
      <SiteFooter />
    </>
  );
}
