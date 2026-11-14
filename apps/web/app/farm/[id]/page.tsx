import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter, SiteNav } from "@/components/site/chrome";
import { LiteDemo } from "@/components/site/lite-demo";

const FARMS: Record<string, { name: string; story: string }> = {
  iowa: { name: "Story County, Iowa", story: "Maize and soybean in the heart of the US Corn Belt. In 2012 a flash drought and weeks above 35 °C at flowering cut the US corn harvest by 13 %." },
  kansas: { name: "Finney County, Kansas", story: "Dryland winter wheat with summer fallow on the High Plains, where 2011 and 2022 droughts hit hard." },
  baragan: { name: "Bărăgan Plain, Romania", story: "Maize and winter wheat on Romania's breadbasket. In 2024 drought damaged about 2 million hectares; winter wheat, harvested before the heat, came through." },
};

export function generateStaticParams() {
  return Object.keys(FARMS).map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/farm/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: FARMS[id]?.name ?? "Farm" };
}

export default async function FarmPage({ params }: PageProps<"/farm/[id]">) {
  const { id } = await params;
  const farm = FARMS[id];
  if (!farm) notFound();
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-28 sm:px-10">
        <p className="mb-4 text-xs uppercase tracking-[0.28em] text-gold">Demo farm</p>
        <h1 className="display max-w-3xl text-5xl sm:text-6xl">{farm.name}</h1>
        <p className="mb-10 mt-4 max-w-2xl text-fg-muted">{farm.story}</p>
        <LiteDemo initialFarm={id} />
      </main>
      <SiteFooter />
    </>
  );
}
