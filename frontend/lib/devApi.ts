// /api/dev 호출 모음 — 개발용 테스트 화면 전용.
//
// 백엔드 dev 라우터는 로컬 codex CLI로 동작하며 APP_ENV=local에서만 등록된다.
// 운영 API 표면(lib/api.ts)과 섞이지 않도록 파일을 나눴고, 요청 자체는 api.ts의
// request()를 그대로 쓴다(타임아웃·에러 포맷 통일).
//
// codex는 텍스트 ~30초, 이미지 ~60초가 걸린다. request()의 기본 20초로는 항상
// 끊기므로 생성 호출은 타임아웃을 크게 잡는다.

import { request } from "@/lib/api";

// 백엔드 codex_timeout_seconds(300초)보다 약간 길게 — 서버가 먼저 사유를 담아
// 실패 응답을 주도록 하고, 클라이언트 타임아웃은 최후의 안전망으로만 둔다.
const GENERATE_TIMEOUT_MS = 320_000;

export interface DevStudent {
  id: string;
  name: string;
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  has_photo: boolean;
  // 원본 사진 Presigned GET URL (1시간). 사진이 없으면 null.
  photo_url: string | null;
  has_answers: boolean;
}

export interface StudentAnswers {
  session_id: string | null;
  status: string | null;
  riasec_scores: Record<string, number>;
  pair_code: string;
  // Pair Code 기본 Career Pool — 화면 편집 초깃값.
  career_pool: string[];
  q7a_first: string | null;
  q7a_second: string | null;
  q7b_first: string | null;
  q7b_second: string | null;
  q8_response: string | null;
  q9_response: string | null;
}

export interface DefaultPrompts {
  persona_system_prompt: string;
  future_photo_prompt: string;
}

// 「Persona 생성 데이터 구조 및 생성 규칙 v1」 13장 출력 계약.
// source_career_pool·pool_extended·q8_reflection·q9_reflection은 학생에게 보여주는
// 값이 아니라 QA·오류 추적용 내부 데이터다.
export interface PersonaResult {
  persona_name: string;
  base_career: string;
  short_description: string;
  source_career_pool: boolean;
  pool_extended: boolean;
  q8_reflection: string;
  q9_reflection: string;
  user_prompt: string;
  elapsed_seconds: number;
}

export interface FuturePhotoResult {
  image_base64: string;
  size_bytes: number;
  width: number;
  height: number;
  elapsed_seconds: number;
}

export function listDevStudents(q?: string): Promise<{ students: DevStudent[] }> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return request(`/api/dev/students${query}`, { method: "GET" });
}

export function getStudentAnswers(studentId: string): Promise<StudentAnswers> {
  return request(`/api/dev/students/${studentId}/answers`, { method: "GET" });
}

export function getDefaultPrompts(): Promise<DefaultPrompts> {
  return request("/api/dev/prompts", { method: "GET" });
}

export function generatePersona(body: {
  student_id: string;
  system_prompt: string;
  career_pool: string[];
}): Promise<PersonaResult> {
  return request(
    "/api/dev/persona",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    GENERATE_TIMEOUT_MS
  );
}

export function generateFuturePhoto(body: {
  student_id: string;
  prompt: string;
}): Promise<FuturePhotoResult> {
  return request(
    "/api/dev/future-photo",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    GENERATE_TIMEOUT_MS
  );
}

// ── 검수 (/dev/review) ─────────────────────────────────────────
// 초안은 scripts/batch_drafts.py가 로컬 codex로 만든다. 여기선 확인·수정·승인만.

export type DraftStatus = "pending" | "approved" | "rejected";

export interface Draft {
  id: string;
  student_id: string;
  status: DraftStatus;
  student_name: string;
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  name: string;
  base_career: string;
  headline: string;
  tagline: string;
  source_career_pool: boolean | null;
  pool_extended: boolean | null;
  raw: Record<string, unknown>;
  photo_url: string | null;
  image_url: string | null;
  error: string | null;
  note: string;
}

export interface DraftEdit {
  name: string;
  base_career: string;
  headline: string;
  tagline: string;
  note: string;
}

export function listDrafts(
  status?: DraftStatus
): Promise<{ drafts: Draft[]; counts: Record<DraftStatus, number> }> {
  const query = status ? `?status=${status}&limit=500` : "?limit=500";
  return request(`/api/dev/drafts${query}`, { method: "GET" });
}

export function updateDraft(id: string, edit: DraftEdit): Promise<Draft> {
  return request(`/api/dev/drafts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(edit),
  });
}

export function draftAction(
  id: string,
  action: "regenerate-text" | "regenerate-image" | "use-fallback" | "approve" | "reject"
): Promise<Draft> {
  return request(`/api/dev/drafts/${id}/${action}`, { method: "POST" }, GENERATE_TIMEOUT_MS);
}

export function previewDraftCard(id: string): Promise<{ image_base64: string }> {
  return request(`/api/dev/drafts/${id}/card`, { method: "GET" }, 60_000);
}

// ── 일괄 생성 (/api/dev/drafts/batch) ───────────────────────────
// 백엔드 백그라운드 태스크로 돈다 — 시작 후 getBatch()로 진행률을 폴링한다.

export interface DevClass {
  grade: number;
  class_no: number;
  total: number;
  completed: number;
  // 초안이 없는 완료자 수 — 일괄 생성 대상.
  targets: number;
}

export interface BatchStatus {
  label: string;
  total: number;
  done: number;
  failed: number;
  running: boolean;
  cancelled: boolean;
  started_at: string | null;
  finished_at: string | null;
  errors: string[];
}

export interface BatchClass {
  school: string;
  grade: number;
  class_no: number;
}

export function listSchools(): Promise<string[]> {
  return request("/api/dev/schools", { method: "GET" });
}

export function listClasses(school: string): Promise<DevClass[]> {
  return request(`/api/dev/schools/classes?school=${encodeURIComponent(school)}`, {
    method: "GET",
  });
}

export function getBatch(): Promise<BatchStatus> {
  return request("/api/dev/drafts/batch", { method: "GET" });
}

export function startBatch(body: {
  classes: BatchClass[];
  concurrency: number;
}): Promise<BatchStatus> {
  return request("/api/dev/drafts/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function cancelBatch(): Promise<BatchStatus> {
  return request("/api/dev/drafts/batch/cancel", { method: "POST" });
}
