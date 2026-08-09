import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = ['index.html', 'v6-staging.html'];
const adapter = fs.readFileSync(new URL('../voca-station-ui.js', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const styles = fs.readFileSync(new URL('../voca-station-ui.css', import.meta.url), 'utf8');
new Function(adapter);

let checks = 0;
function check(name, action) { action(); checks += 1; console.log('PASS:', name); }

check('approved three-tab library UX is present in production and staging', () => {
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /내 학습 단어/);
    assert.match(source, /시험범위/);
    assert.match(source, /전체 단어장/);
    assert.match(source, /voca-station-ui\.js\?v=6\.6\.0/);
    assert.match(source, /voca-station-ui\.css\?v=6\.6\.0/);
  }
});

check('catalog is public-only and section content is on demand', () => {
  assert.match(adapter, /getVocaCatalog/);
  assert.match(adapter, /filter\(book => book\?\.studentVisible !== false\)/);
  assert.match(adapter, /getVocaSection/);
  assert.match(adapter, /state\.sectionRows/);
  assert.doesNotMatch(adapter, /getVocabData/);
});

check('opening a public book defaults to its first section even when a nonnumeric section exists', () => {
  const body = adapter.match(/async function openVocaBookById[\s\S]*?\n  }/)?.[0] || '';
  assert.match(body, /hasAssignedRange\s*\?\s*sections\.find/);
  assert.match(body, /:\s*null\)\s*\|\|\s*sections\[0\]/);
  assert.doesNotMatch(body, /Number\(section\.sectionNo\)\s*===\s*Number\(startDay\)/);
});

check('official learning links require exact stable BookId', () => {
  assert.match(adapter, /state\.bookById\.get\(bookId\)/);
  assert.match(adapter, /openVocaBookById/);
  assert.doesNotMatch(adapter, /includes\([^\n]*displayName|localeCompare\([^\n]*displayName/);
});

check('assigned BookId missing from the public catalog renders a safe connection warning', () => {
  const body = adapter.match(/function connectionNeededCard[\s\S]*?\n  }\n\n  async function renderAssignedBooks[\s\S]*?\n  }/)?.[0] || '';
  assert.match(body, /bookId && !book/);
  assert.match(body, /단어장 연결 필요/);
  assert.match(body, /공식 배정은 정상입니다/);
  assert.match(body, /전체 단어장에서는 공개 자료를 계속 자유롭게 학습/);
  assert.doesNotMatch(body, /state\.bookByLabel|get\([^\n]*groupName/);
  assert.match(styles, /\.voca-book-card\.connection-needed/);
});

check('my-learning cards restrict the browser to the assigned numeric Day range', () => {
  const body = adapter.match(/async function openVocaBookById[\s\S]*?\n  }\n\n  async function openVocaScope/)?.[0] || '';
  assert.match(body, /hasAssignedRange/);
  assert.match(body, /sectionNo >= numericStart && sectionNo <= numericEnd/);
  assert.match(body, /state\.activeScopeSectionIds = new Set\(assignedIds\)/);
  assert.match(body, /현재 배정된 Day를 공개 단어장에서 찾을 수 없습니다/);
});

check('school exam cards only open explicit SCHOOL_EXAM mappings', () => {
  assert.match(adapter, /planType === 'SCHOOL_EXAM'/);
  assert.match(adapter, /고정 단어장 연결 후 학습 가능/);
  assert.match(adapter, /state\.bookById\.get\(bookId\)/);
  assert.match(adapter, /revisionId === text\(book\.revisionId\)/);
  assert.match(adapter, /sectionIds\.every\(id => publishedSections\.has\(id\)\)/);
  assert.match(adapter, /openVocaScope/);
  assert.match(adapter, /연결 갱신 필요/);
});

check('Station practice does not persist attempts or wrong answers', () => {
  assert.match(adapter, /연습 결과와 오답 내용은 저장하지 않습니다/);
  assert.match(adapter, /stationRows/);
  assert.doesNotMatch(adapter, /action:\s*['"]saveVocabResult['"]/);
});

check('favorites use stable Station word IDs', () => {
  assert.match(adapter, /`VOCA:\$\{text\(row\[7\]\)\}`/);
  assert.match(adapter, /getFavoriteState/);
});

check('server-side word search stays within public Station routes', () => {
  assert.match(adapter, /action:\s*'searchVoca'/);
  assert.match(adapter, /revisionId/);
  assert.match(adapter, /sectionId/);
});

check('point practice is unlimited and stateless', () => {
  assert.match(adapter, /getPointPracticeQuestions/);
  assert.match(adapter, /시간·횟수 제한이 없고 결과와 오답은 저장하지 않습니다/);
});

check('actual point test uses a browser idempotency key', () => {
  assert.match(adapter, /POINTSTART_/);
  assert.match(adapter, /getOrCreatePointStartKey/);
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /getPointTestInfo", startKey: getOrCreatePointStartKey\(\)/);
    assert.match(source, /clearPointStartKey\(\)/);
  }
});

check('point policy is Saturday through Friday everywhere', () => {
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /토요일~금요일/);
    assert.doesNotMatch(source, /일요일~토요일/);
  }
});

check('student-facing UX does not expose admin controls or secret configuration', () => {
  const combined = files.map(file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n') + adapter;
  assert.doesNotMatch(combined, /VOCA_STUDENT_GATEWAY_SECRET|VOCA_API_URL|library\.visibility\.update|가져오기 검수 저장/);
});

check('approved responsive styling exists', () => {
  assert.match(styles, /\.voca-library-tabs/);
  assert.match(styles, /\.voca-book-grid/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

assert.equal(checks, 15);
console.log(`student VOCA Station contract: ${checks}/${checks} passed`);
