(function () {
  'use strict';
  const panel = document.getElementById('station-library');
  if (!panel) return;

  const query = document.getElementById('station-library-query');
  const books = document.getElementById('station-library-book');
  const scopes = document.getElementById('station-library-scope');
  const status = document.getElementById('station-library-status');
  const words = document.getElementById('station-library-words');
  let catalog = null;
  let loading = false;
  let generation = 0;
  let selection = 0;
  let ranges = [];

  function resetSelect(select, label) {
    select.replaceChildren(new Option(label, ''));
    select.disabled = true;
  }

  function resetScope() {
    selection++;
    ranges = [];
    resetSelect(scopes, '범위 선택');
    words.replaceChildren();
  }

  function reset() {
    generation++;
    catalog = null;
    loading = false;
    panel.open = false;
    query.value = '';
    status.textContent = '';
    resetSelect(books, '교재 선택');
    resetScope();
  }

  const searchKey = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s()·_-]/g, '');

  function showBooks() {
    if (!catalog) return;
    resetScope();
    resetSelect(books, '교재 선택');
    const terms = query.value.trim().split(/\s+/).filter(Boolean).map(searchKey);
    const matches = catalog.filter(book => terms.every(term => searchKey(book.displayName).includes(term)));
    for (const book of matches) books.add(new Option(book.displayName, book.revisionId));
    books.disabled = matches.length === 0;
    status.textContent = matches.length ? `${matches.length}권 · 교재를 선택하세요.` : '일치하는 교재가 없습니다.';
  }

  panel.addEventListener('toggle', async () => {
    if (!panel.open || catalog || loading || !currentUser?.token) return;
    if (['admin', 'teacher'].includes(String(currentUser.role || '').toLowerCase())) {
      status.textContent = '전체 공개 단어장 검색은 학생 계정에서 사용할 수 있습니다.';
      return;
    }
    const request = generation;
    loading = true;
    status.textContent = '교재 목록을 불러오는 중입니다.';
    try {
      const result = await apiGet({ action: 'getVocaCatalog' });
      if (request !== generation) return;
      if (result?.success !== true || !Array.isArray(result.books)) throw new Error('CATALOG');
      catalog = result.books.filter(book => book.revisionId && book.displayName && Array.isArray(book.sections)
        && !['POINT_SPECIAL', 'SCHOOL_EXAM'].includes(book.categoryCode));
      catalog.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko', { numeric: true }));
      showBooks();
    } catch {
      if (request === generation) status.textContent = '교재 목록을 불러오지 못했습니다. 닫았다가 다시 열어주세요.';
    } finally {
      if (request === generation) loading = false;
    }
  });

  query.addEventListener('input', showBooks);
  books.addEventListener('change', () => {
    resetScope();
    const book = catalog?.find(item => item.revisionId === books.value);
    if (!book) return;
    const grouped = new Map();
    for (const section of book.sections) {
      const label = String(section.label || `Day ${section.sectionNo}`);
      const lesson = /^(\d+과)(?:\s|$)/.exec(label)?.[1];
      const key = lesson ? `lesson:${lesson}` : section.sectionId;
      if (!grouped.has(key)) grouped.set(key, { label: lesson || label, ids: [], count: 0 });
      const range = grouped.get(key);
      range.ids.push(section.sectionId);
      range.count += Number(section.wordCount);
    }
    ranges = Array.from(grouped.values());
    ranges.forEach((range, i) => scopes.add(new Option(`${range.label} · ${range.count}개`, String(i))));
    scopes.disabled = ranges.length === 0;
    status.textContent = '과·Day·범위를 선택하세요.';
  });

  scopes.addEventListener('change', async () => {
    const request = ++selection;
    const revisionId = books.value;
    const scope = scopes.value === '' ? null : ranges[Number(scopes.value)];
    words.replaceChildren();
    if (!scope) return;
    status.textContent = `${scope.label} 단어를 불러오는 중입니다.`;
    try {
      const result = await apiGet({ action: 'getVocaSection', revisionId, sectionIdsJson: JSON.stringify(scope.ids) });
      if (request !== selection) return;
      const ids = new Set(scope.ids);
      if (result?.success !== true || result.revisionId !== revisionId || !Array.isArray(result.words)
          || result.words.length !== scope.count || result.words.some(word => !ids.has(word.sectionId))) throw new Error('SCOPE');
      const list = document.createElement('ol');
      for (const word of result.words) {
        const row = document.createElement('li');
        const term = document.createElement('strong');
        term.textContent = word.word;
        row.append(term, ' — ', String(word.meaning ?? ''));
        list.append(row);
      }
      words.replaceChildren(list);
      status.textContent = `${scope.label} · ${result.words.length}개`;
    } catch {
      if (request === selection) status.textContent = '선택한 범위를 불러오지 못했습니다. 범위를 다시 선택해 주세요.';
    }
  });

  window.StationLibrary = { reset };
  reset();
})();
