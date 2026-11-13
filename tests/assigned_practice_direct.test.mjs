import test from 'node:test';
import assert from 'node:assert/strict';
import { virtualStudent, makeDay, server } from './helpers/virtual-student.mjs';

// Synthetic student and Student API responses only; no live credentials or writes.
const item = (overrides = {}) => ({
  bookName: '가상 단어장',
  regularText: 'Day 30',
  displayText: 'Day 30',
  testPlanId: 'VIRTUAL_PLAN_30',
  vocaScopeState: 'CONNECTED',
  sourceRanges: [{ bookId: 'B1', sectionId: 'D30' }],
  ...overrides
});
const questionResult = () => ({
  success: true,
  planDate: '2026-10-19',
  questions: [
    { questionNo: 1, prompt: '사과', acceptedAnswers: ['apple'], sourceLabel: 'Day 30', bookId: 'B1', vocabWordId: 'W1' },
    { questionNo: 2, prompt: '바나나', acceptedAnswers: ['banana'], sourceLabel: 'Day 30', bookId: 'B1', vocabWordId: 'W2' }
  ]
});
function mockBackend() {
  const backend = server();
  backend.day = makeDay('Day 30', { vocab: [item()] });
  const original = backend.answer.bind(backend);
  backend.practiceResult = questionResult();
  backend.answer = params => params.action === 'getAssignedVocaPracticeQuestions'
    ? structuredClone(backend.practiceResult)
    : original(params);
  return backend;
}
const calls = (v, action) => v.requests.filter(x => x.action === action);

test('home offers practice only for a server-connected plan; duplicate and missing scope never appear as available', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  assert.match(v.node('home-learning-content').innerHTML, /이 시험범위 연습하기/);
  assert.match(v.node('home-learning-content').innerHTML, /VIRTUAL_PLAN_30/);
  assert.doesNotMatch(v.context.renderHomeVocabTask(item({ vocaScopeState: 'DUPLICATE' })), /연습하기/);
  assert.doesNotMatch(v.context.renderHomeVocabTask(item({ sourceRanges: [] })), /연습하기/);
  assert.doesNotMatch(v.context.renderHomeVocabTask(item({ testPlanId: '' })), /연습하기/);
  v.read('currentUser').role = 'teacher';
  assert.doesNotMatch(v.context.renderHomeVocabTask(item()), /연습하기/);
});

test('practice goes directly to its own view; legacy full vocabulary read is not required', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  const fullBefore = calls(v, 'getVocabData').length;
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  assert.equal(v.read('getActiveTabId()'), 'practice');
  assert.equal(calls(v, 'getAssignedVocaPracticeQuestions').length, 1);
  assert.equal(calls(v, 'getAssignedVocaPracticeQuestions')[0].testPlanId, 'VIRTUAL_PLAN_30');
  assert.equal(calls(v, 'getVocabData').length, fullBefore);
  assert.match(v.node('practice-view').innerHTML, /시험 전 단어 연습/);
  assert.match(v.node('practice-view').innerHTML, /암기 카드/);
  assert.match(v.node('practice-view').innerHTML, /리콜/);
  assert.match(v.node('practice-view').innerHTML, /스펠링/);
  assert.match(v.node('practice-view').innerHTML, /실전 TEST/);
  assert.equal(v.node('practice-answer-0'), null);
  v.context.assignedPracticeChooseMode('mock');
  assert.ok(v.node('practice-answer-0'));
  assert.ok(v.node('practice-answer-1'));
  assert.match(v.node('practice-view').innerHTML, /배정 범위 주관식 모의연습/);
  assert.match(v.node('practice-view').innerHTML, /문항 수·문제 순서는 실제 학원 시험과 다를 수 있습니다/);
  assert.match(v.node('practice-view').innerHTML, /시험 전 개인 연습/);
  assert.equal(v.node('answer-0'), null);
});

test('practice grading and wrong-word retry never save official results or issue points', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('mock');
  v.node('practice-answer-0').value = 'apple';
  v.node('practice-answer-1').value = 'peach';
  v.node('practice-result').scrollIntoView = () => {};
  v.context.gradeVocabTest();
  assert.match(v.node('practice-result').innerHTML, /1개 정답 · 오답 1개/);
  assert.match(v.node('practice-result').innerHTML, /틀린 단어 다시 시험/);
  assert.match(v.node('practice-result').innerHTML, /이 범위 다시 연습하기/);
  assert.equal(calls(v, 'saveVocabResult').length, 0);
  assert.equal(calls(v, 'submitPointTest').length, 0);
  v.context.startWrongWordTest();
  assert.equal(v.read('currentTestMeta.skipSave'), true);
  assert.equal(v.read('currentTestMeta.testPlanId'), 'VIRTUAL_PLAN_30');
  assert.equal(v.read('currentTestMeta.targetId'), 'practice-view');
  assert.ok(v.node('practice-answer-0'));
  assert.equal(v.node('practice-answer-1'), null);
});

