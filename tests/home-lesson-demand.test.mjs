import test from 'node:test';
import assert from 'node:assert/strict';
import {virtualStudent,server,makeDay} from './helpers/virtual-student.mjs';
function fixture({empty=false}={}){
 const backend=server(),answer=backend.answer.bind(backend),day=makeDay('',{vocab:empty?[]:[{testPlanId:'SYNTH_PLAN',slotKey:'first',personalScopeFingerprint:'a'.repeat(64),displayText:'합성 Day 1',vocaScopeState:'CONNECTED',sourceRanges:[{sectionId:'SYNTH_DAY'}]}]});
 backend.answer=p=>{
  if(p.action==='getMyVocabPreparation')return{success:true,preparationOnly:true,days:[day],visibleDays:[day],nextPlan:day};
  if(p.action==='getAssignedVocaPracticeQuestions'){const offset=Number(p.offset),questions=Array.from({length:Math.min(200,205-offset)},(_,i)=>({questionNo:offset+i+1,prompt:'합성 뜻 '+(offset+i),acceptedAnswers:['synthetic'+(offset+i)],vocabWordId:'SYNTH_'+(offset+i),bookId:'SYNTH_BOOK'}));return{success:true,testPlanId:p.testPlanId,planDate:day.date,mode:'MEANING_TO_WORD',coverage:'ALL',totalCount:205,scopeVersion:'synthetic-scope',offset,count:questions.length,nextOffset:offset+questions.length===205?null:offset+questions.length,questions};}
  return answer(p);
 };
 backend.hold.add('getMyLearningSchedule');return virtualStudent({backend});
}
const full=v=>v.requests.filter(p=>p.action==='getMyLearningSchedule');
async function release(v){for(const pending of v.backend.waiting.splice(0))pending.resolve({success:true,days:[makeDay()],visibleDays:[makeDay()],nextPlan:makeDay()});await v.flush();}
test('word-only home to complete ALL practice omits the automatic full lesson round trip',async()=>{
 const v=fixture();await v.boot();await v.runShortTimers(1500);assert.equal(full(v).length,0);assert.match(v.node('home-learning-content').innerHTML,/아직 확인하지 않았어요/);await v.context.startAssignedVocaPractice('SYNTH_PLAN',null,'first','a'.repeat(64));
 assert.equal(full(v).length,0);const calls=v.requests.filter(p=>p.action==='getAssignedVocaPracticeQuestions');assert.equal(calls.length,2);assert.deepEqual(calls.map(p=>p.offset),['0','200']);assert.ok(calls.every(p=>p.coverage==='ALL'&&p.slotKey==='first'&&p.personalScopeFingerprint==='a'.repeat(64)));assert.equal(v.read('assignedPracticeState.sourceRows.length'),205);
 const before=v.requests.length;v.context.assignedPracticeChooseMode('card');assert.equal(v.read('assignedPracticeState.mode'),'card');v.context.assignedPracticeReveal();v.context.assignedPracticeHide();assert.equal(v.requests.length,before);
});
test('lesson expansion coalesces repeated clicks and keeps all lesson information accessible',async()=>{
 const v=fixture();await v.boot();await v.runShortTimers(1500);const button=v.node('home-other-preparation-load');const first=button.onclick(),second=button.onclick();await v.flush();assert.equal(full(v).length,1);assert.equal(button.disabled,true);await release(v);await Promise.all([first,second]);assert.match(v.node('home-learning-content').innerHTML,/교재 24~27/);assert.match(v.node('home-learning-content').innerHTML,/관계대명사 Quiz/);
});
test('a day without words still offers lesson preparation and expands its homework',async()=>{
 const v=fixture({empty:true});await v.boot();await v.runShortTimers(1500);assert.equal(full(v).length,0);const button=v.node('home-other-preparation-load');assert.ok(button);const pending=button.onclick();await v.flush();await release(v);await pending;assert.match(v.node('home-learning-content').innerHTML,/교재 24~27/);
});
test('late lesson responses after leaving home or logging out cannot repaint home',async()=>{
 for(const leave of ['page','logout']){const v=fixture();await v.boot();await v.runShortTimers(1500);const pending=v.node('home-other-preparation-load').onclick();await v.flush();if(leave==='page')v.context.showTab('vocab');else await v.context.logout();const before=v.node('home-learning-content').innerHTML;await release(v);await pending;assert.equal(v.node('home-learning-content').innerHTML,before);if(leave==='logout')assert.equal(v.read('currentUser'),null);}
});
