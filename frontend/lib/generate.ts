import { chatJSON } from "@/lib/openrouter";
import { buildQ7BMessages } from "@/lib/prompts/q7b";
import { buildQ8Messages } from "@/lib/prompts/q8";
import { buildQ9Messages } from "@/lib/prompts/q9";
import { buildQ10Messages } from "@/lib/prompts/q10";

export type Stage = "q7b" | "q8" | "q9" | "q10";

export interface GenerateInput {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
  q8?: unknown;
  q9?: unknown;
  careerPool?: string[];
}

const BUILDERS = {
  q7b: buildQ7BMessages,
  q8: buildQ8Messages,
  q9: buildQ9Messages,
  q10: buildQ10Messages,
} as const;

export function isStage(v: string): v is Stage {
  return v in BUILDERS;
}

export async function runStage(stage: Stage, input: GenerateInput): Promise<unknown> {
  const messages = BUILDERS[stage](input);
  const result = await chatJSON(messages);
  // 최상위 키(stage) 존재만 가볍게 검증
  if (
    typeof result !== "object" ||
    result === null ||
    !(stage in (result as Record<string, unknown>))
  ) {
    const { OpenRouterError } = await import("@/lib/openrouter");
    throw new OpenRouterError("GENERATION_FAILED", `${stage} 키 누락`);
  }
  return result;
}