test('incomplete question responses fail closed instead of silently omitting a test word', async () => {
  const backend = mockBackend();
  backend.practiceResult.questions[1].acceptedAnswers = [];
  const v = virtualStudent({ backend });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  assert.match(v.node('practice-view').innerHTML, /문항이 일부 누락/);
  assert.equal(v.node('practice-answer-0'), null);
  assert.equal(calls(v, 'saveVocabResult').length, 0);
});

test('late practice response after logout does not render words into another session', async () => {
  const backend = mockBackend();
  backend.hold.add('getAssignedVocaPracticeQuestions');
  const v = virtualStudent({ backend });
  await v.boot();
  const work = v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  await v.flush();
  assert.equal(backend.waiting.length, 1);
  await v.context.logout();
  backend.waiting[0].resolve(questionResult());
  await work;
  assert.equal(v.node('practice-answer-0'), null);
  assert.match(v.node('practice-view').innerHTML, /다시 선택/);
  assert.equal(calls(v, 'saveVocabResult').length, 0);
});

test('leaving practice before a pending response prevents hidden stale test rendering', async () => {
  const backend = mockBackend();
  backend.hold.add('getAssignedVocaPracticeQuestions');
  const v = virtualStudent({ backend });
  await v.boot();
  const work = v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  await v.flush();
  v.context.showTab('home');
  backend.waiting[0].resolve(questionResult());
  await work;
  assert.equal(v.node('practice-answer-0'), null);
  assert.equal(v.read('getActiveTabId()'), 'home');
  assert.equal(calls(v, 'saveVocabResult').length, 0);
});


test('flashcard mode reveals meaning only on request and requeues a forgotten word once', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('card');
  assert.match(v.node('practice-view').innerHTML, /apple/);
  assert.doesNotMatch(v.node('practice-view').innerHTML, /practice-reveal.*사과/);
  v.context.assignedPracticeReveal();
  assert.match(v.node('practice-view').innerHTML, /practice-reveal[^>]*>사과/);
  v.context.assignedPracticeRate(false);
  assert.equal(v.read('assignedPracticeState.study.queue.length'), 2);
  assert.equal(v.read('assignedPracticeState.study.misses'), 1);
  assert.equal(calls(v,'saveVocabResult').length, 0);
});

test('spelling mode checks typed answers and repeats a wrong answer once', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('spell');
  assert.ok(v.node('practice-spell-input'));
  v.node('practice-spell-input').value = 'wrong';
  v.context.assignedPracticeSubmitSpelling();
  assert.match(v.node('practice-view').innerHTML, /틀린 단어는 뒤에서/);
  v.context.assignedPracticeNext();
  assert.equal(v.read('assignedPracticeState.study.queue.length'),2);
  assert.equal(v.read('assignedPracticeState.study.misses'),1);
  assert.equal(calls(v,'saveVocabResult').length,0);
});

test('recall never invents alternatives when a set contains too few distinct words', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('recall');
  assert.match(v.node('practice-view').innerHTML,/객관식 리콜을 안전하게 구성할 수 없습니다/);
  assert.equal(v.read('assignedPracticeState.finished'), true);
});

test('recall presents four distinct terms from the same assigned scope and checks once', async () => {
  const backend = mockBackend();
  backend.practiceResult.questions.push(
    {questionNo:3,prompt:'평가하다',acceptedAnswers:['evaluate'],sourceLabel:'Day 30'},
    {questionNo:4,prompt:'유지하다',acceptedAnswers:['maintain'],sourceLabel:'Day 30'},
    {questionNo:5,prompt:'방해하다',acceptedAnswers:['interrupt'],sourceLabel:'Day 30'}
  );
  const v = virtualStudent({ backend });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('recall');
  const choices = v.read('assignedPracticeState.study.choiceMap.get(0)');
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices).size,4);
  assert.ok(choices.includes('apple'));
  v.context.assignedPracticePick(choices.indexOf('apple'));
  assert.equal(v.read('assignedPracticeState.study.feedback.correct'), true);
  assert.match(v.node('practice-view').innerHTML,/정답입니다/);
  v.context.assignedPracticeNext();
  assert.equal(v.read('assignedPracticeState.study.misses'),0);
  assert.equal(calls(v,'saveVocabResult').length,0);
});

