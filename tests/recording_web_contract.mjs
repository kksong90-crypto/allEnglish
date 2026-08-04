import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const appPath=path.join(root,'recording','app.js');
const indexPath=path.join(root,'recording','index.html');
const stylePath=path.join(root,'recording','styles.css');
const swPath=path.join(root,'recording','sw.js');
const app=fs.readFileSync(appPath,'utf8');
const index=fs.readFileSync(indexPath,'utf8');
const styles=fs.readFileSync(stylePath,'utf8');
const sw=fs.readFileSync(swPath,'utf8');

const checks=[];
function check(name,fn){fn();checks.push(name)}

const nodes=new Map();
function makeNode(){
  const classes=new Set();
  return {
    textContent:'',className:'',value:'',innerHTML:'',hidden:false,disabled:false,checked:false,
    classList:{add(...items){items.forEach(x=>classes.add(x))},remove(...items){items.forEach(x=>classes.delete(x))},contains(x){return classes.has(x)},toggle(x,on){if(on===undefined){if(classes.has(x))classes.delete(x);else classes.add(x)}else if(on)classes.add(x);else classes.delete(x)}},
    querySelector(){return makeNode()},querySelectorAll(){return[]},closest(){return makeNode()}
  };
}
const document={
  hidden:false,
  getElementById(id){if(!nodes.has(id))nodes.set(id,makeNode());return nodes.get(id)},
  querySelectorAll(){return[]},
  addEventListener(){}
};
const storage=new Map();
const context=vm.createContext({
  console,document,navigator:{onLine:true},localStorage:{getItem:key=>storage.get(key)||'',setItem:(key,value)=>storage.set(key,String(value))},
  window:{addEventListener(){}},setTimeout,clearTimeout,AbortController,fetch:async()=>{throw new Error('unexpected fetch')},confirm:()=>false
});
vm.runInContext(app,context,{filename:appPath});
const hooks=context.__ALLBARUN_RECORDING_TEST__;

