import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Compass,
  Heart,
  Megaphone,
  Palette,
  Wrench,
  Sparkles,
} from "lucide-react";
import type { RiasecType } from "@/lib/mock/questions";

/** RIASEC → welcome 톤 픽토그램 (sky 계열) */
export const riasecPictogram: Record<RiasecType, LucideIcon> = {
  R: Wrench,
  I: Compass,
  A: Palette,
  S: Heart,
  E: Megaphone,
  C: ClipboardList,
};

export const defaultPictogram = Sparkles;

export function getPictogramForRiasec(type?: RiasecType): LucideIcon {
  if (type && type in riasecPictogram) return riasecPictogram[type];
  return defaultPictogram;
}
