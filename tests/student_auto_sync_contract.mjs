import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const sync = fs.readFileSync(new URL('sync-layer.js', root), 'utf8');
const pages = ['index.html', 'v6-staging.html'];
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

new Function(sync);
check(/6\.5\.2-AUTO-SYNC-ROLE-SAFE/.test(sync), 'sync version marker missing');
check(/currentRole\(\) === 'student'/.test(sync), 'student-only role gate missing');
check(/currentUser\.studentId \? 'student'/.test(sync), 'legacy student session fallback missing');
check(/pointTestInProgress\(\)/.test(sync), 'point-test refresh guard missing');
check(/loadHomeLearningPreview\(force\)/.test(sync), 'guarded home schedule loader missing');
check(/loadMySchedule\(/.test(sync), 'guarded schedule screen loader missing');
check(!/currentUser\.(?:name|className)\s*=/.test(sync), 'sync layer must not overwrite signed-in identity');
check(/refreshPromise/.test(sync), 'duplicate refresh lock missing');
check(/scheduleAlreadyRefreshed/.test(sync) && /refreshActiveTab\(force, scheduleQueued\)/.test(sync), 'schedule duplicate-call guard missing');
check(/visibilitychange/.test(sync) && /window\.addEventListener\('focus'/.test(sync), 'return-to-app refresh hooks missing');
check(/id = 'allbarun-refresh-button'/.test(sync), 'manual refresh button missing');

for (const page of pages) {
  const html = fs.readFileSync(new URL(page, root), 'utf8');
  check(/sync-layer\.js\?v=6\.6\.0/.test(html), `${page}: sync layer include missing`);
  const expectedVersion = page === 'index.html'
    ? /6\.6\.2-RUNTIME-RESILIENCE/
    : /6\.6\.0-VOCA-STATION-ROLE-SAFE/;
  check(expectedVersion.test(html), `${page}: student version marker mismatch`);
  check(/studentSessionEpoch/.test(html) && /myScheduleRequestSerial/.test(html), `${page}: v6.5.1 stale-response guards lost`);
  check(/getMyScoreReport/.test(html) && /nextPreparationEmptyText/.test(html), `${page}: report/next-lesson features lost`);
}

console.log(JSON.stringify({ ok: true, checks, pages }, null, 2));