check('version markers are synchronized',()=>{
  assert.match(app,/version:'8\.2\.2'/);
  assert.match(index,/8\.2\.2-NO-SCHEMA-SPEED/);
  assert.match(index,/>v8\.2\.2</);
  assert.match(sw,/allbarun-recording-v822-no-schema-speed/);
});
check('planned absence is an exemption, never pending',()=>{
  const row={studentId:'S1',name:'학생1',status:'MISSING',plannedAbsence:true,eligible:false};
  assert.equal(hooks.isRecordingExempt(row),true);
  assert.equal(hooks.isPendingRecording(row),false);
  assert.equal(hooks.recordingExemptLabel(row),'예정결석');
});
check('server exemption states are never pending',()=>{
  for(const status of ['EXEMPT','WAIVED','NOT_REQUIRED','SKIPPED','CLOSED']){
    assert.equal(hooks.isRecordingExempt({status}),true,status);
    assert.equal(hooks.isPendingRecording({status}),false,status);
  }
});
check('normal unknown and missing rows remain pending',()=>{
  assert.equal(hooks.isPendingRecording({status:'UNKNOWN',eligible:true}),true);
  assert.equal(hooks.isPendingRecording({status:'MISSING',eligible:true}),true);
  assert.equal(hooks.isPendingRecording({status:'RECEIVED',eligible:true}),false);
});
check('eligible and exempt rosters merge without changing target roster',()=>{
  const data={classes:[{classId:'C1',className:'중1',students:[{studentId:'S1',status:'UNKNOWN'}]}],exemptClasses:[{classId:'C1',className:'중1',students:[{studentId:'S2',status:'EXEMPT',plannedAbsence:true}]}]};
  const merged=hooks.mergedClasses(data);
  assert.equal(merged.length,1);
  assert.equal(merged[0].students.length,1);
  assert.equal(merged[0].exemptStudents.length,1);
});
check('new server exemption totals take precedence',()=>{
  const data={plannedAbsenceCount:3,totalExemptions:4,classes:[],exemptClasses:[]};
  assert.equal(hooks.plannedAbsenceCount(data),3);
  assert.equal(hooks.totalExemptionCount(data),4);
});
check('legacy responses calculate planned absence count defensively',()=>{
  const data={classes:[{classId:'C1',students:[{studentId:'S1',plannedAbsence:true,status:'EXEMPT'}]}]};
  assert.equal(hooks.plannedAbsenceCount(data),1);
  assert.equal(hooks.totalExemptionCount(data),1);
});
check('default filter hides exemptions',()=>{
  const rows=hooks.filteredStudents({students:[{studentId:'S1',status:'UNKNOWN'}],exemptStudents:[{studentId:'S2',status:'EXEMPT',plannedAbsence:true}]});
  assert.deepEqual(Array.from(rows,x=>x.studentId),['S1']);
});
check('exempt row is rendered disabled and without override action',()=>{
  const html=hooks.renderStudent({classId:'C1'},{studentId:'S2',name:'학생2',status:'EXEMPT',plannedAbsence:true,eligible:false,exemptReason:'가족 일정',startDate:'2026-08-03',endDate:'2026-08-04'});
  assert.match(html,/disabled/);
  assert.match(html,/예정결석/);
  assert.doesNotMatch(html,/마감 전 제출 인정/);
});
check('eligible deadline row retains override action',()=>{
  const html=hooks.renderStudent({classId:'C1'},{studentId:'S1',name:'학생1',status:'MISSING',eligible:true,canCheck:false,canAcceptBeforeDeadline:true});
  assert.match(html,/마감 전 제출 인정/);
  assert.doesNotMatch(html,/badge exemption/);
});
check('academy closure summary reports exemption and zero pending',()=>{
  hooks.renderSummary({totalStudents:0,totalReceived:0,totalMissing:0,totalUnknown:0,totalExemptions:0,deadlinePassed:true,closure:{closed:true,count:3},exemptReason:'여름방학 · 녹음 확인이 자동 면제됩니다.',classes:[],exemptClasses:[],notice:{}});
  assert.equal(nodes.get('m-pending').textContent,0);
  assert.equal(nodes.get('notice-title').textContent,'학원 방학·휴원 · 녹음 면제');
  assert.equal(nodes.get('deadline-badge').textContent,'녹음 면제');
});
check('zero targets with exemptions never become a missing notice',()=>{
  hooks.renderSummary({totalStudents:0,totalReceived:0,totalMissing:0,totalUnknown:0,totalExemptions:2,plannedAbsenceCount:2,deadlinePassed:false,closure:{closed:false},classes:[],exemptClasses:[],notice:{missing:0}});
  assert.equal(nodes.get('m-pending').textContent,0);
  assert.equal(nodes.get('notice-title').textContent,'전원 예정결석·면제');
});
check('UI labels describe exemption behavior',()=>{
  assert.match(index,/방학·예정결석 이중 보호/);
  assert.match(index,/예정결석·면제 숨기기/);
  assert.match(index,/미확인·미제출만/);
});
check('visual styles distinguish exemptions',()=>{
  assert.match(styles,/notice-banner\.exemption/);
  assert.match(styles,/student\.exempt/);
  assert.match(styles,/badge\.exemption/);
  assert.match(styles,/Pretendard/);
});
check('save path contains a client-side exemption guard',()=>{
  assert.match(app,/if\(isRecordingExempt\(student\)\)/);
  assert.match(app,/input\.disabled=isRecordingExempt\(student\)/);
});
check('pending-only filter delegates to exemption-aware predicate',()=>{
  assert.match(app,/APP\.filters\.pendingOnly\|\|isPendingRecording\(st\)/);
});
check('only student write controls are disabled offline',()=>{
  assert.match(app,/\.student input\[type=checkbox\],\.override-btn/);
  assert.doesNotMatch(app,/querySelectorAll\('input\[type=checkbox\],\.override-btn'/);
});
check('README records the matching server contract and no schema change',()=>{
  const readme=fs.readFileSync(path.join(root,'recording','README_GITHUB.md'),'utf8');
  assert.match(readme,/8\.2\.2-NO-SCHEMA-SPEED/);
  assert.match(readme,/스키마를 추가하거나 변경하지 않습니다/);
});

console.log(`recording web contract: ${checks.length}/${checks.length} passed`);
for(const name of checks)console.log(`PASS ${name}`);
