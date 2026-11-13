import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
function display(data){
  const nodes=new Map(),ctx={APP:{targetDate:data.targetDate},$:(id)=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},esc:String,renderSummary(){},renderClasses(){},renderRecordingRecovery(){}};
  vm.createContext(ctx);
  vm.runInContext(source.split(/\r?\n/).filter(line=>/^function (render|renderDates)\(/.test(line)).join('\n'),ctx);
  ctx.render(data);
  return nodes.get('date-strip').innerHTML;
}
function data(totalStudents,cachedCount){return {targetDate:'2026-11-16',totalStudents,candidates:[{date:'2026-11-12',shortLabel:'11/12',studentCount:7},{date:'2026-11-16',shortLabel:'11/16',studentCount:cachedCount}],classes:[]};}

test('external absence cancellation shows the live roster count in the selected date chip',()=>{
  const response=data(2,1),before=JSON.stringify(response),html=display(response);
  assert.match(html,/11\/16<span class="tiny">2명/);
  assert.match(html,/11\/12<span class="tiny">7명/);
  assert.equal(JSON.stringify(response),before,'rendering must not rewrite the cached server response');
});
test('a fully exempt selected date displays zero rather than a cached positive count',()=>{
  assert.match(display(data(0,2)),/11\/16<span class="tiny">0명/);
});
test('missing or invalid authoritative totals preserve the candidate count',()=>{
  for(const total of [undefined,null,'2',-1,NaN])assert.match(display(data(total,1)),/11\/16<span class="tiny">1명/);
});
