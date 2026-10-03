import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const moduleSource = fs.readFileSync(new URL('../staff-schedule-preview.js', import.meta.url), 'utf8');
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const rest = html.slice(start + 1);
  const next = /\n\s*(?:async )?function \w+\(/.exec(rest);
  return html.slice(start, next ? start + 1 + next.index : html.indexOf('</script>', start));
}
function fixture(role = 'admin') {
  const elements = Object.fromEntries(['staff-schedule-preview', 'staff-schedule-student-id', 'staff-schedule-from-date', 'staff-schedule-range', 'staff-schedule-query', 'staff-schedule-status', 'staff-schedule-result'].map(id => [id, {hidden:true, value:'', innerHTML:'', textContent:'', disabled:false}]));
  elements['staff-schedule-student-id'].value = 'TEST-STUDENT';
  elements['staff-schedule-from-date'].value = '2026-10-05';
  elements['staff-schedule-range'].value = 'three';
  const calls = [];
  const payload = {
    success:true, student:{studentId:'TEST-STUDENT', name:'<img onerror="attack">', className:'Test Class'}, startDate:'2026-10-05', endDate:'2026-10-18', range:'three',
    days:[{date:'2026-10-06',displayDate:'October6',className:'Test Class',hasPlan:true,listening:{type:'LISTENING_DICTATION',homework:'3'},vocab:[{displayText:'School lesson5-6',testPlanId:'TP',vocaScopeState:'CONNECTED',sourceRanges:[{}]}],result:{score:99},attendance:'PRESENT'},
      {date:'2026-10-08',displayDate:'October8',listening:{type:'LISTENING_SOLVE',homework:'4'},hasPlan:true}],
  };
  const context = vm.createContext({document:{getElementById:id=>elements[id]}, currentUser:{role}, studentSessionEpoch:1, getTodayString:()=> '2026-10-03', API_LONG_TIMEOUT_MS:90000, apiPost:async p=>{calls.push(p); return payload;}, console});
  for (const name of ['escapeHtml','formatMultilineHtml','normalizeScheduleRange','scheduleRangeDays','scheduleHasValue','scheduleItem','scheduleVocabItem','sanitizeFuturePreparationSchedule','normalizeListeningTypeCode','normalizeListeningScopeText','formatListeningScheduleText','renderScheduleDay']) vm.runInContext(functionSource(name),context);
  vm.runInContext(moduleSource+'\nthis.preview = StaffSchedulePreview;',context);
  return {context,elements,calls,payload,preview:context.preview};
}
test('production inline script and standalone preview compile',()=>{
  for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
  new vm.Script(moduleSource);
  assert.match(html,/StaffSchedulePreview\.reset\(\)/);
  assert.match(html,/StaffSchedulePreview\.syncPanel\(\)/);
});
test('student and guest never request another student',async()=>{
  for(const role of ['student','guest','ADMINISTRATOR','']){const f=fixture(role); f.preview.syncPanel();await f.preview.load();assert.equal(f.calls.length,0);assert.equal(f.elements['staff-schedule-preview'].hidden,true);}
});
test('admin and teacher show preview without auto-fetch',()=>{
  for(const role of ['admin','teacher','ADMIN']){const f=fixture(role);f.preview.syncPanel();assert.equal(f.elements['staff-schedule-preview'].hidden,false);assert.equal(f.calls.length,0);}
});
test('one readonly request uses existing API and no result/print/write action',async()=>{
  const f=fixture();await f.preview.load();assert.equal(f.calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),{action:'getMyLearningSchedule',studentId:'TEST-STUDENT',fromDate:'2026-10-05',range:'three',days:'14',futureOnly:'Y',includeResults:'N'});
  assert.equal(f.elements['staff-schedule-query'].disabled,false);
});
test('real renderer displays round3 dictation and round4 solve with no practice button',async()=>{
  const f=fixture();await f.preview.load();const out=f.elements['staff-schedule-result'].innerHTML;
  assert.match(out,/딕테이션 · 3회/);assert.match(out,/풀기 · 4회/);assert.doesNotMatch(out,/<button|startAssignedVocaPractice|score|PRESENT/);assert.doesNotMatch(out,/<img/);assert.match(out,/&lt;img/);
});
test('other group HOLD renders no listening card',async()=>{
  const f=fixture();f.payload.days.forEach(d=>{d.listening=null;});await f.preview.load();assert.doesNotMatch(f.elements['staff-schedule-result'].innerHTML,/듣기 숙제|딕테이션|풀기/);
});
test('ordinary student practice still renders its original button',()=>{
  const f=fixture('student');assert.match(f.context.renderScheduleDay(f.payload.days[0]),/startAssignedVocaPractice/);
});
test('past dates and invalid identifiers fail before sending request',async()=>{
  for(const value of ['','<script>','a b']) {const f=fixture();f.elements['staff-schedule-student-id'].value=value;await f.preview.load();assert.equal(f.calls.length,0);}
  for(const value of ['2026-10-02','2026-02-30','wrong','2026-13-08']){const f=fixture();f.elements['staff-schedule-from-date'].value=value;await f.preview.load();assert.equal(f.calls.length,0);}
});
test('mismatching response is never displayed',async()=>{
  const f=fixture();f.payload.student.studentId='OTHER';await f.preview.load();assert.equal(f.elements['staff-schedule-result'].innerHTML,'');assert.match(f.elements['staff-schedule-status'].textContent,/요청 학생과 응답 학생이 다릅니다/);
});
test('changing target invalidates outstanding response',async()=>{
  const f=fixture();let resolve;f.context.apiPost=()=>new Promise(r=>resolve=r);const pending=f.preview.load();f.elements['staff-schedule-student-id'].value='OTHER';f.preview.clearResult();resolve(f.payload);await pending;assert.equal(f.elements['staff-schedule-result'].innerHTML,'');
});
test('session change invalidates outstanding response and reset clears identifiers',async()=>{
  const f=fixture();let resolve;f.context.apiPost=()=>new Promise(r=>resolve=r);const pending=f.preview.load();f.context.studentSessionEpoch+=1;f.context.currentUser={role:'student'};f.preview.reset();resolve(f.payload);await pending;assert.equal(f.elements['staff-schedule-result'].innerHTML,'');assert.equal(f.elements['staff-schedule-preview'].hidden,true);assert.equal(f.elements['staff-schedule-student-id'].value,'');
});
test('server failures clear old result and re-enable button',async()=>{
  const f=fixture();f.elements['staff-schedule-result'].innerHTML='old';f.context.apiPost=async()=>({success:false,message:'Denied'});await f.preview.load();assert.equal(f.elements['staff-schedule-result'].innerHTML,'');assert.equal(f.elements['staff-schedule-status'].textContent,'Denied');assert.equal(f.elements['staff-schedule-query'].disabled,false);
});
test('preview makes no local/session storage, token access, queue or print call',()=>{
  assert.doesNotMatch(moduleSource,/localStorage|sessionStorage|\.token|\.print\(|claim|lease|saveVocab|submitPoint|addRetest/);
});
