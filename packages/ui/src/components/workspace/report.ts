// A simple standalone HTML report of the farm (opens in any browser; print to PDF from there). Saved through the host
// (native "save as" dialog in the desktop app).
import type { FarmData } from "@/lib/store/farm";
import type { FieldRisk } from "./risk";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildReportHtml(farm: Pick<FarmData, "name" | "fields" | "profile">, risks: Record<string, FieldRisk | undefined>, tr: (k: string, v?: Record<string, string | number>) => string, locale: "ro" | "en"): string {
  const date = new Date().toLocaleDateString(locale === "ro" ? "ro-RO" : "en-GB");
  const rows = farm.fields.map((f) => {
    const r = risks[f.id];
    return `<tr><td>${esc(f.name)}</td><td class="n">${f.areaHa} ha</td><td>${f.rotation.map((c) => esc(tr(`crops.${c}`))).join(" → ")}</td>` +
      `<td>${r ? esc(tr(`common.risk_${r.level}`)) : "—"}</td><td class="n">${r ? `${(r.pFail * 100).toFixed(0)} %` : "—"}</td>` +
      `<td class="n">${r && r.level !== "over" ? `+${r.marginDT.toFixed(1)} °C` : "—"}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>${esc(tr("workspace.reportTitle"))} · ${esc(farm.name)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#14201a;max-width:860px;margin:40px auto;padding:0 20px}h1{letter-spacing:-.02em}
table{border-collapse:collapse;width:100%;margin-top:20px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e3e1d8}th{font-size:12px;color:#5b655e;text-transform:uppercase}
.n{font-variant-numeric:tabular-nums;white-space:nowrap}small{color:#5b655e}</style>
<h1>${esc(tr("workspace.reportTitle"))}: ${esc(farm.name)}</h1>
<table><thead><tr><th>${esc(tr("workspace.reportField"))}</th><th>ha</th><th>${esc(tr("workspace.reportRotation"))}</th><th>${esc(tr("workspace.reportRisk"))}</th><th>${esc(tr("workspace.reportBadYears"))}</th><th>${esc(tr("workspace.reportHeadroom"))}</th></tr></thead><tbody>${rows}</tbody></table>
<p><small>${esc(tr("workspace.reportGenerated", { date }))} · NASA POWER, ISRIC SoilGrids.</small></p></html>`;
}
