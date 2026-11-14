import type { Metadata } from "next";
import { PricingPage } from "@/components/site";
import { isLocale, msg } from "../locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? msg(locale, "site", "pricingPageTitle") : undefined };
}
export default function Page() {
  return <PricingPage />;
}
