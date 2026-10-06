import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../admin-class-schedule.js',import.meta.url),'utf8');
const html=fs.readFileSync(process.env.STUDENT_HTML||new URL('../index.html',import.meta.url),'utf8');
function fixture(role='admin') {
 const ids=['admin-class-panel','admin-class-from','admin-class-range','admin-class-select','admin-class-query','admin-class-cancel','admin-class-status','admin-class-result','exam-table','schedule-summary-view'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{value:'',hidden:true,innerHTML:'',textContent:'',disabled:false}]));
 nodes['admin-class-from'].value='2026-10-05';nodes['admin-class-range'].value='week';nodes['admin-class-select'].value='C';
 const calls=[];
 const context=vm.createContext({currentUser:{role,id:'all'},studentSessionEpoch:1,document:{getElementById:id=>nodes[id]},getTodayString:()=> '2026-10-04',API_LONG_TIMEOUT_MS:90000,normalizeScheduleRange:r=>r,escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),sanitizeFuturePreparationSchedule:p=>p,renderScheduleDay:(d,o)=>{assert.equal(o.readOnly,true);return d.listening?.homework||'HOLD';},apiPost:async p=>{calls.push(p);if(p.action==='getStaffScheduleDirectory')return {success:true,readOnly:true,startDate:p.fromDate,classes:[{classId:'C',className:'중1',studentCount:2}]};return {success:true,readOnly:true,classId:'C',range:p.range,startDate:p.fromDate,endDate:'2026-10-11',offset:0,totalStudents:2,revision:'R',entries:[{student:{studentId:'A',name:'서창',classId:'C',className:'중1'},days:[{date:'2026-10-06',classId:'C',hasPlan:true,listening:{homework:'3회 딕테이션'}}]},{student:{studentId:'B',name:'다른 그룹',classId:'C',className:'중1'},days:[{date:'2026-10-06',classId:'C',hasPlan:true,listening:null}]}],nextOffset:2,hasMore:false};}});
 vm.runInContext(source+'\nthis.feature=AdminClassSchedule;',context);return {nodes,calls,context,feature:context.feature};
}
test('production scripts compile and administrator panel is explicitly hidden by default',()=>{new vm.Script(source);for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);assert.match(html,/id="admin-class-panel"[^>]*hidden/);assert.match(html,/src="admin-class-schedule.js"/);assert.match(html,/AdminClassSchedule.reset/);assert.match(html,/return AdminClassSchedule.open/);});
test('server-only permissions are not replaced by an all username shortcut',async()=>{for(const role of ['student','guest','teacher','']){const f=fixture(role);await f.feature.open();await f.feature.loadDirectory();await f.feature.load();assert.equal(f.calls.length,0);assert.equal(f.nodes['admin-class-panel'].hidden,true);}assert.doesNotMatch(source,/id\s*={2,3}\s*['"]all/);});
test('administrator class directory loads without student impersonation',async()=>{const f=fixture();await f.feature.open();await f.feature.open();assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'getStaffScheduleDirectory');assert.equal(f.calls[0].studentId,undefined);});
test('all students in selected class show distinct listening and HOLD state readonly',async()=>{const f=fixture();await f.feature.load();assert.match(f.nodes['admin-class-result'].innerHTML,/3회 딕테이션/);assert.match(f.nodes['admin-class-result'].innerHTML,/HOLD/);assert.match(f.nodes['admin-class-status'].textContent,/전체 2명.*완료/);assert.equal(f.calls[0].action,'getStaffClassLearningSchedule');assert.doesNotMatch(f.nodes['admin-class-result'].innerHTML,/<button/);});
test('mismatched target response is never shown',async()=>{const f=fixture(),api=f.context.apiPost;f.context.apiPost=async p=>({...await api(p),classId:'OTHER'});await f.feature.load();assert.equal(f.nodes['admin-class-result'].innerHTML,'');assert.doesNotMatch(f.nodes['admin-class-status'].textContent,/확인 완료/);});
test('no secrets, printing or write actions used by administrator module',()=>{assert.doesNotMatch(source,/localStorage|sessionStorage|\.token|\.print\(|claim|lease|saveVocab|submit|changePassword/);assert.match(html,/점수 저장·초안 저장·PDF 생성만으로는 게시되지 않습니다/);});
test('조회 진단은 기존 요청만 측정하고 서버 구간이 없으면 없다고 표시',async()=>{
 const f=fixture();await f.feature.load();assert.equal(f.calls.length,1);
 assert.match(f.nodes['admin-class-status'].textContent,/API 대기\(파싱 포함\): \d+ ms · 1회 · 서버 구간 계측 없음/);
});
test('서버 진단은 허용한 숫자 구간만 표시하고 불완전·문자열은 숨김',()=>{
 const f=fixture();const timing={scope:'ADMIN_CLASS_REQUEST',totalMs:50,authOptionsClassMs:5,rosterMs:10,tablesMs:20,revisionMs:5,assemblyMs:10,token:'출력 금지'};
 const format=f.context.adminClassReadTimingText;
 const output=format([{waitMs:60,server:timing}]);assert.match(output,/서버 합계: 50 ms/);assert.doesNotMatch(output,/출력 금지|token/);
 for(const bad of [{...timing,totalMs:'50'},{...timing,totalMs:NaN},{...timing,totalMs:-1},{...timing,scope:'OTHER'},{scope:'ADMIN_CLASS_REQUEST'}])assert.match(format([{waitMs:60,server:bad}]),/서버 구간 계측 없음/);
});
