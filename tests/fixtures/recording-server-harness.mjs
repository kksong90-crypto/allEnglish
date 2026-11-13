import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('./recording-batch-server.js',import.meta.url),'utf8');
export function serverHarness({count=30,stale=[],absent=[],closed=false,writeError=false}={}){
 const calls=[],rows=Array.from({length:count},(_,i)=>({recording_check_id:'R'+i,class_id:'C',student_id:'S'+i,status:'UNKNOWN',record_version:7,updated_at:new Date('2026-11-12'),created_at:new Date('2026-01-01'),custom_column:'preserve-'+i,_rowNumber:i+2}));let projected=false;
 const revision=r=>r.recording_check_id?JSON.stringify([r.recording_check_id,r.updated_at.toISOString(),r.status]):'';
 const changes=rows.map((r,i)=>({classId:'C',studentId:r.student_id,received:true,expectedRevision:stale.includes(i)?'stale':revision(r),requestId:'Q'+i}));
 const ctx={console,Date,Math,JSON,Object,Array,isFinite,ScriptApp:{getScriptId:()=> '1gtJFnSdYn_1sjx_LB3Nli2XbEdE9JKR_7eMwmreKww6_r0Qo23p6X7JT'},REC716:{ENVIRONMENT:'STAGING_EXAM_ONLY',CHECK_SHEET:'RecordingChecks'},REC800:{SAVE_LOCK_MS:100},recExamStagingBoundary_(){},recRequireOwner_(){},recText_:x=>String(x||''),recDateKey_:x=>x,recBool_:Boolean,recStatus_:x=>x,recAdminEmail_:()=> 'qa',recRecordingRevision_:revision,recCheckId_:(_d,_c,s)=>s,recBatchId_:()=> 'B',recFormat_:()=> '12:00:00',recResetContext_(){},
 recWithLock_:f=>{calls.push('lock');return f()},recWithProjection20261113_:f=>{assert.equal(calls[0],'lock');calls.push('projection');projected=true;try{return f()}finally{projected=false}},rec800BuildSnapshot_:()=>({classes:[]}),rec800Checks_:()=>{assert.equal(projected,false);calls.push('checks');return rows.map(r=>({...r}))},rec800ValidateTarget_:(_s,_c,s)=>{if(absent.includes(Number(s.slice(1))))throw Error('예정결석 또는 대상 없음');return {cls:{openAt:'2000-01-01',testPlanIds:['P'],vocabSummary:'Day1'},student:{name:s}}},recV748Deadline_:()=>new Date(closed?'2000-01-01':'2100-01-01'),
 rec800UpsertMany_:(_n,_k,saved,existing)=>{calls.push('write');assert.equal(projected,false);assert.ok(existing.every(r=>r.custom_column==='preserve-'+r.student_id.slice(1)));if(writeError)throw Error('write failed');for(const row of saved){const old=rows.find(r=>r.recording_check_id===row.recording_check_id);Object.assign(old,row,{record_version:old.record_version+1})}},SpreadsheetApp:{flush:()=>calls.push('flush')},rec800PublishNotice_:()=>{calls.push('notice');return {status:'PUBLISHED',missing:0}},rec800ClearDashboardCaches_:()=>calls.push('cache'),rec800SummaryAfterSave_:(_d,_n,_s,checks)=>({total:count,received:checks.filter(r=>r.status==='RECEIVED').length})};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.rec800MirrorBatchSavedV830_=()=>calls.push('mirror');
 return {ctx,calls,rows,changes,run:(cs=changes)=>ctx.recordingOpsSaveBatchV830({targetDate:'2026-11-16',changes:cs})};
}

