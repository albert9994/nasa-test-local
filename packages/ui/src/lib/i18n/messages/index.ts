// Register each namespace here (one line per feature).
import { analysis } from "./analysis";
import { common, crops, glossary, units } from "./common";
import { explain } from "./explain";
import { farm } from "./farm";
import { inputs } from "./inputs";
import { replay } from "./replay";
import { tour } from "./tour";
import { onboarding } from "./onboarding";
import { workspace } from "./workspace";

type Dict = { en: Record<string, string>; ro: Record<string, string> };
export const MESSAGES: Record<string, Dict> = {
  common, crops, units, glossary, tour, analysis, inputs, replay, explain, farm, onboarding, workspace,
};
