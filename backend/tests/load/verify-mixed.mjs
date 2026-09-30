import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const dir = path.resolve('tests/load/results/verify-mixed-' + Date.now());
await mkdir(dir, { recursive: true });
const accounts = Array.from({ length: 20 }, (_, i) => ({ student_id: String(i), student_token: String(i) }));
const booths = Array.from({ length: 5 }, (_, i) => ({ id: String(i), code: 'BOOTH' + i }));
await writeFile(dir + '/accounts.json', JSON.stringify(accounts));
await writeFile(dir + '/booths.json', JSON.stringify(booths));
let bad = false;
let seen = new Set();
const visits = new Map();
const server = http.createServer((req, res) => {
  const token = req.headers.authorization;
  seen.add(token);
  let body;
  if (req.url === '/api/students/me') {
    body = { has_completed: true, student: {}, persona: {}, booths: booths.map(b => ({ ...b, visited: visits.has(token + b.id) })) };
  } else {
    const code = req.url.split('/')[3];
    const booth = booths.find(b => b.code === code);
    assert.ok(booth);
    const key = token + booth.id;
    const prior = visits.has(key);
    if (req.method === 'POST') {
      if (!prior) visits.set(key, new Date().toISOString());
      body = { code, already_visited: prior, visited_at: visits.get(key) };
    } else body = { code, visited: prior };
  }
  res.writeHead(bad ? 503 : 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const invalid of [false, true]) {
    bad = invalid; seen = new Set(); visits.clear();
    const summary = dir + `/summary-${invalid}.json`;
    const result = await new Promise((resolve, reject) => {
      const child = spawn('k6', ['run', '--quiet', '--summary-export', summary, 'tests/load/mixed.js'], {
        env: { ...process.env, BASE_URL: `http://127.0.0.1:${server.address().port}`,
          ACCOUNTS_FILE: dir + '/accounts.json', BOOTHS_FILE: dir + '/booths.json',
          MIXED_USERS: '20', MIXED_SECONDS: '3', MIXED_JITTER: '0.1', MIXED_THINK: '0.02', K6_NO_USAGE_REPORT: 'true' },
        windowsHide: true,
      });
      let output = '';
      child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
      child.on('error', reject); child.on('close', code => resolve({ code, output }));
    });
    assert.equal(seen.size, 20);
    const data = JSON.parse(await readFile(summary));
    assert.equal(data.metrics.participants.count, 20);
    if (invalid) assert.notEqual(result.code, 0);
    else { assert.equal(result.code, 0, result.output); assert.ok(visits.size > 20); }
    console.log(invalid ? 'HTTP failures detected: PASS' : 'Distinct users and multi-booth visits: PASS');
  }
} finally { server.close(); }
