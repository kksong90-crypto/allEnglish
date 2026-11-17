# 시험범위 개인 연습: 실제 앱 통합·운영 배포 기록

2026-11-17. 세 학습 경험과 배정 전체 범위 연습을 운영에 반영했다. **VocabDB의 콘텐츠 기준 저장소 전환은 별도 진행 중이며, 이 기록은 DB 분리 완료를 뜻하지 않는다.** 실제 학생 계정으로 로그인한 UAT는 아직 수행하지 않았다.

## 배포 영수증

| 대상 | 확인된 결과 | 증거 |
| --- | --- | --- |
| 학생웹 구현 | [PR #62](https://github.com/kksong90-crypto/allEnglish/pull/62), `81878ec53b6d925e0b6d0c117eff8a2c074352`, 2026-11-17 05:33:10 UTC 병합 | 세 경험과 전체 범위 연습 통합 |
| GitHub Pages | 같은 커밋 배포 성공, 05:33:49 UTC 완료 | [Pages 배포 44024909544](https://github.com/kksong90-crypto/allEnglish/actions/runs/44024909544) |
| 배포 후 검증 | 같은 커밋의 공개 자산·로그인 없는 요청 거부 검사 성공 | [Published release smoke 44024909389](https://github.com/kksong90-crypto/allEnglish/actions/runs/44024909389) |
| Student API | 운영 버전 **65** 반영 | 기존 배포 URL 보존, 불변 소스·선택된 버전 읽기 대조 |
| Station | 운영 버전 **91** 반영 | 기존 배포 URL 보존, 불변 소스·선택된 버전 읽기 대조, health 확인 |

백엔드의 전체 범위 페이지 계약을 먼저 배포하고 검증한 뒤 학생웹을 병합했다. 백엔드 배포에서 학생 성적·포인트 등 업무 테이블을 쓰지 않았다. 무인증 공개 목록·전체 범위 연습 요청 거부를 확인했으나 이는 인증된 학생의 사용 검증을 대신하지 않는다. 비공개 서버 원본·인증값·데이터베이스 식별자는 이 공개 기록에 포함하지 않는다.

05:42:41 UTC에 공개 학생웹의 `index.html`, `practice-experience.js`, `practice-experience.css`를 실제 구현 파일과 바이트 단위로 비교했다. 세 파일 모두 일치했다. 아래 값은 공개 파일의 SHA256이다.

| 공개 파일 | 운영 자산과 일치한 SHA256 |
| --- | --- |
| `index.html` | `d340defa9db21d66cd0c524f3078d0c3a7970b2e8b3c6aa8d73bf4d30bb6e2d0` |
| `practice-experience.js` | `fec35325c8428e89fb7cb3e3e2e9aab46a3fa2483906c0048360b8da8b52ca19` |
| `practice-experience.css` | `c98617ebdb527b78ac8d1f2a2d1e1b36895d42d25aff7e0e3326b0b283f044f6` |

## 화면과 상태

홈/학습일정의 확정 시험범위 연습, 단어장의 선택 범위 연습, 관리자·교사 공개 범위 미리보기는 같은 `PracticeExperience` 화면을 사용한다.

- **집중 카드:** 단어 중심 카드, 뜻 반복 공개/가리기, 자기평가, 직접 쓰기.
- **단계형 챌린지:** 카드 → 영어 단어의 뜻 고르기 → 직접 쓰기. 원하는 단계로 이동할 수 있다.
- **시험 준비실:** 같은 범위의 단어 목록, 확인 방식별 기록, 개별 점검, 어려운 단어 선별 연습.

범위·위치·초안·방식별 결과를 세 경험에서 공유한다. 어려운 단어의 하위 연습에서 원래 연습으로 돌아올 수 있으며, 200개 단위 묶음 사이에서도 같은 세션의 상태를 보관한다. 기존 주관식 모의연습은 `skipSave:true` 경로를 유지하고 공식 시험·포인트 저장을 호출하지 않는다.

`index.html`은 서버 응답 검증과 인증/세션 경계를 소유하고, `practice-experience.js`는 검증된 rows만 사용한다. 상태는 `assignedPracticeState` 내부 메모리다. 내부 경험·단계·묶음 이동은 초안을 보존하며, 실제 화면 이탈의 미채점 초안에는 기존 확인을 적용한다. 로그아웃·새 범위 로딩·개인 연습 화면 이탈은 상태를 폐기한다. **새로고침이나 OS의 탭 종료 뒤 이어하기, 장기 학습 이력 저장은 구현하지 않았다.**

카드 자기평가, 뜻 선택 결과, 철자 결과를 구분한다. ‘기억했어요’를 정답률로 표시하지 않는다. 기존 strict spelling 판정과 acceptedAnswers를 사용하며, 안전한 객관식 보기가 부족하면 직접 쓰기로 대체한다. IME 조합 중 Enter는 채점하지 않는다. 입력·피드백·다음 문항의 포커스를 연결하고 카드 공개 상태와 선택 모드의 접근성 속성을 제공한다. 실제 스크린리더 음성 동작은 미검증이다.

## 전체 범위와 무작위 순서

배정 API의 ALL 페이지 계약으로 시험범위 전체를 수집한다. 페이지당 최대 200문항이며 `totalCount`·`scopeVersion`·`offset`·`nextOffset`·중복 ID를 검증한 뒤 화면을 연다. 최대 5000단어를 지원한다. 초과·누락·중복·범위 변경·구형 표본 응답을 일부만 받은 전체 범위로 표시하지 않고 명시적으로 거부한다.

서버는 첫 페이지에서 범위를 고정하고, 학생·범위에 묶인 10분 스냅샷과 해시를 사용한다. 뒤 페이지마다 배정/공개 권한을 다시 검증하면서 단어 본문은 캐시에서 읽는다. 캐시 만료·유실·해시 불일치는 연습 시작을 중단하고 재시작을 요구한다. 원자료 수정은 새 범위 진입에서 반영된다.

Fisher–Yates는 복사본에 적용한다. 최초 진입·전체 다시 연습·새 약점 연습·새 주관식 모의연습은 다시 섞는다. 전체 범위 다시 연습은 현재 묶음에 한정하지 않고 전체 sourceRows를 섞어 첫 묶음부터 시작한다. 이전/다음, 단계·경험 전환, 이어하기, 원래 연습 복귀는 현재 큐를 유지한다. 준비실에서 특정 단어를 여는 동작은 그 대상을 정확히 열며 재추첨하지 않는다. 무작위이므로 우연히 같은 순서가 다시 나올 수 있다.

## 검증 범위

[PR #62 브라우저 CI 44017280567](https://github.com/kksong90-crypto/allEnglish/actions/runs/44017280567)은 다음 네 job 모두 성공했다.

| 검증 | 결과 |
| --- | --- |
| 실제 앱 새 UI · Chromium | **14/14 합성 여정 통과** |
| 실제 앱 새 UI · WebKit | **14/14 동일 합성 여정 통과** |
| 새 모듈을 명시적으로 불러오지 못한 경우의 기존 UI · Chromium | 네 방식·복귀·공개 단어장 fallback 통과, 키보드·피드백 포커스 검사 통과 |
| 같은 unavailable-module fallback · WebKit | 기존 UI 회귀 통과 |

새 UI 여정은 학생 모바일/데스크톱, 1단어 보기 대체, 안전한 객관식, 로그아웃·새 로그인, 관리자 205단어 묶음/모의연습, 배정 전체 201/401단어, 구형 표본·수량 오류·범위 변경·중복·페이지 누락 차단을 포함한다. 합성 계정·가상 API를 사용하며 공식 저장 호출 0, 기존 전체 단어장 다운로드 0을 검사한다. fallback 검사는 `PRACTICE_LEGACY_FALLBACK=1`에서만 새 모듈 요청을 차단하며, 새 UI 검증을 대신하지 않는다.

[Portable regression 44017280699](https://github.com/kksong90-crypto/allEnglish/actions/runs/44017280699)의 **39/39 모듈**이 통과했다. 전체 범위 페이지·오류 차단과 무작위 순서 계약을 포함한다. inline script만 읽는 단위 fixture만으로 외부 JS/CSS의 새 화면을 검증했다고 간주하지 않는다.

서버 후보의 별도 합성 검사 22/22는 451단어, 5000단어의 25페이지, 본문 읽기 1회, 요청 크기·바이트 경계, 권한 철회·비공개·다른 학생/유형, 캐시 만료·유실·훼손과 기존 표본 경로 보존을 확인했다. 이는 실제 학생 계정에서 5000단어를 로딩한 속도 측정이 아니다.

로컬 Chromium의 카드 전환 관측값은 두 animation frame 대기를 포함한 합성 표시 응답이다. 운영망 속도나 실제 휴대폰 성능으로 해석하지 않는다. 운영 배포와 공개 파일 일치가 확인됐어도 실제 인증 학생 UAT·물리 기기 가상 키보드·실제 스크린리더 검증은 남아 있다. 실제 학생 인터뷰를 수행한 리뷰로 표현하지 않는다.

## 재현

```sh
node scripts/check-student-web.mjs
node browser-tests/practice-experience.browser.mjs chromium
node browser-tests/practice-experience.browser.mjs webkit
# localhost에서 실제 앱을 가상 API로 체험
node browser-tests/practice-experience.browser.mjs --preview
# 새 모듈이 불러와지지 않은 상황의 기존 UI만 검사
PRACTICE_LEGACY_FALLBACK=1 node browser-tests/assigned-practice.browser.mjs chromium
PRACTICE_LEGACY_FALLBACK=1 node browser-tests/mobile-review.browser.mjs
```

브라우저 엔진과 OS 의존성이 필요하다. 새 UI의 합성 결과는 `browser-tests/artifacts/practice-experience/results.json`, WebKit은 그 하위 `webkit/results.json`에 기록한다. 실제 앱의 JS/CSS를 그대로 사용하는 로컬 미리보기는 가상 인증·가상 응답을 테스트 환경에만 주입하며 운영 인증 우회를 추가하지 않는다.

## 별도 진행 중: VocabDB 전환

이번 학생웹/Student API65/Station91 배포는 학습 화면과 전체 범위 연습의 운영 반영이다. **콘텐츠 DB의 최종 기준 저장소 연결, 검색 인덱스 게시, 운영 소비자 전환은 별도 작업으로 아직 완료 판정하지 않는다.** DB 전환과 실제 계정 검증의 후속 영수증이 나오기 전에는 ‘VocabDB 분리·모든 검색 병목까지 해결’했다고 보고하지 않는다. 이 문서 변경은 코드·데이터·배포 설정을 추가로 바꾸지 않는다.
