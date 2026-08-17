/*
 * 학생 정상 플로우 부하테스트 — 회원가입 없이 관리자 API로 발급한
 * 테스트 계정(kind='test')만 사용한다. 실제 참가자 데이터는 건드리지 않는다.
 *
 * AI(OpenAI/OpenRouter) 호출 엔드포인트는 의도적으로 제외했다:
 *   - POST /api/generate/{stage}  (적응형 질문 생성)
 *   - /api/dev/*                  (AI 이미지·카드 생성 개발용 엔드포인트)
 * 두 경로 다 호출당 실제 AI 비용이 발생해서 부하테스트로 반복 호출하면 안 된다.
 *
 * 부스 체크인(GET/POST /api/booths/{code})도 뺐다 — 카드 발급(POST /api/cards/generate)이
 * 아직 미구현이라 어떤 테스트 계정도 has_card=true가 될 수 없고, 그 상태로 부스를 찍으면
 * 항상 403이 나서 지금은 의미 있게 테스트할 수 없다. 카드 발급이 구현되면 이 파일에
 * 이어서 추가하면 된다.
 *
 * 사용법:
 *   k6 run -e BASE_URL=http://localhost:8000 \
 *          -e ADMIN_USERNAME=... -e ADMIN_PASSWORD=... \
 *          backend/loadtest/student-flow.js
 *
 * 주요 환경변수 (전부 -e KEY=VALUE 로 전달):
 *   BASE_URL        대상 서버. 기본 http://localhost:8000
 *   ADMIN_USERNAME  관리자 계정 (테스트 계정 발급/삭제에 필요) — 필수
 *   ADMIN_PASSWORD  관리자 비밀번호 — 필수
 *   ACCOUNTS        미리 만들어둘 테스트 계정 수. 기본 30 (student_flow 최대 VU와 맞춰두면 됨)
 *   INCLUDE_PHOTO   "true"면 더미 사진을 실제 S3에 업로드하는 단계 포함. 기본 false
 *                   (S3 쓰기가 실제로 발생하니 켤 때 주의)
 *   ADMIN_READ_VUS  0보다 크면 관리자 조회 API(부스 통계 등)도 같이 부하를 준다. 기본 0(끔)
 *   SCHOOL          admin_read 시나리오의 반별 진행 현황 조회에 쓸 실제 학교명(선택)
 *   KEEP_ACCOUNTS   "true"면 종료 후 테스트 계정을 삭제하지 않고 남겨둔다(디버깅용). 기본 false
 *
 * 종료 시 teardown()이 자동으로 DELETE /api/admin/students/test를 호출해서
 * 이번에 만든 테스트 계정 전부(그리고 그 전에 남아있던 테스트 계정까지 전부)를 정리한다.
 * k6가 도중에 강제 종료(Ctrl+C)되면 teardown이 안 돌 수 있으니, 그럴 땐 수동으로
 *   curl -X DELETE $BASE_URL/api/admin/students/test -H "Authorization: Bearer <admin_token>"
 * 을 한 번 불러서 정리해야 한다.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const ADMIN_USERNAME = __ENV.ADMIN_USERNAME;
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD;
const ACCOUNT_COUNT = Number(__ENV.ACCOUNTS || 30);
const INCLUDE_PHOTO = (__ENV.INCLUDE_PHOTO || 'false') === 'true';
const ADMIN_READ_VUS = Number(__ENV.ADMIN_READ_VUS || 0);
const KEEP_ACCOUNTS = (__ENV.KEEP_ACCOUNTS || 'false') === 'true';
// admin_read 시나리오의 반별 진행 현황 조회용 — 존재하지 않는 학교명이면 그냥 빈 목록으로
// 200이 나오니 에러는 아니지만, 실제 데이터로 재는 게 더 의미 있어 env로 바꿀 수 있게 뒀다.
const SCHOOL_FOR_PROGRESS = __ENV.SCHOOL || '테스트';

// 실제 답변 내용은 자유 JSON이라 부하테스트에서는 최소한의 더미 값만 채운다.
const ANSWER_STAGES = ['q1to6', 'q7a', 'q7b', 'q8', 'q9'];

// 1x1 흰 픽셀 JPEG — INCLUDE_PHOTO=true일 때만 사용.
const TINY_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x02, 0x02,
  0x02, 0x03, 0x02, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x06, 0x04,
  0x04, 0x04, 0x04, 0x04, 0x08, 0x06, 0x06, 0x05, 0x06, 0x09, 0x08, 0x0a,
  0x0a, 0x09, 0x08, 0x09, 0x09, 0x0a, 0x0c, 0x0f, 0x0c, 0x0a, 0x0b, 0x0e,
  0x0b, 0x09, 0x09, 0x0d, 0x11, 0x0d, 0x0e, 0x0f, 0x10, 0x10, 0x11, 0x10,
  0x0a, 0x0c, 0x12, 0x13, 0x12, 0x10, 0x13, 0x0f, 0x10, 0x10, 0x10, 0xff,
  0xc9, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xcc, 0x00, 0x06, 0x00, 0x10, 0x10, 0x05, 0xff, 0xda, 0x00, 0x08,
  0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xd2, 0xcf, 0x20, 0xff, 0xd9,
]);

const errors = new Counter('domain_errors');

export const options = {
  scenarios: {
    student_flow: {
      executor: 'ramping-vus',
      exec: 'studentFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 30 },
        { duration: '1m', target: 30 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    admin_read: {
      executor: 'constant-vus',
      exec: 'adminRead',
      vus: ADMIN_READ_VUS, // 기본 0 → 비활성. 켜려면 -e ADMIN_READ_VUS=5 처럼 넘긴다.
      duration: '3m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

function checkOk(res, name) {
  const ok = check(res, { [`${name}: status 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  if (!ok) errors.add(1);
  return ok;
}

// ---- setup: 관리자 로그인 + 테스트 계정 발급 (한 번만, VU 시작 전) ----

export function setup() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_USERNAME / ADMIN_PASSWORD 환경변수가 필요합니다 (-e 로 전달).');
  }

  const loginRes = http.post(
    `${BASE_URL}/api/admin/login`,
    JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (loginRes.status !== 200) {
    throw new Error(`관리자 로그인 실패 (${loginRes.status}): ${loginRes.body}`);
  }
  const adminToken = loginRes.json('admin_token');

  const runId = `${Date.now()}`;
  const tokens = [];
  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    const createRes = http.post(
      `${BASE_URL}/api/admin/students/test`,
      JSON.stringify({ name: `k6-loadtest-${runId}-${i}`, gender: i % 2 === 0 ? 'male' : 'female' }),
      authHeaders(adminToken)
    );
    if (createRes.status !== 201) {
      throw new Error(`테스트 계정 생성 실패 (${createRes.status}): ${createRes.body}`);
    }
    const studentId = createRes.json('id');

    const tokenRes = http.post(
      `${BASE_URL}/api/admin/students/test/${studentId}/token`,
      null,
      authHeaders(adminToken)
    );
    if (tokenRes.status !== 200) {
      throw new Error(`테스트 계정 토큰 발급 실패 (${tokenRes.status}): ${tokenRes.body}`);
    }
    tokens.push(tokenRes.json('student_token'));
  }

  console.log(`setup 완료: 테스트 계정 ${tokens.length}개 발급`);
  return { adminToken, tokens };
}

// ---- 학생 플로우 (VU마다 반복 실행) ----

export function studentFlow(data) {
  const token = data.tokens[__VU % data.tokens.length];
  const opts = authHeaders(token);

  group('프로필 조회', () => {
    const res = http.get(`${BASE_URL}/api/students/me`, opts);
    checkOk(res, 'GET /students/me');
  });
  sleep(1);

  if (INCLUDE_PHOTO) {
    group('사진 업로드', () => {
      const res = http.post(
        `${BASE_URL}/api/students/me/photo`,
        { file: http.file(TINY_JPEG.buffer, 'photo.jpg', 'image/jpeg') },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      checkOk(res, 'POST /students/me/photo');
    });
    sleep(1);
  }

  let sessionId;
  group('설문 답변 저장', () => {
    for (const stage of ANSWER_STAGES) {
      const res = http.post(
        `${BASE_URL}/api/sessions/answers`,
        JSON.stringify({ sessionId: sessionId, stage, answer: { value: 'loadtest' } }),
        opts
      );
      if (checkOk(res, `POST /sessions/answers[${stage}]`)) {
        sessionId = res.json('session_id');
      }
      sleep(0.3);
    }
  });

  group('설문 완료', () => {
    const res = http.post(
      `${BASE_URL}/api/sessions/complete`,
      JSON.stringify({ sessionId }),
      opts
    );
    checkOk(res, 'POST /sessions/complete');
  });
  sleep(1);

  group('완료 후 프로필 재조회', () => {
    const res = http.get(`${BASE_URL}/api/students/me`, opts);
    checkOk(res, 'GET /students/me (완료 후)');
  });
  sleep(1);
}

// ---- 관리자/운영진 조회 API 부하 (선택, ADMIN_READ_VUS>0일 때만 동작) ----

export function adminRead(data) {
  const opts = authHeaders(data.adminToken);

  group('관리자 조회', () => {
    checkOk(http.get(`${BASE_URL}/api/admin/students?limit=50&include_photo=false`, opts), 'GET /admin/students');
    checkOk(http.get(`${BASE_URL}/api/admin/booths/stats`, opts), 'GET /admin/booths/stats');
    checkOk(
      http.get(`${BASE_URL}/api/admin/progress/classes?school=${encodeURIComponent(SCHOOL_FOR_PROGRESS)}`, opts),
      'GET /admin/progress/classes'
    );
  });
  sleep(2);
}

// ---- teardown: 테스트 계정 일괄 삭제 ----

export function teardown(data) {
  if (KEEP_ACCOUNTS) {
    console.log('KEEP_ACCOUNTS=true — 테스트 계정을 삭제하지 않고 남겨둡니다.');
    return;
  }
  const res = http.del(`${BASE_URL}/api/admin/students/test`, null, authHeaders(data.adminToken));
  if (res.status !== 200) {
    console.error(`테스트 계정 정리 실패 (${res.status}): ${res.body} — 수동으로 DELETE /api/admin/students/test 를 호출해주세요.`);
    return;
  }
  console.log(`teardown 완료: ${JSON.stringify(res.json())}`);
}
