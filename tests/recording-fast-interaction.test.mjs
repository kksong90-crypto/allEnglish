import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {journalContext} from './recording-journal-harness.mjs';

const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');

test('recording restores a server-confirmed screen before starting background refresh',()=>{
  const startup="if(ensureConnected()){restoreDashboardCache();void loadData(false,initialRecordingTargetDate());}";
  assert.ok(source.includes(startup));
  assert.ok(source.indexOf('restoreDashboardCache()')<source.lastIndexOf("void loadData(false,initialRecordingTargetDate())"));
  assert.match(source,/cached\.apiUrl===apiUrl\(\)/);
  assert.match(source,/saveDashboardCache\(data\)/);
});

function harness(count=2){
  const names=count===2?['A','B']:Array.from({length:count},(_,i)=>'S'+i);
  const students=Object.fromEntries(names.map(name=>[name,{received:false,canCheck:true}]));
  const calls=[], pending={}, APP={data:{totalReceived:0},saving:new Set(),targetDate:'2026-11-10'};
  const ctx={...journalContext(),APP,findStudent:(_,id)=>students[id],requestId:()=> 'REC_SAVE_'+Math.random().toString(16).slice(2),
    navigator:{onLine:true},setSync(){},toast(){},applySavedStudentScope(){},clearDashboardCache(){},
    loadData:async (...args)=>{calls.push(args);return null;},
    applySummary(summary){APP.data.totalReceived=summary.received;},
    api:(_,payload)=>new Promise((resolve,reject)=>{
      calls.push(payload.studentId);
      pending[payload.studentId]={resolve,reject};
    })};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('async function saveOne('),source.indexOf('async function acceptBeforeDeadline(')),ctx);
  const input=()=>{const state={textContent:''};return {checked:true,state,isConnected:true,closest:()=>({
    querySelector:()=>state,classList:{add(){},remove(){},toggle(){}}
  })}};
  const inputs=names.map(input),[first,second]=inputs;
  return {APP,calls,pending,first,second,inputs,names,start:()=>names.map((name,i)=>ctx.saveOne(inputs[i],'C',name))};
}

test('rapid checks show immediately and send the second request only after the first response',async()=>{
  const h=harness(),[a,b]=h.start();
  assert.equal(h.second.state.textContent,'저장 대기 중…');
  await Promise.resolve();
  assert.deepEqual(h.calls,['A']);
  h.pending.A.resolve({status:'RECEIVED',received:true,summary:{received:1}});
  await a;
  assert.deepEqual(h.calls,['A','B']);
  h.pending.B.resolve({status:'RECEIVED',received:true,summary:{received:2}});
  await b;
  assert.equal(h.APP.data.totalReceived,2);
});

test('one failed check cannot subtract a different confirmed check',async()=>{
  const h=harness(),[a,b]=h.start();
  await Promise.resolve();
  h.pending.A.resolve({status:'RECEIVED',received:true,summary:{received:1}});
  await a;
  h.pending.B.reject(new Error('rejected'));
  await b;
  assert.equal(h.APP.data.totalReceived,1);
  assert.equal(h.first.checked,true);
  assert.equal(h.second.checked,false);
});

test('thirty rapid checks remain visible and all thirty are confirmed without overlapping writes',async()=>{
 const h=harness(30),writes=h.start();
 assert.equal(h.APP.saving.size,30);assert.ok(h.inputs.every(input=>input.checked));
 for(let i=0;i<30;i++){
  await Promise.resolve();assert.equal(h.calls.length,i+1);assert.equal(h.calls[i],h.names[i]);
  h.pending[h.names[i]].resolve({status:'RECEIVED',received:true,summary:{received:i+1}});await writes[i];
 }
 assert.equal(h.APP.data.totalReceived,30);assert.equal(h.APP.saving.size,0);assert.ok(h.inputs.every(input=>input.checked&&!input.disabled));
});

test('an uncertain save pauses queued writes and rereads the same date once',async()=>{
  const h=harness(),[a,b]=h.start();
  await Promise.resolve();
  h.pending.A.reject(Object.assign(new Error('disconnected'),{uncertain:true}));
  await Promise.all([a,b]);
  assert.deepEqual(h.calls,['A',[true,'2026-11-10']]);
  assert.equal(h.APP.needsRead,true);
  assert.equal(h.second.checked,false);
  assert.equal(h.second.disabled,true);
});

test('secondary workspaces stay lazy and cannot block recording startup',()=>{
  const start=source.indexOf('function loadSelectedWorkspace()');
  const end=source.indexOf('function workspaceList(',start);
  const body=source.slice(start,end);
  assert.ok(body.includes("selectedWorkspace==='absence'"));
  assert.ok(body.includes("selectedWorkspace==='score'"));
  assert.ok(!body.includes("selectedWorkspace==='recording'"));
});

function startupTarget(app,now){
 const ctx={APP:app,Date,Intl};vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function initialRecordingTargetDate('),source.indexOf('async function refreshRecording(')),ctx);
 return ctx.initialRecordingTargetDate(Date.parse(now));
}
test('reload retains the selected recording date within the same Korean day',()=>{
 assert.equal(startupTarget({targetDate:'2026-11-16',lastLoaded:Date.parse('2026-11-12T18:41:00+09:00')},'2026-11-12T18:42:00+09:00'),'2026-11-16');
});
test('crossing Korean midnight returns to the server default even within the cache lifetime',()=>{
 assert.equal(startupTarget({targetDate:'2026-11-12',lastLoaded:Date.parse('2026-11-12T23:59:00+09:00')},'2026-11-13T00:01:00+09:00'),'');
});
test('a fresh start without a restored screen requests the server default',()=>{
 assert.equal(startupTarget({targetDate:'',lastLoaded:0},'2026-11-12T18:42:00+09:00'),'');
});


