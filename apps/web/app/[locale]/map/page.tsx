import type { Metadata } from "next";
import { MapPage } from "@/components/site";
import { isLocale, msg } from "../locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/map">): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? msg(locale, "mapTool", "pageTitle") : undefined };
}
export default function Page() {
  return <MapPage />;
}
