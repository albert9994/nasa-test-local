import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { useFarm } from "@/lib/store/farm";
import { Onboarding } from "@/components/onboarding/onboarding";
import { Workspace } from "@/components/workspace/workspace";

export default function App() {
  const hydrated = useFarm((s) => s.hydrated);
  const onboarded = useFarm((s) => s.onboarded);
  const t = useT();
  useEffect(() => { void useFarm.getState().hydrate(); }, []);
  if (!hydrated) return <div className="grid h-full place-items-center bg-bg text-sm text-fg-muted">{t("common.loading")}</div>;
  return onboarded ? <Workspace /> : <Onboarding />;
}
