(function () {
  'use strict';
  const panel = document.getElementById('station-library');
  if (!panel) return;
  const query = document.getElementById('station-library-query');
  const category = document.getElementById('station-library-category');
  const metadataFilters = [
    ['schoolLevel', document.getElementById('station-library-school-level'), 'school-level'],
    ['gradeNo', document.getElementById('station-library-grade'), 'grade'],
    ['publicationYear', document.getElementById('station-library-year'), 'year'],
    ['publicationMonth', document.getElementById('station-library-month'), 'month'],
    ['publisher', document.getElementById('station-library-publisher'), 'publisher']
  ];
  const rangeList = document.getElementById('station-library-range-list');
  const basketSummary = document.getElementById('station-library-selection-summary');
  const basketItems = document.getElementById('station-library-selection-items');
  const selectAllButton = document.getElementById('station-library-select-all');
  const clearBasketButton = document.getElementById('station-library-clear-selection');
  const combinedButton = document.getElementById('station-library-combined-practice');
  const combinedStatus = document.getElementById('station-library-selection-status');
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
  let pendingCatalogSearch = 0;
  let catalog = null, loading = null, generation = 0, selection = 0, searchSerial = 0, ranges = [], selectedWords = null;
  const basket = new Map();
  let basketVersion = 0, combinedSerial = 0;
  const MAX_SELECTED_RANGES = 150, MAX_SELECTED_WORDS = 5000;

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
    if (rangeList) rangeList.replaceChildren();
    if (selectAllButton) selectAllButton.disabled = true;
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
    basket.clear();
    basketVersion++;
    combinedSerial++;
    if (combinedStatus) combinedStatus.textContent = '';
    if (category) category.value = '';
    for (const [, select] of metadataFilters) if (select) resetSelect(select, '전체');
    if (wordQuery) wordQuery.value = '';
    if (wordScope) wordScope.value = 'all';
    panel.open = false;
    query.value = '';
    status.textContent = '';
    resetSelect(books, '교재 선택');
    resetScope();
    renderBasket();
  }
  const searchKey = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s()·_-]/g, '');
  // Product taxonomy is stable in storage; the student-facing choices are
  // grouped without pretending an EBS workbook is an academy-authored word list.
  const categoryNames = {TEXTBOOK:'학교 내신·교과서', MOCK_EXAM:'모의고사·수능', VOCAB:'시판 단어장',
    CUSTOM:'학원 자체자료', SUPPORT:'보충·EBS 교재', OTHER:'분류 미확인·기타',
    SUPPLEMENT:'부교재', EBS:'EBS 교재'};
  const categoryKey = book => {
    const code = String(book.categoryCode || '').trim().toUpperCase();
    return ({VOCAB_BOOK:'VOCAB',WORD_BOOK:'VOCAB',SUPPLEMENTARY:'SUPPORT',
      SUPPLEMENT:'SUPPORT',EBS:'SUPPORT'}[code]
      || (categoryNames[code] ? code : 'OTHER'));
  };
  const categoryName = book => {
    const code = String(book.categoryCode || '').trim().toUpperCase();
    return code === 'EBS' ? 'EBS 교재'
      : ['SUPPLEMENT','SUPPLEMENTARY'].includes(code) ? '부교재'
      : categoryNames[categoryKey(book)];
  };
  const FACETS = {
    TEXTBOOK:['schoolLevel','gradeNo','publisher'],
    MOCK_EXAM:['gradeNo','publicationYear','publicationMonth'],
    VOCAB:['publisher'],
    CUSTOM:['schoolLevel','gradeNo','publisher'],
    SUPPORT:['schoolLevel','gradeNo','publisher'],
    OTHER:['schoolLevel','gradeNo','publisher']
  };
  const searchIndex = new Map();
  const bookSearch = book => {
    // The visible category is "모의고사·수능", but a search for "수능" must
    // NOT return every ordinary mock exam. Use the actual title for subtype.
    const categorySearch = categoryKey(book) === 'MOCK_EXAM'
      ? (/대학수학능력시험|수능/u.test(String(book.displayName || '')) ? '수능' : '모의고사')
      : categoryName(book);
    return searchKey([book.displayName, categorySearch, book.publisher, canonicalPublisher(book.publisher), book.authorLabel,
      book.schoolLevel, book.gradeNo, book.publicationYear, book.publicationMonth, book.seriesName,
      book.publicationYear && `${book.publicationYear}년`, book.publicationMonth && `${Number(book.publicationMonth)}월`
    ].filter(Boolean).join(' '));
  };
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
  const metadataValue = value => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)
    ? String(value).trim() : '';
  // Source metadata uses mixed legacy codes: HIGH, 고, 고등학교, MIDDLE, 중, ...
  // Collapse *recognized* aliases for filtering without modifying source rows.
  const canonicalSchoolLevel = raw => {
    const original = metadataValue(raw).normalize('NFKC');
    const key = original.toUpperCase().replace(/[\s_-]/g,'');
    if (['HIGH','HIGHSCHOOL','고','고교','고등','고등학교'].includes(key)) return 'HIGH';
    if (['MIDDLE','MIDDLESCHOOL','중','중등','중학교'].includes(key)) return 'MIDDLE';
    if (['ELEMENTARY','ELEMENTARYSCHOOL','PRIMARY','PRIMARYSCHOOL','초','초등','초등학교'].includes(key)) return 'ELEMENTARY';
    return original; // Unknown values are not guessed or suppressed.
  };
  // Map only verified equivalents; labels such as 천재 and 천재교과서 are
  // distinct publisher metadata and must NOT be merged by a substring match.
  const canonicalPublisher = raw => {
    const original = metadataValue(raw).normalize('NFKC');
    const key = original.toUpperCase().replace(/[\s_.-]/g,'');
    if (['NE능률','능률'].includes(key)) return 'NE능률';
    if (['해커스','해커스어학연구소'].includes(key)) return '해커스';
    return original;
  };
  function facetValue(book, field) {
    const value = metadataValue(book[field]);
    if (field === 'publisher') return canonicalPublisher(value);
    if (field === 'schoolLevel') return canonicalSchoolLevel(value);
    if (field === 'publicationYear' && !value && categoryKey(book) === 'MOCK_EXAM') {
      // The *title* can state a CSAT reference year even when the historical
      // publication_year field is blank. This is a display-only year, not a
      // claim about the calendar date when the exam was administered.
      const title = String(book.displayName || '').normalize('NFKC');
      const namedYear = /^\s*((?:19|20)\d{2})년\s*대학수학능력시험(?:\s|$)/u.exec(title);
      if (namedYear) return namedYear[1];
    }
    if (field === 'gradeNo') {
      const compact = value.normalize('NFKC').replace(/\s/g,'');
      const normalizedGrade = /^(?:고|중|초)?([1-6])(?:학년)?$/.exec(compact);
      if (normalizedGrade) return String(Number(normalizedGrade[1]));
      // A CSAT is an explicit exam type, not an inferred "grade 3".
      // Do not guess its calendar year from the title's school year.
      if (!compact && categoryKey(book) === 'MOCK_EXAM' && /대학수학능력시험/u.test(String(book.displayName || ''))) return 'CSAT';
      return compact;
    }
    if (['publicationYear','publicationMonth'].includes(field) && /^\d+$/.test(value)) return String(Number(value));
    return value;
  }
  const MISSING_FACET = '__METADATA_NOT_REGISTERED__';
  function facetMatches(book, field, chosen) {
    return !chosen || (chosen === MISSING_FACET ? !facetValue(book,field) : facetValue(book,field) === chosen);
  }
  function facetLabel(field, value) {
    return value === MISSING_FACET ? '정보 미등록'
      : field === 'publicationYear' ? value + '년'
      : field === 'publicationMonth' ? value + '월'
      : field === 'gradeNo' ? (value === 'CSAT' ? '수능' : (category?.value === 'MOCK_EXAM' ? '고' + value : value + '학년'))
      : field === 'schoolLevel' ? ({HIGH:'고등학교',MIDDLE:'중학교',ELEMENTARY:'초등학교'}[value] || '확인 필요: ' + value)
      : value;
  }
  function populateMetadataFilters() {
    const active = category?.value ? (FACETS[category.value] || []) : ['schoolLevel','gradeNo','publisher'];
    const gradeHeading = document.getElementById('station-library-grade-label');
    if (gradeHeading) gradeHeading.textContent = category?.value === 'MOCK_EXAM' ? '학년·시험' : '학년';
    const yearHeading = document.getElementById('station-library-year-label');
    if (yearHeading) yearHeading.textContent = category?.value === 'MOCK_EXAM'
      && metadataFilters.find(([field]) => field === 'gradeNo')?.[1]?.value === 'CSAT'
      ? '자료명 표기 연도' : '연도';
    const terms = query.value.trim().split(/\s+/).filter(Boolean).map(searchKey);
    const base = catalog.filter(book => (!category?.value || categoryKey(book) === category.value)
      && terms.every(term => (searchIndex.get(book.revisionId) || bookSearch(book)).includes(term)));
    // Real hierarchy: upstream facets restrict downstream choices, never the reverse.
    // Changing a mock-exam year can therefore reset an incompatible month instead of
    // trapping the student in the previous month's option list.
    for (const [field, select, id] of metadataFilters) {
      if (!select) continue; // Older cached HTML is still supported.
      const visible = active.includes(field);
      const parent = document.getElementById('station-library-' + id + '-field');
      if (parent) parent.hidden = !visible;
      if (!visible) resetSelect(select,'전체');
    }
    for (let index=0; index<metadataFilters.length; index++) {
      const [field, select] = metadataFilters[index];
      if (!select || !active.includes(field)) continue;
      const previous = select.value, upstream = metadataFilters.slice(0,index);
      const available = base.filter(book => upstream.every(([parent,input]) =>
        facetMatches(book,parent,input?.value)));
      const values = [...new Set(available.map(book => facetValue(book,field)).filter(Boolean))]
        .sort((a,b) => a.localeCompare(b,'ko',{numeric:true}));
      // A missing metadata option appears only when valid values ALSO exist.
      // This keeps unclassified official exams discoverable without inventing
      // a school grade or guessing the actual calendar year of a CSAT title.
      if (values.length && available.some(book => !facetValue(book,field))) values.push(MISSING_FACET);
      resetSelect(select,'전체');
      for (const value of values) select.add(new Option(facetLabel(field,value),value));
      select.disabled = values.length === 0;
      if (values.includes(previous)) select.value = previous;
    }
  }
  function refreshCategoryAvailability() {
    if (!category?.querySelectorAll || !catalog) return;
    for (const option of category.querySelectorAll('option')) {
      if (!option.value) continue;
      const permitted = catalog.some(book => categoryKey(book) === option.value);
      const base = option.getAttribute('data-source-label') || option.textContent;
      option.setAttribute('data-source-label',base);
      option.disabled = !permitted;
      option.textContent = permitted ? base : base + ' (공개 자료 없음)';
      if (!permitted && category.value === option.value) category.value = '';
    }
  }
  function showBooks() {
    if (!catalog) return;
    populateMetadataFilters();
    const previous = books.value;
    const terms = query.value.trim().split(/\s+/).filter(Boolean).map(searchKey);
    const matches = catalog.filter(book => (!category?.value || categoryKey(book) === category.value)
      && metadataFilters.every(([field,select]) => facetMatches(book,field,select?.value))
      && terms.every(term => searchIndex.get(book.revisionId).includes(term)));
    resetSelect(books, '교재 선택');
    for (const book of matches) {
      // The category is already stated in the parent selector. Only preserve
      // subtype labels when mixing EBS and commercial supplementary books.
      const prefix = !category?.value || category.value === 'SUPPORT' ? `[${categoryName(book)}] ` : '';
      books.add(new Option(prefix + book.displayName, book.revisionId));
    }
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
        refreshCategoryAvailability();
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
  category?.addEventListener('change', () => {
    // Preserve the selection basket, but reset incompatible category-specific facets.
    for (const [, select] of metadataFilters) if (select) select.value = '';
    showBooks();
  });
  for (const [, select] of metadataFilters) select?.addEventListener('change', showBooks);
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
    renderRangeCheckboxes();
  }
  books.addEventListener('change', selectBook);

  // The study basket is separate from the single-scope preview and official test plans.
  const rangeKey = (revisionId, range) => JSON.stringify([revisionId, ...range.ids]);
  function selectedEstimate() {
    return Array.from(basket.values()).reduce((total, item) => total + item.count, 0);
  }
  function invalidateCombined() {
    basketVersion++;
    combinedSerial++;
    if (combinedStatus) combinedStatus.textContent = '';
  }
  function renderRangeCheckboxes() {
    if (!rangeList) return; // Old cached app shell.
    const revisionId = books.value;
    const items = ranges.map(range => {
      const label = document.createElement('label');
      label.className = 'vocab-library-range';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = basket.has(rangeKey(revisionId,range));
      const caption = document.createElement('span');
      caption.textContent = range.label + ' · ' + range.count + '개';
      checkbox.addEventListener('change', () => toggleRange(revisionId,range,!!checkbox.checked));
      label.append(checkbox,caption);
      return label;
    });
    rangeList.replaceChildren(...items);
    if (selectAllButton) {
      selectAllButton.disabled = !items.length;
      selectAllButton.textContent = items.length && ranges.every(range => basket.has(rangeKey(revisionId,range)))
        ? '현재 교재 전체 해제' : '현재 교재 전체 담기';
    }
  }
  function renderBasket() {
    const count = basket.size, estimate = selectedEstimate();
    if (basketSummary) basketSummary.textContent = '선택한 범위 ' + count + '개 · 예상 단어 ' + estimate + '개 (중복 통합 전)';
    if (clearBasketButton) clearBasketButton.disabled = count === 0;
    if (combinedButton) combinedButton.disabled = count === 0 || estimate > MAX_SELECTED_WORDS;
    if (basketItems) {
      const chips = Array.from(basket, ([key,item]) => {
        const chip = document.createElement('span');
        chip.className = 'vocab-library-chip';
        const text = document.createElement('span');
        text.textContent = item.bookName + ' / ' + item.label;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = '이 범위 제거';
        remove.setAttribute?.('aria-label','선택 제거: ' + item.bookName + ' ' + item.label);
        remove.addEventListener('click', () => {
          basket.delete(key);
          invalidateCombined(); renderBasket(); renderRangeCheckboxes();
        });
        chip.append(text,remove);
        return chip;
      });
      basketItems.replaceChildren(...chips);
    }
    if (selectAllButton) {
      selectAllButton.textContent = ranges.length && ranges.every(range => basket.has(rangeKey(books.value,range)))
        ? '현재 교재 전체 해제' : '현재 교재 전체 담기';
    }
  }
  function toggleRange(revisionId,range,checked) {
    if (!catalog?.some(book => book.revisionId === revisionId && book.sections.length
      && range.ids.every(id => book.sections.some(section => section.sectionId === id)))) return;
    const key = rangeKey(revisionId,range);
    if (checked) {
      if (!basket.has(key) && (basket.size >= MAX_SELECTED_RANGES
        || selectedEstimate() + range.count > MAX_SELECTED_WORDS)) {
        if (combinedStatus) combinedStatus.textContent = '한 번에 최대 ' + MAX_SELECTED_RANGES + '개 범위·' + MAX_SELECTED_WORDS + '개 단어를 선택할 수 있습니다.';
        renderRangeCheckboxes(); return;
      }
      basket.set(key,{revisionId,ids:range.ids.slice(),label:range.label,count:range.count,
        bookName:catalog.find(book => book.revisionId === revisionId).displayName});
    } else basket.delete(key);
    invalidateCombined(); renderBasket(); renderRangeCheckboxes();
  }
  selectAllButton?.addEventListener('click', () => {
    const revisionId = books.value;
    if (!revisionId || !ranges.length) return;
    const allSelected = ranges.every(range => basket.has(rangeKey(revisionId,range)));
    const additions = ranges.filter(range => !basket.has(rangeKey(revisionId,range)));
    if (!allSelected && (basket.size + additions.length > MAX_SELECTED_RANGES
      || selectedEstimate() + additions.reduce((total,range) => total + range.count,0) > MAX_SELECTED_WORDS)) {
      if (combinedStatus) combinedStatus.textContent = '선택 가능한 최대 범위 또는 단어 수를 초과합니다. 일부 범위를 선택하세요.';
      return;
    }
    for (const range of ranges) {
      const key = rangeKey(revisionId,range);
      if (allSelected) basket.delete(key);
      else if (!basket.has(key)) basket.set(key,{revisionId,ids:range.ids.slice(),label:range.label,count:range.count,
        bookName:catalog.find(book => book.revisionId === revisionId).displayName});
    }
    invalidateCombined(); renderBasket(); renderRangeCheckboxes();
  });
  clearBasketButton?.addEventListener('click', () => {
    if (!basket.size) return;
    basket.clear(); invalidateCombined(); renderBasket(); renderRangeCheckboxes();
  });
  function selectedScope() { return scopes.value === '' ? null : ranges[Number(scopes.value)]; }
  async function fetchScope(revisionId, scope, meter) {
    const key = JSON.stringify([revisionId, scope.ids]);
    const hit = cached(sectionCache, key);
    if (hit) return hit;
    if (sectionFlights.has(key)) return sectionFlights.get(key);
    const request = generation;
    const task = (async () => {
      // The server accepts at most 20 section IDs. Never silently lose the rest of a lesson.
      const revision = catalog?.find(book => book.revisionId === revisionId);
      if (!revision || scope.ids.length !== new Set(scope.ids).size) throw Error('SCOPE_IDS');
      const expected = new Map(revision.sections.map(section => [section.sectionId, Number(section.wordCount)]));
      // The published API caps each response at 500 words AND 20 section IDs.
      // Splitting by IDs alone would silently truncate a 20 x 30-word request.
      const batches = [];
      let batch = [], batchCount = 0;
      for (const id of scope.ids) {
        const count = expected.get(id);
        if (!Number.isInteger(count) || count < 0 || count > 500) throw Error('SECTION_TOO_LARGE');
        if (batch.length && (batch.length >= 20 || batchCount + count > 500)) {
          batches.push(batch); batch = []; batchCount = 0;
        }
        batch.push(id); batchCount += count;
      }
      if (batch.length) batches.push(batch);
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

  // Build a complete, verified combined range before opening the existing isolated
  // card/recall/spelling practice. Never send partial results or official writes.
  async function startCombinedPractice() {
    if (!catalog || !currentUser?.token || !basket.size) return;
    const entries = Array.from(basket.values()).map(item => ({...item,ids:item.ids.slice()}));
    const epoch = generation, version = basketVersion, request = ++combinedSerial;
    const current = () => epoch === generation && version === basketVersion && request === combinedSerial && !!currentUser?.token;
    const startPractice = ['admin','teacher'].includes(String(currentUser.role || '').toLowerCase())
      ? window.startPublicVocaPreview : window.startPublicVocaPractice;
    if (typeof startPractice !== 'function') {
      if (combinedStatus) combinedStatus.textContent = '연습 화면을 불러오지 못했습니다. 앱을 새로고침한 뒤 다시 시도하세요.';
      return;
    }
    if (selectedEstimate() > MAX_SELECTED_WORDS || entries.length > MAX_SELECTED_RANGES) return;
    if (combinedButton) combinedButton.disabled = true;
    if (combinedStatus) combinedStatus.textContent = '선택한 범위의 단어를 확인하고 있습니다.';
    try {
      const grouped = new Map(), origins = new Map();
      for (const entry of entries) {
        const book = catalog.find(book => book.revisionId === entry.revisionId);
        const sectionIds = new Set(book?.sections.map(section => section.sectionId) || []);
        if (!book || !entry.ids.length || entry.ids.some(id => !sectionIds.has(id))) throw Error('NOT_PUBLISHED');
        if (!grouped.has(entry.revisionId)) grouped.set(entry.revisionId,{ids:[],count:0});
        const group = grouped.get(entry.revisionId);
        for (const id of entry.ids) {
          if (group.ids.includes(id)) continue;
          const section = book.sections.find(section => section.sectionId === id);
          group.ids.push(id); group.count += Number(section.wordCount);
          origins.set(JSON.stringify([entry.revisionId,id]),book.displayName + ' / ' + entry.label);
        }
      }
      if ([...grouped.values()].reduce((n,group) => n + group.count,0) > MAX_SELECTED_WORDS) throw Error('TOO_MANY');
      const all = [];
      for (const [revisionId,scope] of grouped) {
        if (!current()) return;
        const body = await fetchScope(revisionId,scope,null);
        if (!current()) return;
        for (const word of body) all.push({...word,revisionId,
          sourceLabel:origins.get(JSON.stringify([revisionId,word.sectionId])) || '선택 범위'});
      }
      // Same spelling + meaning (+ part of speech where provided) is one card;
      // different meanings are never collapsed. Keep permitted answer variants.
      const unique = new Map();
      for (const word of all) {
        const spelling = String(word.word || '').normalize('NFKC').trim().toLowerCase();
        const meaning = String(word.meaning || '').normalize('NFKC').trim();
        const id = String(word.vocabWordId || '').trim();
        if (!spelling || !meaning || !id) throw Error('INVALID_WORD');
        const key = JSON.stringify([spelling,meaning,String(word.partOfSpeech || '').trim()]);
        const aliases = Array.isArray(word.allowedAnswers) ? word.allowedAnswers : [];
        if (unique.has(key)) {
          const kept = unique.get(key);
          kept.allowedAnswers = [...new Set([...(kept.allowedAnswers || []),...aliases])];
          continue;
        }
        unique.set(key,{...word,allowedAnswers:aliases,
          vocabWordId:word.revisionId + ':' + id});
      }
      if (!current()) return;
      if (!unique.size) throw Error('EMPTY');
      if (combinedStatus) combinedStatus.textContent = '확인 완료 · ' + unique.size + '개 단어 (중복 ' + (all.length-unique.size) + '개 통합)';
      startPractice({revisionId:'PUBLIC_COMBINED',bookName:grouped.size + '권 자료',
        label:entries.length + '개 선택 범위',words:Array.from(unique.values())});
    } catch {
      if (current() && combinedStatus) combinedStatus.textContent = '선택한 범위를 모두 확인하지 못했습니다. 일부만 공부하지 않고 중단했습니다. 같은 선택으로 다시 시도하세요.';
    } finally {
      if (current() && combinedButton) combinedButton.disabled = false;
    }
  }
  combinedButton?.addEventListener('click',startCombinedPractice);

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
    if (!wordQuery || !searchResult) return;
    const pending = ++pendingCatalogSearch;
    const queryText = wordQuery.value.normalize('NFKC').trim();
    clearSearch();
    if (!queryText) { searchResult.textContent = '영어 또는 뜻을 입력하세요.'; return; }
    if (queryText.length > 80) { searchResult.textContent = '검색어는 80자 이내로 입력하세요.'; return; }
    const mode = wordScope?.value || 'all';
    if (!catalog) {
      const epoch = generation;
      const input = wordQuery.value;
      searchResult.textContent = '교재 목록을 불러온 뒤 단어를 검색합니다.';
      try { await loadCatalog(); } catch { /* Show a search-specific retry below. */ }
      if (pending !== pendingCatalogSearch || epoch !== generation || input !== wordQuery.value || mode !== (wordScope?.value || 'all')) return;
      if (!catalog) {
        searchResult.textContent = '교재 목록을 불러오지 못했습니다. 단어 검색을 다시 눌러 주세요.';
        return;
      }
    }
    const revisionId = mode === 'all' ? '' : books.value;
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
            query.value = ''; if (category) category.value = '';
            for (const [, select] of metadataFilters) if (select) select.value = '';
            showBooks();
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
  const cancelWordSearch = () => { pendingCatalogSearch++; clearSearch(); };
  wordQuery?.addEventListener('input', cancelWordSearch);
  wordScope?.addEventListener('change', cancelWordSearch);
  document.getElementById('station-library-word-clear')?.addEventListener('click', () => { wordQuery.value = ''; cancelWordSearch(); });
  legacy?.addEventListener('toggle', () => { if (legacy.open && currentUser?.token && getActiveTabId() === 'vocab') loadVocabBooksOnce(); });
  window.StationLibrary = {reset, open() {panel.open = true; return loadCatalog();}};
  reset();
})();
