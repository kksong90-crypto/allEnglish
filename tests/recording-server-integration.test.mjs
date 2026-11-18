import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {journalContext} from './recording-journal-harness.mjs';
import {serverHarness} from './fixtures/recording-server-harness.mjs';

const app=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
// Pinned server handler + simulated sheet I/O; actual client save/recovery algorithms.
const factory={harness:serverHarness};
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve()};
function client(server,{journal=journalContext(),dropReply=false,stale=[]}={}){
 const students=server.rows.map((r,i)=>({studentId:r.student_id,name:r.student_id,received:r.status==='RECEIVED',status:r.status,canCheck:true,revision:stale.includes(i)?'obsolete':server.ctx.recRecordingRevision_(r)}));
 const timers=[],requests=[],APP={data:{recordingBatchLimit:30,classes:[{classId:'C',students}],totalReceived:students.filter(x=>x.received).length},targetDate:'2026-11-16',saving:new Set()};let serial=0;
 const rows=students.map(s=>{const state={textContent:s.received?'제출':'미확인'},classes=new Set(s.received?['received']:[]),input={checked:s.received,isConnected:true,disabled:false};const row={dataset:{key:'C|'+s.studentId},querySelector:q=>q==='input[type=checkbox]'?input:state,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}};input.closest=()=>row;return row});
 const ctx={...journal,APP,Date,Intl,navigator:{onLine:true},document:{hidden:false,querySelectorAll:()=>rows},$:()=>null,
 setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},requestId:()=> 'REC_SAVE_i'+(++serial),findStudent:(_c,id)=>students.find(s=>s.studentId===id),
 setSync(){},toast(){},clearDashboardCache(){},saveDashboardCache(){},applySavedStudentScope(){},applySummary:s=>APP.data.totalReceived=s.received,loadData:async()=>null,
 api:async(action,payload)=>{requests.push({action,payload});const result=server.run(payload.changes||[payload]);if(dropReply)throw Error('synthetic reply lost after commit');return action==='opsSaveBatch'?result:result.results[0]}};
 vm.createContext(ctx);
 vm.runInContext(app.slice(app.indexOf('function classifyRecordingAttempt('),app.indexOf('function retainedRecordingCheck('))+app.slice(app.indexOf('function recordingInput('),app.indexOf('// Serialize network batches'))+app.slice(app.indexOf('function createRecordingBatchTransport('),app.indexOf('async function acceptBeforeDeadline(')),ctx);
 // The view-only recovery panel is outside this sheet-I/O integration fixture.
 ctx.applyRecordingFilters=()=>{};
 return{ctx,APP,students,requests,journal,rows,timers,async saveAll(){const writes=rows.map(r=>{const input=r.querySelector('input[type=checkbox]');input.checked=true;return ctx.saveOne(input,'C',r.dataset.key.slice(2))});while(timers.length){timers.shift()();await drain()}await Promise.all(writes);await drain();return writes}};
}
test('30 real client save flows match actual server response revisions and preserve every original sheet field',async()=>{
 const server=factory.harness(),ui=client(server);await ui.saveAll();
 assert.equal(ui.requests.length,1);assert.equal(ui.APP.data.totalReceived,30);assert.equal(ui.journal.pendingRecordingChecks().length,0);
 for(let i=0;i<30;i++){assert.equal(ui.students[i].revision,server.ctx.recRecordingRevision_(server.rows[i]));assert.equal(server.rows[i].record_version,8);assert.equal(server.rows[i].custom_column,'preserve-'+i)}
 assert.ok(ui.rows.every(r=>r.querySelector('input[type=checkbox]').checked&&!r.querySelector('input[type=checkbox]').disabled));
});
test('31 students split into 30 plus 1 with correct final counts across actual server replies',async()=>{
 const server=factory.harness({count:31}),ui=client(server);await ui.saveAll();
 assert.deepEqual(ui.requests.map(r=>r.payload.changes.length),[30,1]);assert.equal(ui.APP.data.totalReceived,31);assert.equal(ui.journal.pendingRecordingChecks().length,0);assert.ok(server.rows.every(r=>r.record_version===8));
});
test('a stale revision and newly absent student retain review while the other 28 are confirmed',async()=>{
 const server=factory.harness({absent:[1]}),ui=client(server,{stale:[0]});await ui.saveAll();
 assert.equal(ui.APP.data.totalReceived,28);assert.equal(ui.journal.pendingRecordingChecks().length,2);assert.equal(server.rows[0].record_version,7);assert.equal(server.rows[1].record_version,7);assert.ok(ui.students.slice(2).every(s=>s.received));assert.equal(ui.APP.needsRead,true);
});
test('lost reply after 30 committed writes survives restart and authoritative recovery makes no duplicate writes',async()=>{
 const server=factory.harness(),first=client(server,{dropReply:true});await first.saveAll();
 assert.equal(first.journal.pendingRecordingChecks().length,30);assert.ok(server.rows.every(r=>r.record_version===8));
 const restarted=client(server,{journal:first.journal});await restarted.ctx.recoverRecordingChecks();
 assert.equal(restarted.journal.pendingRecordingChecks().length,0);assert.equal(restarted.requests.length,0);assert.ok(restarted.students.every(s=>s.received));assert.ok(server.rows.every(r=>r.record_version===8));
});
