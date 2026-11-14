"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Land } from "@/lib/geo/land";
import { listSaved, removeSaved, saveField, type SavedField } from "@/lib/geo/saved";

/** "Full stress test, futures to 2050… → FieldShift Desktop" + "Save this field" (1 field on the Free plan). */
export function DesktopCta({ land, href, onOpenSaved }: { land: Land | null; href: string; onOpenSaved?(f: SavedField): void }) {
  const t = useT();
  const [saved, setSaved] = useState<SavedField[]>([]);
  const [msg, setMsg] = useState<"saved" | "limit" | null>(null);
  useEffect(() => { setSaved(listSaved()); }, []);
  const refresh = () => setSaved(listSaved());
  const save = (replace = false) => {
    if (!land) return;
    const r = saveField(t("mapTool.fieldName", { n: 1 }), land, replace);
    setMsg(r === "ok" ? "saved" : "limit");
    refresh();
  };
  return (
    <div className="space-y-3">
      <section data-tour="desktop-cta" className="rounded-2xl bg-primary p-5 text-primary-fg">
        <h3 className="text-base font-semibold tracking-tight">{t("mapTool.ctaTitle")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-primary-fg/80">{t("mapTool.ctaBody")}</p>
        <a href={href} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-primary hover:bg-primary-soft">{t("mapTool.ctaButton")}<ArrowRight className="size-4" /></a>
      </section>
      {land && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <button type="button" onClick={() => save(false)} className={cn("inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-surface-2")}>
            {msg === "saved" ? <Check className="size-4 text-ok" /> : <Bookmark className="size-4" />}{msg === "saved" ? t("mapTool.saved") : t("mapTool.saveField")}
          </button>
          {msg === "limit" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <span>{t("mapTool.saveLimit")}</span>
              <button type="button" onClick={() => save(true)} className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-fg">{t("mapTool.saveReplace")}</button>
            </div>
          )}
        </div>
      )}
      {saved.length > 0 && (
        <ul className="rounded-2xl border border-line bg-surface p-2 text-sm">
          {saved.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2">
              <span className="flex items-center gap-2 font-medium"><Bookmark className="size-3.5 text-primary" />{t("mapTool.savedFields")}</span>
              <span className="flex gap-2">
                {onOpenSaved && <button type="button" onClick={() => onOpenSaved(s)} className="text-primary hover:underline">{t("mapTool.openSaved")}</button>}
                <button type="button" onClick={() => { removeSaved(s.id); refresh(); setMsg(null); }} className="text-fg-muted hover:text-danger">{t("mapTool.removeSaved")}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
