import type { Metadata } from "next";
import { SigninPage } from "@/components/site";
import { isLocale, msg } from "../locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/signin">): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? msg(locale, "site", "signinTitle") : undefined, robots: { index: false } };
}
export default function Page() {
  return <SigninPage />;
}
