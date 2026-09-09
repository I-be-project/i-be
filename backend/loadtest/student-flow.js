/*
 * 학생 정상 플로우 부하테스트 — 회원가입 없이 관리자 API로 발급한
 * 테스트 계정(kind='test')만 사용한다. 실제 참가자 데이터는 건드리지 않는다.
 *
 * AI(OpenAI/OpenRouter) 호출 엔드포인트는 의도적으로 제외했다:
 *   - POST /api/generate/{stage}  (적응형 질문 생성)
 *   - /api/dev/*                  (AI 이미지·카드 생성 개발용 엔드포인트)
 * 두 경로 다 호출당 실제 AI 비용이 발생해서 부하테스트로 반복 호출하면 안 된다.
 * POST /api/sessions/complete는 persona 없이 호출하므로 AI를 태우지 않는다.
 *
 * 부스 체크인(GET/POST /api/booths/{code})도 뺐다 — 카드 발급(POST /api/cards/generate)이
 * 아직 미구현이라 어떤 테스트 계정도 has_card=true가 될 수 없고, 그 상태로 부스를 찍으면
 * 항상 403이 나서 지금은 의미 있게 테스트할 수 없다. 카드 발급이 구현되면 이 파일에
 * 이어서 추가하면 된다.
 *
 * ── 사용법 ──────────────────────────────────────────────────
 *   # 1) 스크립트가 제대로 도는지 먼저 확인 (VU 1개, 30초)
 *   k6 run -e PROFILE=smoke backend/loadtest/student-flow.js
 *
 *   # 2) 실제 부하
 *   k6 run backend/loadtest/student-flow.js
 *
 * ADMIN_USERNAME / ADMIN_PASSWORD는 -e로 주지 않으면 backend/.env에서 자동으로 읽는다.
 * (-e로 준 값이 항상 우선. .env를 못 읽으면 그때만 에러)
 *
 * ── 환경변수 (전부 -e KEY=VALUE 로 전달) ────────────────────
 *   PROFILE         smoke | load | stress. 기본 load
 *                     smoke  VU 1, 30초 — 스크립트 검증용. 부하 아님
 *                     load   VU 10→30 램프, 3분 30초 — 기본
 *                     stress VU 30→100 램프, 4분 — 한계 확인용
 *   BASE_URL        대상 서버. 기본 http://localhost:8000
 *   ADMIN_USERNAME  관리자 계정 (테스트 계정 발급/삭제에 필요). 미지정 시 .env에서 읽음
 *   ADMIN_PASSWORD  관리자 비밀번호. 미지정 시 .env에서 읽음
 *   ACCOUNTS        미리 만들어둘 테스트 계정 수. 기본은 프로필 최대 VU 수와 동일
 *   INCLUDE_PHOTO   "true"면 더미 사진을 실제 S3에 업로드하는 단계 포함. 기본 false
 *                   (S3 쓰기·비용이 실제로 발생하니 켤 때 주의)
 *   ADMIN_READ_VUS  0보다 크면 관리자 조회 API(부스 통계 등)도 같이 부하를 준다. 기본 0(끔)
 *   SCHOOL          admin_read 시나리오의 반별 진행 현황 조회에 쓸 실제 학교명(선택)
 *   KEEP_ACCOUNTS   "true"면 종료 후 테스트 계정을 삭제하지 않고 남겨둔다(디버깅용). 기본 false
 *   P95_MS          http_req_duration p(95) 임계값(ms). 기본 800
 *   ERROR_RATE      http_req_failed 허용 비율. 기본 0.01
 *
 * ── 뒷정리 ──────────────────────────────────────────────────
 * 종료 시 teardown()이 DELETE /api/admin/students/test를 호출해서 테스트 계정을
 * 전부(이전 실행에서 남은 것까지) 정리한다. DB는 cascade로 세션·답변까지 함께 지워진다.
 * k6가 도중에 강제 종료(Ctrl+C)되면 teardown이 안 돌 수 있으니, 그럴 땐 수동으로
 *   curl -X DELETE $BASE_URL/api/admin/students/test -H "Authorization: Bearer <admin_token>"
 * 을 한 번 불러서 정리해야 한다.
 */

