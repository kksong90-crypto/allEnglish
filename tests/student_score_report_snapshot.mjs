import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = ['index.html','v6-staging.html'];
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks += 1; }

for (const file of files) {
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  check(scripts.length > 0, `${file}: inline scripts present`);
  scripts.forEach((script, index) => new Function(script));
  check(/data-tab="report"/.test(html) && /id="school-report-view"/.test(html), `${file}: report tab and view`);
  check(/apiPost\(\{action:'getMyScoreReport'/.test(html), `${file}: authenticated POST`);
  check(!/getMyScoreReport[^\n]*studentId/.test(html), `${file}: no client student id`);
  check(/if \(!data\?\.published \|\| !data\.report\)/.test(html), `${file}: publication gate`);
  check(/ScoreReportHistory\.PUBLISHED/.test(html) === false, `${file}: internal table name hidden from UI`);
  check(/PDF로 저장·인쇄/.test(html) && /window\.open\('', '_blank'\)/.test(html), `${file}: browser PDF without Drive link`);
  check(/tabId === "report"[\s\S]*?loadMyScoreReport\(false\)/.test(html), `${file}: lazy tab load`);
  check(/예상 범위와 목표는 과거 기록 기반 참고치/.test(html), `${file}: forecast disclaimer`);
}

console.log(JSON.stringify({ok:true,checks,files}, null, 2));
