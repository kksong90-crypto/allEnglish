// Scenario-based administrator/teacher review. Synthetic users/API only, not user interviews or production UAT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { virtualStudent as originalVirtualStudent } from './helpers/virtual-student.mjs';
// Isolate legacy grading/batch contracts from ordering. Actual random order is
// exercised with the production helper and real browser in the integration suite.
function virtualStudent(options) {
  const v=originalVirtualStudent(options);
  v.context.shuffleAssignedPractice=items=>[...items];
  return v;
}
const words = [
  ['apple', '사과'], ['banana', '바나나'], ['orange', '오렌지'], ['pear', '배']
].map(([word, meaning], i) => ({vocabWordId:'ADMIN_REVIEW_'+i, bookId:'REVIEW_BOOK', word, meaning, allowedAnswers:[word]}));
async function preview(role='admin') {
  const v=virtualStudent();await v.boot();v.read('currentUser').role=role;
  v.context.startPublicVocaPreview({revisionId:'REVIEW_REV',bookName:'교사 검토용 교재',label:'Day 1',words});
  return v;
}
const writes = v => v.requests.filter(request => ['saveVocabResult','submitPointTest','saveFavoriteState'].includes(request.action));
function gradeMock(v) {
  v.context.assignedPracticeChooseMode('mock');
  v.node('practice-answer-0').value='apple';
  v.node('practice-result').scrollIntoView=()=>{};
  v.context.gradeVocabTest();
}
for (const role of ['admin','teacher']) {
  test(`${role} can review cards, spelling and mock without official writes or student-assigned requests`,async()=>{
    const v=await preview(role);const before=v.requests.length;
    assert.match(v.node('practice-view').innerHTML,/학생 연습 미리보기/);
    v.context.assignedPracticeChooseMode('card');v.context.assignedPracticeReveal();v.context.assignedPracticeHide();
    assert.equal(v.read('assignedPracticeState.study.revealed'),false);
    v.context.assignedPracticeChooseMode('spell');v.node('practice-spell-input').value='apple';v.context.assignedPracticeSubmitSpelling();
    assert.equal(v.read('assignedPracticeState.study.feedback.correct'),true);
    gradeMock(v);assert.equal(v.requests.length,before);assert.equal(writes(v).length,0);
  });
  test(`${role} result repeat button locally restores the same verified scope`,async()=>{
    const v=await preview(role);gradeMock(v);
    const result=v.node('practice-result').innerHTML;
    const button=result.match(/onclick="([^"]+)"[^>]*>이 범위 다시 연습하기/);
    assert.ok(button,'graded preview exposes an actionable scope retry');
    const before=v.requests.length;
    await v.read(button[1]);await v.flush();
    assert.equal(v.requests.length,before,'public staff preview retry must not call assigned-plan API');
    assert.equal(v.read('assignedPracticeState.mode'),'');
    assert.equal(v.read('assignedPracticeState.rows.length'),4);
    assert.match(v.node('practice-view').innerHTML,/학생 연습 미리보기/);
    assert.equal(writes(v).length,0);
  });
}

test('administrator preview preserves book identity when different books share Day 1',async()=>{
  const v=await preview();
  assert.match(v.node('practice-view').innerHTML,/교사 검토용 교재/);
  assert.match(v.node('practice-view').innerHTML,/Day 1/);
});

test('administrator wrong-word retry keeps preview identity and mode navigation',async()=>{
  const v=await preview();gradeMock(v);v.context.startWrongWordTest();
  assert.match(v.node('practice-view').innerHTML,/학생 연습 미리보기/);
  assert.match(v.node('practice-view').innerHTML,/assignedPracticeBackToMenu/);
  assert.match(v.node('practice-view').innerHTML,/암기 카드/);
  assert.equal(v.read('currentTestMeta.skipSave'),true);
  assert.equal(writes(v).length,0);
});

test('teacher can inspect words after 200 and repeat the active batch without new server requests',async()=>{
  const v=virtualStudent();await v.boot();v.read('currentUser').role='teacher';
  const large=Array.from({length:201},(_,i)=>({vocabWordId:'LARGE_'+i,word:'word'+i,meaning:'뜻'+i}));
  v.context.startPublicVocaPreview({revisionId:'LARGE',bookName:'긴 교재',label:'3과',words:large});
  const before=v.requests.length;
  assert.equal(v.read('assignedPracticeState.sourceRows.length'),201);
  assert.equal(v.read('assignedPracticeState.rows.length'),200);
  v.context.assignedPracticeChangeBatch(1);
  assert.equal(v.read('assignedPracticeState.batchStart'),200);
  assert.equal(v.read('assignedPracticeState.rows[0][2]'),'word200');
  assert.match(v.node('practice-view').innerHTML,/201–201번째/);
  v.context.assignedPracticeChooseMode('mock');
  v.node('practice-answer-0').value='word200';v.node('practice-result').scrollIntoView=()=>{};v.context.gradeVocabTest();
  v.context.assignedPracticeRestartRange();
  assert.equal(v.read('assignedPracticeState.batchStart'),200);
  assert.equal(v.read('assignedPracticeState.rows.length'),1);
  assert.match(v.node('practice-view').innerHTML,/긴 교재/);
  assert.equal(v.requests.length,before);assert.equal(writes(v).length,0);
});

test('administrator can recheck only a repeatedly difficult card with no official writes',async()=>{
  const v=await preview();const before=v.requests.length;
  v.context.assignedPracticeChooseMode('card');
  for(let step=0;step<8 && !v.read('assignedPracticeState.finished');step++){
    const index=v.read('assignedPracticeCurrentIndex()');
    v.context.assignedPracticeReveal();v.context.assignedPracticeRate(index!==0);
  }
  assert.equal(v.read('assignedPracticeState.finished'),true);
  assert.equal(v.read('assignedPracticeState.study.needsReview.size'),1);
  assert.match(v.node('practice-view').innerHTML,/어려운 단어만 다시 연습/);
  v.context.assignedPracticeReviewDifficult();
  assert.equal(v.read('assignedPracticeState.study.total'),1);
  assert.equal(v.read('assignedPracticeCurrentIndex()'),0);
  assert.match(v.node('practice-view').innerHTML,/교사 검토용 교재/);
  v.context.assignedPracticeReveal();v.context.assignedPracticeRate(true);
  assert.equal(v.read('assignedPracticeState.study.needsReview.size'),0);
  assert.equal(v.requests.length,before);assert.equal(writes(v).length,0);
});
