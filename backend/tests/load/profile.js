import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import encoding from 'k6/encoding';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

function positive(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name}: positive integer required`);
  return value;
}

const profile = __ENV.PROFILE || 'smoke';
const journey = __ENV.JOURNEY || 'own';
if (!['own', 'shared', 'visit', 'visit-existing'].includes(journey)) throw new Error('Unknown JOURNEY');
const reuseAccount = __ENV.REUSE_ACCOUNT === '1';
const requireCard = __ENV.REQUIRE_CARD !== '0';
const requireCompetencies = __ENV.REQUIRE_COMPETENCIES !== '0';
const requireVisitTimestamp = __ENV.REQUIRE_VISIT_TIMESTAMP !== '0';
if (reuseAccount && !['own', 'visit-existing'].includes(journey)) throw new Error('Account reuse only supports own or visit-existing');
const baseUrl = (__ENV.BASE_URL || '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/?#]+$/.test(baseUrl)) {
  throw new Error('BASE_URL must be an explicit API origin, e.g. http://localhost:8000');
}
const stageSeconds = positive('STAGE_SECONDS', 300);
const smokeSeconds = positive('SMOKE_SECONDS', 120);
const recoverySeconds = positive('RECOVERY_SECONDS', 300);
const p95 = positive('P95_MS', 800);
const syncWindow = positive('SYNC_WINDOW_MS', 1000);
const timeoutSeconds = 10;
const drainSeconds = journey === 'visit' ? 62 : journey === 'visit-existing' ? 22 : 12;
const scenarios = {};
const expected = {};
let timeline = 0;

function arrival(name, rate, seconds, startTime = 0) {
  scenarios[name] = {
    executor: 'constant-arrival-rate', exec: 'readProfile',
    rate, timeUnit: '1s', duration: `${seconds}s`, startTime: `${startTime}s`,
    // Single-read timeout budget. Multi-request journeys also enforce zero dropped iterations.
    preAllocatedVUs: rate * (timeoutSeconds + 1),
    gracefulStop: `${drainSeconds}s`,
  };
  expected[name] = rate * seconds;
}

let uniqueCount = 1;
if (profile === 'smoke') {
  arrival('smoke', 1, smokeSeconds);
  timeline = smokeSeconds + drainSeconds;
} else if (profile === 'steady') {
  for (const rate of [10, 20, 35, 50]) {
    arrival(`steady_${rate}`, rate, stageSeconds, timeline);
    timeline += stageSeconds + drainSeconds; // Drain previous requests before the next stage.
  }
} else if (profile === 'burst10' || profile === 'burst5') {
  const seconds = profile === 'burst10' ? 10 : 5;
  uniqueCount = 500;
  arrival('burst', 500 / seconds, seconds);
  timeline = seconds + drainSeconds;
} else if (/^sync(100|300|500)$/.test(profile)) {
  uniqueCount = Number(profile.slice(4));
  scenarios.sync = {
    executor: 'per-vu-iterations', exec: 'synchronizedRead',
    vus: uniqueCount, iterations: 1, maxDuration: `${drainSeconds + 3}s`, gracefulStop: '0s',
  };
  expected.sync = uniqueCount;
  timeline = drainSeconds + 3;
} else {
  throw new Error('PROFILE: smoke | steady | burst10 | burst5 | sync100 | sync300 | sync500');
}
if (profile.startsWith('burst') || profile.startsWith('sync')) {
  arrival('recovery', 3, recoverySeconds, timeline);
  timeline += recoverySeconds + drainSeconds;
}
// Repeating visit journeys assign one account per VU to avoid competing writes to one student.
if (journey === 'visit' && (profile === 'smoke' || profile === 'steady')) {
  uniqueCount = Math.max(...Object.values(scenarios).map((s) => s.preAllocatedVUs));
}

const accounts = new SharedArray('student accounts', () => {
  if (!__ENV.ACCOUNTS_FILE) throw new Error('ACCOUNTS_FILE is required (absolute path recommended)');
  const rows = JSON.parse(open(__ENV.ACCOUNTS_FILE));
  if (!Array.isArray(rows) || rows.length < (reuseAccount ? 1 : uniqueCount)) {
    throw new Error(`At least ${uniqueCount} distinct student accounts required`);
  }
  const seen = new Set();
  rows.forEach((row, index) => {
    let claims;
    try {
      claims = JSON.parse(encoding.b64decode(row.student_token.split('.')[1], 'rawurl', 's'));
    } catch (_) {
      throw new Error(`Account row ${index + 1}: invalid JWT format`);
    }
    if (claims.kind !== 'student' || !claims.sub || claims.sub !== row.student_id || seen.has(claims.sub)) {
      throw new Error(`Account row ${index + 1}: student ID mismatch, duplicate, or wrong token kind`);
    }
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 < Date.now() + (timeline + 60) * 1000) {
      throw new Error(`Account row ${index + 1}: token expires before the run ends`);
    }
    seen.add(claims.sub);
    if (journey === 'shared' && !row.share_code) throw new Error(`Account row ${index + 1}: share_code required`);
    if (journey === 'visit' && (!row.booth_code || !row.booth_id)) {
      throw new Error(`Account row ${index + 1}: booth_code and booth_id required`);
    }
    if (journey === 'visit-existing' && (!row.booth_code || !row.booth_id || !row.baseline || typeof row.was_visited !== 'boolean')) {
      throw new Error('visit-existing needs booth and baseline data from the HTTP runner');
    }
  });
  return rows;
});

const completed = new Counter('profile_completed');
const valid = new Rate('profile_valid');
const elapsed = new Trend('profile_elapsed_ms', true);
const startOffset = new Trend('sync_start_offset_ms', true);
const apiElapsed = new Trend('api_elapsed_ms', true);
const newVisits = new Counter('new_visits');
const duplicateVisits = new Counter('duplicate_visits');
const thresholds = { dropped_iterations: ['count==0'] };
for (const [name, count] of Object.entries(expected)) {
  const tag = `{scenario:${name}}`;
  thresholds[`profile_completed${tag}`] = [`count==${count}`];
  thresholds[`profile_valid${tag}`] = ['rate==1'];
  thresholds[`http_req_failed${tag}`] = ['rate<0.01'];
  const requestsPerJourney = name === 'recovery' ? 1 : journey === 'visit' ? 6 : journey === 'visit-existing' ? 2 : 1;
  thresholds[`profile_elapsed_ms${tag}`] = [`p(95)<${p95 * requestsPerJourney}`];
  const endpoints = journey === 'shared' ? ['shared'] : journey === 'visit' && name !== 'recovery'
    ? ['own', 'booth', 'visit_new', 'visit_duplicate'] : journey === 'visit-existing' && name !== 'recovery'
    ? ['own', 'visit_existing'] : ['own'];
  for (const endpoint of endpoints) {
    // New visits may only occur in the first steady stage; count is enforced across the run below.
    if (endpoint === 'visit_new') continue;
    thresholds[`api_elapsed_ms{scenario:${name},endpoint:${endpoint}}`] = [`p(95)<${p95}`];
  }
}
if (journey === 'visit') {
  thresholds.new_visits = [profile.startsWith('burst') || profile.startsWith('sync') ? `count==${uniqueCount}` : 'count>0'];
  thresholds.duplicate_visits = ['count>0'];
  thresholds['api_elapsed_ms{endpoint:visit_new}'] = [`p(95)<${p95}`];
}
if (journey === 'visit-existing') {
  if (accounts.length !== 1 || !reuseAccount) throw new Error('visit-existing requires exactly one existing account');
  thresholds.new_visits = [`count==${accounts[0].was_visited ? 0 : 1}`];
}
if (scenarios.sync) thresholds.sync_start_offset_ms = [`max<${syncWindow}`];

export const options = {
  scenarios, thresholds,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  // A first visit uses a new connection; do not make later iterations artificially warmer.
  noVUConnectionReuse: true,
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response', 'error_code'],
};

function request(account, endpoint, method, path, anonymous = false) {
  const started = Date.now();
  const response = http.request(method, `${baseUrl}${path}`, null, {
    headers: anonymous ? {} : { Authorization: `Bearer ${account.student_token}` },
    timeout: `${timeoutSeconds}s`, redirects: 0,
    tags: { name: `${method} ${endpoint}`, endpoint },
  });
  apiElapsed.add(Date.now() - started, { endpoint });
  let body = null;
  try { body = response.json(); } catch (_) { /* Verified below. */ }
  const ok = check(response, { [`${endpoint}: HTTP 200 JSON`]: (r) => r.status === 200 && body !== null });
  return { body, ok };
}

function ownValid(body) {
  return Boolean(body && body.has_completed === true && body.student && body.persona &&
    (!requireCard || body.card?.card_image_url) && Array.isArray(body.booths) &&
    (!requireCompetencies || body.competencies?.length === 10));
}

function own(account) { return request(account, 'own', 'GET', '/api/students/me'); }

function existingVisit(account) {
  // One existing student: first insert at most once, subsequent requests test idempotency.
  const result = request(account, 'visit_existing', 'POST', `/api/booths/${encodeURIComponent(account.booth_code)}/visit`);
  if (!result.ok || result.body.code !== account.booth_code || typeof result.body.already_visited !== 'boolean' || !result.body.visited_at) return false;
  newVisits.add(result.body.already_visited ? 0 : 1);
  duplicateVisits.add(result.body.already_visited ? 1 : 0);
  const current = own(account);
  if (!current.ok || !ownValid(current.body)) return false;
  const booth = current.body.booths.find((b) => b.id === account.booth_id);
  const expectedTime = account.was_visited ? account.visited_at : result.body.visited_at;
  return Boolean(booth?.visited && Number.isFinite(Date.parse(expectedTime)) &&
    Date.parse(booth.visited_at) === Date.parse(expectedTime) &&
    Date.parse(result.body.visited_at) === Date.parse(expectedTime) &&
    account.baseline.every((c) => current.body.competencies.some((next) => next.key === c.key &&
      next.score === c.score + (!account.was_visited && account.booth_competencies.includes(c.key) ? 1 : 0))));
}

function visit(account) {
  const before = own(account);
  if (!before.ok || !ownValid(before.body)) return false;
  const boothBefore = before.body.booths.find((b) => b.id === account.booth_id);
  const codePath = `/api/booths/${encodeURIComponent(account.booth_code)}`;
  const booth = request(account, 'booth', 'GET', codePath);
  if (!booth.ok || !boothBefore || booth.body.code !== account.booth_code ||
      booth.body.visited !== boothBefore.visited) return false;
  const wasVisited = boothBefore.visited;
  const first = request(account, wasVisited ? 'visit_duplicate' : 'visit_new', 'POST', `${codePath}/visit`);
  if (!first.ok || first.body.code !== account.booth_code ||
      first.body.already_visited !== wasVisited || !first.body.visited_at) return false;
  if (wasVisited) duplicateVisits.add(1); else newVisits.add(1);
  const after = own(account);
  if (!after.ok || !ownValid(after.body)) return false;
  const target = after.body.booths.find((b) => b.id === account.booth_id);
  const sameInstant = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
  if (!target?.visited || (requireVisitTimestamp && !sameInstant(target.visited_at, first.body.visited_at))) return false;
  if (wasVisited && requireVisitTimestamp && (!sameInstant(first.body.visited_at, boothBefore.visited_at) ||
      !sameInstant(booth.body.visited_at, boothBefore.visited_at))) return false;
  const incremented = !requireCompetencies || before.body.competencies.every((c) => {
    const next = after.body.competencies.find((n) => n.key === c.key);
    const increment = !wasVisited && (boothBefore.competencies || []).includes(c.key) ? 1 : 0;
    return next && next.score === c.score + increment;
  });
  if (!incremented) return false;
  const duplicate = request(account, 'visit_duplicate', 'POST', `${codePath}/visit`);
  if (!duplicate.ok || duplicate.body.code !== account.booth_code ||
      duplicate.body.already_visited !== true || !sameInstant(duplicate.body.visited_at, first.body.visited_at)) return false;
  duplicateVisits.add(1);
  const final = own(account);
  if (!final.ok || !ownValid(final.body)) return false;
  const finalBooth = final.body.booths.find((b) => b.id === account.booth_id);
  return Boolean(finalBooth?.visited && (!requireVisitTimestamp || sameInstant(finalBooth.visited_at, target.visited_at)) &&
    (!requireCompetencies || after.body.competencies.every((c) => final.body.competencies.some((n) => n.key === c.key && n.score === c.score))));
}

export function readProfile() {
  const name = exec.scenario.name;
  const index = exec.scenario.iterationInTest;
  // Some k6 versions schedule an extra iteration exactly at the duration boundary.
  // Cap HTTP work explicitly; missing scheduled work still fails the count threshold.
  if (index >= expected[name]) return;
  const accountIndex = journey === 'visit' && name !== 'recovery' && (profile === 'smoke' || profile === 'steady')
    ? exec.vu.idInTest - 1 : name === 'burst' || name === 'sync' ? index : index % accounts.length;
  const account = accounts[reuseAccount ? accountIndex % accounts.length : accountIndex];
  if (!account) exec.test.abort('Insufficient distinct accounts for the burst');
  const tags = { scenario: name };
  const started = Date.now();
  let passed;
  if (journey === 'visit-existing' && name !== 'recovery') {
    passed = existingVisit(account);
  } else if (journey === 'visit' && name !== 'recovery') {
    passed = visit(account);
  } else if (journey === 'shared') {
    const { body, ok } = request(account, 'shared', 'GET', `/api/students/shared/${encodeURIComponent(account.share_code)}`, true);
    passed = Boolean(ok && typeof body.display_name === 'string' && body.persona && body.card?.card_image_url &&
      Array.isArray(body.booths) && body.competencies?.length === 10 &&
      !['student', 'completed_session_id', 'retry_enabled', 'share_path', 'has_completed', 'password', 'photo_url'].some((key) => key in body));
  } else {
    const result = own(account);
    passed = result.ok && ownValid(result.body);
  }
  check(passed, { 'journey data correct': (value) => value }, tags);
  elapsed.add(Date.now() - started, tags);
  valid.add(passed, tags);
  completed.add(1, tags);
}

export function synchronizedRead() {
  // Single local k6 process: align VUs to a common time, then measure actual dispatch skew.
  const target = exec.scenario.startTime + 2000;
  const delay = target - Date.now();
  if (delay > 0) sleep(delay / 1000);
  startOffset.add(Math.max(0, Date.now() - target));
  readProfile();
}
