import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
function harness(result){
 const student={received:false,status:'UNKNOWN',canCheck:true,revision:'READ_REVISION'};
 const reads=[],writes=[],summaries=[],messages=[],APP={data:{},targetDate:'2026-11-16',saving:new Set()};
 const state={textContent:'미확인'},row={querySelector:()=>state,classList:{add(){},remove(){},toggle(){}}};
 const input={checked:true,isConnected:true,closest:()=>row};
 const ctx={APP,navigator:{onLine:true},findStudent:()=>student,requestId:()=> 'SYNTHETIC_REQUEST',clearDashboardCache(){},
  setSync(){},toast:m=>messages.push(m),applySavedStudentScope(){},applySummary:s=>summaries.push(s),
  api:async(_action,payload)=>{writes.push(payload);return result;},loadData:async(...args)=>{reads.push(args);return null;}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function saveOne('),source.indexOf('async function acceptBeforeDeadline(')),ctx);
 return {ctx,APP,student,input,reads,writes,summaries,messages,run:()=>ctx.saveOne(input,'CLASS','STUDENT')};
}
test('UI sends the revision it read so a stale device cannot silently overwrite a newer check',async()=>{
 const h=harness({ok:true,status:'RECEIVED',received:true,summary:{received:1}});await h.run();
 assert.equal(h.writes[0].expectedRevision,'READ_REVISION');
});
test('a new student explicitly sends empty revision and remembers the revision returned by the server',async()=>{
 const h=harness({ok:true,status:'RECEIVED',received:true,revision:'NEW_REVISION',summary:{received:1}});h.student.revision='';await h.run();
 assert.equal(h.writes[0].expectedRevision,'');assert.equal(h.student.revision,'NEW_REVISION');
});
test('a conflict never reports save success or changes counters and forces an authoritative read',async()=>{
 const h=harness({ok:false,conflict:true,received:true,revision:'OTHER_DEVICE'});await h.run();
 assert.equal(h.summaries.length,0);assert.equal(h.student.status,'UNKNOWN');assert.equal(h.student.revision,'READ_REVISION');
 assert.deepEqual(h.reads,[[true,'2026-11-16']]);assert.equal(h.APP.needsRead,true);
 assert.ok(h.messages.some(m=>/다른 화면/.test(m)));
});
test('a contradictory save reply is not accepted as a confirmed receipt',async()=>{
 const h=harness({ok:true,status:'UNKNOWN',received:false,summary:{received:0}});await h.run();
 assert.equal(h.summaries.length,0);assert.deepEqual(h.reads,[[true,'2026-11-16']]);
});
test('a second check on the same student sends the newly confirmed revision',async()=>{
 const result={ok:true,status:'RECEIVED',received:true,revision:'AFTER_FIRST',summary:{received:1}};
 const h=harness(result);await h.run();h.input.checked=false;
 Object.assign(result,{status:'UNKNOWN',received:false,revision:'AFTER_SECOND',summary:{received:0}});await h.run();
 assert.equal(h.writes[1].expectedRevision,'AFTER_FIRST');assert.equal(h.student.revision,'AFTER_SECOND');assert.equal(h.reads.length,0);
});
test('a response for another date or student cannot be applied to the visible row',async()=>{
 for(const identity of [{targetDate:'2026-11-17'},{classId:'OTHER_CLASS'},{studentId:'OTHER_STUDENT'}]){
  const h=harness({ok:true,status:'RECEIVED',received:true,summary:{received:1},...identity});await h.run();
  assert.equal(h.student.received,false);assert.equal(h.summaries.length,0);assert.deepEqual(h.reads,[[true,'2026-11-16']]);
 }
});
