"use client";
// Place search with Nominatim (OpenStreetMap). Needs internet; the farmer can always click the map instead.
import { useState } from "react";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Place } from "@/lib/store/farm";

interface Hit { display_name: string; lat: string; lon: string }

export async function searchPlaces(q: string, lang: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=0&accept-language=${lang}&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const hits = (await r.json()) as Hit[];
  return hits.map((h) => ({ name: h.display_name, lat: +h.lat, lon: +h.lon })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export function PlaceSearch({ onPick }: { onPick: (p: Place) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "empty" | "error">("idle");
  const [hits, setHits] = useState<Place[]>([]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setState("busy");
    try {
      const r = await searchPlaces(q.trim(), t.locale);
      setHits(r);
      setState(r.length ? "idle" : "empty");
    } catch {
      setHits([]);
      setState("error");
    }
  }

  return (
    <div>
      <form onSubmit={run} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("onboarding.searchPh")} aria-label={t("onboarding.search")}
            className="h-10 w-full rounded-full border border-line-strong bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary"
          />
        </div>
        <button type="submit" className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50" disabled={state === "busy"}>
          {state === "busy" ? t("onboarding.searching") : t("onboarding.search")}
        </button>
      </form>
      {state === "empty" && <p className="mt-2 text-sm text-fg-muted">{t("onboarding.noResults")}</p>}
      {state === "error" && <p className="mt-2 text-sm text-heat">{t("onboarding.searchFailed")}</p>}
      {hits.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon}`}>
              <button type="button" className="w-full truncate px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => { onPick(h); setHits([]); }}>
                {h.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
