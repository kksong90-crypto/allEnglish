import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = ['index.html', 'v6-staging.html'];
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

for (const file of files) {
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  check(scripts.length > 0, `${file}: inline script missing`);
  scripts.forEach((script, index) => new Function(script));
  check(/6\.5\.1-VOCA-GATEWAY-RETEST-SAFETY/.test(html), `${file}: API version marker mismatch`);
  check(/data-tab="report"/.test(html) && /id="school-report-view"/.test(html), `${file}: self score report screen missing`);
  check(/apiPost\(\{ action:'getMyScoreReport'/.test(html), `${file}: score report must use authenticated POST`);
  check(!/apiGet\(\{ action:'getMyScoreReport'/.test(html), `${file}: score token must not be sent in a GET URL`);
  check(/row\.examLabel \|\| row\.cycleName/.test(html), `${file}: school-grade-semester exam label missing`);
  check(/학원 입력학생 순위/.test(html), `${file}: peer rank label is misleading`);
  check(/schoolReportRankText\(row\)/.test(html), `${file}: participant count display missing`);
  check(/nextPreparationEmptyText/.test(html) && /범위 등록 대기/.test(html), `${file}: missing-plan states are not explicit`);
  check(/resetUserScopedState\(\)/.test(html) && /studentSessionEpoch/.test(html), `${file}: cross-account stale response guard missing`);
}

console.log(JSON.stringify({ ok:true, checks, files }, null, 2));
