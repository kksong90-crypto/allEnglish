(function () {
  'use strict';
  if (new URLSearchParams(window.location.search).get('vocabNativePilot') === '1') return;
  const header = ['단어장명','Day','영어','뜻','정렬번호','book_id','허용답'];
  const originalDays = loadVocabDays, originalSearch = searchVocab;
  const originalFavorites = showFavorites, originalTest = startFavoriteTest, originalMeaning = startFavoriteMeaningCheck;
  const originalReset = resetUserScopedState;
  let owner = '', catalog = null, catalogTicket = 0, bookTicket = 0, searchTicket = 0;
  let fullRows = null, fullFlight = null, fullTicket = 0;
  const books = new Map(), flights = new Map();
  const identity = () => studentSessionEpoch + '|' + String(currentUser?.token || '');
  function clear() { catalog = null; books.clear(); flights.clear(); fullRows = null; fullFlight = null; fullTicket++; catalogTicket++; bookTicket++; searchTicket++; }
  function sync() { const next = identity(); if (owner !== next) { clear(); owner = next; } return next; }
  const node = id => document.getElementById(id);
  function failure(target, text, action) {
    node(target).innerHTML = `<div class="card" role="status">${escapeHtml(text)}<div class="button-row"><button type="button" class="vocab-btn secondary" onclick="${action}">다시 불러오기</button></div></div>`;
  }
  function validRows(rows) { return Array.isArray(rows) && rows.length >= 1 && rows.every(row => Array.isArray(row) && row.length === 7); }
  function oldResponse(reply) { return reply?.success === true && reply.schema == null && validRows(reply.values) && JSON.stringify(reply.values[0]) === JSON.stringify(header); }
  function oldCatalog(reply) {
    const found = new Map();
    for (const row of reply.values.slice(1)) {
      if (typeof row[5] !== 'string' || !row[5] || typeof row[0] !== 'string' || !row[0]) throw Error('이전 단어장 목록을 확인하지 못했습니다.');
      if (!found.has(row[5])) found.set(row[5], {bookId:row[5],name:row[0],isPoint:reply.pointStudyAvailable === true && row[0] === reply.pointStudyBookName});
    }
    fullRows = reply.values;
    return {success:true,schema:'STUDENT_SCOPED_VOCAB_CATALOG_V1',books:[...found.values()]};
  }
  function bookForName(name) { return catalog?.books.find(book => book.name === name); }
  async function bookRows(book) {
    const session = sync(), version = catalogTicket;
    if (books.has(book.bookId)) return books.get(book.bookId);
    let task = flights.get(book.bookId);
    if (!task) {
      task = Promise.resolve().then(() => apiGet({action:'getVocabData',view:'BOOK',bookId:book.bookId,valuesOnly:'Y'})).then(reply => {
        if (session !== identity() || version !== catalogTicket) throw Error('로그인이나 단어장 목록이 변경되었습니다.');
        if (oldResponse(reply)) { fullRows = reply.values; reply = {success:true,schema:'STUDENT_SCOPED_VOCAB_BOOK_V1',bookId:book.bookId,bookName:book.name,values:[header,...reply.values.slice(1).filter(row => row[5] === book.bookId && row[0] === book.name)]}; }
        if (reply?.success !== true || reply.schema !== 'STUDENT_SCOPED_VOCAB_BOOK_V1' || reply.bookId !== book.bookId || reply.bookName !== book.name || !validRows(reply.values) || reply.values.slice(1).some(row => row[0] !== book.name || row[5] !== book.bookId)) throw Error('선택한 단어장을 확인하지 못했습니다. 다시 불러와 주세요.');
        books.set(book.bookId, reply.values); return reply.values;
      });
      flights.set(book.bookId, task);
      task.finally(() => { if (flights.get(book.bookId) === task) flights.delete(book.bookId); }).catch(() => {});
    }
    return task;
  }
  async function compatibilityRows(force = false) {
    const session = sync(); if (force) { fullRows = null; fullFlight = null; fullTicket++; } if (fullRows) return fullRows;
    if (!fullFlight) {
      const version = fullTicket;
      const task = Promise.resolve().then(() => apiGet({action:'getVocabData',valuesOnly:'Y'})).then(reply => {
        if (session !== identity() || version !== fullTicket) throw Error('로그인이나 검색 범위가 변경되었습니다.');
        if (reply?.success !== true || !validRows(reply.values)) throw Error('검색 범위의 단어를 불러오지 못했습니다. 다시 시도해 주세요.');
        fullRows = reply.values; return fullRows;
      }); fullFlight = task;
      task.finally(() => { if (fullFlight === task) fullFlight = null; }).catch(() => {});
    }
    return fullFlight;
  }
  resetUserScopedState = function () { clear(); owner = ''; return originalReset(); };
  loadVocabBooks = async function (epoch = studentSessionEpoch) {
    const session = sync(), ticket = ++catalogTicket; bookTicket++; searchTicket++;
    catalog = null; books.clear(); flights.clear(); vocabData = [header];
    node('vocab-book-select').innerHTML = '<option value="">단어장 선택</option>';
    node('vocab-day-select').innerHTML = '<option value="">Day 선택</option>';
    try {
      let reply = await apiGet({action:'getVocabData',view:'CATALOG',valuesOnly:'Y'});
      if (epoch !== studentSessionEpoch || session !== identity() || ticket !== catalogTicket) return false;
      if (oldResponse(reply)) reply = oldCatalog(reply);
      const seenIds = new Set(), seenNames = new Set();
      if (reply?.success !== true || reply.schema !== 'STUDENT_SCOPED_VOCAB_CATALOG_V1' || !Array.isArray(reply.books) || !reply.books.length) throw Error('단어장 목록을 확인하지 못했어요. 다시 불러오거나 위의 공개 교재에서 찾아보세요.');
      for (const book of reply.books) {
        if (typeof book.bookId !== 'string' || !book.bookId.trim() || typeof book.name !== 'string' || !book.name.trim() || seenIds.has(book.bookId) || seenNames.has(book.name)) throw Error('단어장 목록을 확인하지 못했습니다.');
        seenIds.add(book.bookId); seenNames.add(book.name);
      }
      catalog = reply;
      node('vocab-book-select').innerHTML += reply.books.map(book => `<option value="${escapeHtml(book.name)}">${escapeHtml(book.name)}</option>`).join('');
      node('vocab-book-select').onchange = loadVocabDays; node('vocab-day-select').onchange = showVocabList;
      node('vocab-view').innerHTML = '<div class="card">단어장을 선택하세요.</div>'; return true;
    } catch (error) {
      if (session === identity() && ticket === catalogTicket) failure('vocab-view', error.message || '단어장을 불러오지 못했습니다.', 'loadVocabBooksOnce(true)');
      return false;
    }
  };
  loadVocabDays = async function () {
    const session = sync(), ticket = ++bookTicket, name = node('vocab-book-select').value;
    searchTicket++; vocabStudyView = ''; vocabData = [header];
    node('vocab-day-select').innerHTML = '<option value="">Day 선택</option>';
    node('vocab-progress').innerHTML = ''; node('vocab-search-result').innerHTML = '';
    const book = bookForName(name);
    if (!book) { node('vocab-view').innerHTML = '<div class="card">단어장을 먼저 선택하세요.</div>'; return; }
    node('vocab-view').innerHTML = '<div class="card" role="status">선택한 단어장을 불러오는 중입니다…</div>';
    try {
      const rows = await bookRows(book);
      if (session !== identity() || ticket !== bookTicket || node('vocab-book-select').value !== name) return;
      vocabData = rows; return originalDays();
    } catch (error) { if (session === identity() && ticket === bookTicket) failure('vocab-view',error.message,'loadVocabDays()'); }
  };
  searchVocab = async function () {
    const session = sync(), ticket = ++searchTicket;
    const pin = () => JSON.stringify(['vocab-book-select','vocab-day-select','vocab-search-scope','vocab-search-input'].map(id => node(id).value));
    const selection = pin(), current = () => session === identity() && ticket === searchTicket && pin() === selection;
    if (!String(node('vocab-search-input').value || '').trim()) return originalSearch();
    const scope = node('vocab-search-scope').value, selected = bookForName(node('vocab-book-select').value);
    try {
      let rows;
      if (scope === 'current-book' || scope === 'current-day') { if (!selected) throw Error('단어장을 먼저 선택하세요.'); rows = await bookRows(selected); }
      else if (scope === 'point-current') { const point = catalog?.books.find(book => book.isPoint); rows = point ? await bookRows(point) : [header]; }
      else {
        const reply = await apiGet({action:'getVocabData',view:'SEARCH',query:String(node('vocab-search-input').value || '').trim(),searchScope:scope,valuesOnly:'Y'});
        if (!current()) return;
        if (oldResponse(reply)) { const saved = vocabData; try { vocabData = reply.values; return originalSearch(); } finally { vocabData = saved; } }
        if (reply?.success !== true || reply.schema !== 'STUDENT_SCOPED_VOCAB_SEARCH_V1' || !validRows(reply.values) || !Number.isSafeInteger(reply.count) || reply.count !== reply.values.length - 1) throw Error('검색 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
        return renderLegacyVocabSearchResults(node('vocab-search-result'),sortWordsByOrder(reply.values.slice(1)));
      }
      if (!current()) return; const saved = vocabData; try { vocabData = rows; return originalSearch(); } finally { vocabData = saved; }
    } catch (error) { if (current()) failure('vocab-search-result',error.message,'searchVocab()'); }
  };
  getFavoriteRows = function (folder = currentFavoriteFolder) {
    sync(); const keys = new Set(favoriteFolders[folder] || []);
    return sortWordsByOrder((fullRows || [header]).slice(1).filter(row => keys.has(makeWordKey(row))));
  };
  async function favorites(action, force = false) {
    const session = sync(), folder = currentFavoriteFolder, pin = JSON.stringify(favoriteFolders[folder] || []);
    if (!(favoriteFolders[folder] || []).length) return action();
    try { await compatibilityRows(force); if (session === identity() && folder === currentFavoriteFolder && pin === JSON.stringify(favoriteFolders[folder] || [])) return action(); }
    catch (error) { if (session === identity() && folder === currentFavoriteFolder) failure('favorites-view',error.message,'showFavorites(true)'); }
  }
  showFavorites = (force = false) => favorites(() => originalFavorites(force), force === true);
  startFavoriteTest = () => favorites(originalTest);
  startFavoriteMeaningCheck = () => favorites(originalMeaning);
})();
