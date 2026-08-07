/* Allbarun Student Sync Layer v6.3.2
 * Refreshes stale server-backed data without logout/relogin.
 * Existing login, favorites and in-progress point tests are preserved.
 * Staff preview and Guest sessions never overwrite the signed-in account profile.
 */
(() => {
  'use strict';

  const VERSION = '6.3.2-AUTO-SYNC-ROLE-SAFE';
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
    return loggedIn() ? String(currentUser.role || '').trim().toLowerCase() : '';
  }

  function isStaff() {
    return ['admin', 'teacher'].includes(currentRole());
  }

  function previewStudent() {
    return window.__allbarunPreviewStudent || null;
  }

  function canRefreshStudentSchedule() {
    const role = currentRole();
    if (role === 'student') return true;
    if (isStaff()) return !!(previewStudent() && previewStudent().studentId);
    return false;
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

  function syncProfileFromSchedule(payload) {
    // Only a real STUDENT session may refresh its own cached name/class.
    // ADMIN/TEACHER preview responses and GUEST-linked students must never
    // mutate the signed-in account identity.
    if (currentRole() !== 'student' || !payload || !payload.student || !loggedIn()) return false;
    const student = payload.student;
    let changed = false;

    if (student.name && student.name !== currentUser.name) {
      currentUser.name = student.name;
      changed = true;
    }
    if (student.className !== undefined && student.className !== null && student.className !== currentUser.className) {
      currentUser.className = student.className || '';
      changed = true;
    }

    if (changed) {
      try { saveUserSession(currentUser); } catch (_) {}
      try { updateUserLabel(); } catch (_) {}
    }
    return changed;
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
    if (!loggedIn() || !canRefreshStudentSchedule()) return;
    await safe('schedule', async () => {
      const payload = await fetchMyLearningSchedule('upcoming', force);
      syncProfileFromSchedule(payload);
      renderHomeLearningPreview(payload);

      if (typeof myScheduleLoadedOnce !== 'undefined' && myScheduleLoadedOnce) {
        const activePayload = await fetchMyLearningSchedule(
          typeof myScheduleCurrentRange !== 'undefined' ? myScheduleCurrentRange : 'week',
          force
        );
        syncProfileFromSchedule(activePayload);
        myScheduleLastPayload = activePayload;
        renderMySchedule(activePayload);
      }
      return payload;
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
    const daySelect = document.getElementById('vocab-day-select');
    if (oldBook && bookSelect && [...bookSelect.options].some(opt => opt.value === oldBook)) {
      bookSelect.value = oldBook;
      await loadVocabDays();
      if (oldDay && daySelect && [...daySelect.options].some(opt => opt.value === oldDay)) {
        daySelect.value = oldDay;
        showVocabList();
      }
    }
  }

  async function refreshActiveTab(force = false) {
    if (!loggedIn() || pointTestInProgress()) return;
    const tab = typeof getActiveTabId === 'function' ? getActiveTabId() : 'home';

    if (tab === 'retest' && (force || due('retest', TTL.retest))) {
      await safe('retest', () => loadRetest());
      if (typeof retestLoadedOnce !== 'undefined') retestLoadedOnce = true;
    } else if (tab === 'vocab' && (force || due('vocab', TTL.vocab))) {
      await safe('vocab', () => refreshVocab());
    } else if (tab === 'point' && currentRole() === 'student' && (force || due('point', TTL.point))) {
      await safe('point', () => loadPointHome());
      if (typeof pointLoadedOnce !== 'undefined') pointLoadedOnce = true;
    } else if (tab === 'pointRank' && currentRole() === 'student' && (force || due('ranking', TTL.ranking))) {
      await safe('ranking', () => loadPointRanking());
      if (typeof pointRankingLoaded !== 'undefined') pointRankingLoaded = true;
    } else if (tab === 'exam' && canRefreshStudentSchedule() && (force || due('schedule', TTL.schedule))) {
      await safe('schedule', async () => {
        await loadMySchedule(
          typeof myScheduleCurrentRange !== 'undefined' ? myScheduleCurrentRange : 'week',
          true
        );
        return true;
      });
    }
  }

  async function refreshEssential(force = false, notify = false) {
    if (!loggedIn() || pointTestInProgress()) return;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const jobs = [];
      if (force || due('content', TTL.content)) jobs.push(refreshContent(true));
      if (canRefreshStudentSchedule() && (force || due('schedule', TTL.schedule))) jobs.push(refreshSchedule(true));
      await Promise.allSettled(jobs);
      await refreshActiveTab(force);
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
