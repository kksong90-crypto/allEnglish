import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {memoryStorage} from './recording-journal-harness.mjs';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
const url='https://example.test/exec',date='2026-11-16';
function attempt(extra={}){return{v:1,apiUrl:url,session:'SESSION',requestId:'REC_SAVE_original',targetDate:date,classId:'C',studentId:'S',received:true,expectedRevision:'R0',createdAt:1,state:'QUEUED',...extra}}
function harness({storage=memoryStorage(),session='SESSION',serverReceived=false,revision='R0',canCheck=true,apiImpl}={}){
 let seq=0;const writes=[],reads=[],messages=[],student={studentId:'S',name:'검증학생',received:serverReceived,status:serverReceived?'RECEIVED':'UNKNOWN',revision,canCheck};
 const state={textContent:'미확인'},row={dataset:{key:'C|S'},querySelector:()=>input,classList:{add(){},remove(){},toggle(){}}};
 const input={checked:serverReceived,isConnected:true,closest:()=>({...row,querySelector:()=>state})};
 const APP={data:{targetDate:date,classes:[]},targetDate:date,saving:new Set()},ctx={APP,Date,performance,localStorage:storage,
  apiUrl:()=>url,token:()=>session+'.signature',navigator:{onLine:true},document:{hidden:false,querySelectorAll:()=>[row]},$:()=>null,
  findStudent:(_c,s)=>s==='S'?student:null,requestId:()=> 'REC_SAVE_new_'+(++seq),ensureConnected:()=>true,
  toast:m=>messages.push(m),setSync(){},clearDashboardCache(){},render(){},renderReadTiming(){},renderError(){},updateNetwork(){},applySummary(){},applySavedStudentScope(){},
  api:async(action,payload)=>{
   if(action==='opsDashboard'){reads.push(payload);return{targetDate:date,classes:[]}}
   writes.push(payload);if(apiImpl)return apiImpl(payload);
   student.received=payload.received;student.status=payload.received?'RECEIVED':'UNKNOWN';student.revision='R1';
   return{ok:true,status:student.status,received:student.received,revision:student.revision,summary:{received:1}};
  }};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function createRecordingJournal('),source.indexOf('async function acceptBeforeDeadline(')),ctx);
 vm.runInContext(source.split('\n').find(l=>l.startsWith('async function loadData(')),ctx);
 return{ctx,APP,student,input,writes,reads,messages,storage,journal:ctx.recordingJournal()};
}
test('click is durably recorded before the first network microtask; reload can recover an unsent check',async()=>{
 const storage=memoryStorage(),first=harness({storage,apiImpl:()=>new Promise(()=>{})});first.input.checked=true;
 void first.ctx.saveOne(first.input,'C','S');
 const before=first.journal.list(url).items;assert.equal(before.length,1);assert.equal(before[0].state,'QUEUED');assert.equal(first.writes.length,0);
 const restarted=harness({storage});await restarted.ctx.recoverRecordingChecks();
 assert.equal(restarted.writes.length,1);assert.equal(restarted.writes[0].requestId,before[0].requestId);assert.equal(restarted.writes[0].expectedRevision,'R0');assert.equal(restarted.reads[0].force,true);assert.equal(restarted.journal.list(url).items.length,0);
});
test('server committed but reply was lost: authoritative matching state clears the attempt without another write',async()=>{
 const h=harness({serverReceived:true,revision:'AFTER_WRITE'});h.journal.put(attempt({state:'SENT'}));
 await h.ctx.loadData(false,date);assert.equal(h.reads[0].force,true);assert.equal(h.writes.length,0);assert.equal(h.journal.list(url).items.length,0);
});
test('a queued retry preserves the original request and displayed revision, including an empty new-row revision',async()=>{
 const h=harness({revision:''});h.journal.put(attempt({expectedRevision:''}));await h.ctx.recoverRecordingChecks();
 assert.equal(h.writes[0].requestId,'REC_SAVE_original');assert.equal(h.writes[0].expectedRevision,'');
});
test('newer device change, new session, unknown revision, absent student and closed deadline never replay automatically',async()=>{
 for(const options of [{revision:'OTHER_DEVICE'},{session:'NEW_SESSION'},{canCheck:false},{revision:undefined}]){
  const h=harness(options);h.journal.put(attempt(options.revision===undefined&&'revision'in options?{expectedRevision:null}:{}));await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,0);assert.equal(h.journal.list(url).items.length,1);
 }
 const h=harness();h.student.plannedAbsence=true;h.journal.put(attempt());await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,0);
});
test('another API, date or missing student stays retained without sending to the current roster',async()=>{
 for(const extra of [{apiUrl:'https://other.example/exec'},{targetDate:'2026-11-17'},{studentId:'MISSING'}]){
  const h=harness();h.journal.put(attempt(extra));await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,0);assert.equal(h.journal.list().items.length,1);
 }
});
test('preview, offline, hidden and active read never trigger recovery',async()=>{
 for(const flag of ['preview','loading','needsRead','offline','hidden']){
  const h=harness();h.journal.put(attempt());if(flag==='offline')h.ctx.navigator.onLine=false;else if(flag==='hidden')h.ctx.document.hidden=true;else h.APP[flag]=true;
  await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,0);assert.equal(h.journal.list(url).items.length,1);
 }
});
test('failed authoritative read does not recover using an older visible snapshot',async()=>{
 const h=harness();h.journal.put(attempt());h.ctx.api=async()=>{throw new Error('read failed')};await h.ctx.loadData(false,date);assert.equal(h.writes.length,0);assert.equal(h.journal.list(url).items.length,1);
});
test('uncertain replay is tried at most once per page and retained for later review',async()=>{
 const h=harness({apiImpl:async()=>{throw Object.assign(new Error('lost'),{uncertain:true})}});h.journal.put(attempt());
 await h.ctx.recoverRecordingChecks();await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,1);assert.equal(h.journal.list(url).items.length,1);
});
test('a cached replay success is never applied over a newer differing server state',async()=>{
 const h=harness({apiImpl:async()=>{h.student.revision='OTHER_DEVICE';return{ok:true,received:true,status:'RECEIVED',summary:{received:1}}}});h.journal.put(attempt({state:'SENT'}));
 await h.ctx.recoverRecordingChecks();assert.equal(h.student.received,false);assert.equal(h.student.revision,'OTHER_DEVICE');assert.equal(h.journal.list(url).items.length,1);assert.equal(h.reads.length,1);
});
test('storage refusal or failed readback prevents transmission and does not show saved state',async()=>{
 for(const storage of [{...memoryStorage(),setItem(){throw new Error('quota')}},{...memoryStorage(),setItem(){}}]){
  const h=harness({storage});h.input.checked=true;await h.ctx.saveOne(h.input,'C','S');assert.equal(h.writes.length,0);assert.equal(h.input.checked,false);assert.ok(h.messages.some(m=>m.includes('보관하지 못해')));
 }
});
test('two tabs append separate keys and clearing one attempt cannot erase the other',()=>{
 const storage=memoryStorage(),a=harness({storage}),b=harness({storage});a.journal.put(attempt());b.journal.put(attempt({requestId:'REC_SAVE_other',studentId:'OTHER'}));
 a.journal.remove(attempt());assert.deepEqual(Array.from(b.journal.list(url).items,a=>a.studentId),['OTHER']);
});
test('damaged records are counted, retained and excluded from replay; unrelated browser values are untouched',async()=>{
 const h=harness();h.storage.setItem('allbarun.rec.pending.v1.bad','broken');h.storage.setItem('unrelated','keep');h.journal.put(attempt({requestId:'REC_SAVE_valid',state:'REVIEW'}));
 await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,0);assert.equal(h.journal.list(url).damaged,1);assert.equal(h.storage.getItem('unrelated'),'keep');assert.equal(h.storage.getItem('allbarun.rec.pending.v1.bad'),'broken');
});
test('competing retained intents for one student require review and normal clicks cannot silently replace them',async()=>{
 const h=harness();h.journal.put(attempt());h.journal.put(attempt({requestId:'REC_SAVE_other',received:false}));
 // A matching intent may be confirmed, but its conflicting sibling is not replayed in this pass.
 await h.ctx.recoverRecordingChecks();await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,0);h.input.checked=true;await h.ctx.saveOne(h.input,'C','S');assert.equal(h.writes.length,0);
});
test('journal contains no PIN, full credential, signature or student name',()=>{
 const h=harness();h.journal.put(attempt());const raw=h.storage.getItem(h.storage.key(0));assert.ok(!/signature|검증학생|admin.pin|token/.test(raw));
});


