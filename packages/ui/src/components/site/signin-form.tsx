"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocalePath, useSiteEnv } from "./env";
import { btn } from "./nav";

const input = "mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] outline-none placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/20";

/** UI only: there is no auth backend yet, so submitting just explains that accounts open soon. */
export function SigninForm() {
  const t = useT();
  const { Link } = useSiteEnv();
  const p = useLocalePath();
  const [sent, setSent] = useState(false);
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-[var(--shadow)]">
      <h1 className="text-2xl font-semibold tracking-tight">{t("site.signinTitle")}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t("site.signinSub")}</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
        <label className="block text-sm font-medium">{t("site.signinEmail")}
          <input type="email" name="email" autoComplete="email" required className={input} />
        </label>
        <label className="block text-sm font-medium">{t("site.signinPassword")}
          <input type="password" name="password" autoComplete="current-password" required className={input} />
        </label>
        <button type="submit" className={cn(btn("primary"), "w-full")}>{t("site.signinSubmit")}</button>
        {sent && <p role="status" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{t("site.signinSoon")}</p>}
        <p className="text-center text-xs text-fg-muted">{t("site.signinForgot")}</p>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-fg-subtle"><span className="h-px flex-1 bg-line" />{t("site.signinOr")}<span className="h-px flex-1 bg-line" /></div>
      <Link href={p("/map")} className={cn(btn("outline"), "w-full")}>{t("site.signinMap")}</Link>
    </div>
  );
}