import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { Counter } from 'k6/metrics';

// ---- .env 폴백 로딩 (init 컨텍스트에서만 가능) ----

/**
 * dotenv 형식을 최소한으로 파싱한다. 따옴표 제거 + " #" 뒤 인라인 주석 제거만 하고,
 * 변수 치환($VAR) 같은 확장 문법은 지원하지 않는다(백엔드도 pydantic-settings 기본 동작을 쓴다).
 */
function parseDotenv(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();

    const quoted =
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2);
    if (quoted) {
      val = val.slice(1, -1);
    } else {
      // 인라인 주석은 "공백 + #"일 때만 자른다. 값 안의 #(비밀번호 등)은 보존.
      const hash = val.search(/\s#/);
      if (hash >= 0) val = val.slice(0, hash).trim();
    }
    out[key] = val;
  }
  return out;
}

// backend/.env — 이 스크립트(backend/loadtest/) 기준 상대 경로.
// 파일이 없어도 -e로 다 넘기면 되므로 여기서 실패시키지 않는다.
let DOTENV = {};
try {
  DOTENV = parseDotenv(open('../.env'));
} catch (e) {
  DOTENV = {};
}

/** -e 플래그 > backend/.env > 기본값 순으로 값을 고른다. */
function envOr(key, fallback) {
  if (__ENV[key] !== undefined && __ENV[key] !== '') return __ENV[key];
  if (DOTENV[key] !== undefined && DOTENV[key] !== '') return DOTENV[key];
  return fallback;
}

// ---- 설정 ----

// BASE_URL은 .env의 APP_BASE_URL을 폴백으로 쓴다(백엔드가 자기 주소로 쓰는 값과 동일).
const BASE_URL = (__ENV.BASE_URL || DOTENV.APP_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const ADMIN_USERNAME = envOr('ADMIN_USERNAME', '');
const ADMIN_PASSWORD = envOr('ADMIN_PASSWORD', '');
const INCLUDE_PHOTO = (__ENV.INCLUDE_PHOTO || 'false') === 'true';
const ADMIN_READ_VUS = Number(__ENV.ADMIN_READ_VUS || 0);
const KEEP_ACCOUNTS = (__ENV.KEEP_ACCOUNTS || 'false') === 'true';
const P95_MS = Number(__ENV.P95_MS || 800);
const ERROR_RATE = Number(__ENV.ERROR_RATE || 0.01);
// admin_read 시나리오의 반별 진행 현황 조회용 — 존재하지 않는 학교명이면 그냥 빈 목록으로
// 200이 나오니 에러는 아니지만, 실제 데이터로 재는 게 더 의미 있어 env로 바꿀 수 있게 뒀다.
const SCHOOL_FOR_PROGRESS = __ENV.SCHOOL || '테스트';

// 부하 프로필. duration은 stages 합과 맞춰둔다(admin_read를 같이 끝내기 위해).
const PROFILES = {
  smoke: {
    stages: [{ duration: '10s', target: 1 }, { duration: '20s', target: 1 }],
    duration: '30s',
    maxVUs: 1,
  },
  load: {
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 30 },
      { duration: '1m', target: 30 },
      { duration: '30s', target: 0 },
    ],
    duration: '3m30s',
    maxVUs: 30,
  },
  stress: {
    stages: [
      { duration: '30s', target: 30 },
      { duration: '1m', target: 60 },
      { duration: '1m', target: 100 },
      { duration: '1m', target: 100 },
      { duration: '30s', target: 0 },
    ],
    duration: '4m',
    maxVUs: 100,
  },
};

const PROFILE_NAME = __ENV.PROFILE || 'load';
const PROFILE = PROFILES[PROFILE_NAME];
if (!PROFILE) {
  throw new Error(
    `알 수 없는 PROFILE: ${PROFILE_NAME}. 가능한 값: ${Object.keys(PROFILES).join(', ')}`
  );
}

// 계정 수 기본값은 프로필 최대 VU와 맞춘다 — VU마다 다른 계정을 쓰게 하려는 것.
const ACCOUNT_COUNT = Number(__ENV.ACCOUNTS || PROFILE.maxVUs);

