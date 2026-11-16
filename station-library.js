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
  const sectionCache = new Map(), searchCache = new Map(), sectionFlights = new Map(), searchFlights = new Map();
  const TIMEOUT = 90000, CACHE_MS = 120000;
  let diagnosticRows = [], diagnosticPanel = null, diagnosticText = null;
  const now = () => window.performance?.now?.() ?? Date.now();
  function startTiming(action) {
    if (!/[?&]vocabSpeed=1(?:&|$)/.test(window.location?.search || '') || !['admin','teacher'].includes(String(currentUser?.role || '').toLowerCase())) return null;
    return {action, start:now(), generation, reads:0};
  }
  async function finishTiming(meter, success, count) {
    if (!meter) return;
    if (window.requestAnimationFrame) await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    if (meter.generation !== generation || meter.current && !meter.current()) return;
    diagnosticRows.push({action:meter.action,elapsedMs:Math.round(now()-meter.start),remoteReads:meter.reads,success,count});
    if (diagnosticRows.length > 20) diagnosticRows.shift();
    if (!diagnosticPanel) {
      diagnosticPanel = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = '운영 속도 점검 결과';
      const note = document.createElement('p'); note.textContent = '로그인한 현재 화면에서 동작 시작부터 표시 완료까지 측정합니다. 계정·검색어·교재명·단어 내용은 기록하지 않습니다.';
      const owner = generation;
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'vocab-btn secondary'; copy.textContent = '속도 결과 복사';
      diagnosticText = document.createElement('pre'); diagnosticText.style.whiteSpace = 'pre-wrap';
      copy.addEventListener('click', async () => {
        if (owner !== generation || !startTiming('copy')) return;
        try { await window.navigator.clipboard.writeText(diagnosticText.textContent); copy.textContent = '복사했습니다'; }
        catch { copy.textContent = '아래 결과 텍스트를 선택해 복사하세요'; }
      });
      diagnosticPanel.append(summary,note,copy,diagnosticText); panel.append(diagnosticPanel);
    }
    diagnosticText.textContent = JSON.stringify({schema:'VOCAB_SPEED_V1',measure:'action-to-next-paint',results:diagnosticRows},null,2);
  }
  function readLibrary(params, meter) {
    if (meter) meter.reads++;
    return apiGet(params, TIMEOUT);
  }
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
    diagnosticRows = [];
    diagnosticPanel?.remove?.(); diagnosticPanel = null; diagnosticText = null;
    catalog = null;
    loading = null;
    sectionCache.clear();
    searchCache.clear();
    sectionFlights.clear();
    searchFlights.clear();
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
    const request = generation, meter = startTiming('catalog');
    words.replaceChildren();
    status.textContent = '교재 목록을 불러오는 중입니다. 단어는 선택한 범위만 불러옵니다.';
    const task = (async () => {
      try {
        const result = await readLibrary({action:'getVocaCatalog'}, meter);
        if (request !== generation) return;
        if (result?.success !== true || !Array.isArray(result.books)) throw Error('CATALOG');
        catalog = result.books.filter(book => book.revisionId && book.displayName && Array.isArray(book.sections)
          && book.studentVisible !== false && String(book.usageScope || 'GENERAL').toUpperCase() !== 'SCHOOL_EXAM'
          && !['POINT_SPECIAL','SCHOOL_EXAM','EXAM_SCOPE'].includes(String(book.categoryCode || '').toUpperCase()));
        catalog.sort((a,b) => a.displayName.localeCompare(b.displayName, 'ko', {numeric:true}));
        for (const book of catalog) searchIndex.set(book.revisionId, bookSearch(book));
        showBooks();
        void finishTiming(meter, true, catalog.length);
      } catch {
        if (request === generation) {
          catalog = null; searchIndex.clear();
          status.textContent = '교재 목록을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';
          const retry = document.createElement('button');
          retry.type = 'button'; retry.className = 'vocab-btn secondary';
          retry.textContent = '교재 목록 다시 불러오기';
          retry.addEventListener('click', () => request === generation ? loadCatalog() : undefined);
          words.replaceChildren(retry);
          void finishTiming(meter, false, 0);
        }
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
  async function fetchScope(revisionId, scope, meter) {
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
          const result = await readLibrary({action:'getVocaSection', revisionId, sectionIdsJson:JSON.stringify(ids)}, meter);
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
  function pagedList(body, makeRow, current) {
    const list = document.createElement('ol');
    const size = 100;
    let offset = 0;
    const controls = body.length > size ? document.createElement('div') : null;
    const previous = controls ? document.createElement('button') : null;
    const next = controls ? document.createElement('button') : null;
    const label = controls ? document.createElement('span') : null;
    function show() {
      if (!current()) return;
      list.start = offset + 1;
      list.replaceChildren(...body.slice(offset, offset + size).map(makeRow));
      list.scrollTop = 0;
      if (controls) {
        previous.disabled = offset === 0;
        next.disabled = offset + size >= body.length;
        label.textContent = `${offset + 1}–${Math.min(offset + size, body.length)} / ${body.length}개`;
      }
    }
    if (controls) {
      controls.className = 'button-row';
      previous.type = next.type = 'button';
      previous.className = next.className = 'vocab-btn secondary';
      previous.textContent = '← 이전 100개'; next.textContent = '다음 100개 →';
      previous.addEventListener('click', () => { if (current() && offset > 0) {offset -= size; show();} });
      next.addEventListener('click', () => { if (current() && offset + size < body.length) {offset += size; show();} });
      controls.append(previous, label, next);
    }
    show();
    return {list, controls};
  }
  function wordList(body, current) {
    return pagedList(body, word => {
      const row = document.createElement('li'), term = document.createElement('strong');
      term.textContent = word.word;
      row.append(term, ' — ', String(word.meaning ?? ''));
      return row;
    }, current);
  }
  async function loadScope() {
    const request = ++selection, epoch = generation, revisionId = books.value, scope = selectedScope();
    const meter = startTiming('scope');
    if (meter) meter.current = () => request === selection && epoch === generation;
    selectedWords = null;
    words.replaceChildren(); clearSearch();
    if (!scope) return;
    status.textContent = `${scope.label} 단어를 불러오는 중입니다.`;
    try {
      const body = await fetchScope(revisionId, scope, meter);
      if (request !== selection || epoch !== generation) return;
      selectedWords = body;
      const page = wordList(body, () => request === selection && epoch === generation);
      words.replaceChildren(page.list);
      const staff = ['admin','teacher'].includes(String(currentUser?.role || '').toLowerCase());
      const startPractice = staff ? window.startPublicVocaPreview : window.startPublicVocaPractice;
      if (typeof startPractice === 'function') {
        const practice = document.createElement('button');
        practice.type = 'button'; practice.className = 'vocab-btn';
        practice.id = 'station-library-practice-button';
        practice.textContent = staff ? '이 범위 학생 연습 미리보기' : '이 범위 카드·리콜·스펠링 연습';
        practice.addEventListener('click', () => {
          if (epoch !== generation || request !== selection) return;
          startPractice({revisionId, bookName:catalog.find(book => book.revisionId === revisionId)?.displayName, label:scope.label, words:body});
        });
        words.append(practice);
      }
      if (page.controls) words.append(page.controls);
      status.textContent = `${scope.label} · ${body.length}개`;
      void finishTiming(meter, true, body.length);
    } catch {
      if (request === selection && epoch === generation) {
        status.textContent = '선택한 범위를 불러오지 못했습니다. 같은 범위를 다시 불러올 수 있습니다.';
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'vocab-btn secondary';
        retry.textContent = '같은 범위 다시 불러오기';
        retry.addEventListener('click', () => request === selection && epoch === generation ? loadScope() : undefined);
        words.replaceChildren(retry);
        void finishTiming(meter, false, 0);
      }
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
    const meter = startTiming('search');
    if (meter) meter.current = current;
    const key = JSON.stringify([queryText.toLowerCase(), revisionId]);
    searchResult.textContent = '단어를 검색하는 중입니다.';
    if (searchButton) searchButton.disabled = true;
    try {
      let result;
      if (mode === 'section') {
        const body = selectedWords || await fetchScope(revisionId, scope, meter);
        const terms = queryText.toLowerCase().split(/\s+/);
        result = {words:body.filter(word => terms.every(term => `${word.word} ${word.meaning}`.normalize('NFKC').toLowerCase().includes(term))), truncated:false};
      } else {
        result = cached(searchCache, key);
        if (!result) {
          let flight = searchFlights.get(key);
          if (!flight) {
            flight = Promise.resolve(readLibrary({action:'searchVoca', query:queryText, revisionId}, meter));
            searchFlights.set(key, flight);
            flight.finally(() => { if (searchFlights.get(key) === flight) searchFlights.delete(key); }).catch(() => {});
          }
          result = await flight;
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
      const page = pagedList(result.words, word => {
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
        return row;
      }, current);
      searchResult.replaceChildren(caption, page.list, ...(page.controls ? [page.controls] : []));
      void finishTiming(meter, true, result.words.length);
    } catch {
      if (current()) {
        searchResult.textContent = '검색하지 못했습니다. 잠시 후 다시 검색해 주세요.';
        void finishTiming(meter, false, 0);
      }
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
