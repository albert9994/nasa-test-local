"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { searchPlaces, type PlaceHit } from "@/lib/geo/nominatim";

/** Place search (OSM Nominatim, debounced, ≤ 1 request/s). Calls `onPick` with the chosen place. */
export function SearchBox({ onPick, className }: { onPick(hit: PlaceHit): void; className?: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [open, setOpen] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = (text: string) => {
    ctl.current?.abort();
    const c = (ctl.current = new AbortController());
    setState("busy");
    searchPlaces(text, t.locale, c.signal)
      .then((r) => { if (!c.signal.aborted) { setHits(r); setState("idle"); setOpen(true); } })
      .catch((e) => { if (!c.signal.aborted && e?.name !== "AbortError") { setState("error"); setHits(null); setOpen(true); } });
  };
  const onChange = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    if (v.trim().length < 3) { setHits(null); setState("idle"); ctl.current?.abort(); return; }
    timer.current = setTimeout(() => run(v.trim()), 650);
  };
  useEffect(() => () => { clearTimeout(timer.current); ctl.current?.abort(); }, []);

  return (
    <div className={cn("relative", className)}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); clearTimeout(timer.current); if (q.trim().length >= 2) run(q.trim()); }}
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 shadow-[var(--shadow)]">
        {state === "busy" ? <Loader2 className="size-4 shrink-0 animate-spin text-fg-muted" /> : <Search className="size-4 shrink-0 text-fg-muted" />}
        <input
          type="search" value={q} onChange={(e) => onChange(e.target.value)} onFocus={() => hits && setOpen(true)}
          placeholder={t("mapTool.searchPlaceholder")} aria-label={t("mapTool.searchLabel")}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-subtle" autoComplete="off"
        />
      </form>
      {open && (hits || state === "error") && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-auto rounded-2xl border border-line bg-surface p-1 shadow-[var(--shadow)]">
          {state === "error" && <li className="px-3 py-2.5 text-sm text-danger">{t("mapTool.searchError")}</li>}
          {hits?.length === 0 && state !== "error" && <li className="px-3 py-2.5 text-sm text-fg-muted">{t("mapTool.noResults")}</li>}
          {hits?.map((h, i) => (
            <li key={i}>
              <button type="button" className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2"
                onClick={() => { setOpen(false); setQ(h.name.split(",").slice(0, 2).join(",")); onPick(h); }}>
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /><span className="line-clamp-2">{h.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
