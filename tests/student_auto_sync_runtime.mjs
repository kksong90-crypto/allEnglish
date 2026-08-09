import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const syncSource = fs.readFileSync(new URL('../sync-layer.js', import.meta.url), 'utf8');

function makeHarness({ role, tab = 'home', pointTest = null }) {
  const calls = { content: 0, notice: 0, homeSchedule: 0, fullSchedule: 0 };
  const timers = [];
  const documentListeners = {};
  const windowListeners = {};
  const actions = {
    firstChild: null,
    inserted: null,
    insertBefore(button) { this.inserted = button; this.firstChild = button; }
  };

  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    documentElement: { dataset: {} },
    querySelector(selector) { return selector === '.top-user-buttons' ? actions : null; },
    getElementById(id) { return id === 'allbarun-refresh-button' ? actions.inserted : null; },
    createElement() {
      return {
        listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; }
      };
    },
    addEventListener(type, handler) { documentListeners[type] = handler; }
  };

  const context = vm.createContext({
    console,
    Date,
    Promise,
    document,
    window: {
      __allbarunPreviewStudent: null,
      addEventListener(type, handler) { windowListeners[type] = handler; }
    },
    setTimeout(handler) { timers.push(handler); return timers.length; },
    clearTimeout() {},
    currentUser: { token: 'token', role, studentId: role === 'student' ? 'TEST-STUDENT-001' : '' },
    currentPointTest: pointTest,
    myScheduleLoadedOnce: tab === 'exam',
    myScheduleCurrentRange: 'week',
    loadHomeText: async () => { calls.content += 1; return {}; },
    loadNotice: async () => { calls.notice += 1; },
    loadHomeLearningPreview: async () => { calls.homeSchedule += 1; },
    loadMySchedule: async () => { calls.fullSchedule += 1; },
    loadRetest: async () => {},
    loadVocabBooks: async () => {},
    loadVocabDays: async () => {},
    showVocabList: () => {},
    loadPointHome: async () => {},
    loadPointRanking: async () => {},
    loadMyScoreReport: async () => {},
    getActiveTabId: () => tab,
    showAppToast: () => {},
    showTab: () => {},
    afterLogin: () => {}
  });

  vm.runInContext(syncSource, context);

  async function drainTimers() {
    while (timers.length) {
      const batch = timers.splice(0);
      await Promise.allSettled(batch.map(handler => handler()));
      await Promise.resolve();
    }
  }

  async function clickRefresh() {
    const handler = actions.inserted?.listeners?.click;
    assert.equal(typeof handler, 'function', 'manual refresh handler missing');
    await handler();
    await Promise.resolve();
  }

  return { context, calls, actions, drainTimers, clickRefresh };
}

{
  const harness = makeHarness({ role: 'teacher', tab: 'exam' });
  const identityBefore = JSON.stringify(harness.context.currentUser);
  await harness.drainTimers();
  assert.equal(harness.calls.content, 1, 'staff may refresh public content');
  assert.equal(harness.calls.homeSchedule + harness.calls.fullSchedule, 0, 'staff session must not refresh student schedule');
  assert.equal(JSON.stringify(harness.context.currentUser), identityBefore, 'staff identity changed');
}

{
  const harness = makeHarness({ role: 'student', tab: 'exam' });
  await harness.drainTimers();
  assert.equal(harness.calls.fullSchedule, 1, 'student schedule should refresh once at boot');
  harness.calls.content = 0;
  harness.calls.fullSchedule = 0;
  await harness.clickRefresh();
  assert.equal(harness.calls.content, 1, 'manual refresh should refresh content once');
  assert.equal(harness.calls.fullSchedule, 1, 'manual refresh must not duplicate the schedule request');
}

{
  const harness = makeHarness({ role: 'student', tab: 'exam', pointTest: { testId: 'active-test' } });
  await harness.drainTimers();
  await harness.clickRefresh();
  assert.deepEqual(harness.calls, { content: 0, notice: 0, homeSchedule: 0, fullSchedule: 0 }, 'point test in progress must block refresh');
}

console.log(JSON.stringify({ ok: true, scenarios: 3 }, null, 2));
