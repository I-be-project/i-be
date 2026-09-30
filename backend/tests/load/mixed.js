import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

const users = Number(__ENV.MIXED_USERS || 3000);
const seconds = Number(__ENV.MIXED_SECONDS || 180);
const think = Number(__ENV.MIXED_THINK || 1);
const jitter = Number(__ENV.MIXED_JITTER || 15);
const base = __ENV.BASE_URL;
const accounts = new SharedArray('mixed students', () => JSON.parse(open(__ENV.ACCOUNTS_FILE)));
const booths = new SharedArray('mixed booths', () => JSON.parse(open(__ENV.BOOTHS_FILE)));
if (accounts.length !== users || !booths.length || !Number.isInteger(users) || users < 1 || seconds < 1) {
  throw new Error('Invalid mixed test fixtures or configuration');
}
const participants = new Counter('participants');
const actions = new Counter('actions_completed');
const valid = new Rate('action_valid');
const latency = new Trend('api_elapsed_ms', true);
const visits = new Counter('new_visits');
const duplicates = new Counter('duplicate_visits');
const visited = new Map();
let started = false;

export const options = {
  scenarios: { mixed: { executor: 'constant-vus', vus: users, duration: `${seconds}s`, gracefulStop: '30s' } },
  thresholds: {
    participants: [`count==${users}`],
    action_valid: ['rate==1'],
    http_req_failed: ['rate<0.01'],
    'api_elapsed_ms{endpoint:own}': ['p(95)<800'],
    'api_elapsed_ms{endpoint:booth}': ['p(95)<800'],
    'api_elapsed_ms{endpoint:visit}': ['p(95)<800'],
    new_visits: ['count>0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response', 'error_code'],
};

function call(account, endpoint, method, path) {
  const start = Date.now();
  const response = http.request(method, base + path, null, {
    headers: { Authorization: `Bearer ${account.student_token}` },
    timeout: '8s', redirects: 0, tags: { endpoint, name: `${method} ${endpoint}` },
  });
  latency.add(Date.now() - start, { endpoint });
  let body = null;
  try { body = response.json(); } catch (_) { /* Checked below. */ }
  return check(response, { [`${endpoint}: HTTP 200 JSON`]: r => r.status === 200 && body !== null }) ? body : null;
}

function own(account, booth = null) {
  const body = call(account, 'own', 'GET', '/api/students/me');
  return Boolean(body?.has_completed && body.student && body.persona && Array.isArray(body.booths) &&
    (!booth || body.booths.some(b => b.id === booth.id && b.visited)));
}

export default function () {
  const account = accounts[exec.vu.idInTest - 1];
  if (!started) {
    sleep(Math.random() * jitter);
    participants.add(1);
    started = true;
    const ok = own(account);
    valid.add(ok); actions.add(1, { action: 'own' });
    sleep((3 + Math.random() * 5) * think);
    return;
  }
  const choice = Math.random();
  const booth = booths[Math.floor(Math.random() * booths.length)];
  const path = `/api/booths/${encodeURIComponent(booth.code)}`;
  let ok;
  let action;
  if (choice < 0.5) {
    action = 'own'; ok = own(account);
  } else if (choice < 0.7) {
    action = 'browse_booth';
    const body = call(account, 'booth', 'GET', path);
    ok = Boolean(body && body.code === booth.code && typeof body.visited === 'boolean');
  } else {
    action = 'visit_booth';
    const body = call(account, 'visit', 'POST', `${path}/visit`);
    ok = Boolean(body && body.code === booth.code && typeof body.already_visited === 'boolean' &&
      Number.isFinite(Date.parse(body.visited_at)));
    if (ok) {
      // A timed-out POST may still commit: do not assume unseen visits are new.
      if (visited.has(booth.id)) {
        ok = body.already_visited && Date.parse(visited.get(booth.id)) === Date.parse(body.visited_at);
      }
      visited.set(booth.id, body.visited_at);
      if (body.already_visited) duplicates.add(1); else visits.add(1);
      ok = own(account, booth) && ok;
    }
  }
  check(ok, { 'action data correct': v => v });
  valid.add(ok); actions.add(1, { action });
  sleep((3 + Math.random() * 5) * think);
}
