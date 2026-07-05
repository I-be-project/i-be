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
  gender: "male" | "female";
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
  // 성별 ('male' | 'female'). 과거 가입자는 null일 수 있음.
  gender: string | null;
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

// fetch 자체엔 타임아웃이 없어, 연결이 "매달리면"(hang) 무한 대기한다(스피너가 영영 안 끝남).
// AbortController로 상한을 두고, 초과 시 status 0 ApiError로 전환한다(→ 화면에 재시도 UI 노출).
// 기본 20초. LLM 생성처럼 정상적으로 오래 걸리는 요청은 호출부에서 timeoutMs로 늘린다.
async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs = 20_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // fetch(응답 헤더 수신)와 본문 읽기(res.text())를 모두 상한 안에서 수행한다.
    // 헤더만 오고 본문이 멈추는 경우까지 abort로 끊어, 무한 대기를 완전히 막는다.
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });

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
  } catch (e) {
    // 위에서 만든 도메인/검증 에러(ApiError)는 그대로 전파한다.
    if (e instanceof ApiError) throw e;
    // 그 외(타임아웃 abort·네트워크 단절·CORS·서버 다운·본문 읽기 중단)는 status 0으로 통일.
    throw new ApiError(
      controller.signal.aborted
        ? "응답이 너무 오래 걸려요. 잠시 후 다시 시도해주세요."
        : "서버에 연결할 수 없어요. 백엔드가 켜져 있는지 확인해주세요.",
      0
    );
  } finally {
    clearTimeout(timer);
  }
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
  // 사진은 수 MB 멀티파트라 느린 업링크에서 기본 20초를 넘길 수 있어 상한을 넉넉히 준다.
  return request<PhotoUploadResponse>(
    "/api/students/me/photo",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
    60_000
  );
}

export interface AdminLoginResponse {
  admin_token: string;
}

export type AdminProgressStatus = "not_started" | "in_progress" | "completed";

export interface AdminStudentProgress {
  status: AdminProgressStatus;
  stages_done: string[];
  has_persona: boolean;
  has_card: boolean;
  last_activity_at: string | null;
}

export interface AdminStudentItem {
  id: string;
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  name: string;
  password: string;
  gender: string | null;
  photo_url: string | null;
  consent_privacy: boolean;
  created_at: string;
  progress: AdminStudentProgress;
}

export interface AdminStudentList {
  total: number;
  items: AdminStudentItem[];
}

export interface AdminAnswer {
  stage: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AdminPersona {
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
}

export interface AdminSessionDetail {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  answers: AdminAnswer[];
  persona: AdminPersona | null;
  card_image_url: string | null;
}

export interface AdminStudentDetail {
  id: string;
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  name: string;
  password: string;
  gender: string | null;
  photo_url: string | null;
  consent_privacy: boolean;
  created_at: string;
  sessions: AdminSessionDetail[];
}

export interface AdminDeleteResponse {
  student_id: string;
  removed_storage_objects: number;
}

export interface AdminBulkDeleteResponse {
  deleted: string[];
  not_found: string[];
  removed_storage_objects: number;
}

export interface AdminStudentQuery {
  q?: string;
  school?: string;
  grade?: number;
  class_no?: number;
  limit?: number;
  offset?: number;
}

export function adminLogin(
  username: string,
  password: string
): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function fetchAdminStudents(
  token: string,
  params: AdminStudentQuery = {}
): Promise<AdminStudentList> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.school) sp.set("school", params.school);
  if (params.grade != null) sp.set("grade", String(params.grade));
  if (params.class_no != null) sp.set("class_no", String(params.class_no));
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return request<AdminStudentList>(
    `/api/admin/students${qs ? `?${qs}` : ""}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } }
  );
}

export function fetchAdminStudentDetail(
  token: string,
  id: string
): Promise<AdminStudentDetail> {
  return request<AdminStudentDetail>(`/api/admin/students/${id}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function deleteAdminStudent(
  token: string,
  id: string
): Promise<AdminDeleteResponse> {
  return request<AdminDeleteResponse>(`/api/admin/students/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function bulkDeleteAdminStudents(
  token: string,
  ids: string[]
): Promise<AdminBulkDeleteResponse> {
  return request<AdminBulkDeleteResponse>("/api/admin/students/bulk-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  });
}

// LLM 생성 단계(q7b/q8/q9)를 백엔드에 위임한다.
// 반환값은 단계명을 키로 갖는 파싱된 JSON (예: { q7b: {...} }).
// 호출 측에서 (json as { q7b: Q7BData }).q7b 형태로 캐스팅한다.
export function generateStage(
  stage: "q7b" | "q8" | "q9",
  input: Record<string, unknown>
): Promise<unknown> {
  // LLM 생성은 정상적으로 수십 초가 걸릴 수 있어 기본 20초보다 넉넉한 상한을 준다.
  return request<unknown>(
    `/api/generate/${stage}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    60_000
  );
}

// 진행 중(Q7~9) 답변을 단계별로 저장. 인증 필요. Q1~6은 저장하지 않는다.
// - sessionId 없이 처음 저장하면 백엔드가 in_progress 세션을 만들어 session_id를 돌려준다.
// - 이후 저장과 완료(completeSurvey)에 같은 session_id를 재사용한다.
export type AnswerStage = "q1to6" | "q7a" | "q7b" | "q8" | "q9";

export interface SaveAnswerResponse {
  session_id: string;
}

export function saveAnswer(
  token: string,
  input: { sessionId?: string; stage: AnswerStage; answer: Record<string, unknown> }
): Promise<SaveAnswerResponse> {
  return request<SaveAnswerResponse>("/api/sessions/answers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sessionId: input.sessionId,
      stage: input.stage,
      answer: input.answer,
    }),
  });
}

// 세션 완료. 인증 필요.
// 학생 흐름은 Q9가 마지막이라 persona 없이 세션만 completed로 승격한다(→ 프로필 '완료 · 카드 준비 중').
// 탐험대원증 이름·카드는 이후(한마당)에 생성·공개한다. persona를 넘기면 함께 저장한다.
export interface PersonaInput {
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
}

export function completeSurvey(
  token: string,
  persona?: PersonaInput | null,
  sessionId?: string
): Promise<ProfileSummary> {
  return request<ProfileSummary>("/api/sessions/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    // sessionId가 있으면 그 in_progress 세션을 completed로 승격한다.
    body: JSON.stringify({ ...(persona ?? {}), sessionId }),
  });
}
