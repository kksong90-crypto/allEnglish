/* Read-only public catalog host. No legacy word arrays, favorites or score sinks. */
(function (root) {
  'use strict';

  const actions = Object.freeze({
    catalog: 'getPublicVocabCatalogCandidate',
    section: 'getPublicVocabSectionCandidate'
  });
  const messages = Object.freeze({
    SIGNED_OUT: '공개 자료를 보려면 다시 로그인해 주세요.',
    LOADING_CATALOG: '공개 자료 목록을 읽는 중입니다.',
    READY: '자료와 구간을 선택하세요.',
    EMPTY: '현재 공개된 자료가 없습니다.',
    LOADING_BODY: '선택한 구간을 읽는 중입니다.',
    BODY: '선택한 구간의 전체 단어입니다.',
    LEFT: '',
    ERROR: '자료를 확인하지 못했습니다. 새로 읽기를 눌러 주세요.'
  });

  function mount(host, core, dependencies) {
    const doc = host.ownerDocument;
    host.innerHTML = '<h2>공개 단어 자료</h2>' +
      '<p>Station에서 공개한 자료를 읽습니다. 기존 단어장·즐겨찾기·오답은 그대로 유지됩니다.</p>' +
      '<div class="public-catalog-controls">' +
      '<label>자료 종류<select id="public-catalog-category"><option value="">전체</option><option value="MOCK_EXAM">모의고사</option><option value="OTHER">기타 자료</option></select></label>' +
      '<label>학년<select id="public-catalog-grade"><option value="">전체</option><option value="1">고1</option><option value="2">고2</option><option value="3">고3</option></select></label>' +
      '<label>연도<select id="public-catalog-year"><option value="">전체</option></select></label>' +
      '<label>월<select id="public-catalog-month"><option value="">전체</option></select></label>' +
      '<label>문항 번호<input id="public-catalog-question" inputmode="numeric" maxlength="3" placeholder="예: 32"></label>' +
      '<label>자료명 검색<input id="public-catalog-query" maxlength="120"></label>' +
      '<button type="button" id="public-catalog-refresh">새로 읽기</button>' +
      '<button type="button" id="public-catalog-back">목록으로</button></div>' +
      '<p id="public-catalog-status" role="status" aria-live="polite"></p>' +
      '<div id="public-catalog-results"></div><div id="public-catalog-body"></div>';
    const element = suffix => host.querySelector('#public-catalog-' + suffix);
    const textNode = (tag, text) => {
      const node = doc.createElement(tag);
      node.textContent = String(text);
      return node;
    };
    let controller;
    let version = '';
    const filters = () => Object.fromEntries(
      ['category', 'grade', 'year', 'month', 'question', 'query'].map(key => [key, element(key).value.trim()])
    );
    function list() {
      if (!controller) return;
      element('results').replaceChildren();
      try {
        const rows = controller.filtered(filters());
        for (const {book, section} of rows) {
          const label = book.categoryCode === 'MOCK_EXAM'
            ? `${book.name} · 고${book.grade} · ${book.year}년 ${book.month}월 · ${section.label}`
            : `${book.name} · ${section.label}`;
          const button = textNode('button', label);
          button.type = 'button';
          button.className = 'public-catalog-section';
          button.onclick = () => controller.select({
            bookId: book.bookId, revisionId: book.revisionId, sectionId: section.sectionId
          });
          element('results').append(button);
        }
        if (!rows.length && controller.snapshot().phase === 'READY') {
          element('status').textContent = '선택한 조건에 맞는 공개 자료가 없습니다.';
        }
      } catch (_) {
        element('status').textContent = '학년·연도·월·문항 번호를 확인해 주세요.';
      }
    }
    controller = core.create({...dependencies, onState(state) {
      if (state.phase === 'SIGNED_OUT') {
        for (const key of ['category', 'grade', 'year', 'month', 'question', 'query']) element(key).value = '';
      }
      element('status').textContent = state.error === 'CATALOG_EXPIRED'
        ? '공개 상태를 다시 확인해야 합니다. 새로 읽기를 눌러 주세요.'
        : messages[state.phase] || messages.ERROR;
      element('back').disabled = !state.body;
      element('refresh').disabled = state.phase === 'SIGNED_OUT' || state.phase === 'LOADING_CATALOG';
      element('body').replaceChildren();
      if (state.body) {
        element('body').append(textNode('h3', state.body.sectionLabel || state.body.sectionId));
        const table = doc.createElement('table');
        const head = doc.createElement('tr');
        for (const label of ['순서', '단어', '뜻']) {
          const th = textNode('th', label);
          th.scope = 'col';
          head.append(th);
        }
        table.append(head);
        for (const word of state.body.words) {
          const row = doc.createElement('tr');
          for (const value of [word.sortOrder, word.word, word.meaning]) row.append(textNode('td', value));
          table.append(row);
        }
        element('body').append(table);
      }
      const nextVersion = JSON.stringify(state.books.map(book => [book.bookId, book.revisionId, book.year, book.month]));
      if (nextVersion !== version) {
        version = nextVersion;
        for (const key of ['year', 'month']) {
          const select = element(key);
          const previous = select.value;
          const all = textNode('option', '전체');
          all.value = '';
          select.replaceChildren(all);
          const values = state.books.filter(book => book.categoryCode === 'MOCK_EXAM').map(book => book[key]).filter(Boolean);
          for (const value of [...new Set(values)].sort((a, b) => Number(b) - Number(a))) {
            const option = textNode('option', value);
            option.value = value;
            select.append(option);
          }
          select.value = [...select.options].some(option => option.value === previous) ? previous : '';
        }
      }
      list();
    }});
    // A filter change leaves the old body and cancels its pending selection first.
    for (const key of ['category', 'grade', 'year', 'month', 'question', 'query']) {
      element(key).addEventListener(['question', 'query'].includes(key) ? 'input' : 'change', () => {
        if (key === 'category' && element(key).value === 'OTHER') {
          for (const mockKey of ['grade', 'year', 'month', 'question']) element(mockKey).value = '';
        }
        controller.back();
        list();
      });
    }
    element('refresh').onclick = () => controller.refresh(true);
    element('back').onclick = () => controller.back();
    return controller;
  }

  function attach(dependencies) {
    // This is a release gate, never a query string, storage key or user preference.
    if (dependencies.enabled !== true) return Object.freeze({enabled: false});
    const doc = dependencies.document || root.document;
    const host = doc.getElementById('public-catalog');
    const entries = [...doc.querySelectorAll('[data-public-catalog-entry]')];
    const core = dependencies.core || root.PublicCatalog15;
    if (!host || !core) return Object.freeze({enabled: false});
    let identity = null;
    function session() {
      const next = dependencies.getSession();
      if (!next || !next.subject || !next.token || !Number.isSafeInteger(next.epoch)) {
        identity = null;
      } else if (!identity || ['subject', 'token', 'epoch'].some(key => identity[key] !== next[key])) {
        identity = Object.freeze({subject: next.subject, token: next.token, epoch: next.epoch});
      }
      return identity;
    }
    const transport = {};
    for (const kind of ['catalog', 'section']) transport[kind] = async query => {
      const expected = session();
      if (!expected || expected !== query.session) throw Error('AUTH');
      const params = {action: actions[kind], token: expected.token};
      if (kind === 'section') {
        for (const key of ['bookId', 'revisionId', 'sectionId', 'catalogVersion']) params[key] = query[key];
      }
      const reply = await dependencies.read(params, query.signal);
      // Check ownership before interpreting AUTH. Never log out a newer app session.
      if (session() !== expected || query.signal.aborted) throw Error('AUTH');
      if (reply?.success !== true) {
        throw Error(['AUTH', 'VERSION'].includes(reply?.code) ? reply.code : 'NOT_AVAILABLE');
      }
      return reply.result;
    };
    const controller = (dependencies.mount || mount)(host, core, {
      transport, timeoutMs: dependencies.timeoutMs || 15000, ttlMs: 30000
    });
    for (const entry of entries) {
      entry.hidden = false;
      entry.onclick = () => dependencies.showTab('public-catalog');
    }
    function reset() {
      identity = null;
      controller.logout();
      host.hidden = true;
    }
    function onTab(tabId, options = {}) {
      if (tabId !== 'public-catalog' || doc.hidden || options.deferLoad) {
        controller.leave();
        host.hidden = true;
        return;
      }
      const next = session();
      if (!next) { reset(); return; }
      host.hidden = false;
      return controller.enter(next);
    }
    doc.addEventListener('visibilitychange', () => onTab(dependencies.activeTab()));
    root.addEventListener('pagehide', reset);
    root.addEventListener('pageshow', () => onTab(dependencies.activeTab()));
    return Object.freeze({enabled: true, reset, onTab});
  }
  root.StudentPublicCatalog = Object.freeze({attach, mount});
  if (typeof module !== 'undefined') module.exports = root.StudentPublicCatalog;
})(typeof window === 'undefined' ? globalThis : window);
