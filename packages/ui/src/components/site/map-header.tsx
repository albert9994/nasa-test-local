"use client";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useTour } from "@/components/tour/tour";
import { useLocalePath, useSiteEnv } from "./env";
import { Logo } from "./logo";
import { LocaleSwitcher } from "./locale-switcher";
import { btn } from "./nav";

export const MAP_TOUR_ID = "map-tool";

/** Slim header of the free map tool. */
export function MapHeader() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  return (
    <header className="z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg px-3 sm:px-5">
      <Link href={p()} aria-label={t("mapTool.back")} className="flex items-center gap-2">
        <ArrowLeft className="hidden size-4 text-fg-muted sm:block" /><Logo />
      </Link>
      <span className="ml-1 hidden text-sm text-fg-muted md:inline">{t("mapTool.pageTitle")}</span>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={() => useTour.getState().start(MAP_TOUR_ID)} className={btn("ghost", "sm")} aria-label={t("mapTool.tourRestart")}>
          <HelpCircle className="size-4" /><span className="hidden sm:inline">{t("mapTool.tourRestart")}</span>
        </button>
        <Link href={`${p()}#download`} className={cn(btn("outline", "sm"), "hidden sm:inline-flex")}>Hotar Desktop</Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
