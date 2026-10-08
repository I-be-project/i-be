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
  // Pair Code 기본 Career Direction Pool 항목(줄 단위) — 화면 편집 초깃값.
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

// Career Persona Prompt v40 27장 출력 계약.
// persona_name·career_name·short_description 외에는 학생에게 보여주지 않는 해석 근거다.
export interface PersonaResult {
  career_name: string;
  persona_name: string;
  persona_anchor: string;
  target: string;
  desired_impact: string;
  value_attitude: string;
  problem_solving: string;
  career_reason: string;
  career_required_competencies: string[];
  short_description: string;
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
  verdict: Verdict | null;
  verdict_reason: string;
  // /dev/review에서 다시 만든 시각과, 다시 만들기 전의 평가(재검수할 때 참고).
  regenerated_at: string | null;
  prev_verdict: Verdict | null;
  prev_verdict_reason: string;
}

export type Verdict = "o" | "x" | "triangle";

// O/X/△ 평가 — /admin/review와 같은 값. verdict=null이면 평가 취소.
export function setDraftVerdict(id: string, verdict: Verdict | null, reason = ""): Promise<Draft> {
  return request(`/api/dev/drafts/${id}/verdict`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verdict, reason }),
  });
}

export interface DraftEdit {
  name: string;
  base_career: string;
  headline: string;
  tagline: string;
  note: string;
}

// 학교·학년·반 범위. 비운 값은 전체.
export interface DraftScope {
  school?: string;
  grade?: number;
  class_no?: number;
}

export function listDrafts(
  status?: DraftStatus,
  scope: DraftScope = {}
): Promise<{ drafts: Draft[]; counts: Record<DraftStatus, number> }> {
  const params = new URLSearchParams({ limit: "500" });
  if (status) params.set("status", status);
  for (const [k, v] of Object.entries(scope)) if (v !== undefined) params.set(k, String(v));
  return request(`/api/dev/drafts?${params}`, { method: "GET" });
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

export function previewDraftCard(id: string): Promise<{ image_base64: string; qr_url: string }> {
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

// 아직 생성하지 않은 학생(설문 완료·초안 없음) 수 — 전체 학교.
export function countTargets(): Promise<{ total: number }> {
  return request("/api/dev/drafts/targets", { method: "GET" });
}

// 학교·반을 고르지 않고 미생성 전원을 생성한다.
export function startBatchAll(concurrency: number): Promise<BatchStatus> {
  return request("/api/dev/drafts/batch/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concurrency }),
  });
}

export function cancelBatch(): Promise<BatchStatus> {
  return request("/api/dev/drafts/batch/cancel", { method: "POST" });
}

// 초안 삭제 — 다시 만들기용. 승인된 초안은 확정본(카드)도 함께 지워진다.
export function deleteDrafts(ids: string[]): Promise<{ deleted: number }> {
  return request("/api/dev/drafts/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

// 다시 만들 대상 — codex 실패(실행 실패·시간 초과) · codex 거절(사진 문제) · △ 평가.
export type DraftIssue = "codex_failed" | "codex_refused" | "triangle" | "regenerated";

export function listDraftIssues(
  issue: DraftIssue
): Promise<{ drafts: Draft[]; counts: Record<DraftIssue, number> }> {
  return request(`/api/dev/drafts/issues?issue=${issue}`, { method: "GET" });
}

// △ 초안을 검수 이유를 반영해 다시 만든다 — 이유에 직업·문구가 있으면 텍스트, 그 밖은 이미지.
export function regenerateReview(ids: string[], concurrency: number): Promise<BatchStatus> {
  return request("/api/dev/drafts/regenerate-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, concurrency }),
  });
}

// 고른 초안들의 이미지만 백그라운드로 다시 만든다. 진행 상태는 getBatch()로 본다.
export function regenerateImages(ids: string[], concurrency: number): Promise<BatchStatus> {
  return request("/api/dev/drafts/regenerate-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, concurrency }),
  });
}
