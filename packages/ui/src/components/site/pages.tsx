"use client";
import { useT } from "@/lib/i18n";
import { MapTool } from "@/components/landpick/map-tool";
import { useLocalePath } from "./env";
import { SiteNav } from "./nav";
import { SiteFooter } from "./footer";
import { HeroCinema, MarginBand } from "./cinema/hero-cinema";
import { useSmoothScroll } from "./smooth-scroll";
import { MapHeader } from "./map-header";
import { SigninForm } from "./signin-form";
import { DataSources, DesktopDownload, Faq, Features, FinalCta, HowItWorks, PlanComparison, PricingSection, PricingTiers, Section, Showcase } from "./sections";

export function LandingPage() {
  useSmoothScroll();
  return (
    <>
      <SiteNav overlay />
      <main>
        <HeroCinema /><MarginBand /><HowItWorks /><Showcase /><Features /><DataSources /><PricingSection /><DesktopDownload /><Faq /><FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

export function PricingPage() {
  const t = useT();
  return (
    <>
      <SiteNav />
      <main>
        <Section>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t("site.pricingPageTitle")}</h1>
            <p className="mt-4 text-lg text-fg-muted">{t("site.pricingPageSub")}</p>
          </div>
          <div className="mt-14"><PricingTiers /></div>
          <h2 className="mb-5 mt-20 text-2xl font-semibold tracking-tight">{t("site.cmpTitle")}</h2>
          <PlanComparison />
        </Section>
        <DesktopDownload />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}

export function SigninPage() {
  return (
    <>
      <SiteNav />
      <main className="px-4 py-16 sm:py-24"><SigninForm /></main>
      <SiteFooter />
    </>
  );
}

export function MapPage() {
  const p = useLocalePath();
  return <MapTool header={<MapHeader />} desktopHref={`${p()}#download`} />;
}
