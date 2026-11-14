"use client";
import { useMemo } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LocaleProvider, SiteEnvProvider, type SiteEnv } from "@/components/site";
import type { Locale } from "@/lib/i18n";

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const env = useMemo<SiteEnv>(() => ({ Link: NextLink as SiteEnv["Link"], pathname, navigate: (href) => router.push(href) }), [pathname, router]);
  return (
    <LocaleProvider locale={locale}>
      <SiteEnvProvider value={env}>{children}</SiteEnvProvider>
    </LocaleProvider>
  );
}
