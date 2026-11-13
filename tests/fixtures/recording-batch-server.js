// Pinned API implementation: 66f2528daec8df2c2b1224d6ac3232da6285a925 (unchanged by staging32).
// STAGING-only bounded coalescing. Projection ends before authoritative checks/CAS/writes.
function recordingOpsSaveBatchV830(payload){
 recExamStagingBoundary_();recRequireOwner_();
 if(ScriptApp.getScriptId()!=='1gtJFnSdYn_1sjx_LB3Nli2XbEdE9JKR_7eMwmreKww6_r0Qo23p6X7JT'||REC716.ENVIRONMENT!=='STAGING_EXAM_ONLY')throw new Error('Wrong batch save environment');
 payload=payload||{};var date=recDateKey_(payload.targetDate),changes=payload.changes,seen={},requests={};
 if(!date||!Array.isArray(changes)||!changes.length||changes.length>30)throw new Error('날짜와 1~30명의 체크가 필요합니다.');
 changes=changes.map(function(c){
  if(!c||!recText_(c.classId)||!recText_(c.studentId)||typeof c.received!=='boolean'||typeof c.expectedRevision!=='string'||!recText_(c.requestId))throw new Error('체크의 학생·변경 버전·요청 번호가 필요합니다.');
  var cid=recText_(c.classId),sid=recText_(c.studentId),id=recText_(c.requestId),key=JSON.stringify([cid,sid]);
  if(seen[key]||requests[id])throw new Error('같은 학생이나 요청 번호를 중복 전송할 수 없습니다.');seen[key]=true;requests[id]=true;
  return {classId:cid,studentId:sid,received:c.received,expectedRevision:c.expectedRevision,requestId:id};
 });
 var started=Date.now(),step=started,timing={scope:'BATCH_SAVE_HANDLER',count:changes.length};
 function mark(k){var at=Date.now();timing[k]=at-step;step=at;}
 return recWithLock_(function(){
  mark('lockWaitMs');var now=new Date();recResetContext_();
  var snap=recWithProjection20261113_(function(){return rec800BuildSnapshot_(date);});mark('targetSnapshotMs');
  // Full original rows, including fields outside the read projection, are essential here.
  var existing=rec800Checks_(date),byStudent={};
  existing.forEach(function(r){var key=JSON.stringify([recText_(r.class_id),recText_(r.student_id)]);(byStudent[key]||(byStudent[key]=[])).push(r);});
  mark('checksMs');var pending=[],results=changes.map(function(c){
   var result={requestId:c.requestId,targetDate:date,classId:c.classId,studentId:c.studentId,ok:false},target;
   try{
    target=rec800ValidateTarget_(snap,c.classId,c.studentId);
    if(now.getTime()<new Date(target.cls.openAt).getTime())throw new Error('확인 가능 시간이 아닙니다.');
    if(now.getTime()>=recV748Deadline_(date).getTime())throw new Error('15시 마감 이후에는 일반 체크를 변경할 수 없습니다.');
   }catch(error){result.error={message:error.message};return result;}
   var matches=byStudent[JSON.stringify([c.classId,c.studentId])]||[],old=matches[0]||{};
   if(matches.length>1){result.error={message:'중복 체크가 있어 관리자 확인이 필요합니다.'};return result;}
   var revision=recRecordingRevision_(old);
   if(c.expectedRevision!==revision){result.conflict=true;result.revision=revision;result.received=recStatus_(old.status)==='RECEIVED';return result;}
   var prior=old.updated_at instanceof Date?old.updated_at.getTime():Date.parse(old.updated_at||''),status=c.received?'RECEIVED':'UNKNOWN';
   var saved={recording_check_id:recText_(old.recording_check_id)||recCheckId_(date,c.classId,c.studentId),recording_batch_id:recBatchId_(date),target_date:date,class_id:c.classId,student_id:c.studentId,test_plan_ids_json:JSON.stringify(target.cls.testPlanIds||[]),vocab_summary:target.cls.vocabSummary||'',status:status,received_checked_at:c.received?now:'',status_changed_at:now,checked_by:recAdminEmail_(),source:c.received?'WEBAPP_V800_CONFIRMED':'WEBAPP_V800_UNCHECKED',applied_to_lesson:recBool_(old.applied_to_lesson),applied_at:old.applied_at||'',memo:'',created_at:old.created_at||now,updated_at:new Date(Math.max(now.getTime(),isFinite(prior)?prior+1:0))};
   pending.push({change:c,target:target,saved:saved,result:result});return result;
  });
  if(!pending.length){timing.totalMs=Date.now()-started;return {ok:true,targetDate:date,results:results,saved:0,serverTiming:timing};}
  rec800UpsertMany_(REC716.CHECK_SHEET,'recording_check_id',pending.map(function(p){return p.saved;}),existing);
  SpreadsheetApp.flush();mark('saveFlushMs');
  var accepted={};pending.forEach(function(p){accepted[JSON.stringify([p.change.classId,p.change.studentId])]=true;});
  var checks=existing.filter(function(r){return !accepted[JSON.stringify([recText_(r.class_id),recText_(r.student_id)])];}).concat(pending.map(function(p){return p.saved;}));
  var notice=rec800PublishNotice_(date,now,snap,checks);mark('noticeMs');
  rec800MirrorBatchSavedV830_(date,pending,notice);mark('auditMirrorMs');
  rec800ClearDashboardCaches_([date],true);mark('cacheClearMs');
  var summary=rec800SummaryAfterSave_(date,now,snap,checks,notice);
  pending.forEach(function(p){Object.assign(p.result,{ok:true,status:p.saved.status,received:p.change.received,revision:recRecordingRevision_(p.saved),savedAt:recFormat_(now,'HH:mm:ss'),notice:notice,summary:summary});});
  timing.totalMs=Date.now()-started;return {ok:true,targetDate:date,results:results,saved:pending.length,serverTiming:timing};
 },REC800.SAVE_LOCK_MS);
}
function rec800MirrorBatchSavedV830_(date,items,notice){
 try{
  var sh=recDb_().getSheetByName(REC800.AUDIT_SHEET);if(!sh)return;
  var last=sh.getLastRow(),index={};
  if(last>=2)sh.getRange(2,10,last-1,3).getDisplayValues().forEach(function(v,i){var k=JSON.stringify([recText_(v[0]),recText_(v[1]),recText_(v[2])]);if(!index[k])index[k]=i+2;});
  var updates=[],appends=[];
  items.forEach(function(p){var c=p.change,s=p.saved,t=p.target,at=index[JSON.stringify([date,c.classId,c.studentId])],row=[date,t.cls.className||c.classId,t.student.name||c.studentId,s.vocab_summary||'',recStatus_(s.status),s.received_checked_at||'','조회·저장 시 자동',recText_(notice&&notice.status)+(notice&&notice.active?' · 노출':' · 숨김'),'',date,c.classId,c.studentId,s.recording_check_id,s.recording_batch_id,s.source,s.updated_at||''];if(at)updates.push({at:at,row:row});else appends.push(row);});
  updates.sort(function(a,b){return a.at-b.at;});var groups=[];
  updates.forEach(function(u){var g=groups[groups.length-1];if(g&&u.at===g.at+g.rows.length)g.rows.push(u.row);else groups.push({at:u.at,rows:[u.row]});});
  groups.forEach(function(g){sh.getRange(g.at,1,g.rows.length,REC800.AUDIT_HEADERS.length).setValues(g.rows);});
  if(appends.length)sh.getRange(last+1,1,appends.length,REC800.AUDIT_HEADERS.length).setValues(appends);
 }catch(error){console.warn('감사 시트 보조 갱신 실패: '+error.message);}
}