// 실제 답변 내용은 자유 JSON이라 부하테스트에서는 최소한의 더미 값만 채운다.
// app/services/session_service.py의 ANSWER_STAGES와 일치해야 한다.
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

// ---- 시나리오 구성 ----
// constant-vus는 vus >= 1을 요구하므로, admin_read는 켤 때만 시나리오에 넣는다.
// (vus: 0으로 선언해두면 k6가 설정 검증 단계에서 아예 실행을 거부한다)
const scenarios = {
  student_flow: {
    executor: 'ramping-vus',
    exec: 'studentFlow',
    startVUs: 0,
    stages: PROFILE.stages,
    gracefulRampDown: '10s',
  },
};

if (ADMIN_READ_VUS > 0) {
  scenarios.admin_read = {
    executor: 'constant-vus',
    exec: 'adminRead',
    vus: ADMIN_READ_VUS,
    duration: PROFILE.duration,
  };
}

export const options = {
  scenarios,
  // 임계값은 본 시나리오({phase:main})만 본다. setup/teardown의 계정 발급·정리 요청이
  // 응답시간·실패율 통계를 오염시키지 않게 하려는 것.
  thresholds: {
    'http_req_duration{phase:main}': [`p(95)<${P95_MS}`],
    'http_req_failed{phase:main}': [`rate<${ERROR_RATE}`],
    domain_errors: ['count<1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// ---- 공통 헬퍼 ----

function authHeaders(token, extraTags) {
  return {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    tags: extraTags || {},
  };
}

/**
 * 2xx면 true. 실패하면 domain_errors를 올리고 원인을 로그로 남긴다.
 * 부하테스트에서 어떤 엔드포인트가 왜 깨졌는지 사후에 알 수 있어야 해서 body 앞부분까지 찍는다.
 */
function checkOk(res, name) {
  const ok = check(res, { [`${name}: status 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  if (!ok) {
    errors.add(1);
    console.error(`${name} 실패 (${res.status}): ${String(res.body).slice(0, 200)}`);
  }
  return ok;
}

// ---- setup: 관리자 로그인 + 테스트 계정 발급 (한 번만, VU 시작 전) ----

export function setup() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    fail(
      'ADMIN_USERNAME / ADMIN_PASSWORD를 찾을 수 없습니다. backend/.env에 넣거나 -e로 전달하세요.'
    );
  }

  console.log(
    `프로필=${PROFILE_NAME} 대상=${BASE_URL} 계정=${ACCOUNT_COUNT}개 ` +
      `사진업로드=${INCLUDE_PHOTO} 관리자조회VU=${ADMIN_READ_VUS}`
  );

  const loginRes = http.post(
    `${BASE_URL}/api/admin/login`,
    JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { phase: 'setup' } }
  );
  if (loginRes.status === 0) {
    fail(`${BASE_URL} 에 연결할 수 없습니다. 서버가 떠 있는지 확인하세요. (${loginRes.error})`);
  }
  if (loginRes.status !== 200) {
    fail(`관리자 로그인 실패 (${loginRes.status}): ${loginRes.body}`);
  }
  const adminToken = loginRes.json('admin_token');

  // 이전 실행이 Ctrl+C로 끊겨 남은 테스트 계정을 먼저 치우고 시작한다.
  const purgeRes = http.del(
    `${BASE_URL}/api/admin/students/test`,
    null,
    authHeaders(adminToken, { phase: 'setup' })
  );
  if (purgeRes.status === 200 && purgeRes.json('deleted') > 0) {
    console.log(`이전 실행에서 남은 테스트 계정 ${purgeRes.json('deleted')}개를 정리했습니다.`);
  }

  const runId = `${Date.now()}`;
  const tokens = [];
  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    const createRes = http.post(
      `${BASE_URL}/api/admin/students/test`,
      JSON.stringify({ name: `k6-${runId}-${i}`, gender: i % 2 === 0 ? 'male' : 'female' }),
      authHeaders(adminToken, { phase: 'setup' })
    );
    if (createRes.status !== 201) {
      fail(`테스트 계정 생성 실패 (${createRes.status}): ${createRes.body}`);
    }
    const studentId = createRes.json('id');

    const tokenRes = http.post(
      `${BASE_URL}/api/admin/students/test/${studentId}/token`,
      null,
      authHeaders(adminToken, { phase: 'setup' })
    );
    if (tokenRes.status !== 200) {
      fail(`테스트 계정 토큰 발급 실패 (${tokenRes.status}): ${tokenRes.body}`);
    }
    tokens.push(tokenRes.json('student_token'));
  }

  console.log(`setup 완료: 테스트 계정 ${tokens.length}개 발급`);
  return { adminToken, tokens };
}

// ---- 학생 플로우 (VU마다 반복 실행) ----
// 테스트 계정은 kind='test'라 재시도가 항상 허용되므로(session_service.complete_survey)
// 같은 계정으로 몇 번을 반복해도 409가 나지 않는다.

export function studentFlow(data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const opts = authHeaders(token, { phase: 'main' });

  group('프로필 조회', () => {
    const res = http.get(`${BASE_URL}/api/students/me`, {
      headers: opts.headers,
      tags: { phase: 'main', name: 'GET /students/me' },
    });
    checkOk(res, 'GET /students/me');
  });
  sleep(1);

  if (INCLUDE_PHOTO) {
    group('사진 업로드', () => {
      const res = http.post(
        `${BASE_URL}/api/students/me/photo`,
        { file: http.file(TINY_JPEG.buffer, 'photo.jpg', 'image/jpeg') },
        {
          headers: { Authorization: `Bearer ${token}` },
          tags: { phase: 'main', name: 'POST /students/me/photo' },
        }
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
        { headers: opts.headers, tags: { phase: 'main', name: 'POST /sessions/answers' } }
      );
      if (checkOk(res, `POST /sessions/answers[${stage}]`)) {
        // 첫 호출이 만든 세션 id를 이후 stage와 complete에서 재사용한다.
        sessionId = res.json('session_id');
      }
      sleep(0.3);
    }
  });

  group('설문 완료', () => {
    const res = http.post(
      `${BASE_URL}/api/sessions/complete`,
      JSON.stringify({ sessionId }),
      { headers: opts.headers, tags: { phase: 'main', name: 'POST /sessions/complete' } }
    );
    checkOk(res, 'POST /sessions/complete');
  });
  sleep(1);

  group('완료 후 프로필 재조회', () => {
    const res = http.get(`${BASE_URL}/api/students/me`, {
      headers: opts.headers,
      tags: { phase: 'main', name: 'GET /students/me' },
    });
    checkOk(res, 'GET /students/me (완료 후)');
  });
  sleep(1);
}

// ---- 관리자/운영진 조회 API 부하 (선택, ADMIN_READ_VUS>0일 때만 시나리오에 등록) ----

export function adminRead(data) {
  const headers = authHeaders(data.adminToken).headers;

  group('관리자 조회', () => {
    checkOk(
      http.get(`${BASE_URL}/api/admin/students?limit=50&include_photo=false`, {
        headers,
        tags: { phase: 'main', name: 'GET /admin/students' },
      }),
      'GET /admin/students'
    );
    checkOk(
      http.get(`${BASE_URL}/api/admin/booths/stats`, {
        headers,
        tags: { phase: 'main', name: 'GET /admin/booths/stats' },
      }),
      'GET /admin/booths/stats'
    );
    checkOk(
      http.get(
        `${BASE_URL}/api/admin/progress/classes?school=${encodeURIComponent(SCHOOL_FOR_PROGRESS)}`,
        { headers, tags: { phase: 'main', name: 'GET /admin/progress/classes' } }
      ),
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
  const res = http.del(
    `${BASE_URL}/api/admin/students/test`,
    null,
    authHeaders(data.adminToken, { phase: 'teardown' })
  );
  if (res.status !== 200) {
    console.error(
      `테스트 계정 정리 실패 (${res.status}): ${res.body} — ` +
        '수동으로 DELETE /api/admin/students/test 를 호출해주세요.'
    );
    return;
  }
  console.log(`teardown 완료: ${JSON.stringify(res.json())}`);
}
