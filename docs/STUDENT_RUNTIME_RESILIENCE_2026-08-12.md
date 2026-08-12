# 학생웹 v6.6.2 런타임 복원력 보완

## 범위

- 루트 학생웹 `index.html`만 변경한다.
- Student API 배포 주소와 API 계약 버전은 변경하지 않는다.
- 저장소의 `recording/` PWA와 Apps Script 배포는 변경하지 않는다.

## 변경 내용

1. 읽기 요청 제한 시간을 15초에서 20초로 분리하고, 시간 초과·네트워크 오류·408·429·5xx에만 600ms 뒤 한 번 재시도한다.
2. `getMyPointSummary` 동시 요청을 하나의 진행 중 Promise로 합친다.
3. 세션 만료 또는 로그아웃 시 인증 사용자 화면을 즉시 숨기고 개인 DOM과 입력 상태를 초기화한다.
4. 로그아웃 API 응답을 기다리기 전에 로컬 세션과 개인 화면을 닫는다.
5. 이전 계정의 늦은 포인트 응답과 답안 제출 응답이 새 계정 상태를 바꾸지 못하도록 세션 세대와 제출 일련번호를 확인한다.

## 안전 경계

- POST 제한 시간은 기존 15초를 유지한다.
- POST 요청은 자동 재시도하지 않는다.
- 인증 토큰 전송 방식은 기존 계약을 유지한다.
- 배포 및 실데이터 변경은 이 변경에 포함하지 않는다.

## 확인

```powershell
node tests/student_runtime_resilience_contract.mjs
node tests/student_web_contract.mjs
node tests/student_auto_sync_contract.mjs
node tests/student_auto_sync_runtime.mjs
node tests/point_ranking_positive_only.js .
```
