// Register each namespace here (one line per feature).
import { common, crops, glossary, units } from "./common";
import { tour } from "./tour";
import { onboarding } from "./onboarding";
import { workspace } from "./workspace";

type Dict = { en: Record<string, string>; ro: Record<string, string> };
export const MESSAGES: Record<string, Dict> = {
  common, crops, units, glossary, tour, onboarding, workspace,
};
