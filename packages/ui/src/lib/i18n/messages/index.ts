// Register each namespace here (one line per feature).
import { common, crops, glossary, units } from "./common";
import { satellite } from "./satellite";
import { tour } from "./tour";

type Dict = { en: Record<string, string>; ro: Record<string, string> };
export const MESSAGES: Record<string, Dict> = {
  common, crops, units, glossary, tour, satellite,
};
