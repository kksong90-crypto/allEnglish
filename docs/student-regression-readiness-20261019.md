# 학생웹앱 잔여 회귀검사 정리 — 2026-10-19

## 기준과 변경 범위
기준 main: d756e84c1ade5ac41fadf241bf4a34c25af2c6cd(PR46).
이번 변경은 테스트 환경·CI·문서만 수정한다. index.html, student-shell.css, app-auto-update.js, 관리자 조회 모듈, 녹음/Quick 코드, 이미지, manifest, Apps Script/API/계획 데이터는 수정하지 않는다.

## 이전 실패 10개 원인
|구분|건수|원인 및 복구|
|---|---:|---|
|관리자 조회|7|실제 GET 어댑터 대신 구형 apiPost만 가로채던 fixture, 누락된 URLSearchParams·설정 URL·인증 처리 도우미, 인증용 token 접근 자체를 금지하던 과거 소스 검사|
|선택 구간 단어장 실험 경로|3|실제 GET 경로 대신 apiGet에만 연결된 fixture, 누락된 사용자/URL/타임아웃/검색 입력칸|

테스트 응답 데이터와 실제 기능 코드를 바꾸어 통과시킨 것이 아니다. 현재 전송 경로를 fixture가 가로채도록 맞췄으며 기존 권한·오류·읽기 전용·타임아웃·취소·부분 결과 차단·전체 단어표로의 임의 대체 금지·계측 개인정보 제외 검사를 유지했다.
인증 토큰은 실제 조회 요청에 필요하므로 `.token` 문자열 금지 대신 설정된 GET 주소/메서드/본문 없음/화면 미노출을 검사한다. 추가로 허용되지 않은 쓰기 action이 네트워크 전에 거부되는지 검사한다. 모든 토큰과 학생 정보는 합성 값이며 실제 API를 호출하지 않는다.

## 실행과 CI
```
node scripts/check-student-web.mjs
TZ=Asia/Seoul node --test tests/app-auto-update.test.mjs
```
- 26개 portable 모듈, 199개 검사 PASS / 실패 0 / 건너뜀 0.
- Asia/Seoul 자동 갱신 검사 30 PASS(위 전체 검사와 중복되는 시간대 별도 실행).
- 주요 JS/서비스워커 구문 검사 포함. 현재 동작과 과거 실패 목록 비교로 통과시키던 예외는 제거했다.
- Web safety CI는 전체 portable 검사를 반드시 통과해야 한다. 계획/갱신 CI의 관련 131개 검사와 시간대 검사는 유지한다.
- 의도적으로 실패하는 임시 검사를 추가해 종료 코드 1로 차단됨을 확인한 뒤 임시 파일을 제거했다. 이후 정상 199개가 다시 통과했다.
- `recording-ui-fixture.mjs`는 다른 테스트에서 사용하는 helper이며 독립 테스트가 아니다.
- 과거 `student_score_report_visual.mjs`는 Windows 전용 절대 경로와 Chrome을 요구하는 별도 시각 검사로 portable 명령에 포함하지 않는다. 실행하지 않은 사실과 이유를 명령 출력에 표시한다.

## 검증의 한계
199개 통과는 합성 회귀검사 결과이다. 실제 학생 폰의 로그인·설치 앱·통신 속도·키보드·시험 저장·녹음을 검증했다는 의미가 아니다.
PR46의 화면/파일/자동 갱신 확인 이력은 student-optimization-completion-20261018.md와 PR46에 있다.

## 반영·복구
브랜치 test/student-regression-cleanup-20261019에서 PR을 생성하고 두 CI 성공을 확인한 뒤 병합한다.
롤백은 해당 PR만 새 PR로 revert하면 된다. 운영 코드나 데이터 복구는 필요 없다.
이전 문서의 '실패 10개'는 당시 결과이며, 이번 테스트 환경 복구 및 CI 검증 결과가 최신 상태이다.
