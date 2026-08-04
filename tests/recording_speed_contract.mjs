import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../recording/index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../recording/sw.js',import.meta.url),'utf8');
const checks=[];
function check(name,fn){fn();checks.push(name)}

check('PWA version and service-worker cache are bumped together',()=>{
  assert.match(app,/version:'8\.2\.2'/);
  assert.match(index,/8\.2\.2-NO-SCHEMA-SPEED/);
  assert.match(worker,/recording-v822-no-schema-speed/);
});
check('last confirmed dashboard is shown before the network finishes',()=>{
  assert.match(app,/function readSnapshot\(/);
  assert.match(app,/if\(!force\)\{const snapshot=readSnapshot/);
  assert.match(app,/저장 화면 · 최신 확인 중/);
  assert.match(app,/function renderSnapshotError\(/);
});
check('server-confirmed data and save summaries refresh the local snapshot',()=>{
  assert.match(app,/writeSnapshot\(data\);render\(data\)/);
  assert.match(app,/updateClassCounts\(\);writeSnapshot\(APP\.data\)/);
});
check('student saves are serialized instead of competing for the Apps Script lock',()=>{
  assert.match(app,/saveTail:Promise\.resolve\(\)/);
  assert.match(app,/APP\.saveTail=APP\.saveTail\.then\(task,task\)/);
  assert.match(app,/async function persistOne\(/);
});
check('ordinary reconnect and post-override refresh do not flush server caches',()=>{
  assert.match(app,/addEventListener\('online',[^\n]*loadData\(false,APP\.targetDate\)/);
  assert.match(app,/opsAcceptBeforeDeadline[\s\S]*?loadData\(false,APP\.targetDate\)/);
});
check('manual authoritative refresh remains explicitly forceful',()=>{
  assert.match(app,/function readServerAgain\(\)[\s\S]*?loadData\(true,APP\.targetDate\)/);
});
check('existing planned-absence and exemption guards remain active',()=>{
  assert.match(app,/function isPendingRecording\(student\)\{return !isRecordingExempt/);
  assert.match(app,/if\(isRecordingExempt\(student\)\)/);
});

console.log(`recording speed contract: ${checks.length}/${checks.length} passed`);
for(const name of checks)console.log(`PASS ${name}`);
