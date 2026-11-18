// Temporary owner-only STAGING fixture preparation/cleanup; never deploy.
function prepareWorkspaces35(){
 recRequireIntegratedRelease_();recResetContext_();var school='RECQA_20261113_SCHOOL',ids=['RECQA_20261112_S1','RECQA_20261112_S2'];
 var s=recFind_('Schools','school_id',school),st=ids.map(function(id){return recFind_('Students','student_id',id);});
 if(!s||st.some(function(r){return !r||(recText_(r.current_school_id)&&recText_(r.current_school_id)!==school);}))throw Error('Unexpected fixture baseline; no writes');
 var prior=recRead_('SchoolExams').filter(function(e){return e.school_id===school&&Number(e.semester)===1&&e.exam_type==='중간'&&Number(e.year)===2026;});
 if(prior.length)throw Error('Final exam fixture already exists; stop');
 recBulkUpsert_('Schools','school_id',[{school_id:school,active:true,updated_at:new Date()}]);
 recBulkUpsert_('Students','student_id',ids.map(function(id){return {student_id:id,current_school_id:school,updated_at:new Date()};}));SpreadsheetApp.flush();recResetContext_();
 var options=quickExamRegistrationOptions_({startDate:'2026-11-16'}).rows.filter(function(r){return r.schoolId===school;});if(options.length!==1||options[0].total!==2)throw Error('Fixture options not2');
 console.log(JSON.stringify({probe:'WORKSPACES35_PREPARED',schoolId:school,option:options[0]}));
}
function inspectWorkspaces35(){
 recRequireIntegratedRelease_();recResetContext_();var school='RECQA_20261113_SCHOOL';
 var exams=recRead_('SchoolExams').filter(function(e){return e.school_id===school&&Number(e.semester)===1&&e.exam_type==='중간'&&Number(e.year)===2026;});
 var ids=exams.map(function(e){return e.exam_id;});var scores=recRead_('SchoolScores').filter(function(s){return ids.indexOf(s.exam_id)>=0;});
 var absence=recRead_('PlannedAbsences').filter(function(r){return recText_(r.reason)==='통합35 검증전용 20261114';});
 console.log(JSON.stringify({probe:'WORKSPACES35_READBACK',exams:exams.map(function(e){return {id:e.exam_id,status:e.input_status,hidden:e.hidden};}),scores:scores.map(function(s){return {studentId:s.student_id,score:s.raw_score,hidden:s.hidden};}),absences:absence.map(function(a){return {id:a.planned_absence_id,status:a.status,studentId:a.student_id};})}));
}
function cleanupWorkspaces35(){
 recRequireIntegratedRelease_();recResetContext_();var school='RECQA_20261113_SCHOOL',ids=['RECQA_20261112_S1','RECQA_20261112_S2'];
 var abs=recRead_('PlannedAbsences').filter(function(r){return ids.indexOf(r.student_id)>=0&&recText_(r.reason)==='통합35 검증전용 20261114'&&recText_(r.status)!=='CANCELLED';});
 abs.forEach(function(a){quick730CancelAbsence_({plannedAbsenceId:a.planned_absence_id,recordVersion:a.record_version});});
 recResetContext_();var exams=recRead_('SchoolExams').filter(function(e){return e.school_id===school&&Number(e.semester)===1&&e.exam_type==='중간'&&Number(e.year)===2026;}),examIds=exams.map(function(e){return e.exam_id;});
 var scores=recRead_('SchoolScores').filter(function(s){return examIds.indexOf(s.exam_id)>=0;});if(scores.some(function(s){return ids.indexOf(s.student_id)<0;}))throw Error('Unexpected fixture scores; stop');
 if(exams.length)recBulkUpsert_('SchoolExams','exam_id',exams.map(function(e){return {exam_id:e.exam_id,hidden:true,updated_at:new Date()};}));
 if(scores.length)recBulkUpsert_('SchoolScores','school_score_id',scores.map(function(s){return {school_score_id:s.school_score_id,hidden:true,memo:'통합35 검증 완료',updated_at:new Date()};}));
 recBulkUpsert_('Students','student_id',ids.map(function(id){return {student_id:id,current_school_id:'',updated_at:new Date()};}));recBulkUpsert_('Schools','school_id',[{school_id:school,active:false,updated_at:new Date()}]);SpreadsheetApp.flush();recResetContext_();rec800ClearDashboardCaches_(['2026-11-16'],true);
 var d=recordingOpsDashboardIntegrated_({targetDate:'2026-11-16',force:true,readOnly:true});console.log(JSON.stringify({probe:'WORKSPACES35_CLEANED',total:d.totalStudents,received:d.totalReceived,examsHidden:exams.length,scoresHidden:scores.length,absencesCancelled:abs.length}));
}
