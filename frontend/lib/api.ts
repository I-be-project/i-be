// 백엔드 API 호출 모음.
// - base URL은 NEXT_PUBLIC_API_URL (기본값 http://localhost:8000)
// - 컴포넌트에서 직접 fetch 하지 말고 이 파일의 함수를 사용한다.
// - 백엔드 에러는 두 형식이 섞여 온다:
//     도메인 에러   { "error": { "code", "message", "details" } }
//     검증 에러     { "detail": [ { "loc", "msg" } ] }  (FastAPI 기본)
//   두 형식을 parseErrorMessage가 하나의 사용자 메시지로 통일한다.

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface RegisterPayload {
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  name: string;
  password: string;
  consent_privacy: boolean;
}

export interface LoginPayload {
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  password: string;
}

export interface AuthResponse {
  student_id: string;
  student_token: string;
}

export interface PhotoUploadResponse {
  photo_key: string;
}

// GET /api/students/me 응답.
// 주의: store의 PersonaResult와 다르다(recommendedBooths 없음). 별도 타입으로 둔다.
export interface ProfilePersona {
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
}

export interface ProfileCard {
  card_image_url: string | null;
}

// 백엔드가 내려주는 학생 식별 정보(snake_case). 소프트 삭제 등이면 null.
export interface ProfileStudent {
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  name: string;
  // 학생 사진 Presigned GET URL (만료 있음). 사진이 없으면 null.
  photo_url: string | null;
}

export interface ProfileSummary {
  has_completed: boolean;
  retry_enabled: boolean;
  student: ProfileStudent | null;
  // has_completed가 false면 persona/card 둘 다 null. true여도 card는 null일 수 있다(카드 미생성).
  persona: ProfilePersona | null;
  card: ProfileCard | null;
}

// API 호출 실패를 status/code와 함께 던진다. 화면에서 분기(409/403/401 등)에 사용.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface DomainErrorBody {
  error?: { code?: unknown; message?: unknown };
}
interface ValidationErrorBody {
  detail?: unknown;
}

// 도메인/검증 두 에러 포맷을 하나의 메시지+code로 통일.
function parseErrorMessage(
  body: unknown,
  fallback: string
): { message: string; code?: string } {
  if (body && typeof body === "object") {
    const domain = body as DomainErrorBody;
    if (domain.error && typeof domain.error === "object") {
      const message =
        typeof domain.error.message === "string"
          ? domain.error.message
          : fallback;
      const code =
        typeof domain.error.code === "string" ? domain.error.code : undefined;
      return { message, code };
    }

    const validation = body as ValidationErrorBody;
    if (Array.isArray(validation.detail)) {
      const messages = validation.detail
        .map((item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { msg?: unknown }).msg === "string"
            ? (item as { msg: string }).msg
            : null
        )
        .filter((msg): msg is string => msg !== null);
      if (messages.length > 0) return { message: messages.join("\n") };
    }
    if (typeof validation.detail === "string") {
      return { message: validation.detail };
    }
  }
  return { message: fallback };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    // 네트워크 단절·CORS·서버 다운 등 (status 0으로 구분)
    throw new ApiError(
      "서버에 연결할 수 없어요. 백엔드가 켜져 있는지 확인해주세요.",
      0
    );
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // JSON이 아니면 그대로 무시 (fallback 메시지 사용)
    }
  }

  if (!res.ok) {
    const { message, code } = parseErrorMessage(
      body,
      "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요."
    );
    throw new ApiError(message, res.status, code);
  }

  return body as T;
}

export function registerStudent(
  payload: RegisterPayload
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function loginStudent(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getMyProfile(token: string): Promise<ProfileSummary> {
  return request<ProfileSummary>("/api/students/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function uploadPhoto(
  token: string,
  file: File
): Promise<PhotoUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  // multipart는 브라우저가 Content-Type(boundary 포함)을 자동 설정하므로 직접 넣지 않는다.
  return request<PhotoUploadResponse>("/api/students/me/photo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}
