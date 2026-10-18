import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extract(name) {
  const start = html.indexOf(`async function ${name}(`);
  assert.ok(start >= 0);
  const end = html.indexOf('\n}', start) + 2;
  return html.slice(start, end);
}
function harness() {
  const pending = [], home = [], schedule = [], forces = [];
  const target = {dataset:{},innerHTML:''};
  const ctx = {
    currentUser:{token:'synthetic-noncredential'}, studentSessionEpoch:1,
    homeScheduleRequestSerial:0, myScheduleRequestSerial:0,
    myScheduleLoadedOnce:true, myScheduleCurrentRange:'week',
    myScheduleLastPayload:{range:'week',startDate:'2026-10-06',days:[]},
    document:{getElementById:()=>target,visibilityState:'visible'}, console:{error(){}},
    learningScheduleLastResumeAt:0, Date:{now:()=>20000},getActiveTabId:()=> 'exam',
    normalizeScheduleRange:x=>x, setScheduleRangeActive(){},setScheduleButtonsDisabled(){},
    scheduleRangeLabel:x=>x,escapeHtml:x=>x,getTodayString:()=> '2026-10-07',
    renderHomeLearningPreview:x=>home.push(x),renderMySchedule:x=>schedule.push(x),
    fetchMyLearningSchedule:(range,force)=>{forces.push(force);return new Promise(resolve=>pending.push(resolve));}
  };
  vm.createContext(ctx);
  vm.runInContext(['loadHomeLearningPreview','loadMySchedule','loadExamTabOnce','refreshLearningScheduleOnResume'].map(extract).join('\n'),ctx);
  return {ctx,pending,home,schedule,forces};
}
test('a new day cannot reuse the previous date schedule indefinitely',async()=>{
  const h=harness(); const work=h.ctx.loadExamTabOnce();
  assert.equal(h.pending.length,1,'a fresh date requires a new read');
  h.pending[0]({range:'week',startDate:'2026-10-07',days:[]});await work;
  assert.equal(h.schedule.at(-1).startDate,'2026-10-07');
});
test('older home response cannot overwrite a later explicit schedule read',async()=>{
  const h=harness();const old=h.ctx.loadHomeLearningPreview();const latest=h.ctx.loadMySchedule('week',true);
  h.pending[1]({marker:'latest'});await latest;
  h.pending[0]({marker:'older'});await old;
  assert.equal(h.home.at(-1).marker,'latest');
});
test('same-day publication replaces old two-Day payload on revisit',async()=>{
  const h=harness();h.ctx.myScheduleLastPayload={startDate:'2026-10-07',vocab:'Day 30~31'};
  const work=h.ctx.loadExamTabOnce();assert.equal(h.pending.length,1);
  assert.equal(h.forces[0],true);
  h.pending[0]({startDate:'2026-10-07',vocab:'Day 30'});await work;
  assert.equal(h.schedule.at(-1).vocab,'Day 30');
});
test('phone resume refreshes the active schedule and coalesces focus events',async()=>{
  const h=harness();const work=h.ctx.refreshLearningScheduleOnResume();
  assert.equal(h.pending.length,1);assert.equal(h.forces[0],true);
  await h.ctx.refreshLearningScheduleOnResume();assert.equal(h.pending.length,1);
  h.pending[0]({marker:'published'});await work;
  assert.equal(h.schedule.at(-1).marker,'published');
});
test('hidden or logged-out sessions do not request schedule data on resume',async()=>{
  const h=harness();h.ctx.document.visibilityState='hidden';
  await h.ctx.refreshLearningScheduleOnResume();assert.equal(h.pending.length,0);
  h.ctx.document.visibilityState='visible';h.ctx.currentUser=null;
  await h.ctx.refreshLearningScheduleOnResume();assert.equal(h.pending.length,0);
});
test('force refresh still reads even when the date matches',async()=>{
  const h=harness();h.ctx.myScheduleLastPayload.startDate='2026-10-07';
  const work=h.ctx.loadExamTabOnce(true);assert.equal(h.pending.length,1);
  h.pending[0]({startDate:'2026-10-07',days:[]});await work;
});
test('logout epoch prevents both responses from rendering',async()=>{
  const h=harness();const home=h.ctx.loadHomeLearningPreview();const schedule=h.ctx.loadMySchedule('week');
  h.ctx.studentSessionEpoch++;h.pending.forEach(resolve=>resolve({startDate:'2026-10-07',days:[]}));
  await Promise.all([home,schedule]);assert.equal(h.home.length,0);assert.equal(h.schedule.length,0);
});
