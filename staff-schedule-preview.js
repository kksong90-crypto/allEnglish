/* Uses only the existing role-validated getMyLearningSchedule API. */
const StaffSchedulePreview = (() => {
  let serial = 0;
  const element = id => document.getElementById(id);
  const permitted = () => !!currentUser && ["admin", "teacher"].includes(String(currentUser.role || "").toLowerCase());
  function clearResult() {
    serial += 1;
    const result = element("staff-schedule-result");
    const status = element("staff-schedule-status");
    const button = element("staff-schedule-query");
    if (result) result.innerHTML = "";
    if (status) status.textContent = "";
    if (button) button.disabled = false;
  }
  function reset() {
    clearResult();
    const panel = element("staff-schedule-preview");
    if (panel) panel.hidden = true;
    for (const id of ["staff-schedule-student-id", "staff-schedule-from-date"]) {
      const input = element(id);
      if (input) input.value = "";
    }
    const range = element("staff-schedule-range");
    if (range) range.value = "three";
  }
  function syncPanel() {
    if (!permitted()) return reset();
    const panel = element("staff-schedule-preview");
    const date = element("staff-schedule-from-date");
    if (panel) panel.hidden = false;
    if (date) {
      date.min = getTodayString();
      if (!date.value || date.value < date.min) date.value = date.min;
    }
  }
  async function load() {
    clearResult();
    const status = element("staff-schedule-status");
    if (!permitted()) {
      reset();
      return;
    }
    const studentId = String(element("staff-schedule-student-id")?.value || "").trim();
    const fromDate = String(element("staff-schedule-from-date")?.value || "");
    const range = normalizeScheduleRange(element("staff-schedule-range")?.value || "three");
    if (!studentId || studentId.length > 100 || /[\s<>]/.test(studentId)) {
      if (status) status.textContent = "운영센터의 정확한 학생 ID를 입력해 주세요.";
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || fromDate < getTodayString() || Number.isNaN(Date.parse(fromDate + "T00:00:00")) || new Date(fromDate + "T00:00:00").getDate() !== Number(fromDate.slice(-2))) {
      if (status) status.textContent = "오늘 이후의 유효한 조회 시작일을 선택해 주세요.";
      return;
    }
    const request = serial;
    const epoch = studentSessionEpoch;
    const button = element("staff-schedule-query");
    if (button) button.disabled = true;
    if (status) status.textContent = "학생 일정을 읽기 조회하는 중입니다…";
    const isCurrent = () => request === serial && epoch === studentSessionEpoch && permitted();
    try {
      const payload = await apiPost({
        action: "getMyLearningSchedule", studentId, fromDate, range,
        days: String(scheduleRangeDays(range)), futureOnly: "Y", includeResults: "N"
      }, API_LONG_TIMEOUT_MS);
      if (!isCurrent()) return;
      if (!payload?.success) throw new Error(payload?.message || "학생 일정을 조회하지 못했습니다.");
      if (String(payload?.student?.studentId || "") !== studentId) throw new Error("요청 학생과 응답 학생이 다릅니다. 이 응답은 표시하지 않습니다.");
      const clean = sanitizeFuturePreparationSchedule(payload);
      const days = (Array.isArray(clean.days) ? clean.days : []).filter(day => String(day.date || "") >= fromDate);
      const result = element("staff-schedule-result");
      if (result) result.innerHTML = `<div class="schedule-summary-card"><b>${escapeHtml(clean.student?.name || "학생")}</b> · ${escapeHtml(clean.student?.className || "")}<br>${escapeHtml(clean.startDate || fromDate)} ~ ${escapeHtml(clean.endDate || "")} · 읽기 전용</div><div class="schedule-card-list">${days.length ? days.map(day => renderScheduleDay(day, {readOnly: true})).join("") : '<div class="schedule-empty">표시할 학습일정이 없습니다.</div>'}</div>`;
      if (status) status.textContent = "읽기 확인 완료. 계획·점수·인쇄 요청은 변경하지 않았습니다.";
    } catch (error) {
      if (isCurrent() && status) status.textContent = error?.message || "학생 일정 조회에 실패했습니다.";
    } finally {
      if (isCurrent() && button) button.disabled = false;
    }
  }
  return {syncPanel, reset, clearResult, load};
})();
