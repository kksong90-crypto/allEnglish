import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {test} from 'node:test';
import {journalContext} from './recording-journal-harness.mjs';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
function harness(){
  const students={};for(let i=1;i<=30;i++)students['S'+i]={name:'합성'+i,received:false,status:'UNKNOWN',revision:'R0',canCheck:true};
  const old={targetDate:'2026-11-16',classes:[]},APP={data:old,targetDate:old.targetDate,saving:new Set()},writes=[],renders=[],messages=[],sync=[];
  let resolveRead,rejectRead,n=0;const read=new Promise((resolve,reject)=>{resolveRead=resolve;rejectRead=reject;});
  const ctx={...journalContext(),APP,Date,performance,navigator:{onLine:true},ensureConnected:()=>true,clearDashboardCache(){},setSync:m=>sync.push(m),toast:m=>messages.push(m),
    findStudent:(_c,id)=>students[id],requestId:()=> 'REC_SAVE_'+(++n),applySummary(){},applySavedStudentScope(){},render:d=>renders.push(d),renderReadTiming(){},renderError(){},updateNetwork(){},refreshRecording:async()=>{},
    api:async(action,payload)=>{if(action==='opsDashboard')return read;writes.push(payload);return{ok:true,received:payload.received,status:payload.received?'RECEIVED':'UNKNOWN',revision:'R1',summary:{received:1}};}};
  vm.createContext(ctx);vm.runInContext(source.split('\n').find(l=>l.startsWith('async function loadData('))+'\n'+source.slice(source.indexOf('async function saveOne('),source.indexOf('async function acceptBeforeDeadline(')),ctx);
  function input(){const state={textContent:'미확인'},row={querySelector:()=>state,classList:{add(){},remove(){},toggle(){}}};return{checked:true,isConnected:true,closest:()=>row};}
  return{ctx,APP,old,students,writes,renders,messages,sync,resolveRead,rejectRead,input};
}
test('two checks during a same-date background read are retained and saved; the late read cannot replace them',async()=>{
  const h=harness(),read=h.ctx.loadData(false,h.APP.targetDate),a=h.input(),b=h.input();
  const first=h.ctx.saveOne(a,'C','S1'),second=h.ctx.saveOne(b,'C','S2');
  assert.equal(h.ctx.pendingRecordingChecks().length,2,'both intents must be durable before network microtasks');
  await Promise.all([first,second]);assert.equal(h.writes.length,2);assert.equal(a.checked,true);assert.equal(b.checked,true);
  assert.equal(h.students.S1.received,true);assert.equal(h.students.S2.received,true);
  h.resolveRead({targetDate:h.APP.targetDate,classes:[],stale:true});await read;
  assert.equal(h.APP.data,h.old);assert.equal(h.renders.length,0);assert.equal(h.ctx.pendingRecordingChecks().length,0);assert.equal(h.APP.refreshPending,true);
});
test('a late read failure cannot replace the confirmation of a check made during that read',async()=>{
  const h=harness(),read=h.ctx.loadData(false,h.APP.targetDate);await h.ctx.saveOne(h.input(),'C','S1');
  h.rejectRead(new Error('synthetic late network failure'));await read;
  assert.equal(h.students.S1.received,true);assert.equal(h.messages.length,0);assert.equal(h.sync.at(-1),'저장 완료');assert.equal(h.APP.loading,false);
});
test('thirty checks entered during an old read all retain unique attempts and original date/revisions',async()=>{
  const h=harness(),read=h.ctx.loadData(false,h.APP.targetDate),pending=[];
  for(let i=1;i<=30;i++)pending.push(h.ctx.saveOne(h.input(),'C','S'+i));
  assert.equal(h.ctx.pendingRecordingChecks().length,30);await Promise.all(pending);
  assert.equal(h.writes.length,30);assert.equal(new Set(h.writes.map(x=>x.requestId)).size,30);
  assert.ok(h.writes.every(x=>x.targetDate==='2026-11-16'&&x.expectedRevision==='R0'));
  assert.ok(Object.values(h.students).every(x=>x.received));h.resolveRead({targetDate:h.APP.targetDate,classes:[],stale:true});await read;
  assert.equal(h.renders.length,0);assert.equal(h.ctx.pendingRecordingChecks().length,0);
});
test('a different-date read still blocks changes to the old displayed date',async()=>{
  const h=harness(),read=h.ctx.loadData(false,'2026-11-17'),input=h.input();await h.ctx.saveOne(input,'C','S1');
  assert.equal(h.writes.length,0);assert.equal(input.checked,false);
  h.resolveRead({targetDate:'2026-11-17',classes:[]});await read;assert.equal(h.APP.targetDate,'2026-11-17');
});
test('a read required after a conflict does not accept another unverified check',async()=>{
  const h=harness();h.APP.needsRead=true;const read=h.ctx.loadData(true,h.APP.targetDate),input=h.input();await h.ctx.saveOne(input,'C','S1');
  assert.equal(h.writes.length,0);assert.equal(input.checked,false);h.resolveRead({targetDate:h.APP.targetDate,classes:[]});await read;
});
