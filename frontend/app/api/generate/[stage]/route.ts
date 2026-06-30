import { runStage, isStage, type GenerateInput } from "@/lib/generate";
import { OpenRouterError } from "@/lib/openrouter";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ stage: string }> },
) {
  const { stage } = await params;
  if (!isStage(stage)) {
    return Response.json(
      { error: "알 수 없는 단계입니다.", code: "BAD_STAGE" },
      { status: 404 },
    );
  }

  let body: GenerateInput;
  try {
    body = (await request.json()) as GenerateInput;
  } catch {
    return Response.json(
      { error: "잘못된 요청입니다.", code: "BAD_BODY" },
      { status: 400 },
    );
  }

  try {
    const result = await runStage(stage, body);
    return Response.json(result);
  } catch (e) {
    if (e instanceof OpenRouterError) {
      const status = e.code === "MISSING_KEY" ? 400 : 502;
      return Response.json({ error: e.message, code: e.code }, { status });
    }
    return Response.json(
      { error: "서버 오류", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
