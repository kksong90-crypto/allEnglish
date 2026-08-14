# 학생웹 전용 릴리스 분리 기록

기준: `origin/agent/student-web-runtime-resilience` (`ae2ee0f`)

## 목적

학생웹 적층 PR #6→#8에 함께 포함된 녹음체크 변경을 분리해, 학생웹 배포가 녹음체크를 동시에 바꾸지 않도록 한다.

## 분리 방식

- 학생웹·VOCA·학생 자동동기화·런타임 복원력·포인트 랭킹 변경은 유지한다.
- 다음 녹음 전용 파일은 `origin/main`과 동일하게 복원한다.
  - `recording/*`
  - `docs/RECORDING_V820_STAGING_CANDIDATE_2026-08-02.md`
  - `previews/RECORDING_V820_PREVIEW_2026-08-02.html`
  - `tests/recording_web_contract.mjs`
- `quick/app.js`의 기능 변경은 포함하지 않고, 공개 main에 남은 실제 학생 이름 예시만 가상 이름으로 치환한다.

## 로컬 미커밋 작업 보존 확인

기존 `student-web-6.5.2-auto-sync-20260809`의 미커밋 변경을 읽기 전용으로 비교했다.

- 배정된 숫자 Day 범위만 “내 학습”에서 여는 기능: PR #8에 이미 더 완전한 형태로 포함
- 관련 계약·런타임 테스트: PR #8에 추가 시나리오까지 포함
- 가상 학생 테스트 ID: 포함
- 가상화된 학생웹 미리보기 PNG: SHA-256 동일
- 녹음 미리보기·quick 예시 가상화: 녹음 기능은 제외하되 quick의 개인정보 제거 1줄만 포함

기존 dirty worktree는 수정·reset·checkout하지 않았다.

## 안전성

- 알려진 실제 학생 이름·ID 패턴: 0건
- 비밀키·token 상수 패턴: 0건
- CoreDB·Apps Script·실데이터 변경: 없음
- main 병합·GitHub Pages 배포: 없음

## 운영 전 남은 절차

1. 학생웹 테스트 전체 통과
2. main 대비 변경 파일 목록 검토
3. 모바일·데스크톱 미리보기 승인
4. 별도 Draft PR 공개 승인
5. Student API 6.5.1 운영 준비 후 배포 순서 확정
