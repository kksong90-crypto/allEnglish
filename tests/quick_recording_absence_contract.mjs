import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../quick/app.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../quick/sw.js',import.meta.url),'utf8');
const checks=[];
function check(name,fn){fn();checks.push(name)}

check('quick PWA version matches the existing 7.3.1 service-worker cache',()=>{
  assert.match(app,/version:'7\.3\.1'/);
  assert.match(worker,/allbarun-quick-v731/);
});
check('planned absence copy reflects the recording exemption contract',()=>{
  assert.match(app,/예정결석은 녹음 확인·미제출 집계에서 자동 면제됩니다/);
  assert.match(app,/녹음 확인 자동 면제/);
  assert.match(app,/예정결석 기간에는 녹음 확인·미제출 집계에서 자동 제외됩니다/);
  assert.doesNotMatch(app,/예정결석이어도 단어녹음 제출 대상은 유지됩니다/);
  assert.doesNotMatch(app,/예정결석을 등록해도 해당 단어시험 녹음은 제출해야 합니다/);
});
check('absence cancellation carries the rendered record version',()=>{
  assert.match(app,/cancelAbsence\('\$\{esc\(r\.plannedAbsenceId\)\}','\$\{esc\(r\.studentName\)\}',\$\{Number\(r\.recordVersion\|\|0\)\}\)/);
  assert.match(app,/function cancelAbsence\(id,name,version\)/);
  assert.match(app,/quickCancelAbsence',\{plannedAbsenceId:id,recordVersion:version\|\|undefined\}/);
});
check('absence save continues to carry the record version',()=>{
  assert.match(app,/quickSaveAbsence',\{plannedAbsenceId:id,recordVersion:version\|\|undefined/);
});

console.log(`quick recording absence contract: ${checks.length}/${checks.length} passed`);
for(const name of checks)console.log(`PASS ${name}`);
