import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
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
    title: { default: msg(locale, "site", "metaTitle"), template: "%s · Hotar" },
    description: msg(locale, "site", "metaDescription"),
    icons: { icon: "/brand/favicon.svg" },
    alternates: { languages: { ro: "/ro", en: "/en" } },
  };
}
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f6f1" }, { media: "(prefers-color-scheme: dark)", color: "#070b08" }],
  width: "device-width", initialScale: 1,
};

/** Before first paint: carry over storage saved under the old FieldShift names (`fieldshift.*`, `fs-theme`) once, then set
 *  the theme (saved choice, else the system setting) so there is no light flash in dark mode. */
const THEME_SCRIPT = `try{var s=localStorage,k,i,o=[];for(i=0;i<s.length;i++){k=s.key(i);if(k&&(k.indexOf("fieldshift.")===0||k==="fs-theme"))o.push(k)}o.forEach(function(k){var n=k==="fs-theme"?"hotar-theme":"hotar."+k.slice(11);if(s.getItem(n)===null)s.setItem(n,s.getItem(k));s.removeItem(k)})}catch(e){}
try{var t=localStorage.getItem("hotar-theme");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={`${fontClasses} h-full`} suppressHydrationWarning>
      <head><Script id="hotar-theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script></head>
      <body className="min-h-full flex flex-col">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
