/* Uses the existing administrator session; no student sign-in or operational writes. */
const AdminClassSchedule = (() => {
  let serial = 0;
  let directoryKey = '';
  let directoryRequest = null;
  const el = id => document.getElementById(id);
  const permitted = () => !!currentUser && String(currentUser.role || '').toLowerCase() === 'admin';
  const status = text => { if (el('admin-class-status')) el('admin-class-status').textContent = text; };
  function clearResult() {
    serial += 1;
    if (el('admin-class-result')) el('admin-class-result').innerHTML = '';
    if (el('admin-class-query')) el('admin-class-query').disabled = false;
    if (el('admin-class-cancel')) el('admin-class-cancel').hidden = true;
    status('');
  }
  function reset() {
    clearResult(); directoryKey = ''; directoryRequest = null;
    if (el('admin-class-panel')) el('admin-class-panel').hidden = true;
    if (el('admin-class-select')) el('admin-class-select').innerHTML = '<option value="">반 목록을 불러오세요</option>';
    if (el('admin-class-from')) el('admin-class-from').value = '';
  }
  function syncPanel() {
    if (!permitted()) return reset();
    el('admin-class-panel').hidden = false;
    el('admin-class-from').min = getTodayString();
    if (!el('admin-class-from').value || el('admin-class-from').value < getTodayString()) el('admin-class-from').value = getTodayString();
  }
  function options() {
    const fromDate = el('admin-class-from').value;
    const range = el('admin-class-range').value;
    const parsed = new Date(fromDate + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fromDate || fromDate < getTodayString()) throw new Error('오늘 이후의 유효한 시작일을 선택하세요.');
    if (!['today','week','three'].includes(range)) throw new Error('조회 기간을 선택하세요.');
    return {fromDate, range};
  }
  async function loadDirectory(force = false) {
    if (!permitted()) return reset();
    syncPanel();
    let opt;
    try {opt = options();} catch (error) {clearResult(); status(error.message); return;}
    const key = JSON.stringify(opt), epoch = studentSessionEpoch;
    if (!force && directoryKey === key) return;
    if (!force && directoryRequest?.key === key && directoryRequest.epoch === epoch) return directoryRequest.promise;
    clearResult(); const request = serial;
    const isCurrent = () => request === serial && epoch === studentSessionEpoch && permitted();
    el('admin-class-query').disabled = true;
    status('반 목록을 읽는 중입니다…');
    const promise = (async () => {
      try {
        const data = await apiPost({action:'getStaffScheduleDirectory', ...opt}, API_LONG_TIMEOUT_MS);
        if (!isCurrent()) return;
        if (!data?.success || !data.readOnly || data.startDate !== opt.fromDate || !Array.isArray(data.classes)) throw new Error(data?.message || '반 목록 응답을 확인하지 못했습니다.');
        const previous = el('admin-class-select').value;
        el('admin-class-select').innerHTML = '<option value="">반 선택</option>' + data.classes.map(c => `<option value="${escapeHtml(c.classId)}">${escapeHtml(c.className)} · ${Number(c.studentCount) || 0}명</option>`).join('');
        if (data.classes.some(c => c.classId === previous)) el('admin-class-select').value = previous;
        directoryKey = key;
        status(`${data.classes.length}개 반 확인. 반을 선택해 일정을 조회하세요.`);
      } catch (error) {
        if (isCurrent()) {directoryKey = ''; el('admin-class-select').innerHTML = '<option value="">반 목록 조회 실패</option>'; status(error.message || '반 목록을 읽지 못했습니다.');}
      } finally {
        if (isCurrent()) el('admin-class-query').disabled = false;
        if (directoryRequest?.promise === promise) directoryRequest = null;
      }
    })();
    directoryRequest = {key, epoch, promise};
    return promise;
  }
  function invalidateDirectory() {directoryKey = ''; clearResult();}
  async function open(range = 'week', force = false) {
    if (!permitted()) return;
    syncPanel();
    const normalized = normalizeScheduleRange(range);
    if (el('admin-class-range').value !== normalized) {el('admin-class-range').value = normalized; invalidateDirectory();}
    for (const id of ['exam-table','schedule-summary-view']) if (el(id)) el(id).innerHTML = '';
    await loadDirectory(force);
  }
  async function load() {
    clearResult(); if (!permitted()) return reset();
    const request = serial, epoch = studentSessionEpoch;
    const isCurrent = () => request === serial && epoch === studentSessionEpoch && permitted();
    try {
      const opt = options(), classId = el('admin-class-select').value;
      if (!classId) throw new Error('반을 선택하세요.');
      el('admin-class-query').disabled = true; el('admin-class-cancel').hidden = false;
      let offset = 0, revision = '', total = null;
      const entries = [], seen = new Set();
      while (isCurrent()) {
        status(`반 전체 일정을 읽는 중… ${entries.length}${total === null ? '' : '/' + total}명`);
        const data = await apiPost({action:'getStaffClassLearningSchedule', ...opt, classId, offset:String(offset), revision}, API_LONG_TIMEOUT_MS);
        if (!isCurrent()) return;
        if (!data?.success) throw new Error(data?.message || '반 일정을 읽지 못했습니다.');
        if (!data.readOnly || data.classId !== classId || data.startDate !== opt.fromDate || data.range !== opt.range || data.offset !== offset || !Array.isArray(data.entries) || data.entries.length > 8 || !data.revision || (revision && data.revision !== revision)) throw new Error('조회 대상 또는 계획 버전이 다른 응답입니다. 다시 조회하세요.');
        if (!Number.isInteger(data.totalStudents) || data.totalStudents < 0 || data.totalStudents > 10000 || (total !== null && total !== data.totalStudents)) throw new Error('반 명단 응답이 일치하지 않습니다.');
        total = data.totalStudents; revision = data.revision;
        for (const entry of data.entries) {
          if (!entry.student?.studentId || entry.student.classId !== classId || seen.has(entry.student.studentId) || !Array.isArray(entry.days) || entry.days.some(d => d.classId !== classId || d.date < opt.fromDate || d.date > data.endDate)) throw new Error('반 명단 또는 날짜가 다른 응답입니다.');
          seen.add(entry.student.studentId); entries.push(entry);
        }
        if (data.nextOffset !== offset + data.entries.length || data.hasMore !== (data.nextOffset < total) || (data.hasMore && data.nextOffset <= offset)) throw new Error('반 일정 조회가 진행되지 않았습니다.');
        offset = data.nextOffset;
        if (!data.hasMore) break;
      }
      if (!isCurrent()) return;
      if (entries.length !== total) throw new Error('반 전체 조회가 완료되지 않았습니다.');
      el('admin-class-result').innerHTML = entries.length ? entries.map(entry => {
        const clean = sanitizeFuturePreparationSchedule({days:entry.days}, opt.fromDate);
        const days = clean.days.filter(d => d.hasPlan || d.scheduled || d.closed);
        return `<details class="admin-student-schedule"><summary>${escapeHtml(entry.student.name)} · ${escapeHtml(entry.student.className)}</summary><div class="schedule-card-list">${days.length ? days.map(d=>renderScheduleDay(d,{readOnly:true})).join('') : '<div class="schedule-empty">표시할 학습일정이 없습니다.</div>'}</div></details>`;
      }).join('') : '<div class="schedule-empty">이 기간에 배정된 재원 학생이 없습니다.</div>';
      status(`반 전체 ${entries.length}명 일정 확인 완료 · 읽기 전용. 학생 로그인·계획·점수·인쇄 요청은 변경하지 않았습니다.`);
    } catch (error) {
      if (isCurrent()) {el('admin-class-result').innerHTML = ''; status(error.message || '전체 일정 조회 실패');}
    } finally {
      if (isCurrent()) {el('admin-class-query').disabled = false; el('admin-class-cancel').hidden = true;}
    }
  }
  function cancel() {clearResult(); status('조회를 중단했습니다. 서버에 쓰기 작업을 요청하지 않았습니다.');}
  return {syncPanel, reset, open, loadDirectory, load, clearResult, invalidateDirectory, cancel};
})();
