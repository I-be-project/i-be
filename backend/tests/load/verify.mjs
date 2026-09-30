// Integration checks against loopback only. Requires Node.js and k6 on PATH.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const directory = await mkdtemp(path.join(tmpdir(), 'ibe-k6-'));
const script = fileURLToPath(new URL('./profile.js', import.meta.url));
const fixture = path.join(directory, 'accounts.json');
const journey = process.env.JOURNEY || 'own';
const legacy = process.env.LEGACY_PROFILE === '1';
const accounts = Array.from({ length: 550 }, (_, index) => {
  const student_id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const claims = { sub: student_id, kind: 'student', exp: Math.floor(Date.now() / 1000) + 3600 };
  return {
    student_id,
    share_code: `share-${index}`,
    booth_id: 'test-booth-id', booth_code: 'TEST01',
    was_visited: false, visited_at: null, booth_competencies: ['c0'],
    baseline: Array.from({ length: 10 }, (_, i) => ({ key: `c${i}`, score: 0 })),
    student_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.mock`,
  };
});
await writeFile(fixture, JSON.stringify(journey === 'visit-existing' ? accounts.slice(0, 1) : accounts));
let mode = 'good';
let requests = [];
let visits = new Map();
const server = http.createServer((request, response) => {
  const isShared = request.url.startsWith('/api/students/shared/');
  requests.push(isShared ? request.url : request.headers.authorization);
  if (isShared) assert.equal(request.headers.authorization, undefined, 'Shared requests must be anonymous');
  const identity = request.headers.authorization;
  const visitedAt = visits.get(identity);
  let body = {
    ...(isShared ? { display_name: 'synthetic' } : { has_completed: true, student: { name: 'synthetic' } }),
    persona: { name: 'synthetic' }, card: { card_image_url: 'http://localhost/mock.png' },
    booths: [{ id: 'test-booth-id', visited: Boolean(visitedAt), visited_at: visitedAt || null, competencies: ['c0'] }],
    competencies: Array.from({ length: 10 }, (_, i) => ({ key: `c${i}`, score: i === 0 && visitedAt ? 1 : 0 })),
  };
  if (request.url === '/api/booths/TEST01') {
    assert.equal(request.method, 'GET');
    body = { code: 'TEST01', visited: Boolean(visitedAt), visited_at: visitedAt || null };
  } else if (request.url === '/api/booths/TEST01/visit') {
    assert.equal(request.method, 'POST');
    if (!visitedAt) visits.set(identity, new Date().toISOString());
    body = { code: 'TEST01', already_visited: Boolean(visitedAt), visited_at: visits.get(identity) };
    if (mode === 'bad_duplicate' && visitedAt) body.already_visited = false;
  } else {
    assert.ok(isShared || request.url === '/api/students/me');
    assert.equal(request.method, 'GET');
    if (mode === 'bad_score' && visitedAt) body.competencies[0].score = 2;
    if (mode === 'private_leak' && isShared) body.student = { name: 'private' };
  }
  if (legacy && request.url === '/api/students/me') {
    body.card = null;
    delete body.competencies;
    for (const booth of body.booths || []) delete booth.visited_at;
  }
  response.writeHead(mode === 'error' ? 503 : 200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(mode === 'malformed' ? {} : body));
});
await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1', backlog: 4096 }, resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

function run(profile, summary) {
  return new Promise((resolve, reject) => {
    const child = spawn('k6', ['run', '--quiet', '--summary-export', summary, script], {
      env: {
        ...process.env, BASE_URL: baseUrl, ACCOUNTS_FILE: fixture, PROFILE: profile,
        JOURNEY: journey,
        REUSE_ACCOUNT: journey === 'visit-existing' ? '1' : '0',
        REQUIRE_CARD: legacy ? '0' : '1', REQUIRE_COMPETENCIES: legacy ? '0' : '1',
        REQUIRE_VISIT_TIMESTAMP: legacy ? '0' : '1',
        SMOKE_SECONDS: '1', STAGE_SECONDS: '1', RECOVERY_SECONDS: '1',
        // Local mock is for correctness; these are not performance acceptance values.
        P95_MS: '10000', SYNC_WINDOW_MS: '5000', K6_NO_USAGE_REPORT: 'true',
      },
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

try {
  for (const [profile, count, distinct] of [
    ['smoke', 1, 1], ['steady', 115, 0], ['burst10', 503, 500],
    ['burst5', 503, 500], ['sync100', 103, 100], ['sync300', 303, 300], ['sync500', 503, 500],
  ]) {
    if (process.argv.length > 2 && !process.argv.slice(2).includes(profile)) continue;
    requests = [];
    visits = new Map();
    const summary = path.join(directory, `${profile}.json`);
    const result = await run(profile, summary);
    assert.equal(result.code, 0, result.output);
    const recovery = profile.startsWith('sync') || profile.startsWith('burst') ? 3 : 0;
    const expectedCount = journey === 'visit' ? (count - recovery) * 6 + recovery
      : journey === 'visit-existing' ? (count - recovery) * 2 + recovery : count;
    assert.equal(requests.length, expectedCount, `${profile}: request count`);
    if (distinct) assert.equal(new Set(journey === 'visit' ? requests : requests.slice(0, distinct)).size,
      journey === 'visit-existing' ? 1 : distinct, `${profile}: unique students`);
    const data = JSON.parse(await readFile(summary, 'utf8'));
    assert.ok(data.metrics.profile_completed, `${profile}: metrics exported`);
    console.log(`PASS ${journey}/${profile}: ${expectedCount} requests${journey === 'visit-existing' ? ', 1 reused student' : distinct ? `, ${distinct} distinct initial students` : ''}`);
  }
  for (const failureMode of ['error', 'malformed', ...(journey === 'visit' ? [...(legacy ? [] : ['bad_score']), 'bad_duplicate'] : journey === 'visit-existing' ? ['bad_score'] : journey === 'shared' ? ['private_leak'] : [])]) {
    mode = failureMode;
    visits = new Map();
    const result = await run('smoke', path.join(directory, `${mode}.json`));
    assert.equal(result.code, 99, result.output);
    console.log(`PASS ${mode}: thresholds reject invalid responses`);
  }
  mode = 'good';
  requests = [];
  await writeFile(fixture, JSON.stringify([accounts[0], ...accounts.slice(0, 549)]));
  const result = await run('smoke', path.join(directory, 'duplicate.json'));
  assert.notEqual(result.code, 0);
  assert.match(result.output, /duplicate/);
  assert.equal(requests.length, 0);
  console.log('PASS duplicate student rejected before HTTP requests');
} finally {
  await new Promise((resolve) => server.close(resolve));
  // Only the exact temporary directory created by this process is removed.
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('ibe-k6-'));
  await rm(directory, { recursive: true, force: true });
}
