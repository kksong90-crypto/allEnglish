import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('recording/app.js', 'utf8');
const storage = new Map([
  ['allbarun.rec.apiUrl', 'https://example.invalid/exec'],
  ['allbarun.rec.token', 'expired-token'],
]);
const elements = new Map();

function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, {
      id,
      value: '',
      textContent: '',
      className: '',
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
      },
    });
  }
  return elements.get(id);
}

const context = vm.createContext({
  AbortController,
  console,
  confirm: () => true,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  },
  performance,
  navigator: { onLine: true },
  window: { addEventListener: () => {} },
  document: {
    hidden: false,
    addEventListener: () => {},
    getElementById: element,
    querySelectorAll: () => [],
  },
  fetch: async () => ({
    text: async () => JSON.stringify({
      success: false,
      error: { message: '세션이 만료되었습니다. 다시 로그인하세요.' },
    }),
  }),
  setTimeout: () => 1,
  clearTimeout: () => {},
});

new vm.Script(source, { filename: 'recording/app.js' }).runInContext(context);
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));

assert.equal(storage.has('allbarun.rec.token'), false, 'expired token must be removed');
assert.equal(storage.get('allbarun.rec.apiUrl'), 'https://example.invalid/exec', 'API URL must be preserved');
assert.equal(element('api-url').value, 'https://example.invalid/exec');
assert.equal(element('admin-pin').value, '');
assert.equal(element('setup-modal').classList.contains('show'), true, 'login modal must open');
assert.equal(element('setup-title').textContent, '세션 만료 · 다시 로그인');
assert.match(element('setup-note').textContent, /기존 관리자 PIN/);
assert.equal(element('sync-state').textContent, '로그인 필요');

console.log('recording session relogin runtime: PASS');
