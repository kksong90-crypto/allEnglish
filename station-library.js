(function () {
  'use strict';
  const panel = document.getElementById('station-library');
  if (!panel) return;
  const query = document.getElementById('station-library-query');
  const category = document.getElementById('station-library-category');
  const books = document.getElementById('station-library-book');
  const scopes = document.getElementById('station-library-scope');
  const status = document.getElementById('station-library-status');
  const words = document.getElementById('station-library-words');
  const wordQuery = document.getElementById('station-library-word-query');
  const wordScope = document.getElementById('station-library-word-scope');
  const searchButton = document.getElementById('station-library-word-search');
  const searchResult = document.getElementById('station-library-search-result');
  const legacy = document.getElementById('legacy-vocab-library');
  const sectionCache = new Map(), searchCache = new Map(), sectionFlights = new Map();
  const TIMEOUT = 90000, CACHE_MS = 120000;
  let catalog = null, loading = null, generation = 0, selection = 0, searchSerial = 0, ranges = [], selectedWords = null;

  function resetSelect(select, label) {
    select.replaceChildren(new Option(label, ''));
    select.disabled = true;
  }
  function clearSearch() {
    searchSerial++;
    if (searchResult) searchResult.replaceChildren();
    if (searchButton) searchButton.disabled = false;
  }
  function resetScope() {
    selection++;
    ranges = [];
    selectedWords = null;
    resetSelect(scopes, '범위 선택');
    words.replaceChildren();
    clearSearch();
  }
  function reset() {
    generation++;
    catalog = null;
    loading = null;
    sectionCache.clear();
    searchCache.clear();
    sectionFlights.clear();
    searchIndex.clear();
    if (category) category.value = '';
    if (wordQuery) wordQuery.value = '';
    if (wordScope) wordScope.value = 'all';
    panel.open = false;
    query.value = '';
    status.textContent = '';
    resetSelect(books, '교재 선택');
    resetScope();
  }
  const searchKey = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s()·_-]/g, '');
  const categoryNames = { TEXTBOOK: '교과서', MOCK_EXAM: '모의고사', VOCAB: '시중 단어장', VOCAB_BOOK: '시중 단어장', WORD_BOOK: '시중 단어장', SUPPLEMENT: '부교재', SUPPLEMENTARY: '부교재', EBS: 'EBS 수능교재', OTHER: '기타' };
  const categoryKey = book => ({VOCAB_BOOK:'VOCAB', WORD_BOOK:'VOCAB', SUPPLEMENTARY:'SUPPLEMENT'}[book.categoryCode] || (categoryNames[book.categoryCode] ? book.categoryCode : 'OTHER'));
  const categoryName = book => categoryNames[book.categoryCode] || '기타';
  const searchIndex = new Map();
  const bookSearch = book => searchKey([book.displayName, categoryName(book), book.publisher, book.authorLabel,
    book.schoolLevel, book.gradeNo, book.publicationYear, book.publicationMonth, book.seriesName,
    book.publicationYear && `${book.publicationYear}년`, book.publicationMonth && `${Number(book.publicationMonth)}월`
  ].filter(Boolean).join(' '));
  function cached(map, key) {
    const entry = map.get(key);
    if (!entry || Date.now() - entry.at >= CACHE_MS) { map.delete(key); return null; }
    map.delete(key); map.set(key, entry);
    return entry.value;
  }
  function remember(map, key, value) {
    map.delete(key); map.set(key, {at:Date.now(), value});
    if (map.size > 12) map.delete(map.keys().next().value);
  }
  function showBooks() {
    if (!catalog) return;
    const previous = books.value;
    const terms = query.value.trim().split(/\s+/).filter(Boolean).map(searchKey);
    const matches = catalog.filter(book => (!category?.value || categoryKey(book) === category.value)
      && terms.every(term => searchIndex.get(book.revisionId).includes(term)));
    resetSelect(books, '교재 선택');
    for (const book of matches) books.add(new Option(`[${categoryName(book)}] ${book.displayName}`, book.revisionId));
    books.disabled = matches.length === 0;
    if (previous && matches.some(book => book.revisionId === previous)) books.value = previous;
    else resetScope();
    status.textContent = matches.length ? `${matches.length}권 · 교재를 선택하세요.` : '일치하는 교재가 없습니다.';
  }
  async function loadCatalog() {
    if (catalog || !currentUser?.token) return;
    if (loading) return loading;
    const request = generation;
    status.textContent = '교재 목록을 불러오는 중입니다. 단어는 선택한 범위만 불러옵니다.';
    const task = (async () => {
      try {
        const result = await apiGet({action:'getVocaCatalog'}, TIMEOUT);
        if (request !== generation) return;
        if (result?.success !== true || !Array.isArray(result.books)) throw Error('CATALOG');
        catalog = result.books.filter(book => book.revisionId && book.displayName && Array.isArray(book.sections)
          && book.studentVisible !== false && String(book.usageScope || 'GENERAL').toUpperCase() !== 'SCHOOL_EXAM'
          && !['POINT_SPECIAL','SCHOOL_EXAM','EXAM_SCOPE'].includes(String(book.categoryCode || '').toUpperCase()));
        catalog.sort((a,b) => a.displayName.localeCompare(b.displayName, 'ko', {numeric:true}));
        for (const book of catalog) searchIndex.set(book.revisionId, bookSearch(book));
        showBooks();
      } catch {
        if (request === generation) status.textContent = '교재 목록을 불러오지 못했습니다. 닫았다가 다시 열어주세요.';
      } finally {
        if (loading === task) loading = null;
      }
    })();
    loading = task;
    return task;
  }
  panel.addEventListener('toggle', () => panel.open ? loadCatalog() : undefined);
  query.addEventListener('input', showBooks);
  category?.addEventListener('change', showBooks);
  function selectBook() {
    resetScope();
    const book = catalog?.find(item => item.revisionId === books.value);
    if (!book) return;
    const grouped = new Map();
    for (const section of book.sections) {
      const label = String(section.label || (String(section.sectionType).toUpperCase() === 'DAY' ? `Day ${section.sectionNo}` : `범위 ${section.sectionNo || section.sectionId}`));
      const lesson = /^(\d+과)(?:\s|$)/.exec(label)?.[1];
      const key = lesson ? `lesson:${lesson}` : section.sectionId;
      if (!grouped.has(key)) grouped.set(key, {label:lesson || label, ids:[], count:0});
      const range = grouped.get(key);
      range.ids.push(section.sectionId);
      range.count += Number(section.wordCount);
    }
    ranges = Array.from(grouped.values()).sort((a,b) => a.label.localeCompare(b.label, 'ko', {numeric:true}));
    ranges.forEach((range,i) => scopes.add(new Option(`${range.label} · ${range.count}개`, String(i))));
    scopes.disabled = ranges.length === 0;
    status.textContent = ranges.length ? '과·Day·범위를 선택하세요.' : '이 교재에는 공개된 범위가 없습니다.';
  }
  books.addEventListener('change', selectBook);
  function selectedScope() { return scopes.value === '' ? null : ranges[Number(scopes.value)]; }
  async function fetchScope(revisionId, scope) {
    const key = JSON.stringify([revisionId, scope.ids]);
    const hit = cached(sectionCache, key);
    if (hit) return hit;
    if (sectionFlights.has(key)) return sectionFlights.get(key);
    const request = generation;
    const task = (async () => {
      // The server accepts at most 20 section IDs. Never silently lose the rest of a lesson.
      const batches = [];
      for (let i=0; i<scope.ids.length; i+=20) batches.push(scope.ids.slice(i,i+20));
      const body = [];
      for (let i=0; i<batches.length; i+=2) {
        const replies = await Promise.all(batches.slice(i,i+2).map(async ids => {
          const result = await apiGet({action:'getVocaSection', revisionId, sectionIdsJson:JSON.stringify(ids)}, TIMEOUT);
          if (result?.success !== true || result.revisionId !== revisionId || !Array.isArray(result.words)
              || result.words.some(word => !ids.includes(word.sectionId))) throw Error('SCOPE');
          return result.words;
        }));
        if (request !== generation) throw Error('STALE');
        body.push(...replies.flat());
      }
      const expected = new Map(catalog.find(book => book.revisionId === revisionId).sections.map(section => [section.sectionId, Number(section.wordCount)]));
      const actual = new Map();
      for (const word of body) actual.set(word.sectionId, (actual.get(word.sectionId) || 0) + 1);
      if (scope.ids.some(id => (actual.get(id) || 0) !== expected.get(id))) throw Error('SECTION_COUNT');
      const seen = new Set();
      if (body.length !== scope.count || body.some(word => {
        if (!word.vocabWordId) return false;
        if (seen.has(word.vocabWordId)) return true;
        seen.add(word.vocabWordId); return false;
      })) throw Error('COUNT');
      remember(sectionCache, key, body);
      return body;
    })();
    sectionFlights.set(key, task);
    try { return await task; }
    finally { if (sectionFlights.get(key) === task) sectionFlights.delete(key); }
  }
  function wordList(body) {
    const list = document.createElement('ol');
    for (const word of body) {
      const row = document.createElement('li'), term = document.createElement('strong');
      term.textContent = word.word;
      row.append(term, ' — ', String(word.meaning ?? ''));
      list.append(row);
    }
    return list;
  }
  async function loadScope() {
    const request = ++selection, epoch = generation, revisionId = books.value, scope = selectedScope();
    selectedWords = null;
    words.replaceChildren(); clearSearch();
    if (!scope) return;
    status.textContent = `${scope.label} 단어를 불러오는 중입니다.`;
    try {
      const body = await fetchScope(revisionId, scope);
      if (request !== selection || epoch !== generation) return;
      selectedWords = body;
      words.replaceChildren(wordList(body));
      const staff = ['admin','teacher'].includes(String(currentUser?.role || '').toLowerCase());
      const startPractice = staff ? window.startPublicVocaPreview : window.startPublicVocaPractice;
      if (typeof startPractice === 'function') {
        const practice = document.createElement('button');
        practice.type = 'button'; practice.className = 'vocab-btn';
        practice.textContent = staff ? '이 범위 학생 연습 미리보기' : '이 범위 카드·리콜·스펠링 연습';
        practice.addEventListener('click', () => {
          if (epoch !== generation || request !== selection) return;
          startPractice({revisionId, label:scope.label, words:body});
        });
        words.append(practice);
      }
      status.textContent = `${scope.label} · ${body.length}개`;
    } catch {
      if (request === selection && epoch === generation) status.textContent = '선택한 범위를 불러오지 못했습니다. 범위를 다시 선택해 주세요.';
    }
  }
  scopes.addEventListener('change', loadScope);
  async function searchWords() {
    if (!wordQuery || !searchResult || !catalog) return;
    const queryText = wordQuery.value.normalize('NFKC').trim();
    clearSearch();
    if (!queryText) { searchResult.textContent = '영어 또는 뜻을 입력하세요.'; return; }
    if (queryText.length > 80) { searchResult.textContent = '검색어는 80자 이내로 입력하세요.'; return; }
    const mode = wordScope?.value || 'all', revisionId = mode === 'all' ? '' : books.value;
    const scope = mode === 'section' ? selectedScope() : null;
    if (mode !== 'all' && !revisionId || mode === 'section' && !scope) {
      searchResult.textContent = '교재와 검색할 범위를 먼저 선택하세요.'; return;
    }
    const request = searchSerial, epoch = generation, scopePin = selection, inputPin = wordQuery.value;
    const current = () => request === searchSerial && epoch === generation && scopePin === selection && inputPin === wordQuery.value;
    const key = JSON.stringify([queryText.toLowerCase(), revisionId]);
    searchResult.textContent = '단어를 검색하는 중입니다.';
    if (searchButton) searchButton.disabled = true;
    try {
      let result;
      if (mode === 'section') {
        const body = selectedWords || await fetchScope(revisionId, scope);
        const terms = queryText.toLowerCase().split(/\s+/);
        result = {words:body.filter(word => terms.every(term => `${word.word} ${word.meaning}`.normalize('NFKC').toLowerCase().includes(term))), truncated:false};
      } else {
        result = cached(searchCache, key);
        if (!result) {
          result = await apiGet({action:'searchVoca', query:queryText, revisionId}, TIMEOUT);
          if (!current()) return;
          if (result?.success !== true || !Array.isArray(result.words) || result.words.length > 100
              || result.count != null && result.count !== result.words.length) throw Error('SEARCH');
          // Public catalog is the only allowed result set, also for administrators.
          if (result.words.some(word => !catalog.some(book => book.revisionId === word.revisionId
              && (!revisionId || revisionId === word.revisionId)
              && book.sections.some(section => section.sectionId === word.sectionId)))) throw Error('SEARCH_SCOPE');
          remember(searchCache, key, result);
        }
      }
      if (!current()) return;
      const caption = document.createElement('p');
      caption.textContent = result.words.length ? `검색 결과 ${result.words.length}개${result.truncated ? ' · 최대 100개입니다. 교재나 검색어를 좁혀 주세요.' : ''}` : '검색 결과가 없습니다.';
      const list = document.createElement('ol');
      for (const word of result.words) {
        const row = document.createElement('li'), text = document.createElement('span');
        text.textContent = `${word.word} — ${word.meaning} · ${word.displayName || ''} ${word.sectionLabel || ''}`;
        row.append(text);
        if (mode !== 'section') {
          const open = document.createElement('button');
          open.type = 'button'; open.className = 'small-btn secondary'; open.textContent = '이 범위 열기';
          open.addEventListener('click', () => {
            if (!current()) return;
            query.value = ''; if (category) category.value = ''; showBooks();
            books.value = word.revisionId; selectBook();
            scopes.value = String(ranges.findIndex(range => range.ids.includes(word.sectionId)));
            loadScope();
          });
          row.append(open);
        }
        list.append(row);
      }
      searchResult.replaceChildren(caption, list);
    } catch {
      if (current()) searchResult.textContent = '검색하지 못했습니다. 잠시 후 다시 검색해 주세요.';
    } finally {
      if (request === searchSerial && searchButton) searchButton.disabled = false;
    }
  }
  searchButton?.addEventListener('click', searchWords);
  wordQuery?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchWords(); } });
  wordQuery?.addEventListener('input', clearSearch);
  wordScope?.addEventListener('change', clearSearch);
  document.getElementById('station-library-word-clear')?.addEventListener('click', () => { wordQuery.value = ''; clearSearch(); });
  legacy?.addEventListener('toggle', () => { if (legacy.open) loadVocabBooksOnce(); });
  window.StationLibrary = {reset, open() {panel.open = true; return loadCatalog();}};
  reset();
})();
