// Complete production scripts with synthetic sessions/data only. No browser or live API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {virtualStudent, html, server} from './helpers/virtual-student.mjs';

const require = createRequire(import.meta.url);
const core = require('../student-public-catalog-core.js');
const coreText = fs.readFileSync(new URL('../student-public-catalog-core.js', import.meta.url), 'utf8');
const hostText = fs.readFileSync(new URL('../student-public-catalog.js', import.meta.url), 'utf8');
const binding = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('StudentPublicCatalog.attach({'));
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const task = new Promise(done => { resolve = done; }); return {task, resolve}; };
function catalog() {
  const books = ['MOCK_EXAM', 'TEXTBOOK'].map((categoryCode, i) => ({
    bookId: 'PUBLIC_BOOK_' + i, revisionId: 'PUBLIC_REVISION_' + i, name: i ? '기타 공개 자료' : '가상 모의고사',
    grade: i ? '' : '2', year: i ? '' : '2026', month: i ? '' : '9', categoryCode,
    libraryType: 'GENERAL', audience: 'PUBLIC', status: 'PUBLISHED', contentHash: 'synthetic-hash', recordVersion: 1,
    sections: [{sectionId: 'PUBLIC_SECTION_' + i, sectionNo: i ? '1' : '31~34', label: i ? '첫 구간' : '31~34번', wordCount: 25, sortOrder: 1}]
  }));
  return {schema: 'STUDENT_PUBLIC_CATALOG_CANDIDATE_V2', policy: 'EXPLICIT_GENERAL_V1', books, catalogVersion: core.catalogHash(books)};
}
function body(catalogue, i = 0) {
  const book = catalogue.books[i], section = book.sections[0];
  const words = Array.from({length: section.wordCount}, (_, n) => ({
    bookId: book.bookId, revisionId: book.revisionId, sectionId: section.sectionId,
    wordId: 'PUBLIC_WORD_' + i + '_' + n, word: n ? 'word-' + n : 'false', meaning: n ? '가상 뜻' : '0', allowedAnswers: ['false'], sortOrder: n + 1
  }));
  return {schema: 'STUDENT_PUBLIC_SECTION_CANDIDATE_V2', catalogVersion: catalogue.catalogVersion,
    bookId: book.bookId, revisionId: book.revisionId, sectionId: section.sectionId,
    sectionLabel: section.label, words, bodyHash: core.digest(words.map(core.wordTuple))};
}
function scope(catalogue, i = 0) {
  const book = catalogue.books[i];
  return {bookId: book.bookId, revisionId: book.revisionId, sectionId: book.sections[0].sectionId};
}
function fixture({enabled = true, query = ''} = {}) {
  const backend = server(), catalogue = catalog(), originalAnswer = backend.answer.bind(backend);
  backend.answer = params => {
    if (params.action === 'getPublicVocabCatalogCandidate') return {success: true, result: clone(catalogue)};
    if (params.action === 'getPublicVocabSectionCandidate') return {success: true, result: body(catalogue, params.bookId === 'PUBLIC_BOOK_1' ? 1 : 0)};
    if (params.action === 'changePassword') return {success: true, token: 'virtual-A-rotated'};
    return originalAnswer(params);
  };
  const app = virtualStudent({backend});
  // Extend the existing portable DOM fixture only with methods used by this view.
  const prototype = Object.getPrototypeOf(app.node('public-catalog'));
  if (!Object.getOwnPropertyDescriptor(prototype, 'ownerDocument')) {
    Object.defineProperties(prototype, {
      ownerDocument: {get() { return this.doc; }},
      options: {get() { return this.children.filter(child => child.tagName === 'OPTION'); }}
    });
    prototype.querySelector = function(selector) { return this.doc.querySelector(selector); };
    prototype.append = function(...nodes) { for (const node of nodes) this.appendChild(node); };
    prototype.replaceChildren = function(...nodes) {
      for (const node of [...this.children]) this.doc.remove(node);
      this.children = [];
      this.append(...nodes);
    };
  }
  app.context.location.search = query;
  vm.runInContext(coreText, app.context);
  vm.runInContext(hostText, app.context);
  const create = app.context.PublicCatalog15.create;
  app.context.PublicCatalog15.create = dependencies => (app.controller = create(dependencies));
  // Only this synthetic test copy opens the release gate. Production stays false.
  vm.runInContext(enabled ? binding.replace('enabled: false,', 'enabled: true,') : binding, app.context);
  app.catalogue = catalogue;
  app.state = () => clone(app.controller.snapshot());
  app.open = async () => { app.context.showTab('public-catalog'); await app.flush(); };
  app.dispose = () => app.read('studentPublicCatalog.enabled && studentPublicCatalog.reset()');
  app.catalogRequests = () => app.requests.filter(request => request.action?.startsWith('getPublicVocab'));
  return app;
}

