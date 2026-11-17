// Scenario review regressions: synthetic users only, no real interview or API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {virtualStudent as originalVirtualStudent} from './helpers/virtual-student.mjs';
// Isolate legacy grading/batch contracts from ordering. Actual random order is
// exercised with the production helper and real browser in the integration suite.
function virtualStudent(options) {
  const v=originalVirtualStudent(options);
  v.context.shuffleAssignedPractice=items=>[...items];
  return v;
}

for (const role of ['student','admin']) {
  test(`${role}: public mock result retries the loaded scope without requesting an assigned plan`, async()=>{
    const v=virtualStudent(); await v.boot(); v.read('currentUser').role=role;
    v.context.startPublicVocaPractice({revisionId:'PUBLIC_REVIEW',label:'3과',words:[
      {vocabWordId:'REVIEW_APPLE',word:'apple',meaning:'사과'},
      {vocabWordId:'REVIEW_BANANA',word:'banana',meaning:'바나나'}
    ]});
    v.context.assignedPracticeChooseMode('mock');
    v.node('practice-answer-0').value='apple';v.node('practice-answer-1').value='banana';
    v.node('practice-result').scrollIntoView=()=>{};
    v.context.gradeVocabTest();
    const result=v.node('practice-result').innerHTML;
    const retry=result.match(/onclick="([^"]+)">이 범위 다시 연습하기/);
    assert.ok(retry,'a completed public mock must offer retry');
    const before=v.requests.filter(p=>p.action==='getAssignedVocaPracticeQuestions').length;
    await v.read(retry[1]);await v.flush();
    assert.equal(v.requests.filter(p=>p.action==='getAssignedVocaPracticeQuestions').length,before,
      'public scope retry must reuse its loaded words, not send PUBLIC_PREVIEW as a real plan');
    assert.equal(v.read('assignedPracticeState.rows.length'),2);
    assert.match(v.node('practice-view').innerHTML,/암기 카드/);
    assert.equal(v.requests.filter(p=>['saveVocabResult','submitPointTest'].includes(p.action)).length,0);
  });
}

function reviewWords(count) {
  return Array.from({length:count},(_,i)=>({vocabWordId:'REVIEW_'+(i+1),word:'word'+(i+1),meaning:'뜻'+(i+1)}));
}
for (const role of ['student','admin']) {
  test(`${role}: a 205-word lesson exposes its final five words and can return to the first batch`, async()=>{
    const v=virtualStudent();await v.boot();v.read('currentUser').role=role;
    v.context.startPublicVocaPractice({revisionId:'LONG_LESSON',label:'205단어 큰 과',words:reviewWords(205)});
    assert.equal(v.read('assignedPracticeState.rows.length'),200);
    v.context.assignedPracticeChangeBatch(1);
    assert.equal(v.read('assignedPracticeState.rows.length'),5);
    assert.equal(v.read('assignedPracticeState.rows[0][2]'),'word201');
    assert.equal(v.read('assignedPracticeState.rows.at(-1)[2]'),'word205');
    assert.match(v.node('practice-view').innerHTML,/201/);
    v.context.assignedPracticeChangeBatch(-1);
    assert.equal(v.read('assignedPracticeState.rows.length'),200);
    assert.equal(v.read('assignedPracticeState.rows[0][2]'),'word1');
    assert.equal(v.requests.filter(p=>p.action==='getAssignedVocaPracticeQuestions').length,0);
  });
}

test('changing a large-lesson batch protects an unfinished spelling answer',async()=>{
  const v=virtualStudent();await v.boot();
  v.context.startPublicVocaPractice({revisionId:'LONG_LESSON',label:'205단어 큰 과',words:reviewWords(205)});
  v.context.assignedPracticeChooseMode('spell');v.node('practice-spell-input').value='wor';
  v.context.confirm=()=>false;
  v.context.assignedPracticeChangeBatch(1);
  assert.equal(v.read('assignedPracticeState.rows[0][2]'),'word1');
  assert.equal(v.node('practice-spell-input').value,'wor');
  v.context.confirm=()=>true;v.context.assignedPracticeChangeBatch(1);
  assert.equal(v.read('assignedPracticeState.rows[0][2]'),'word201');
});