test('reopen retry racing an earlier committed write reconciles without blaming another screen',async()=>{const h=harness({apiImpl:async()=>{h.student.received=true;h.student.revision='COMMITTED';return{conflict:true};}});h.journal.put(attempt({state:'SENT'}));await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,1);assert.equal(h.journal.list(url).items.length,0);assert.ok(h.messages.some(m=>m.includes('이전 체크의 저장 결과')));assert.ok(h.messages.every(m=>!m.includes('다른 화면')));assert.equal(h.reads.length,1);});
test('reopen retry with a differing newer state remains retained for review without overwriting',async()=>{const h=harness({apiImpl:async()=>{h.student.received=false;h.student.revision='NEWER';return{conflict:true};}});h.journal.put(attempt({state:'SENT'}));await h.ctx.recoverRecordingChecks();await h.ctx.recoverRecordingChecks();assert.equal(h.writes.length,1);assert.equal(h.student.received,false);assert.equal(h.journal.list(url).items[0].state,'REVIEW');});
test('ordinary concurrent edit still explains that another screen changed the row',async()=>{const h=harness({apiImpl:async()=>{h.student.revision='NEWER';return{conflict:true};}});h.input.checked=true;await h.ctx.saveOne(h.input,'C','S');assert.ok(h.messages.some(m=>m.includes('다른 화면')));assert.equal(h.student.received,false);assert.equal(h.journal.list(url).items.length,1);});
