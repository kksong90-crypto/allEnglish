# 학생 단어장·개인 연습 운영 반영

사용자 진행 승인 뒤 기존 저장소·배포를 확인하고 PR60을 생성했다. 기준 main은 `0c391a1`, 기존 Pages URL은 `https://kksong90-crypto.github.io/allEnglish/`, 게시 소스는 main의 루트이다.

## 확인된 운영 소스

비공개 운영 저장소 branch `feature/student-vocab-search-api-20261116`의 읽기 전용 CI43918883388이 성공했다. 프로젝트 소스·배포만 GET했으며 업무 표/트리거/배포를 변경하지 않았다. 원본은 비공개1일 보존 artifact와 로컬 private 폴더에만 둔다.

- Student API63: active/editor seal `193d9285f0dad1ecdcfd191f8385d7e3a72fc160bf6ad9f1e52c1f5da172a91c` 일치. 카탈로그/검색은 기존 검증 세션과 Station gateway를 사용한다. VocabShared8을 사용한다.
- Station86: active seal `c3ed588ae318758e2d924fddb4deb7f1e33191b40d361a922c53e4b142c66941`. 편집기 seal은 active와 다르므로 편집기를 덮어쓰거나 Station 배포를 교체하지 않았다.
- 배포된 전체 단어 검색은 공개 판본 필터 후 `vocaApiWordSheet_` 전체 데이터를 읽고 필터링한다. 별도 native 저장소/일부 범위 조회 코드가 존재해도 전체 검색의 VocabDB 전환 완료를 뜻하지 않는다. 이 서버 경로의 최초2초는 아직 미측정이며 이번 학생웹 패치로 완료됐다고 주장하지 않는다.

## 원격 브라우저 검증 중 수정

첫 CI에서 Chromium·키보드 검사는 통과했으나 WebKit320px 공개 단어장 복귀에서 가로 넘침이 재현됐다. 진단을 추가한 다음 실행에서 화면을 벗어난 요소가 상단 `header-actions`/전체 메뉴 버튼임을 확인했다. WebKit의 로고 intrinsic minimum이 버튼을 밀지 않도록 로고 최소 너비를0으로 제한했다. 단어장 Grid와 select의 최소 너비도 제한한다. 전체 화면을 overflow:hidden으로 감추지 않는다.

## 실제 계정 속도 확인

인증 정보를 코드/채팅에 복사하지 않고 실제 계정에서 측정하도록 관리자·교사 전용 opt-in 경로를 추가했다.

1. `https://kksong90-crypto.github.io/allEnglish/?vocabSpeed=1`을 **새로 열고** 관리자 또는 교사로 로그인한다.
2. 전체 단어장에 들어가 처음 목록을 받고, 교재·범위를 선택하고, 전체 영어/뜻 검색과 같은 검색을 반복한다.
3. 공개 교재 패널의 ‘운영 속도 점검 결과’를 열고 ‘속도 결과 복사’를 누른다.
4. 결과의 `catalog`/`scope`/`search`, `elapsedMs`, `remoteReads`, `success`, `count`를 비교한다. 동작 시작~다음 paint까지이며 서버 cold start와 동일하지 않다. 반복0회 조회는 클라이언트 재사용/동시요청 공유일 수 있으므로 최초와 구분한다.

로그인 계정·토큰·검색어·교재/판본ID·단어 내용은 결과에 기록하지 않는다. 최대20개를 로그인 메모리에만 보관하고 로그아웃 때 제거한다. 일반 URL이나 학생 계정에는 점검 UI가 나오지 않으며 자동 외부 전송/추가 측정 요청도 없다. 실제 계정 결과를 받기 전에는 운영2초 통과로 표시하지 않는다.

## 최종 배포 영수증 (KST)

- 코드 PR: [#60](https://github.com/kksong90-crypto/allEnglish/pull/60), 검증 head `c28b799295081e9a5a6a49ea9ff0d617d50312f6`.
- 최종 브라우저 CI [43921513773](https://github.com/kksong90-crypto/allEnglish/actions/runs/43921513773): 2026-11-17 02:46:53 KST 성공. Chromium/모바일 키보드/WebKit 모두 통과. verify/regression도 성공, portable37개 모듈 통과.
- 기존 main으로 squash 병합된 코드 릴리스: `d2e96b9056872f5cbd435f18b9dedb2a27e7dab1`.
- Pages [43922212887](https://github.com/kksong90-crypto/allEnglish/actions/runs/43922212887): 02:49:12 KST 성공. Pages build API의 commit도 위 릴리스와 같으며 status=built, 기존 URL 유지.
- 게시 후 smoke [43922214611](https://github.com/kksong90-crypto/allEnglish/actions/runs/43922214611): 02:49:18 KST 성공. 게시된 새 release 표식/연습 코드/교재 JS 확인 및 로그인 없는 공개목록·배정 연습 요청 거절 확인. 실제 로그인 UAT와 구분한다.
- 배포 릴리스 기준 수동 합성 성능 [43922699223](https://github.com/kksong90-crypto/allEnglish/actions/runs/43922699223): 02:52:48 KST 성공, budgetViolations=[]; 실제 운영 API 지연 측정이 아니다.
- 이 환경의 직접 Pages HTML/JS/CSS GET은 연결 실패로 해시 비교를 마치지 못했다. 게시 확인은 위 원격 Pages/실사이트 smoke 증거로 기록하며 직접 해시 일치를 주장하지 않는다.

기존 운영 코드 기준/복구 지점은 `0c391a109e2f7f652985d406a09f4c861223adf3`이다. 문제가 발생하면 PR60 코드 변경을 검토된 역변경 PR로 복구하며 기존 Student API63·Station86·DB 표·기존 URL을 임의 교체하지 않는다. Station 편집기와 후속 원격 작업은 보존한다.

**학생웹 코드 배포·합성/게시 검증 완료. 실제 계정 첫 조회2초, 실기기 UAT, 전체 검색의 VocabDB 전환은 완료로 표시하지 않는다.**
