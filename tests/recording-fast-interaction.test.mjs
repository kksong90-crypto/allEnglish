import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');

test('recording restores a server-confirmed screen before starting background refresh',()=>{
  const startup="if(ensureConnected()){restoreDashboardCache();void loadData(false,'');}";
  assert.ok(source.includes(startup));
  assert.ok(source.indexOf('restoreDashboardCache()')<source.lastIndexOf("void loadData(false,'')"));
  assert.match(source,/cached\.apiUrl!==apiUrl\(\)/);
  assert.match(source,/saveDashboardCache\(data\)/);
});

test('recording updates the selected student before awaiting the server write',()=>{
  const start=source.indexOf('async function saveOne(');
  const end=source.indexOf('async function acceptBeforeDeadline(',start);
  const body=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.ok(body.indexOf("state.textContent=desired?'제출 · 저장 중'")>=0);
  assert.ok(body.indexOf("state.textContent=desired?'제출 · 저장 중'")<body.indexOf("await api('opsSaveOne'"));
  assert.ok(body.includes("화면 반영 완료 · 서버 저장 중"));
});

test('one failed check cannot subtract a different confirmed check',async()=>{
  const APP={data:{totalReceived:0},saving:new Set(),targetDate:'2026-11-10'};
  const students={A:{received:false,canCheck:true},B:{received:false,canCheck:true}};
  const pending={};
  const ctx={APP,findStudent:(_,id)=>students[id],requestId:()=> 'test',
    navigator:{onLine:true},setSync(){},toast(){},applySavedStudentScope(){},
    applySummary(summary){APP.data.totalReceived=summary.received;},
    api:(_,payload)=>new Promise((resolve,reject)=>{pending[payload.studentId]={resolve,reject};})};
  vm.createContext(ctx);
  vm.runInContext(source.split('\n').find(line=>line.startsWith('async function saveOne(')),ctx);
  const input=()=>({checked:true,isConnected:true,closest:()=>({
    querySelector:()=>({}),classList:{add(){},remove(){},toggle(){}}
  })});
  const first=input(), second=input();
  const a=ctx.saveOne(first,'C','A'),b=ctx.saveOne(second,'C','B');
  assert.equal(APP.data.totalReceived,0);
  pending.A.resolve({status:'RECEIVED',received:true,summary:{received:1}});
  await a;
  pending.B.reject(new Error('rejected'));
  await b;
  assert.equal(APP.data.totalReceived,1);
  assert.equal(first.checked,true);
  assert.equal(second.checked,false);
});

test('secondary workspaces stay lazy and cannot block recording startup',()=>{
  const start=source.indexOf('function loadSelectedWorkspace()');
  const end=source.indexOf('function workspaceList(',start);
  const body=source.slice(start,end);
  assert.ok(body.includes("selectedWorkspace==='absence'"));
  assert.ok(body.includes("selectedWorkspace==='score'"));
  assert.ok(!body.includes("selectedWorkspace==='recording'"));
});
