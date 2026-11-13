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
  v.context.currentUser.role = 'teacher';
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
  assert.ok(v.node('practice-answer-0'));
  assert.ok(v.node('practice-answer-1'));
  assert.match(v.node('practice-view').innerHTML, /오늘 단어시험 사전 연습/);
  assert.match(v.node('practice-view').innerHTML, /시험 전 개인 연습/);
  assert.equal(v.node('answer-0'), null);
});

test('practice grading and wrong-word retry never save official results or issue points', async () => {
  const v = virtualStudent({ backend: mockBackend() });
  await v.boot();
  await v.context.startAssignedVocaPractice('VIRTUAL_PLAN_30');
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
