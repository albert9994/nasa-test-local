// Register each namespace here: one import line and one entry line per feature (keeps parallel PRs from colliding).
import { alerts } from "./alerts";
import { analysis } from "./analysis";
import { common, crops, glossary, units } from "./common";
import { explain } from "./explain";
import { farm } from "./farm";
import { inputs } from "./inputs";
import { mapTool, textures } from "./mapTool";
import { onboarding } from "./onboarding";
import { reasons } from "./reasons";
import { replay } from "./replay";
import { satellite } from "./satellite";
import { site } from "./site";
import { tour } from "./tour";
import { workspace } from "./workspace";

type Dict = { en: Record<string, string>; ro: Record<string, string> };
export const MESSAGES: Record<string, Dict> = {
  common,
  crops,
  units,
  glossary,
  tour,
  analysis,
  inputs,
  replay,
  explain,
  farm,
  onboarding,
  workspace,
  site,
  mapTool,
  textures,
  alerts,
  satellite,
  reasons,
};
