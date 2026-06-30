const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5.4-mini";

export type OpenRouterErrorCode = "MISSING_KEY" | "GENERATION_FAILED";

export class OpenRouterError extends Error {
  code: OpenRouterErrorCode;
  constructor(code: OpenRouterErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OpenRouterError";
    this.code = code;
  }
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function chatJSON(messages: ChatMessage[]): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("MISSING_KEY", "OPENROUTER_API_KEY 미설정");

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "naBe-persona",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });
  } catch (e) {
    throw new OpenRouterError("GENERATION_FAILED", `요청 실패: ${String(e)}`);
  }

  if (!res.ok) {
    throw new OpenRouterError("GENERATION_FAILED", `OpenRouter ${res.status}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = await res.json();
  } catch {
    throw new OpenRouterError("GENERATION_FAILED", "응답 JSON 파싱 실패");
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new OpenRouterError("GENERATION_FAILED", "빈 응답");

  try {
    return JSON.parse(content);
  } catch {
    throw new OpenRouterError("GENERATION_FAILED", "생성 JSON 파싱 실패");
  }
}
