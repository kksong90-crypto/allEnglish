# STAGING35: 녹음 체크 즉시 집계와 저장 단계 구분

확인 시각: 2026-11-14 00:49 KST. 공개 immutable35 / UI8.2.22-PENDING-FEEDBACK. 되돌림34. 운영38은 변경하지 않았다.

## 사용자에게 달라지는 점

체크한 직후 반별·전체 제출 수와 진행률을 바꾼다. 서버 응답을 기다리는 동안 “제출 · 저장 중”, “변경 N명 저장 중”과 노란 진행률로 표시한다. 전원이 체크돼 보여도 저장 응답 전에는 “전원 제출 완료”를 표시하지 않는다. 서버가 거절하면 해당 학생만 확정 상태로 되돌리고, 다른 학생의 성공한 체크는 유지한다.

이 변경은 체감 반응 개선이다. 서버 저장 확정 시간을 더 줄였다는 측정이나 주장이 아니다. 최근34의 저장 경로·감사·개인 범위/면제 정책은 그대로다.

## 구현 경계

- 기기 저장소에 변경을 보관하는 데 성공한 뒤에만 임시 집계를 등록한다. 기기 보관 실패 시 요청도 집계 변경도 없다.
- 확인된 APP.data/캐시와 임시 표시 Map을 분리한다. 날짜·반·학생 식별자를 대조하며 유효하지 않은 명단에서는 확정 집계를 사용한다.
- 일부 응답에 전체 묶음의 집계가 포함돼도 다른 학생을 중복 가산하지 않는다. 실패·불확실 응답 시 기존 검토/복구 저널을 유지한다.
- 반 목록 DOM을 재생성하지 않고 집계만 갱신한다. 기존 학생별 저장 잠금·요청 ID·revision·재시도 정책은 유지한다.
- 배포35의 Code.gs는34와 바이트 단위 동일하다. IntegratedStaging.html만 변경했다. endpoint bootstrap, 배포 URL, 권한, PIN, 트리거, DB 구조 변경 없음.

## 검증

화면 Node 검사122/122 통과. 새10검사는 즉시 해제 집계,30명 저장 중 완료 표시 차단, 부분 성공/해제, 날짜/명단 경계, 저장 거절, 응답 유실, 기기 보관 실패, 두 학생 중 한 명 거절 시 성공 보존을 다룬다. 백엔드는 변경하지 않았으며 직전29검사 결과를 재사용한다.

실제 공개35에서 합성 학생1을 해제하자 즉시1/2·50%와 저장 중 표시가 관찰됐다. 그 뒤 새로고침한 화면에서 학생1 해제·학생2 체크와1/2를 확인했다. UI 캡처/호출 간격이 있어 서버 쓰기 완료 전에 재시작했다고 단정하지 않는다. 재체크 직후2/2·100%이면서 “변경 1명 저장 중”을 확인했고, 서버 확인 후에만 “전원 제출 완료”로 전환했다. 다시 재실행해 활성 체크2개와100%를 확인했다.

복원 검증 중 이전 충돌 안내 토스트가 잠시 남아 보였다. 이후 저장 완료·재실행 결과와 DB를 별도로 대조했으며, 해당 안내 문구의 표시 수명은 이번 변경 대상에 포함하지 않았다.

별도 DB 조회: RecordingChecks328/329는 RECEIVED, revision78/56. 기존 범위 `["RECQA_20261112_TP1"]`, “검증용 Day 1”, 빈 메모를 보존했다. 실제 학생 행은 변경하지 않았다.

## 재현 및 파일

기준 앱 소스: allEnglish 커밋19badd98830c7c42bb1bb0f2ddd7c28984a40cdb의 recording/app.js.

```sh
node --test tests/*.test.mjs
node tools/build_recording_staging_ui.mjs recording/verification/staging34-ui-original.html BASELINE_APP_JS recording/app.js OUTPUT_HTML
```

도구는 기존 HTML에 정확한 기준 app 소스가 한 번만 포함됐는지 확인하고 첫 endpoint bootstrap 보존 및 모든 inline script 구문을 검증한다. 배포 전 새 HTML을 편집기에서 다시 복사해 전체 문자열 일치를 확인했다.

- verification/staging34-ui-original.html: 변경 전 실제 편집기 HTML.
- verification/staging35-ui.html: 배포한 HTML. SHA256 a4cb689ddef98c5ecae6317881f475238559fde442c15505cc38117eec084921.
- 서버 Code.gs SHA256 6dc8f9c420d0f272f432ea2ce5ac0736c96a82a9a04cb34763c6f4b34f824c91.
- 화면 증거: verification/staging35-pending-feedback.jpg 및 staging35-final.jpg.

검증 주소: https://script.google.com/macros/s/AKfycbz5m2VgIPcI8ltqSqpL74YS7vX8iD9pgYFOYZRBglkpd-mCQsevvrZHo9T6RPRd9B4G2A/exec?ui=1&build=integrated35

실제 휴대전화 OS 잠금/종료 복원, 실제 반 규모 성능과 운영 전환 직전 원본 대조는 남아 있다. 이번 배포를 실사용 전환 완료로 집계하지 않는다.
