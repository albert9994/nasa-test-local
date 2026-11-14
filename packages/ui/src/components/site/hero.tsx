"use client";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useLocalePath, useSiteEnv } from "./env";
import { btn } from "./nav";
import { ProductPreview } from "./product-preview";

export function Hero() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-14 lg:pb-24 lg:pt-20">
      <div>
        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
          <span className="size-1.5 rounded-full bg-leaf" />{t("site.heroEyebrow")}
        </p>
        <h1 className="display text-balance text-4xl sm:text-5xl lg:text-[3.4rem]">{t("site.heroTitle")}</h1>
        <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-fg-muted">{t("site.heroSub")}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={p("/map")} className={btn("primary", "lg")}>{t("site.heroCta")}<ArrowRight className="size-4" /></Link>
          <Link href={`${p()}#how`} className={btn("outline", "lg")}>{t("site.heroCta2")}</Link>
        </div>
        <p className="mt-5 text-sm text-fg-muted">{t("site.heroTrust")}</p>
      </div>
      <ProductPreview />
    </section>
  );
}