test('a student who forgets one card twice can review only that difficult word',async()=>{
  const v=virtualStudent();await v.boot();
  v.context.startPublicVocaPractice({revisionId:'HARD_WORDS',label:'두 단어',words:reviewWords(2)});
  v.context.assignedPracticeChooseMode('card');
  for(const remembered of [false,true,false]){
    v.context.assignedPracticeReveal();v.context.assignedPracticeRate(remembered);
  }
  assert.equal(v.read('assignedPracticeState.finished'),true);
  assert.equal(v.read('assignedPracticeState.study.needsReview.size'),1);
  assert.match(v.node('practice-view').innerHTML,/어려운 단어/);
  v.context.assignedPracticeReviewDifficult();
  assert.equal(v.read('assignedPracticeState.finished'),false);
  assert.equal(v.read('assignedPracticeState.mode'),'card');
  assert.equal(v.read('assignedPracticeState.rows.length'),2,'keep the original scope available');
  assert.deepEqual(JSON.parse(v.read('JSON.stringify(assignedPracticeState.study.queue)')),[0]);
  v.context.assignedPracticeReveal();v.context.assignedPracticeRate(true);
  assert.equal(v.read('assignedPracticeState.finished'),true);
  assert.equal(v.read('assignedPracticeState.study.needsReview.size'),0);
  assert.equal(v.requests.filter(p=>['saveVocabResult','submitPointTest','getAssignedVocaPracticeQuestions'].includes(p.action)).length,0);
});

test('wrong-word retry and restart preserve the current batch and never borrow errors from another batch',async()=>{
  const v=virtualStudent();await v.boot();
  v.context.startPublicVocaPractice({revisionId:'LONG_REVIEW',label:'205단어',words:reviewWords(205)});
  v.context.assignedPracticeChangeBatch(1);v.context.assignedPracticeChooseMode('mock');
  function gradeWith(firstWrong) {
    for(const [i,row] of v.read('currentVocabWords').entries())v.node('practice-answer-'+i).value=i<firstWrong?'not-the-answer':row[2];
    v.node('practice-result').scrollIntoView=()=>{};v.context.gradeVocabTest();
  }
  gradeWith(2);
  assert.deepEqual(JSON.parse(v.read('JSON.stringify(wrongWords.map(row=>row[2]))')),['word201','word202']);
  v.context.startWrongWordTest();assert.equal(v.read('currentVocabWords.length'),2);
  gradeWith(0);v.context.assignedPracticeRestartRange();
  assert.equal(v.read('assignedPracticeState.sourceRows.length'),205);
  assert.equal(v.read('assignedPracticeState.rows.length'),5);
  assert.equal(v.read('assignedPracticeState.rows[0][2]'),'word201');
  v.context.assignedPracticeChangeBatch(-1);v.context.assignedPracticeChooseMode('mock');
  assert.equal(v.read('currentVocabWords.length'),200);
  assert.equal(v.read('currentVocabWords[0][2]'),'word1');
  assert.equal(v.read('currentVocabWords.some(row=>row[2]==="word201")'),false);
  assert.equal(v.read('wrongWords.length'),0);
  assert.equal(v.requests.filter(p=>['saveVocabResult','submitPointTest','getAssignedVocaPracticeQuestions'].includes(p.action)).length,0);
});

test('difficult words belong to their current batch and changing batches clears old review history',async()=>{
  const v=virtualStudent();await v.boot();
  v.context.startPublicVocaPractice({revisionId:'LONG_REVIEW',label:'205단어',words:reviewWords(205)});
  v.context.assignedPracticeChangeBatch(1);v.context.assignedPracticeChooseMode('card');
  for(const remembered of [false,true,true,true,true,false]){
    v.context.assignedPracticeReveal();v.context.assignedPracticeRate(remembered);
  }
  assert.equal(v.read('assignedPracticeState.finished'),true);
  assert.equal(v.read('assignedPracticeState.study.needsReview.size'),1);
  v.context.assignedPracticeReviewDifficult();
  assert.equal(v.read('assignedPracticeState.rows[assignedPracticeCurrentIndex()][2]'),'word201');
  assert.equal(v.read('assignedPracticeState.study.total'),1);
  v.context.assignedPracticeChangeBatch(-1);
  assert.equal(v.read('assignedPracticeState.sourceRows.length'),205);
  assert.equal(v.read('assignedPracticeState.history.length'),0);
  assert.equal(v.read('assignedPracticeState.study'),null);
  v.context.assignedPracticeChooseMode('card');
  assert.equal(v.read('assignedPracticeState.rows[assignedPracticeCurrentIndex()][2]'),'word1');
  assert.equal(v.read('assignedPracticeState.study.needsReview.size'),0);
  assert.equal(v.read('assignedPracticeState.study.total'),200);
});
