// Temporary owner-only verification; never deploy. All fixture IDs are synthetic.
function nativeThirtyContext_(){
 recRequireIntegratedRelease_();recResetContext_();
 var date='2026-11-16',cid='RECQA_20261112_CLASS',prefix='RECQA30_20261114_',base='RECQA_20261112_S1';
 var students=recRead_('Students'),enrollments=recRead_('ClassEnrollments'),assignments=recRead_('StudentTestGroups');
 var st=students.filter(function(r){return recText_(r.student_id)===base;});
 var en=enrollments.filter(function(r){return recText_(r.student_id)===base&&recText_(r.class_id)===cid;});
 var as=assignments.filter(function(r){return recText_(r.student_id)===base;});
 if(st.length!==1||en.length!==1)throw Error('Synthetic baseline ambiguity');
 var keys={Students:recHeaders_('Students')[0],ClassEnrollments:recHeaders_('ClassEnrollments')[0],StudentTestGroups:recHeaders_('StudentTestGroups')[0]};
 if(keys.Students!=='student_id'||!/_id$/.test(keys.ClassEnrollments)||!/_id$/.test(keys.StudentTestGroups))throw Error('Unexpected primary keys');
 return {date:date,cid:cid,prefix:prefix,base:base,students:students,enrollments:enrollments,assignments:assignments,st:st[0],en:en[0],as:as,keys:keys};
}
function prepareNativeThirtyStaging20261114(){
 var c=nativeThirtyContext_();var baseline=rec800BuildSnapshot_(c.date),list=baseline.classes.reduce(function(a,x){return a.concat(x.students);},[]);
 if(list.length!==2||list.some(function(s){return ['RECQA_20261112_S1','RECQA_20261112_S2'].indexOf(s.studentId)<0;}))throw Error('Expected exact two-student baseline; no writes performed');
 var ss=[],ee=[],aa=[];
 function clone(row){var out={};Object.keys(row).forEach(function(k){if(k.charAt(0)!=='_')out[k]=row[k];});return out;}
 for(var i=1;i<=28;i++){
  var id=c.prefix+('00'+i).slice(-2);if(c.students.some(function(r){return recText_(r.student_id)===id;}))throw Error('Fixture IDs already exist');
  var s=clone(c.st);s.student_id=id;s.name='규모검증'+('00'+i).slice(-2);s.status='ACTIVE';s.updated_at=new Date();
  Object.keys(s).forEach(function(k){if(/phone|email|address|pin|token|password/i.test(k))s[k]='';});ss.push(s);
  var e=clone(c.en);e[c.keys.ClassEnrollments]=id+'_E';e.student_id=id;e.start_date=c.date;e.end_date=c.date;e.status='ACTIVE';e.updated_at=new Date();ee.push(e);
  c.as.forEach(function(a,j){var r=clone(a);r[c.keys.StudentTestGroups]=id+'_G'+j;r.student_id=id;r.start_date=c.date;r.end_date=c.date;r.status='ACTIVE';r.updated_at=new Date();aa.push(r);});
 }
 try{
  recBulkUpsert_('Students',c.keys.Students,ss);recBulkUpsert_('ClassEnrollments',c.keys.ClassEnrollments,ee);if(aa.length)recBulkUpsert_('StudentTestGroups',c.keys.StudentTestGroups,aa);SpreadsheetApp.flush();recResetContext_();rec800ClearDashboardCaches_([c.date],true);
  var d=recordingOpsDashboardIntegrated_({targetDate:c.date,force:true,readOnly:true});
  if(d.totalStudents!==30)throw Error('Expected30 native eligible students');
  console.log(JSON.stringify({probe:'NATIVE30_PREPARED',total:d.totalStudents,received:d.totalReceived,createdStudents:ss.length,createdEnrollments:ee.length,createdAssignments:aa.length,serverTiming:d.serverTiming}));
 }catch(error){cleanupNativeThirtyStaging20261114();throw error;}
}
function verifyNativeThirtyStaging20261114(){
 var c=nativeThirtyContext_(),d=recordingOpsDashboardIntegrated_({targetDate:c.date,force:true,readOnly:true});
 var students=d.classes.reduce(function(out,cls){return out.concat(cls.students.map(function(s){return {classId:cls.classId,studentId:s.studentId,received:s.received,revision:s.revision};}));},[]);
 if(students.length!==30||students.some(function(s){return s.classId!==c.cid||(['RECQA_20261112_S1','RECQA_20261112_S2'].indexOf(s.studentId)<0&&s.studentId.indexOf(c.prefix)!==0);}))throw Error('Unexpected targets; no writes');
 var before=rec800Checks_(c.date).filter(function(r){return recText_(r.class_id)===c.cid;}),old={},result,restore;
 before.forEach(function(r){old[recText_(r.student_id)]={received:r.status==='RECEIVED',scope:JSON.stringify([r.test_plan_ids_json,r.vocab_summary,r.memo])};});
 function changes(received){recResetContext_();var checks=rec800Checks_(c.date),by={};checks.forEach(function(r){if(recText_(r.class_id)===c.cid)by[recText_(r.student_id)]=r;});return students.map(function(s){return {classId:c.cid,studentId:s.studentId,received:typeof received==='boolean'?received:!!(old[s.studentId]&&old[s.studentId].received),expectedRevision:recRecordingRevision_(by[s.studentId]||{}),requestId:'REC_SAVE_NATIVE30_'+Utilities.getUuid().replace(/-/g,'')};});}
 try{result=recordingOpsSaveBatchV830({targetDate:c.date,changes:changes(true)});if(result.saved!==30)throw Error('Native batch did not confirm30');recResetContext_();var committed=rec800Checks_(c.date).filter(function(r){return recText_(r.class_id)===c.cid;});if(committed.length!==30||committed.some(function(r){return r.status!=='RECEIVED';}))throw Error('Native readback mismatch');}
 finally{restore=recordingOpsSaveBatchV830({targetDate:c.date,changes:changes(null)});if(restore.saved!==30)throw Error('Native restore did not confirm30');}
 recResetContext_();var after=rec800Checks_(c.date).filter(function(r){return recText_(r.class_id)===c.cid;});
 if(after.length!==30||after.some(function(r){var p=old[recText_(r.student_id)];return (r.status==='RECEIVED')!==!!(p&&p.received)||(p&&p.scope!==JSON.stringify([r.test_plan_ids_json,r.vocab_summary,r.memo]));}))throw Error('Restored state/scope mismatch');
 console.log(JSON.stringify({probe:'NATIVE30_BATCH_RESTORED',saved:result.saved,restored:restore.saved,finalReceived:after.filter(function(r){return r.status==='RECEIVED';}).length,scopePreserved:true,saveTiming:result.serverTiming,restoreTiming:restore.serverTiming}));
}
function cleanupNativeThirtyStaging20261114(){
 var c=nativeThirtyContext_();
 [['ClassEnrollments',c.enrollments],['StudentTestGroups',c.assignments],['Students',c.students]].forEach(function(pair){var rows=pair[1].filter(function(r){return recText_(r.student_id).indexOf(c.prefix)===0;}).map(function(r){var o={status:'INACTIVE',updated_at:new Date()};o[c.keys[pair[0]]]=r[c.keys[pair[0]]];return o;});if(rows.length)recBulkUpsert_(pair[0],c.keys[pair[0]],rows);});
 SpreadsheetApp.flush();recResetContext_();rec800PublishNotice_(c.date,new Date(),rec800BuildSnapshot_(c.date),rec800Checks_(c.date));rec800ClearDashboardCaches_([c.date],true);
 var d=recordingOpsDashboardIntegrated_({targetDate:c.date,force:true,readOnly:true});if(d.totalStudents!==2)throw Error('Synthetic roster cleanup mismatch');
 console.log(JSON.stringify({probe:'NATIVE30_CLEANUP',total:d.totalStudents,received:d.totalReceived,inactiveFixtureStudents:recRead_('Students').filter(function(r){return recText_(r.student_id).indexOf(c.prefix)===0&&r.status==='INACTIVE';}).length}));
}
