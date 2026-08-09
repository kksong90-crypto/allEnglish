/* All바른 학생웹 6.6.0 · VOCA Station public-library adapter
 * - catalog first, section words on demand
 * - official/exam links use stable BookId only (never display-name guessing)
 * - Station practice and wrong answers are not persisted
 */
(function installVocaStationStudentUi(global) {
  'use strict';

  const state = {
    sessionKey: '',
    books: [],
    bookById: new Map(),
    bookByLabel: new Map(),
    sectionByBookLabel: new Map(),
    sectionRows: new Map(),
    favoriteRows: new Map(),
    schedule: null,
    scopeByKey: new Map(),
    activeScopeSectionIds: null,
    activeLibrary: 'mine'
  };

  const legacySaveResultToServer = global.saveResultToServer;

  function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }
  function html(value) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(value);
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
  function hasText(value) { return value !== null && value !== undefined && String(value).trim() !== ''; }
  function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function currentSessionKey() { return `${text(currentUser?.id || currentUser?.studentId)}|${text(currentUser?.token)}`; }
  function emptyMessage(message) { return `<div class="voca-library-empty">${html(message)}</div>`; }

  function resetForSession() {
    const key = currentSessionKey();
    if (state.sessionKey === key) return;
    state.sessionKey = key;
    state.books = [];
    state.bookById = new Map();
    state.bookByLabel = new Map();
    state.sectionByBookLabel = new Map();
    state.sectionRows = new Map();
    state.favoriteRows = new Map();
    state.schedule = null;
    state.scopeByKey = new Map();
    state.activeScopeSectionIds = null;
  }

  function bookLabel(book, usedLabels) {
    const base = [text(book.displayName), text(book.editionLabel)].filter(Boolean).join(' · ') || text(book.bookId) || '단어장';
    let label = base;
    let suffix = 2;
    while (usedLabels.has(label)) label = `${base} (${suffix++})`;
    usedLabels.add(label);
    return label;
  }

  function bookCategory(book) {
    const metadata = [book.schoolLevel, book.sourceKind, book.displayName, book.editionLabel].map(text).join(' ').toLowerCase();
    if (/학교|중간|기말/.test(metadata)) return '학교시험';
    if (/모의|mock/.test(metadata)) return '모의고사';
    if (/초등|초급|elementary/.test(metadata)) return '초등';
    if (/중등|중학|middle/.test(metadata)) return '중등';
    if (/고등|수능|high/.test(metadata)) return '고등';
    return '기타';
  }

  function sortedSections(book) {
    return [...(Array.isArray(book?.sections) ? book.sections : [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  function sectionRangeText(book, startDay, endDay) {
    const sections = sortedSections(book);
    const selected = sections.filter(section => {
      const number = Number(section.sectionNo);
      if (!Number.isFinite(number)) return false;
      return (!startDay || number >= Number(startDay)) && (!endDay || number <= Number(endDay));
    });
    if (!selected.length) return sections.length ? `${text(sections[0].label)} 외 ${Math.max(0, sections.length - 1)}개 구간` : '등록된 구간 없음';
    if (selected.length === 1) return text(selected[0].label);
    return `${text(selected[0].label)} ~ ${text(selected[selected.length - 1].label)}`;
  }

  function planRows(schedule) {
    const days = Array.isArray(schedule?.visibleDays) && schedule.visibleDays.length ? schedule.visibleDays : (Array.isArray(schedule?.days) ? schedule.days : []);
    return days
      .filter(day => !day?.closed && text(day?.date) >= todayKey())
      .flatMap(day => (Array.isArray(day?.vocab) ? day.vocab : []).map(plan => ({ day, plan })));
  }

  async function loadSchedule() {
    if (state.schedule) return state.schedule;
    if (typeof myScheduleLastPayload !== 'undefined' && myScheduleLastPayload && (myScheduleLastPayload.days || myScheduleLastPayload.visibleDays)) {
      state.schedule = myScheduleLastPayload;
      return state.schedule;
    }
    try {
      const result = await apiGet({ action: 'getMyLearningSchedule', range: 'three', days: '14', fromDate: todayKey(), futureOnly: 'Y', includeResults: 'N' });
      if (result?.success !== false) state.schedule = result;
    } catch (error) {
      console.warn('VOCA 공식 학습일정 연결 실패', error);
    }
    return state.schedule || { days: [] };
  }

  function card(book, options) {
    options = options || {};
    const label = state.labelByBookId?.get(text(book.bookId)) || text(book.displayName) || text(book.bookId);
    const category = bookCategory(book);
    const rangeText = options.rangeText || `${sortedSections(book).length}개 구간 · ${Number(book.wordCount || 0).toLocaleString()}개`;
    const badges = [
      options.assigned ? '<span class="voca-book-badge assigned">현재 배정</span>' : '',
      options.exam ? '<span class="voca-book-badge exam">시험범위</span>' : '',
      '<span class="voca-book-badge">학생 공개</span>'
    ].filter(Boolean).join('');
    const startDay = Number(options.startDay || 0);
    const endDay = Number(options.endDay || 0);
    const openAction = options.scopeKey
      ? `openVocaScope('${encodeURIComponent(text(options.scopeKey))}')`
      : `openVocaBookById('${encodeURIComponent(text(book.bookId))}', ${startDay}, ${endDay})`;
    return `<article class="voca-book-card" data-voca-search="${html(`${label} ${category}`.toLowerCase())}" data-voca-category="${html(category)}">
      <div class="voca-book-badges">${badges}</div>
      <h3>${html(options.title || label)}</h3>
      <p>${html(rangeText)}${options.date ? `\n수업·시험일 ${html(options.date)}` : ''}</p>
      <button class="vocab-btn${options.assigned ? '' : ' secondary'}" type="button" onclick="${openAction}">${html(options.buttonText || (options.assigned ? '이어서 학습' : '단어장 열기'))}</button>
    </article>`;
  }

  function renderAllBooks() {
    const target = document.getElementById('voca-all-grid');
    if (!target) return;
    target.innerHTML = state.books.length ? state.books.map(book => card(book)).join('') : emptyMessage('학생에게 공개된 단어장이 없습니다.');
    filterVocaLibraryCards();
  }

  async function renderAssignedBooks() {
    const mineTarget = document.getElementById('voca-mine-grid');
    const examTarget = document.getElementById('voca-exam-grid');
    const schedule = await loadSchedule();
    const rows = planRows(schedule);
    const mine = [];
    const exams = [];
    const seenMine = new Set();
    const seenExam = new Set();
    state.scopeByKey = new Map();

    rows.forEach(({ day, plan }) => {
      const bookId = text(plan.vocabBookId);
      const planType = text(plan.planType).toUpperCase();
      const book = state.bookById.get(bookId);
      const isExam = planType === 'SCHOOL_EXAM';
      if (isExam && book) {
        const revisionId = text(plan.revisionId);
        const sectionIds = (Array.isArray(plan.sectionIds) ? plan.sectionIds : []).map(text).filter(Boolean);
        const publishedSections = new Set(sortedSections(book).map(section => text(section.sectionId)));
        const exactScope = revisionId && revisionId === text(book.revisionId) && sectionIds.length && sectionIds.every(id => publishedSections.has(id));
        const key = `${text(plan.testPlanId) || bookId}|${text(day.date)}|${revisionId}|${sectionIds.join(',')}`;
        if (!seenExam.has(key)) {
          seenExam.add(key);
          if (exactScope) {
            state.scopeByKey.set(key, { bookId, revisionId, sectionIds: sectionIds.slice() });
            exams.push(card(book, { exam: true, title: text(plan.groupName) || text(book.displayName), rangeText: text(plan.schoolVocabText || plan.regularText) || `${sectionIds.length}개 구간`, date: text(day.date), scopeKey: key, buttonText: '시험범위 학습' }));
          } else {
            exams.push(`<article class="voca-book-card"><div class="voca-book-badges"><span class="voca-book-badge wait">연결 갱신 필요</span></div><h3>${html(text(plan.groupName) || text(book.displayName))}</h3><p>${html(text(plan.schoolVocabText) || '학교시험 단어 범위')}\n시험일 ${html(day.date)}</p><button class="vocab-btn secondary" type="button" disabled>현재 개정의 고정 구간을 다시 연결해 주세요</button></article>`);
          }
        }
        return;
      }
      if (!isExam && book) {
        const key = `${bookId}|${Number(plan.regularStartDay || 0)}|${Number(plan.regularEndDay || 0)}`;
        if (!seenMine.has(key)) {
          seenMine.add(key);
          mine.push(card(book, { assigned: true, rangeText: text(plan.regularText) || sectionRangeText(book, plan.regularStartDay, plan.regularEndDay), date: text(day.date), startDay: plan.regularStartDay, endDay: plan.regularEndDay }));
        }
      }
      if (text(plan.schoolVocabText) && !isExam) {
        const key = `${text(day.date)}|${text(plan.schoolVocabText)}`;
        if (!seenExam.has(key)) {
          seenExam.add(key);
          exams.push(`<article class="voca-book-card"><div class="voca-book-badges"><span class="voca-book-badge wait">연결 대기</span></div><h3>${html(text(plan.groupName) || '학교시험 범위')}</h3><p>${html(plan.schoolVocabText)}\n시험일 ${html(day.date)}</p><button class="vocab-btn secondary" type="button" disabled>고정 단어장 연결 후 학습 가능</button></article>`);
        }
      }
    });

    if (mineTarget) mineTarget.innerHTML = mine.length ? mine.join('') : emptyMessage('앞으로 예정된 공식 단어 배정이 없습니다. 전체 단어장에서는 공개 자료를 자유롭게 학습할 수 있습니다.');
    if (examTarget) examTarget.innerHTML = exams.length ? exams.join('') : emptyMessage('고정 단어장 ID로 연결된 예정 시험범위가 없습니다.');
  }

  function showVocaLibrary(name) {
    const allowed = ['mine', 'exam', 'all'];
    const selected = allowed.includes(name) ? name : 'mine';
    state.activeLibrary = selected;
    allowed.forEach(key => {
      document.getElementById(`voca-library-${key}`)?.classList.toggle('active', key === selected);
      document.getElementById(`voca-library-panel-${key}`)?.classList.toggle('active', key === selected);
    });
    const browser = document.getElementById('voca-browser-panel');
    if (browser) browser.hidden = true;
    if (selected === 'all') renderAllBooks();
  }

  function filterVocaLibraryCards() {
    const query = text(document.getElementById('voca-library-search')?.value).normalize('NFKC').toLowerCase();
    const category = text(document.getElementById('voca-library-category')?.value);
    document.querySelectorAll('#voca-all-grid .voca-book-card').forEach(element => {
      const matchesQuery = !query || text(element.dataset.vocaSearch).includes(query);
      const matchesCategory = !category || text(element.dataset.vocaCategory) === category;
      element.hidden = !(matchesQuery && matchesCategory);
    });
  }

  async function loadVocabBooks() {
    const target = document.getElementById('vocab-view');
    resetForSession();
    state.schedule = null;
    if (!currentUser?.token) return;
    try {
      const result = await apiPost({ action: 'getVocaCatalog' });
      if (!result?.success) throw new Error(result?.message || '단어장 데이터를 불러오지 못했습니다.');
      state.books = (Array.isArray(result.books) ? result.books : []).filter(book => book?.studentVisible !== false);
      state.bookById = new Map(state.books.map(book => [text(book.bookId), book]));
      state.bookByLabel = new Map();
      state.sectionByBookLabel = new Map();
      state.sectionRows = new Map();
      state.labelByBookId = new Map();
      const usedLabels = new Set();
      state.books.forEach(book => {
        const label = bookLabel(book, usedLabels);
        state.bookByLabel.set(label, book);
        state.labelByBookId.set(text(book.bookId), label);
      });
      vocabData = [['단어장', 'Day', '영어', '뜻', '순서', '개정판', '허용답', 'VOCA_ID', 'revision_id', 'section_id']];
      const bookSelect = document.getElementById('vocab-book-select');
      const daySelect = document.getElementById('vocab-day-select');
      if (bookSelect) {
        bookSelect.innerHTML = '<option value="">단어장 선택</option>' + [...state.bookByLabel.keys()].map(label => `<option value="${html(label)}">${html(label)}</option>`).join('');
        bookSelect.onchange = function () { state.activeScopeSectionIds = null; return loadVocabDays(); };
      }
      if (daySelect) {
        daySelect.innerHTML = '<option value="">Day 선택</option>';
        daySelect.onchange = loadVocaSectionAndShow;
      }
      if (target) target.innerHTML = state.books.length ? "<div class='card'>위에서 학습할 단어장을 선택하세요.</div>" : "<div class='card'>학생에게 공개된 단어장이 없습니다.</div>";
      renderAllBooks();
      await renderAssignedBooks();
    } catch (error) {
      console.error(error);
      if (target) target.innerHTML = `<div class='card'>${html(error?.message || 'VOCA Station에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.')}</div>`;
      const mine = document.getElementById('voca-mine-grid');
      const all = document.getElementById('voca-all-grid');
      if (mine) mine.innerHTML = emptyMessage('단어 배정을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.');
      if (all) all.innerHTML = emptyMessage('학생 공개 단어장을 불러오지 못했습니다.');
      throw error;
    }
  }

  async function loadVocabDays() {
    const selectedBook = text(document.getElementById('vocab-book-select')?.value);
    const daySelect = document.getElementById('vocab-day-select');
    const target = document.getElementById('vocab-view');
    if (document.getElementById('vocab-progress')) document.getElementById('vocab-progress').innerHTML = '';
    if (document.getElementById('vocab-search-result')) document.getElementById('vocab-search-result').innerHTML = '';
    if (!selectedBook) {
      if (daySelect) daySelect.innerHTML = '<option value="">Day 선택</option>';
      if (target) target.innerHTML = "<div class='card'>단어장을 먼저 선택하세요.</div>";
      return;
    }
    const book = state.bookByLabel.get(selectedBook);
    if (!book) return;
    const sectionMap = new Map();
    const usedLabels = new Set();
    sortedSections(book).filter(section => !state.activeScopeSectionIds || state.activeScopeSectionIds.has(text(section.sectionId))).forEach(section => {
      const base = text(section.label) || '구간';
      let label = base;
      let suffix = 2;
      while (usedLabels.has(label)) label = `${base} (${suffix++})`;
      usedLabels.add(label);
      sectionMap.set(label, section);
    });
    state.sectionByBookLabel.set(selectedBook, sectionMap);
    if (daySelect) daySelect.innerHTML = '<option value="">Day 선택</option>' + [...sectionMap.keys()].map(label => `<option value="${html(label)}">${html(label)}</option>`).join('');
    if (target) target.innerHTML = "<div class='card'>Day 또는 구간을 선택하세요.</div>";
  }

  function rowFromWord(bookLabelValue, sectionLabel, book, section, word) {
    return [bookLabelValue, sectionLabel, word.word, word.meaning, word.sortOrder, book.revisionId, (word.allowedAnswers || []).join('|'), word.vocabWordId, book.revisionId, section.sectionId];
  }

  async function loadVocaSectionAndShow() {
    const selectedBook = text(document.getElementById('vocab-book-select')?.value);
    const selectedDay = text(document.getElementById('vocab-day-select')?.value);
    const target = document.getElementById('vocab-view');
    if (!selectedBook || !selectedDay) { global.showVocabList(); return; }
    const book = state.bookByLabel.get(selectedBook);
    const section = state.sectionByBookLabel.get(selectedBook)?.get(selectedDay);
    if (!book || !section) {
      if (target) target.innerHTML = "<div class='card'>선택한 단어장 구간을 다시 확인하세요.</div>";
      return;
    }
    const cacheKey = `${text(book.revisionId)}|${text(section.sectionId)}`;
    if (!state.sectionRows.has(cacheKey)) {
      if (target) target.innerHTML = "<div class='card'>선택한 구간의 단어를 불러오는 중입니다...</div>";
      try {
        const result = await apiPost({ action: 'getVocaSection', revisionId: text(book.revisionId), sectionIdsJson: JSON.stringify([text(section.sectionId)]) });
        if (!result?.success) throw new Error(result?.message || '단어를 불러오지 못했습니다.');
        const rows = (result.words || []).map(word => rowFromWord(selectedBook, selectedDay, book, section, word));
        state.sectionRows.set(cacheKey, rows);
        rows.forEach(row => state.favoriteRows.set(makeWordKey(row), row));
        vocabData = [vocabData[0]].concat([...state.sectionRows.values()].flat());
      } catch (error) {
        if (target) target.innerHTML = `<div class='card'>${html(error?.message || 'VOCA Station 연결에 실패했습니다.')}</div>`;
        return;
      }
    }
    global.showVocabList();
  }

  async function openVocaBookById(encodedBookId, startDay, endDay) {
    const bookId = decodeURIComponent(text(encodedBookId));
    const book = state.bookById.get(bookId);
    const label = state.labelByBookId?.get(bookId);
    if (!book || !label) {
      alert('학생 공개 단어장에서 해당 단어장을 찾을 수 없습니다. 선생님에게 알려 주세요.');
      return;
    }
    const browser = document.getElementById('voca-browser-panel');
    if (browser) browser.hidden = false;
    const bookSelect = document.getElementById('vocab-book-select');
    const daySelect = document.getElementById('vocab-day-select');
    state.activeScopeSectionIds = null;
    bookSelect.value = label;
    await loadVocabDays();
    const sections = [...(state.sectionByBookLabel.get(label)?.entries() || [])];
    const desired = sections.find(([, section]) => Number(section.sectionNo) === Number(startDay)) || sections[0];
    if (desired && daySelect) {
      daySelect.value = desired[0];
      await loadVocaSectionAndShow();
    }
    browser?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function openVocaScope(encodedScopeKey) {
    const scopeKey = decodeURIComponent(text(encodedScopeKey));
    const scope = state.scopeByKey.get(scopeKey);
    const book = scope && state.bookById.get(text(scope.bookId));
    const label = book && state.labelByBookId?.get(text(scope.bookId));
    if (!scope || !book || !label || text(book.revisionId) !== text(scope.revisionId)) {
      alert('시험범위에 연결된 단어장 개정이 달라졌습니다. 선생님에게 연결 갱신을 요청해 주세요.');
      return;
    }
    const allowed = new Set((scope.sectionIds || []).map(text).filter(Boolean));
    const available = new Set(sortedSections(book).map(section => text(section.sectionId)));
    if (!allowed.size || [...allowed].some(id => !available.has(id))) {
      alert('시험범위의 고정 구간을 현재 단어장에서 찾을 수 없습니다. 선생님에게 연결 갱신을 요청해 주세요.');
      return;
    }
    state.activeScopeSectionIds = allowed;
    const browser = document.getElementById('voca-browser-panel');
    if (browser) browser.hidden = false;
    const bookSelect = document.getElementById('vocab-book-select');
    const daySelect = document.getElementById('vocab-day-select');
    bookSelect.value = label;
    await loadVocabDays();
    const first = [...(state.sectionByBookLabel.get(label)?.keys() || [])][0];
    if (first && daySelect) {
      daySelect.value = first;
      await loadVocaSectionAndShow();
    }
    browser?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function moveDay(direction) {
    const daySelect = document.getElementById('vocab-day-select');
    const options = [...(daySelect?.options || [])].filter(option => option.value);
    if (!options.length) return;
    let index = options.findIndex(option => option.value === daySelect.value);
    if (index < 0) index = direction > 0 ? 0 : options.length - 1;
    else index = Math.max(0, Math.min(options.length - 1, index + Number(direction || 0)));
    daySelect.value = options[index].value;
    await loadVocaSectionAndShow();
  }

  function makeWordKey(row) {
    if (hasText(row?.[7])) return `VOCA:${text(row[7])}`;
    return [row?.[0], row?.[1], row?.[2]].map(value => String(value ?? '')).join('|');
  }

  function getFavoriteRows(folderName) {
    const targetFolder = folderName || currentFavoriteFolder;
    const keys = favoriteFolders[targetFolder] || [];
    const loaded = new Map(vocabData.slice(1).map(row => [makeWordKey(row), row]));
    return sortWordsByOrder(keys.map(key => loaded.get(key) || state.favoriteRows.get(key)).filter(Boolean));
  }

  async function loadFavoriteFolders() {
    resetForSession();
    let localState = null;
    try { localState = JSON.parse(localStorage.getItem(favoriteStorageKey()) || 'null'); } catch (ignore) {}
    if (!localState || typeof localState !== 'object' || Array.isArray(localState)) localState = { [DEFAULT_FOLDER_NAME]: [] };
    if (!localState[DEFAULT_FOLDER_NAME]) localState[DEFAULT_FOLDER_NAME] = [];
    favoriteFolders = localState;
    if (currentUser?.token) {
      try {
        const result = await apiGet({ action: 'getFavoriteState' });
        if (result?.success && result.folders) {
          const serverState = result.folders;
          state.favoriteRows = new Map((result.items || []).map(item => [item.key, [item.book, item.day, item.word, item.meaning, 999999, '', '', item.vocabWordId || '']]));
          Object.keys(localState).forEach(name => {
            if (!serverState[name]) serverState[name] = [];
            serverState[name] = [...new Set([...(serverState[name] || []), ...(localState[name] || [])])];
          });
          favoriteFolders = serverState;
          await saveFavoriteFolders();
        }
      } catch (error) { console.warn('중요단어 동기화 실패', error); }
    }
    const savedFolder = localStorage.getItem(currentFolderStorageKey());
    currentFavoriteFolder = favoriteFolders[savedFolder] ? savedFolder : DEFAULT_FOLDER_NAME;
    localStorage.setItem(favoriteStorageKey(), JSON.stringify(favoriteFolders));
    localStorage.setItem(currentFolderStorageKey(), currentFavoriteFolder);
  }

  async function searchVocab() {
    const query = text(document.getElementById('vocab-search-input')?.value);
    const scope = text(document.getElementById('vocab-search-scope')?.value);
    const selectedBook = text(document.getElementById('vocab-book-select')?.value);
    const selectedDay = text(document.getElementById('vocab-day-select')?.value);
    const target = document.getElementById('vocab-search-result');
    if (!query) { if (target) target.innerHTML = "<div class='mini-card'>검색어를 입력하세요.</div>"; return; }
    const book = state.bookByLabel.get(selectedBook);
    const section = state.sectionByBookLabel.get(selectedBook)?.get(selectedDay);
    if ((scope === 'current-day' || scope === 'current-book') && !book) { target.innerHTML = "<div class='mini-card'>먼저 단어장을 선택하세요.</div>"; return; }
    if (scope === 'current-day' && !section) { target.innerHTML = "<div class='mini-card'>먼저 Day를 선택하세요.</div>"; return; }
    if (scope === 'point-current') { global.showTab('point'); await startPointPractice(); return; }
    target.innerHTML = "<div class='mini-card'>공개 단어장에서 검색 중입니다...</div>";
    try {
      const result = await apiPost({ action: 'searchVoca', query, revisionId: scope === 'all' ? '' : text(book?.revisionId), sectionId: scope === 'current-day' ? text(section?.sectionId) : '' });
      if (!result?.success) throw new Error(result?.message || '검색하지 못했습니다.');
      const rows = (result.words || []).map(word => {
        const knownLabel = state.labelByBookId?.get(text(word.bookId)) || [...state.bookByLabel.entries()].find(([, item]) => text(item.revisionId) === text(word.revisionId))?.[0] || [word.displayName, word.editionLabel].filter(Boolean).join(' · ');
        return [knownLabel, word.sectionLabel, word.word, word.meaning, word.sortOrder, word.revisionId, (word.allowedAnswers || []).join('|'), word.vocabWordId, word.revisionId, word.sectionId];
      });
      rows.forEach(row => state.favoriteRows.set(makeWordKey(row), row));
      if (!rows.length) { target.innerHTML = "<div class='mini-card'>검색 결과가 없습니다.</div>"; return; }
      target.innerHTML = `<div class="mini-card"><b>검색 결과 ${rows.length}개${result.truncated ? ' · 최대 100개 표시' : ''}</b></div><table><tr><th>단어장</th><th>구간</th><th>영어</th><th>뜻</th></tr>${rows.map(row => `<tr><td>${html(row[0])}</td><td>${html(row[1])}</td><td><span class="speak-word" onclick='speakWord(${JSON.stringify(String(row[2]))})'>${html(row[2])}</span></td><td>${html(row[3])}</td></tr>`).join('')}</table>`;
    } catch (error) {
      target.innerHTML = `<div class='mini-card'>${html(error?.message || '검색 연결에 실패했습니다.')}</div>`;
    }
  }

  function renderStudentProgress() {
    const target = document.getElementById('vocab-progress');
    if (target) target.innerHTML = "<div class='progress-box'><b>연습 모드</b><br>연습 결과와 오답 내용은 저장하지 않습니다.</div>";
  }

  async function saveResultToServer(correctCount, score) {
    const stationRows = Array.isArray(currentVocabWords) && currentVocabWords.some(row => hasText(row?.[7]));
    if (!stationRows && typeof legacySaveResultToServer === 'function') return legacySaveResultToServer(correctCount, score);
    if (testAlreadySaved) return;
    testAlreadySaved = true;
    const status = document.getElementById('save-result-status');
    if (status) status.textContent = '연습 결과는 저장되지 않습니다.';
  }

  function pointStartKeyStorageKey() { return `allbarun-point-start-key:${text(currentUser?.id || currentUser?.studentId) || 'guest'}`; }
  function getOrCreatePointStartKey() {
    const storageKey = pointStartKeyStorageKey();
    let value = '';
    try { value = sessionStorage.getItem(storageKey) || ''; } catch (ignore) {}
    if (!/^[A-Za-z0-9_-]{16,160}$/.test(value)) {
      const randomPart = global.crypto?.randomUUID ? global.crypto.randomUUID().replaceAll('-', '') : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      value = `POINTSTART_${randomPart}`;
      try { sessionStorage.setItem(storageKey, value); } catch (ignore) {}
    }
    return value;
  }
  function clearPointStartKey() { try { sessionStorage.removeItem(pointStartKeyStorageKey()); } catch (ignore) {} }
  function normalizePointPracticeAnswer(value) { return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '); }

  async function startPointPractice() {
    const target = document.getElementById('point-test-view');
    if (!target || !currentUser?.token) return;
    clearPointTimer();
    currentPointTest = null;
    target.innerHTML = "<div class='card'>포인트 시험 연습문제를 준비하는 중입니다...</div>";
    try {
      const result = await apiPost({ action: 'getPointPracticeQuestions' });
      if (!result?.success || !Array.isArray(result.questions) || !result.questions.length) throw new Error(result?.message || '이번 주 포인트 연습문제가 준비되지 않았습니다.');
      target.innerHTML = `<div class='card'><b>포인트 시험 연습</b><br>실제 시험과 같은 무작위 ${html(result.questionCount || 30)}문제입니다.<br>시간·횟수 제한이 없고 결과와 오답은 저장하지 않습니다.</div>${result.questions.map((question, index) => `<div class='vocab-question'><b>${index + 1}. ${html(question.meaning || '')}</b><input type='text' id='answer-point-practice-${index}' autocomplete='off' autocorrect='off' autocapitalize='none' spellcheck='false'></div>`).join('')}<div class='test-action-bar'><button class='vocab-btn' id='grade-point-practice'>채점하기</button></div><div id='point-practice-result'></div>`;
      document.getElementById('grade-point-practice')?.addEventListener('click', () => {
        let correct = 0;
        result.questions.forEach((question, index) => {
          const actual = normalizePointPracticeAnswer(document.getElementById(`answer-point-practice-${index}`)?.value);
          const accepted = (question.acceptedAnswers || []).map(normalizePointPracticeAnswer);
          if (actual && accepted.includes(actual)) correct += 1;
        });
        const resultTarget = document.getElementById('point-practice-result');
        if (resultTarget) resultTarget.innerHTML = `<div class='card score-card'><div class='score-number'>${correct}/${result.questions.length}</div><div class='score-sub'>연습 결과는 저장되지 않습니다.</div><button class='vocab-btn secondary' onclick='startPointPractice()'>새 문제로 다시 연습</button></div>`;
      });
    } catch (error) {
      target.innerHTML = `<div class='card'>${html(error?.message || '포인트 연습 API 연결에 실패했습니다.')}</div>`;
    }
  }

  async function openCurrentPointVocabStudy() {
    global.showTab('point');
    await startPointPractice();
  }

  global.showVocaLibrary = showVocaLibrary;
  global.filterVocaLibraryCards = filterVocaLibraryCards;
  global.loadVocabBooks = loadVocabBooks;
  global.loadVocabDays = loadVocabDays;
  global.loadVocaSectionAndShow = loadVocaSectionAndShow;
  global.openVocaBookById = openVocaBookById;
  global.openVocaScope = openVocaScope;
  global.moveDay = moveDay;
  global.makeWordKey = makeWordKey;
  global.getFavoriteRows = getFavoriteRows;
  global.loadFavoriteFolders = loadFavoriteFolders;
  global.searchVocab = searchVocab;
  global.renderStudentProgress = renderStudentProgress;
  global.saveResultToServer = saveResultToServer;
  global.startPointPractice = startPointPractice;
  global.openCurrentPointVocabStudy = openCurrentPointVocabStudy;
  global.getOrCreatePointStartKey = getOrCreatePointStartKey;
  global.clearPointStartKey = clearPointStartKey;
})(globalThis);
