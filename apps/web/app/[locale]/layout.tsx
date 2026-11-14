import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { fontClasses } from "../fonts";
import { LOCALES, isLocale, msg } from "./locales";
import { Providers } from "./providers";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: { default: msg(locale, "site", "metaTitle"), template: "%s · FieldShift" },
    description: msg(locale, "site", "metaDescription"),
    icons: { icon: "/brand/favicon.svg" },
    alternates: { languages: { ro: "/ro", en: "/en" } },
  };
}
export const viewport: Viewport = { themeColor: "#f7f6f1", width: "device-width", initialScale: 1 };

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={`${fontClasses} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
