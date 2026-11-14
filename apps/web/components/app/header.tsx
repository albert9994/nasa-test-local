"use client";
// O1 (subagent): logo + farm dropdown + farmer/expert toggle + "back to site".
import { useApp } from "@/lib/store/app";

export function AppHeader() {
  const { index, farmId, selectFarm } = useApp();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
      <a href="/" className="display text-2xl">FieldShift</a>
      <select className="rounded-md border border-line bg-bg-elev px-2 py-1 text-sm" value={farmId ?? ""} onChange={(e) => selectFarm(e.target.value)}>
        {index.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </header>
  );
}
