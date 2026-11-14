"use client";
import { useT } from "@/lib/i18n";
import { useLocalePath, useSiteEnv } from "./env";
import { Logo } from "./logo";

export function SiteFooter() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  const col = "space-y-2.5 text-sm text-fg-muted [&_a:hover]:text-fg";
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-fg-muted">{t("site.footTagline")}</p>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t("site.footProduct")}</h3>
            <ul className={col}>
              <li><Link href={p("/map")}>{t("site.navTry")}</Link></li>
              <li><Link href={`${p()}#how`}>{t("site.navHow")}</Link></li>
              <li><Link href={p("/pricing")}>{t("site.navPricing")}</Link></li>
              <li><Link href={`${p()}#download`}>FieldShift Desktop</Link></li>
              <li><Link href={p("/signin")}>{t("site.navSignin")}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t("site.footData")}</h3>
            <ul className={col}>
              <li><Link href={`${p()}#data`}>{t("site.navData")}</Link></li>
              <li><a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER</a></li>
              <li><a href="https://www.isric.org/explore/soilgrids" target="_blank" rel="noreferrer">ISRIC SoilGrids</a></li>
              <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t("site.footCompany")}</h3>
            <ul className={col}>
              <li><a href="#terms">{t("site.footTerms")}</a></li>
              <li><a href="#privacy">{t("site.footPrivacy")}</a></li>
              <li><a href="#cookies">{t("site.footCookies")}</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-fg-muted sm:flex-row sm:justify-between">
          <p className="max-w-3xl leading-relaxed">{t("site.footAttribution")}</p>
          <p className="shrink-0">{t("site.footCopy")}</p>
        </div>
      </div>
    </footer>
  );
}
