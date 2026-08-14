/* Allbarun Student Sync Layer v6.5.2
 * Refreshes stale server-backed data without logout/relogin.
 * Existing login, favorites and in-progress point tests are preserved.
 * Only a real student session refreshes student-scoped learning data.
 */
(() => {
  'use strict';

  const VERSION = '6.5.2-AUTO-SYNC-ROLE-SAFE';
  const RETURN_REFRESH_AFTER_MS = 45 * 1000;
  const TTL = {
    content: 60 * 1000,
    schedule: 60 * 1000,
    retest: 60 * 1000,
    point: 60 * 1000,
    ranking: 2 * 60 * 1000,
    vocab: 5 * 60 * 1000
  };

  const stamps = Object.create(null);
  let lastVisibleAt = Date.now();
  let refreshPromise = null;

  function loggedIn() {
    return !!(typeof currentUser !== 'undefined' && currentUser && currentUser.token);
  }

  function currentRole() {
    if (!loggedIn()) return '';
    const role = String(currentUser.role || '').trim().toLowerCase();
    return role || (currentUser.studentId ? 'student' : '');
  }

  function canRefreshStudentData() {
    return currentRole() === 'student';
  }

  function pointTestInProgress() {
    return !!(typeof currentPointTest !== 'undefined' && currentPointTest && currentPointTest.testId);
  }

  function due(key, ttl) {
    return !stamps[key] || Date.now() - stamps[key] >= ttl;
  }

  function mark(key) {
    stamps[key] = Date.now();
  }

  async function safe(label, fn) {
    try {
      const value = await fn();
      mark(label);
      return value;
    } catch (err) {
      console.warn(`[${VERSION}] ${label} refresh failed`, err);
      return null;
    }
  }

  async function refreshContent(force = true) {
    if (!loggedIn()) return;
    await safe('content', async () => {
      const payload = await loadHomeText(force);
      await loadNotice();
      return payload;
    });
  }

  async function refreshSchedule(force = true) {
    if (!loggedIn() || !canRefreshStudentData()) return;
    await safe('schedule', async () => {
      const activeTab = typeof getActiveTabId === 'function' ? getActiveTabId() : 'home';
      const scheduleScreenLoaded =
        activeTab === 'exam' ||
        (typeof myScheduleLoadedOnce !== 'undefined' && myScheduleLoadedOnce);

      // Use the v6.5.1 request-serial/session-epoch guarded loaders. This avoids
      // a late response from a previous login overwriting the current student.
      if (scheduleScreenLoaded) {
        await loadMySchedule(
          typeof myScheduleCurrentRange !== 'undefined' ? myScheduleCurrentRange : 'week',
          force
        );
      } else {
        await loadHomeLearningPreview(force);
      }
      return true;
    });
  }

  async function refreshVocab() {
    if (!loggedIn()) return;
    const oldBook = document.getElementById('vocab-book-select')?.value || '';
    const oldDay = document.getElementById('vocab-day-select')?.value || '';

    // loadVocabBooks() attaches change listeners. Replace selects first so
    // repeated refreshes never accumulate duplicate handlers.
    ['vocab-book-select', 'vocab-day-select'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.replaceWith(el.cloneNode(true));
    });

    await loadVocabBooks();
    if (typeof vocabLoadedOnce !== 'undefined') vocabLoadedOnce = true;

    const bookSelect = document.getElementById('vocab-book-select');
    if (oldBook && bookSelect && [...bookSelect.options].some(opt => opt.value === oldBook)) {
      bookSelect.value = oldBook;
      await loadVocabDays();
      const daySelect = document.getElementById('vocab-day-select');
      if (oldDay && daySelect && [...daySelect.options].some(opt => opt.value === oldDay)) {
        daySelect.value = oldDay;
        showVocabList();
      }
    }
  }

  async function refreshActiveTab(force = false, scheduleAlreadyRefreshed = false) {
    if (!loggedIn() || pointTestInProgress()) return;
    const tab = typeof getActiveTabId === 'function' ? getActiveTabId() : 'home';

    if (tab === 'retest' && canRefreshStudentData() && (force || due('retest', TTL.retest))) {
      await safe('retest', () => loadRetest());
      if (typeof retestLoadedOnce !== 'undefined') retestLoadedOnce = true;
    } else if (tab === 'vocab' && (force || due('vocab', TTL.vocab))) {
      await safe('vocab', () => refreshVocab());
    } else if (tab === 'point' && canRefreshStudentData() && (force || due('point', TTL.point))) {
      await safe('point', () => loadPointHome());
      if (typeof pointLoadedOnce !== 'undefined') pointLoadedOnce = true;
    } else if (tab === 'pointRank' && canRefreshStudentData() && (force || due('ranking', TTL.ranking))) {
      await safe('ranking', () => loadPointRanking());
      if (typeof pointRankingLoaded !== 'undefined') pointRankingLoaded = true;
    } else if (
      tab === 'exam' &&
      canRefreshStudentData() &&
      !scheduleAlreadyRefreshed &&
      (force || due('schedule', TTL.schedule))
    ) {
      await refreshSchedule(true);
    } else if (tab === 'report' && canRefreshStudentData() && force && typeof loadMyScoreReport === 'function') {
      await safe('report', () => loadMyScoreReport(true));
    }
  }

  async function refreshEssential(force = false, notify = false) {
    if (!loggedIn() || pointTestInProgress()) return;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const jobs = [];
      let scheduleQueued = false;
      if (force || due('content', TTL.content)) jobs.push(refreshContent(true));
      if (canRefreshStudentData() && (force || due('schedule', TTL.schedule))) {
        jobs.push(refreshSchedule(true));
        scheduleQueued = true;
      }
      await Promise.allSettled(jobs);
      await refreshActiveTab(force, scheduleQueued);
      if (notify && typeof showAppToast === 'function') showAppToast('최신 정보로 갱신했습니다.');
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  function addRefreshButton() {
    const actions = document.querySelector('.top-user-buttons');
    if (!actions || document.getElementById('allbarun-refresh-button')) return;
    const button = document.createElement('button');
    button.id = 'allbarun-refresh-button';
    button.type = 'button';
    button.textContent = '↻ 최신정보';
    button.title = '로그아웃하지 않고 최신 정보를 다시 불러옵니다.';
    button.addEventListener('click', () => refreshEssential(true, true));
    actions.insertBefore(button, actions.firstChild);
  }

  function installTabRefreshHook() {
    if (typeof showTab !== 'function' || showTab.__autoSyncWrapped) return;
    const original = showTab;
    const wrapped = function() {
      const result = original.apply(this, arguments);
      setTimeout(() => refreshActiveTab(false), 0);
      return result;
    };
    wrapped.__autoSyncWrapped = true;
    showTab = wrapped;
  }

  function installLoginHook() {
    if (typeof afterLogin !== 'function' || afterLogin.__autoSyncWrapped) return;
    const original = afterLogin;
    const wrapped = function() {
      const result = original.apply(this, arguments);
      addRefreshButton();
      setTimeout(() => refreshEssential(true, false), 700);
      return result;
    };
    wrapped.__autoSyncWrapped = true;
    afterLogin = wrapped;
  }

  function onReturnToApp() {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    const awayFor = now - lastVisibleAt;
    lastVisibleAt = now;
    if (awayFor >= RETURN_REFRESH_AFTER_MS) refreshEssential(false, false);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastVisibleAt = Date.now();
      return;
    }
    onReturnToApp();
  });

  window.addEventListener('focus', () => {
    if (Date.now() - lastVisibleAt >= RETURN_REFRESH_AFTER_MS) onReturnToApp();
  });

  window.addEventListener('pageshow', () => {
    addRefreshButton();
    installTabRefreshHook();
    installLoginHook();
    setTimeout(() => refreshEssential(false, false), 500);
  });

  function boot() {
    addRefreshButton();
    installTabRefreshHook();
    installLoginHook();
    document.documentElement.dataset.allbarunSyncVersion = VERSION;
    if (loggedIn()) setTimeout(() => refreshEssential(true, false), 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
