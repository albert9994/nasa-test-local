// Rough crop calendar for the northern temperate zone (Romania, US Corn Belt): which stage a crop is in on a given date.
// Good enough to switch the weather-alert rules on and off (frost / heat at flowering); not an agronomic model.
import type { CropId, Rotation } from "@/lib/engine/types";
import type { Stage } from "./forecast";

const WINTER: CropId[] = ["wheat", "barley"];

/** Stage of `crop` on `date` (month is what matters). Winter cereals are dormant in Dec–Feb, which has no alert rules. */
export function stageOn(crop: CropId, date: Date): Stage {
  if (crop === "fallow") return "fallow";
  const m = date.getMonth() + 1;
  if (WINTER.includes(crop)) {
    if (m === 10) return "sowing";
    if (m === 11) return "emergence";
    if (m >= 12 || m <= 2) return "fallow";
    if (m === 3) return "vegetative";
    if (m === 4) return "vegetative";
    if (m === 5) return "flowering";
    if (m === 6) return "grain_fill";
    if (m === 7) return "harvest";
    return "fallow";
  }
  const late = crop === "sorghum" || crop === "millet";
  if (m === 4) return "sowing";
  if (m === 5) return "emergence";
  if (m === 6) return "vegetative";
  if (m === 7) return "flowering";
  if (m === 8) return "grain_fill";
  if (m === 9) return late ? "grain_fill" : "harvest";
  if (m === 10) return "harvest";
  return "fallow";
}

/** The crop in the ground this season: the first step of the rotation the analysis starts from. */
export function currentCrop(rotation: Rotation | CropId[] | undefined | null): CropId | null {
  const first = rotation?.[0];
  if (!first) return null;
  return typeof first === "string" ? first : first.crop;
}