test('switching from an unfinished mock to cards drops the mock result owner', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('mock');
  assert.equal(v.read('testAlreadySaved'), false);
  v.context.assignedPracticeChooseMode('card');
  assert.equal(v.read('currentTestMeta'), null);
  assert.equal(v.read('testAlreadySaved'), true);
  assert.equal(v.read('isActivePracticeDraft()'), true);
  v.context.showTab('home');
  assert.equal(v.read('assignedPracticeState'), null);
  assert.equal(v.read('isActivePracticeDraft()'), false);
});


test('discard confirmation protects a partially typed mock when switching modes', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('mock');
  const first = v.node('practice-answer-0');
  first.value = 'app';
  v.context.confirm = () => false;
  v.context.assignedPracticeChooseMode('card');
  assert.equal(v.read('assignedPracticeState.mode'), 'mock');
  assert.equal(v.node('practice-answer-0').value, 'app');
  assert.equal(v.read('currentTestMeta.skipSave'), true);
  v.context.confirm = () => true;
  v.context.assignedPracticeChooseMode('card');
  assert.equal(v.read('assignedPracticeState.mode'), 'card');
  assert.equal(v.node('practice-answer-0'), null);
  assert.equal(calls(v,'saveVocabResult').length,0);
});

test('home navigation does not silently discard unfinished spelling or mock input', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('spell');
  v.node('practice-spell-input').value = 'ap';
  let prompts = 0;
  v.context.confirm = () => { prompts++; return false; };
  v.context.showTab('home');
  assert.equal(prompts,1);
  assert.equal(v.read('getActiveTabId()'),'practice');
  assert.equal(v.node('practice-spell-input').value,'ap');
  v.context.confirm = () => true;
  v.context.showTab('home');
  assert.equal(v.read('getActiveTabId()'),'home');
  assert.equal(v.read('assignedPracticeState'),null);
  assert.equal(calls(v,'saveVocabResult').length,0);
});

test('changing modes without typed answers requires no confirmation', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('mock');
  let prompts=0;
  v.context.confirm = () => { prompts++; return false; };
  v.context.assignedPracticeChooseMode('card');
  assert.equal(prompts,0);
  assert.equal(v.read('assignedPracticeState.mode'),'card');
  assert.equal(calls(v,'saveVocabResult').length,0);
});

test('an ambiguous Korean meaning prevents unsafe recall while spelling stays available', async () => {
  const backend = mockBackend();
  backend.practiceResult.questions = [
    {questionNo:1,prompt:'유지하다',acceptedAnswers:['maintain'],sourceLabel:'Day 30'},
    {questionNo:2,prompt:'유지하다',acceptedAnswers:['preserve'],sourceLabel:'Day 30'},
    {questionNo:3,prompt:'평가하다',acceptedAnswers:['evaluate'],sourceLabel:'Day 30'},
    {questionNo:4,prompt:'중단하다',acceptedAnswers:['interrupt'],sourceLabel:'Day 30'},
    {questionNo:5,prompt:'확인하다',acceptedAnswers:['confirm'],sourceLabel:'Day 30'}
  ];
  const v=virtualStudent({backend});
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('recall');
  const eligible=v.read('assignedPracticeState.study.queue');
  assert.equal(eligible.includes(0),false);
  assert.equal(eligible.includes(1),false);
  assert.ok(eligible.includes(2));
  v.context.assignedPracticeChooseMode('spell');
  assert.equal(v.read('assignedPracticeState.study.total'),5);
});

test('spelling accepts the server-supplied alternate answer', async()=>{
  const backend=mockBackend();
  backend.practiceResult.questions=[{questionNo:1,prompt:'장점',acceptedAnswers:['advantage','benefit'],sourceLabel:'Day 30'}];
  const v=virtualStudent({backend});
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('spell');
  v.node('practice-spell-input').value='benefit';
  v.context.assignedPracticeSubmitSpelling();
  assert.equal(v.read('assignedPracticeState.study.feedback.correct'),true);
  assert.equal(calls(v,'saveVocabResult').length,0);
});

test('repeatedly missed spelling is not trapped in an endless retry cycle', async()=>{
  const backend=mockBackend();
  backend.practiceResult.questions=[{questionNo:1,prompt:'사과',acceptedAnswers:['apple'],sourceLabel:'Day 30'}];
  const v=virtualStudent({backend});
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
  v.context.assignedPracticeChooseMode('spell');
  for(let i=0;i<2;i++){
    v.node('practice-spell-input').value='wrong';
    v.context.assignedPracticeSubmitSpelling();
    v.context.assignedPracticeNext();
  }
  assert.equal(v.read('assignedPracticeState.finished'),true);
  assert.equal(v.read('assignedPracticeState.study.queue.length'),0);
  assert.equal(v.read('assignedPracticeState.study.needsReview.size'),1);
  assert.match(v.node('practice-view').innerHTML,/아직 어려운 단어 1개/);
  assert.equal(calls(v,'saveVocabResult').length,0);
});
