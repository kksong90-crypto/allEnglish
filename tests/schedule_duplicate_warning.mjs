import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const html = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function extract(name) {
  const start = html.indexOf('function '+name+'(');
  assert.ok(start >= 0,name);
  const next = /\n\s*(?:async )?function \w+\(/.exec(html.slice(start+1));
  return html.slice(start,next ? start+1+next.index : html.indexOf('</script>',start));
}
const context = vm.createContext({});
for (const name of ['escapeHtml','formatMultilineHtml','scheduleHasValue','scheduleVocabItem']) vm.runInContext(extract(name),context);
const item = {displayText:'[단어장] Day 1',testPlanId:'P',sourceRanges:[{}]};
test('학생과 관리자 모두 중복 상태를 표시하고 개인연습은 차단',()=>{
  for (const readOnly of [false,true]) {
    const output = context.scheduleVocabItem([{...item,vocaScopeState:'DUPLICATE'}],readOnly);
    assert.match(output,/role="status"/);
    assert.match(output,/계획이 중복되어 확인이 필요/);
    assert.match(output,/확정 범위로 사용하지 마세요/);
    assert.match(output,/Day 1/);
    assert.doesNotMatch(output,/startAssignedVocaPractice/);
  }
});
test('정상·레거시·누락 상태에는 중복 경고를 추가하지 않음',()=>{
  for (const state of ['CONNECTED','UNLINKED','NONE','MANAGED_MISSING',undefined]) {
    const output = context.scheduleVocabItem([{...item,vocaScopeState:state}]);
    assert.doesNotMatch(output,/계획이 중복/);
    assert.equal(output.includes('startAssignedVocaPractice'),state === 'CONNECTED');
  }
});
test('자료의 HTML은 이스케이프하고 새 요청·저장·인쇄는 없음',()=>{
  const output = context.scheduleVocabItem([{...item,vocaScopeState:'DUPLICATE',displayText:'<img onerror="attack">'}]);
  assert.doesNotMatch(output,/<img/);
  assert.match(output,/&lt;img/);
  assert.doesNotMatch(extract('scheduleVocabItem'),/apiPost|fetch\(|localStorage|sessionStorage|\.print\(|claim|lease/);
});
