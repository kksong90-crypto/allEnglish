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
  const pending = [], home = [], schedule = [];
  const target = {dataset:{},innerHTML:''};
  const ctx = {
    currentUser:{token:'synthetic-noncredential'}, studentSessionEpoch:1,
    homeScheduleRequestSerial:0, myScheduleRequestSerial:0,
    myScheduleLoadedOnce:true, myScheduleCurrentRange:'week',
    myScheduleLastPayload:{range:'week',startDate:'2026-10-06',days:[]},
    document:{getElementById:()=>target}, console:{error(){}},
    normalizeScheduleRange:x=>x, setScheduleRangeActive(){},setScheduleButtonsDisabled(){},
    scheduleRangeLabel:x=>x,escapeHtml:x=>x,getTodayString:()=> '2026-10-07',
    renderHomeLearningPreview:x=>home.push(x),renderMySchedule:x=>schedule.push(x),
    fetchMyLearningSchedule:()=>new Promise(resolve=>pending.push(resolve))
  };
  vm.createContext(ctx);
  vm.runInContext(['loadHomeLearningPreview','loadMySchedule','loadExamTabOnce'].map(extract).join('\n'),ctx);
  return {ctx,pending,home,schedule};
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
test('same-day revisit reuses current response without another request',async()=>{
  const h=harness();h.ctx.myScheduleLastPayload.startDate='2026-10-07';
  await h.ctx.loadExamTabOnce();assert.equal(h.pending.length,0);assert.equal(h.schedule.length,1);
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
