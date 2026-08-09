import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../voca-station-ui.js', import.meta.url), 'utf8');

function element() {
  return {
    innerHTML: '', value: '', hidden: false, options: [], dataset: {},
    classList: { toggle() {} },
    addEventListener() {},
    scrollIntoView() {}
  };
}

const ids = new Map([
  'vocab-view','vocab-book-select','vocab-day-select','vocab-progress','vocab-search-result',
  'voca-all-grid','voca-mine-grid','voca-exam-grid','voca-browser-panel',
  'voca-library-search','voca-library-category','point-test-view'
].map(id => [id, element()]));

const calls = [];
const context = vm.createContext({
  console,
  Date,
  Map,
  Set,
  JSON,
  Math,
  encodeURIComponent,
  decodeURIComponent,
  currentUser: { id: 'TEST-STUDENT-001', studentId: 'TEST-STUDENT-001', token: 'student-token' },
  myScheduleLastPayload: null,
  vocabData: [],
  currentVocabWords: [],
  testAlreadySaved: false,
  currentPointTest: null,
  favoriteFolders: { 기본: [] },
  currentFavoriteFolder: '기본',
  DEFAULT_FOLDER_NAME: '기본',
  localStorage: { getItem() { return null; }, setItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    getElementById(id) { if (!ids.has(id)) ids.set(id, element()); return ids.get(id); },
    querySelectorAll() { return []; }
  },
  alert() {},
  escapeHtml(value) { return String(value ?? ''); },
  sortWordsByOrder(rows) { return rows; },
  favoriteStorageKey() { return 'favorite'; },
  currentFolderStorageKey() { return 'folder'; },
  saveFavoriteFolders: async () => {},
  clearPointTimer() {},
  showTab() {},
  showVocabList() {},
  saveResultToServer() {},
  apiPost: async payload => {
    calls.push(payload.action);
    if (payload.action === 'getVocaCatalog') return {
      success: true,
      books: [
        { bookId: 'BOOK-PUBLIC', revisionId: 'REV-1', displayName: '수능완성', wordCount: 150, studentVisible: true, sections: [
          { sectionId: 'SEC-1', sectionNo: '1', label: 'Day 1', sortOrder: 1, wordCount: 50 },
          { sectionId: 'SEC-2', sectionNo: '2', label: 'Day 2', sortOrder: 2, wordCount: 50 },
          { sectionId: 'SEC-3', sectionNo: '3', label: 'Day 3', sortOrder: 3, wordCount: 50 }
        ] },
        { bookId: 'BOOK-PRIVATE', revisionId: 'REV-2', displayName: '교사용 검수본', wordCount: 50, studentVisible: false, sections: [{ sectionId: 'SEC-2', sectionNo: '1', label: 'Day 1', sortOrder: 1, wordCount: 50 }] }
      ]
    };
    if (payload.action === 'getVocaSection') return {
      success: true,
      revisionId: payload.revisionId,
      count: 1,
      words: [{ vocabWordId: 'WORD-1', sectionId: 'SEC-1', word: 'default', meaning: '기본값', sortOrder: 1, allowedAnswers: [] }]
    };
    if (payload.action === 'getPointPracticeQuestions') return { success: true, questionCount: 1, questions: [{ meaning: '기본값', acceptedAnswers: ['default'] }] };
    throw new Error(`unexpected ${payload.action}`);
  },
  apiGet: async payload => {
    calls.push(payload.action);
    if (payload.action === 'getMyLearningSchedule') return {
      success: true,
      days: [{ date: '2099-08-10', vocab: [
        { planType: 'REGULAR', vocabBookId: 'BOOK-PUBLIC', regularStartDay: 1, regularEndDay: 2, regularText: 'Day 1~2' },
        { planType: 'REGULAR', vocabBookId: 'BOOK-MISSING', groupName: '가상중3-해커스보카 수능필수', regularStartDay: 48, regularEndDay: 49, regularText: 'Day 48~49' },
        { testPlanId: 'TP-SCHOOL-1', planType: 'SCHOOL_EXAM', vocabBookId: 'BOOK-PUBLIC', revisionId: 'REV-1', sectionIds: ['SEC-1'], schoolVocabText: '학교시험 단어' },
        { testPlanId: 'TP-SCHOOL-STALE', planType: 'SCHOOL_EXAM', vocabBookId: 'BOOK-PUBLIC', revisionId: 'REV-OLD', sectionIds: ['SEC-OLD'], schoolVocabText: '갱신 대상 범위' },
        { planType: 'REGULAR', vocabBookId: 'BOOK-PUBLIC', schoolVocabText: '연결 전 표시문구' }
      ] }]
    };
    if (payload.action === 'getFavoriteState') return { success: true, folders: { 기본: [] }, items: [] };
    throw new Error(`unexpected ${payload.action}`);
  }
});

vm.runInContext(source, context);
await context.loadVocabBooks();

assert.deepEqual(calls.slice(0, 2), ['getVocaCatalog', 'getMyLearningSchedule']);
assert.match(ids.get('voca-all-grid').innerHTML, /수능완성/);
assert.doesNotMatch(ids.get('voca-all-grid').innerHTML, /교사용 검수본/);
assert.match(ids.get('voca-mine-grid').innerHTML, /현재 배정/);
assert.match(ids.get('voca-mine-grid').innerHTML, /단어장 연결 필요/);
assert.match(ids.get('voca-mine-grid').innerHTML, /해커스보카 수능필수/);
assert.match(ids.get('voca-mine-grid').innerHTML, /Day 48~49/);
assert.match(ids.get('voca-mine-grid').innerHTML, /전체 단어장에서는 공개 자료를 계속 자유롭게 학습/);
assert.doesNotMatch(ids.get('voca-mine-grid').innerHTML, /BOOK-MISSING/);
assert.match(ids.get('voca-exam-grid').innerHTML, /학교시험 단어/);
assert.match(ids.get('voca-exam-grid').innerHTML, /연결 갱신 필요/);
assert.match(ids.get('voca-exam-grid').innerHTML, /고정 단어장 연결 후 학습 가능/);

await context.openVocaBookById(encodeURIComponent('BOOK-PUBLIC'), 1, 2);
assert.match(ids.get('vocab-day-select').innerHTML, /Day 1/);
assert.match(ids.get('vocab-day-select').innerHTML, /Day 2/);
assert.doesNotMatch(ids.get('vocab-day-select').innerHTML, /Day 3/);
assert.equal(calls.includes('getVocaSection'), true);

await context.startPointPractice();
assert.equal(calls.at(-1), 'getPointPracticeQuestions');
assert.match(ids.get('point-test-view').innerHTML, /시간·횟수 제한이 없고 결과와 오답은 저장하지 않습니다/);

console.log(JSON.stringify({ ok: true, calls, publicCatalogOnly: true }, null, 2));