test('release gate cannot be enabled by URL; old tabs and direct catalog navigation issue no catalog read', async () => {
  assert.equal((binding.match(/enabled: false/g) || []).length, 1);
  assert.equal((html.match(/href="student-public-catalog.css/g) || []).length, 1);
  for (const query of ['', '?publicCatalog=1', '?vocabNativePilot=1&favorites=1&publicCatalog=1']) {
    const app = fixture({enabled: false, query});
    app.session.setItem('allbarun-current-tab', 'public-catalog');
    app.session.setItem('allbarun-tab-history', '["public-catalog","home"]');
    await app.boot();
    await app.open();
    assert.equal(app.read('studentPublicCatalog.enabled'), false);
    assert.equal(app.node('public-catalog').hidden, true);
    assert.equal(app.doc.querySelector('[data-public-catalog-entry]').hidden, true);
    assert.notEqual(app.read('getActiveTabId()'), 'public-catalog');
    assert.equal(app.catalogRequests().length, 0);
  }
});

test('release gate preserves the existing legacy, native, favorite and wrong-note function bodies', () => {
  const expected = JSON.parse(fs.readFileSync(new URL('./fixtures/public-catalog-legacy-function-hashes.json', import.meta.url), 'utf8'));
  for (const [name, entry] of Object.entries(expected)) {
    const start = html.indexOf(entry.start), end = html.indexOf(entry.end, start + entry.start.length);
    assert.ok(start >= 0 && end > start, name);
    assert.equal(createHash('sha256').update(html.slice(start, end)).digest('hex'), entry.sha256, name);
  }
});

test('actual host reads metadata, selected full 25-word body, and all public GENERAL categories without writes', async () => {
  const app = fixture();
  try {
    await app.boot();
    app.read('vocabData = [["legacy"],["기존 14교재",1,"apple","사과",1]]; favoriteFolders = {기본:["old|1|apple"]}; serverWrongWords = [{word:"old"}];');
    const before = app.read('JSON.stringify([vocabData,favoriteFolders,serverWrongWords])');
    await app.open();
    assert.equal(app.state().phase, 'READY');
    assert.equal(app.node('public-catalog-results').children.length, 2);
    await app.controller.select(scope(app.catalogue));
    assert.equal(app.state().body.words.length, 25);
    assert.equal(app.node('public-catalog-body').children[1].children.length, 26);
    assert.equal(app.state().body.words[0].word, 'false');
    assert.equal(app.state().body.words[0].meaning, '0');
    assert.deepEqual(app.catalogRequests().map(request => request.action), ['getPublicVocabCatalogCandidate', 'getPublicVocabSectionCandidate']);
    for (const request of app.catalogRequests()) {
      assert.equal(request.method, 'GET');
      assert.equal(request.token, 'virtual-A');
      assert.equal('id' in request || 'subject' in request || 'session' in request, false);
    }
    assert.equal(app.requests.some(request => request.action === 'getVocabData' || /save|submit|issue|print/i.test(request.action || '')), false);
    assert.equal(app.read('JSON.stringify([vocabData,favoriteFolders,serverWrongWords])'), before);
  } finally { app.dispose(); }
});

test('mock filters support grade/year/month and question ranges; other libraries remain accessible', () => {
  const books = catalog().books;
  assert.equal(core.filter(books, {}).length, 2);
  assert.equal(core.filter(books, {grade:'2',year:'2026',month:'9',question:'32'}).length, 1);
  assert.equal(core.filter(books, {question:'35'}).length, 0);
  assert.equal(core.filter(books, {category:'OTHER'}).length, 1);
  assert.equal(core.filter(books, {category:'OTHER',question:'32'}).length, 0);
  assert.throws(() => core.filter(books, {month:'13'}), /INVALID_FILTER/);
});

for (const response of ['success', 'AUTH']) test(`account switch discards old catalog ${response} without affecting new session`, async () => {
  const app = fixture();
  try {
    await app.boot();
    app.backend.hold.add('getPublicVocabCatalogCandidate');
    await app.open();
    const old = app.backend.waiting.shift();
    app.read('resetUserScopedState(); currentUser = {id:"B",token:"virtual-B",role:"student"};');
    app.backend.hold.clear();
    await app.open();
    old.resolve(response === 'AUTH' ? {success:false,code:'AUTH',message:'로그인이 필요합니다.'} : {success:true,result:catalog()});
    await app.flush();
    assert.equal(app.read('currentUser.id'), 'B');
    assert.equal(app.state().phase, 'READY');
    assert.equal(app.catalogRequests().at(-1).token, 'virtual-B');
  } finally { app.dispose(); }
});

test('password rotation resets catalog and old-token AUTH cannot expire the new token', async () => {
  const app = fixture();
  try {
    await app.boot();
    await app.open();
    app.backend.hold.add('getPublicVocabSectionCandidate');
    const pending = app.controller.select(scope(app.catalogue));
    await app.flush();
    const old = app.backend.waiting.shift();
    app.node('old-password').value = 'old-synthetic-password';
    app.node('new-password').value = 'new-synthetic-password';
    app.node('new-password-confirm').value = 'new-synthetic-password';
    await app.context.changeMyPassword();
    await app.flush();
    old.resolve({success:false,code:'AUTH',message:'로그인이 필요합니다.'});
    await pending;
    assert.equal(app.read('currentUser.token'), 'virtual-A-rotated');
    assert.equal(app.state().phase, 'READY');
    assert.equal(app.state().body, null);
    assert.equal(app.catalogRequests().at(-1).token, 'virtual-A-rotated');
  } finally { app.dispose(); }
});

test('filter changes cancel pending body and clear the old selection', async () => {
  const app = fixture();
  try {
    await app.boot(); await app.open();
    app.backend.hold.add('getPublicVocabSectionCandidate');
    const pending = app.controller.select(scope(app.catalogue));
    await app.flush();
    app.node('public-catalog-category').value = 'OTHER';
    await app.node('public-catalog-category').emit('change');
    app.backend.waiting.shift().resolve({success:true,result:body(app.catalogue)});
    await pending;
    assert.equal(app.state().body, null);
    assert.equal(app.node('public-catalog-results').children.length, 1);
  } finally { app.dispose(); }
});

test('leave, visibility loss, pagehide and logout clear bodies; resume fetches fresh metadata', async () => {
  const app = fixture();
  try {
    await app.boot(); await app.open();
    await app.controller.select(scope(app.catalogue));
    app.context.showTab('vocab'); await app.flush();
    assert.equal(app.node('public-catalog').hidden, true);
    assert.equal(app.state().body, null);
    await app.open();
    app.doc.hidden = true; await app.doc.emit('visibilitychange');
    assert.equal(app.state().books.length, 0);
    app.doc.hidden = false; await app.doc.emit('visibilitychange'); await app.flush();
    assert.equal(app.state().phase, 'READY');
    await app.event('pagehide');
    assert.equal(app.state().phase, 'SIGNED_OUT');
    await app.event('pageshow');
    assert.equal(app.state().phase, 'READY');
    app.node('public-catalog-query').value = 'previous account filter';
    await app.context.logout();
    assert.equal(app.state().phase, 'SIGNED_OUT');
    assert.equal(app.node('public-catalog-query').value, '');
    assert.equal(app.node('public-catalog').hidden, true);
    app.controller.back();
    assert.equal(app.state().phase, 'SIGNED_OUT');
  } finally { app.dispose(); }
});

test('server withdrawal and incomplete 25→20 response fail closed without legacy fallback', async () => {
  const app = fixture();
  try {
    await app.boot(); await app.open();
    const good = app.backend.answer;
    app.backend.answer = params => params.action === 'getPublicVocabSectionCandidate' ? {success:false,code:'NOT_AVAILABLE'} : good(params);
    await app.controller.select(scope(app.catalogue));
    assert.equal(app.state().books.length, 0);
    assert.equal(app.state().body, null);
    app.backend.answer = good;
    await app.controller.refresh();
    app.backend.answer = params => {
      if (params.action !== 'getPublicVocabSectionCandidate') return good(params);
      const truncated = body(app.catalogue); truncated.words.length = 20;
      truncated.bodyHash = core.digest(truncated.words.map(core.wordTuple));
      return {success:true,result:truncated};
    };
    await app.controller.select(scope(app.catalogue));
    assert.equal(app.state().error, 'INTEGRITY');
    assert.equal(app.state().body, null);
    assert.equal(app.requests.some(request => request.action === 'getVocabData'), false);
  } finally { app.dispose(); }
});

test('network failure permits an explicit retry; server text is never inserted as markup', async () => {
  const app = fixture();
  try {
    await app.boot();
    app.backend.fail.add('getPublicVocabCatalogCandidate');
    await app.open();
    assert.equal(app.state().phase, 'ERROR');
    app.backend.fail.clear();
    app.catalogue.books[0].name = '<img src=x onerror=alert(1)>';
    app.catalogue.catalogVersion = core.catalogHash(app.catalogue.books);
    await app.controller.refresh();
    assert.equal(app.state().phase, 'READY');
    const button = app.node('public-catalog-results').children[0];
    assert.match(button.textContent, /<img/);
    assert.equal(button.children.length, 0);
    assert.equal(app.doc.querySelectorAll('img[onerror]').length, 0);
  } finally { app.dispose(); }
});

test('private/unpublished books, duplicate identity, wrong revision and corrupted body are rejected', () => {
  for (const change of [book=>book.audience='PRIVATE', book=>book.libraryType='EXAM', book=>book.status='DRAFT']) {
    const value = catalog(); change(value.books[0]); value.catalogVersion = core.catalogHash(value.books);
    assert.throws(() => core.validateCatalog(value), /INTEGRITY/);
  }
  const duplicate = catalog(); duplicate.books.push(clone(duplicate.books[0])); duplicate.catalogVersion = core.catalogHash(duplicate.books);
  assert.throws(() => core.validateCatalog(duplicate), /INTEGRITY/);
  const catalogue = catalog(), query = {...scope(catalogue),catalogVersion:catalogue.catalogVersion};
  for (const change of [value=>value.revisionId='OTHER', value=>value.words[0].word='changed', value=>value.words[1].wordId=value.words[0].wordId]) {
    const value = body(catalogue); change(value);
    assert.throws(() => core.validateBody(value,query,catalogue.books[0].sections[0]), /INTEGRITY/);
  }
});

test('catalog expiry clears a displayed body and refuses a late body after TTL', async () => {
  let now = 0, next = 0;
  const timers = new Map(), context = {TextEncoder,Uint8Array,DataView,AbortController,console,
    setTimeout(fn,ms) { const id = ++next; timers.set(id,{fn,ms}); return id; }, clearTimeout(id) { timers.delete(id); }};
  vm.createContext(context); vm.runInContext(coreText,context);
  const catalogue = catalog(), pending = deferred();
  let held = false;
  const controller = context.PublicCatalog15.create({clock:()=>now,ttlMs:30,timeoutMs:100,
    transport:{catalog:async()=>catalogue,section:()=>held?pending.task:Promise.resolve(body(catalogue))}});
  await controller.enter({subject:'synthetic'});
  await controller.select(scope(catalogue));
  assert.equal(controller.snapshot().phase,'BODY');
  now = 31;
  [...timers.values()].find(timer=>timer.ms===30).fn();
  assert.equal(controller.snapshot().error,'CATALOG_EXPIRED');
  assert.equal(controller.snapshot().body,null);
  assert.equal(controller.snapshot().books.length,0);
  await controller.refresh();
  held = true;
  const selecting = controller.select(scope(catalogue));
  await Promise.resolve();
  now = 62;
  pending.resolve(body(catalogue));
  await selecting;
  assert.equal(controller.snapshot().error,'CATALOG_EXPIRED');
  assert.equal(controller.snapshot().body,null);
  controller.logout();
  assert.equal(timers.size,0);
});
