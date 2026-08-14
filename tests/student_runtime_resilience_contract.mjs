import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[1]));
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

check(inlineScripts.length > 0, 'inline script missing');
inlineScripts.forEach(match => new vm.Script(match[2]));
check(true, 'inline JavaScript parses');

check(/allbarun-student-version" content="6\.6\.2-RUNTIME-RESILIENCE"/.test(html), 'student version marker mismatch');
check(/const API_TIMEOUT_MS = 15000;/.test(html), 'write request timeout must remain unchanged');
check(/const API_GET_TIMEOUT_MS = 20000;/.test(html), 'read request timeout must cover observed p90 latency');
check(/timeoutError\.name = "ApiTimeoutError"/.test(html), 'friendly timeout classification missing');
check(/attempt < 2/.test(html) && /API_GET_RETRY_DELAY_MS/.test(html), 'one read retry missing');
check(/requestEpoch !== studentSessionEpoch/.test(html) && /SessionChangedError/.test(html), 'retry must stop after account change');

check(/AUTHENTICATED_UI_SELECTOR[\s\S]{0,220}body > section/.test(html), 'authenticated screen selector missing');
check(/function showLoggedOutUi[\s\S]{0,650}setAuthenticatedUiVisible\(false\)/.test(html), 'logged-out UI must hide authenticated content');
check(/message\.includes\("세션이 만료"\)/.test(html), 'session-expired response wording missing');
check(/message\.includes\("세션이 유효하지 않"\)/.test(html), 'invalid-session response wording missing');
check(/pointRankList': '로그인 후 랭킹을 확인할 수 있습니다\.'/.test(html), 'personal ranking DOM scrub missing');
check(/clearPointTimer\(\);[\s\S]{0,120}pointSubmitSerial \+= 1/.test(html), 'logout/session reset must invalidate point test work');

const logoutBlock = html.slice(html.indexOf('async function logout()'), html.indexOf('function openPasswordModal()'));
check(logoutBlock.includes('const logoutToken'), 'logout token must be captured before local session removal');
check(logoutBlock.indexOf('showLoggedOutUi("")') < logoutBlock.indexOf('await apiPost'), 'personal UI must disappear before the logout network wait');

check(/let pointSummaryPromise = null;/.test(html), 'shared point-summary promise missing');
check(/function getMyPointSummaryShared\(\)/.test(html), 'shared point-summary loader missing');
check((html.match(/await getMyPointSummaryShared\(\)/g) || []).length === 2, 'both point summary consumers must share the request');
check(/pointSummaryPromise === request/.test(html), 'shared request cleanup identity guard missing');

const submitBlock = html.slice(html.indexOf('async function submitPointTest'), html.indexOf('function renderPointResult'));
check(/const submitEpoch = studentSessionEpoch;/.test(submitBlock), 'point submission account guard missing');
check(/const submitSerial = \+\+pointSubmitSerial;/.test(submitBlock), 'point submission serial guard missing');
check((submitBlock.match(/submitEpoch !== studentSessionEpoch/g) || []).length >= 3, 'late point responses are not fully discarded');

console.log(JSON.stringify({ ok: true, checks }, null, 2));
