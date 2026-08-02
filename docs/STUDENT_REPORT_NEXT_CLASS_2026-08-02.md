# 학생웹 내 성적·다음 수업 안전 패치

화면 버전: `6.5.1-NEXT-LESSON-SAFETY`  
Student API 후보: `6.4.1-NEXT-LESSON-SAFETY`

## 반영 내용

- 일반 학생웹과 STAGING 학생웹 모두에 `내 성적` 메뉴와 본인 전용 리포트를 동일하게 제공한다.
- 성적 API는 URL 쿼리가 아닌 POST 본문으로 로그인 토큰을 전송한다.
- 요청의 `studentId`는 사용하지 않고 로그인 세션의 학생ID만 조회한다.
- 시험명은 `학교 · 학년 · 학기 · 중간/기말` 순서로 표시한다.
- 학교 석차는 `등수/응시인원`으로 표시하고, 내부 비교 순위는 `학원 입력학생 순위`라고 정확히 구분한다.
- 내부 비교 집단은 `시험 + 학교 + 학년`이 모두 같은 성적만 포함한다.
- 다음 수업에는 단어·듣기·Quiz·숙제 네 항목을 항상 확인할 수 있으며, 비어 있으면 `범위 등록 대기`, `등록된 내용 없음`, `면제`로 구분한다.
- 과제는 배정일과 제출일에 중복 노출하지 않고 제출 수업일에만 표시한다.
- 공개 Assignment를 우선하고 없을 때만 공개 ClassDailyPlan을 보완값으로 사용한다.
- DRAFT·학생 비공개 과제와 계획은 노출하지 않는다.
- 방학일은 Quiz·숙제를 숨기고, 듣기는 AcademyCalendar의 정책과 `preserve_on_closure`를 함께 따른다.
- 로그아웃·재로그인 중 늦게 도착한 이전 학생 응답은 화면에 반영하지 않는다.

## 변경하지 않은 것

- CoreDB 스키마 변경 없음
- 실제 학생·성적·수업 데이터 변경 없음
- Drive 파일 또는 권한 변경 없음
- Apps Script 배포 없음
- GitHub main 변경 없음

## 검증

- `tests/student_web_contract.mjs`: 일반·STAGING 화면 기능 및 JavaScript 구문 검사
- `../student-api-learning-plan/test_next_lesson_safety.mjs`: 일정 공개 우선순위, 방학 정책, 본인 전용 성적, 동일 학교·학년 비교 집단 검사
- 데스크톱 미리보기: `previews/STUDENT_WEB_SCORE_NEXT_CLASS_PREVIEW_2026-08-02.html`, `.png`
- 모바일 390×844 확인: `previews/STUDENT_WEB_SCORE_NEXT_CLASS_PREVIEW_MOBILE_VIEWPORT_2026-08-02.png`
- 데스크톱·모바일 모두 가로 넘침 없음 확인
