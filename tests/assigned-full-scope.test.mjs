import test from 'node:test';
import assert from 'node:assert/strict';
import {virtualStudent,server} from './helpers/virtual-student.mjs';
const words=Array.from({length:401},(_,i)=>({questionNo:i+1,prompt:'가상 뜻 '+i,acceptedAnswers:['word'+i],bookId:'B',vocabWordId:'W'+i,sourceLabel:'전체 범위'}));
function fixture(change=()=>{}) {
 const backend=server(),original=backend.answer.bind(backend);
 backend.answer=p=>{
  if(p.action!=='getAssignedVocaPracticeQuestions')return original(p);
  const offset=Number(p.offset),questions=structuredClone(words.slice(offset,offset+200));
  const r={success:true,testPlanId:p.testPlanId,mode:'MEANING_TO_WORD',coverage:'ALL',scopeVersion:'snapshot-1',totalCount:words.length,count:questions.length,offset,nextOffset:offset+questions.length<words.length?offset+questions.length:null,questions};
  change(r,p,backend);return r;
 };
 return virtualStudent({backend});
}
test('all 401 assigned words load once, including the final page, before any study opens',async()=>{
 const v=fixture();await v.boot();await v.context.startAssignedVocaPractice('WHOLE_PLAN');
 const s=v.read('assignedPracticeState');assert.equal(s.sourceRows.length,401);assert.equal(s.rows.length,200);assert.equal(new Set(s.sourceRows.map(r=>r[7])).size,401);
 const calls=v.requests.filter(p=>p.action==='getAssignedVocaPracticeQuestions');assert.deepEqual(calls.map(p=>p.offset),['0','200','400']);assert.ok(calls.every(p=>p.coverage==='ALL'&&p.randomize==='false'));assert.equal(calls[1].scopeVersion,'snapshot-1');
 assert.equal(v.requests.some(p=>p.action==='getVocabData'||p.action==='saveVocabResult'),false);
});
for(const [label,change] of [
 ['legacy sample',r=>{delete r.coverage;}],
 ['scope changed on page 2',r=>{if(r.offset===200)r.scopeVersion='snapshot-2';}],
 ['bad next offset',r=>{r.nextOffset=0;}],
 ['duplicate across pages',r=>{if(r.offset===200)r.questions[0]={...words[0]};}],
 ['total changed on page 2',r=>{if(r.offset===200)r.totalCount=402;}],
 ['truncated last page',r=>{if(r.offset===400){r.questions=[];r.count=0;}}]
])test(label+' fails closed without showing a partial test',async()=>{
 const v=fixture(change);await v.boot();await v.context.startAssignedVocaPractice('WHOLE_PLAN');assert.equal(v.read('assignedPracticeState'),null);assert.equal(v.node('practice-answer-0'),null);
});
test('Fisher–Yates uses all members exactly once, never mutates input, and accepts identical random outcomes',async()=>{
 const v=fixture();const math=Object.create(Math);math.random=()=>0;v.context.Math=math;
 const input=[0,1,2,3];const result=Array.from(v.context.shuffleAssignedPractice(input));assert.deepEqual(result,[1,2,3,0]);assert.deepEqual(input,[0,1,2,3]);assert.deepEqual(Array.from(v.context.shuffleAssignedPractice(input)),result);assert.deepEqual(Array.from(v.context.shuffleAssignedPractice([])),[]);
 math.random=()=>0.999999;assert.deepEqual(Array.from(v.context.shuffleAssignedPractice(input)),input);
});
