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

검증 증거·최종 배포 영수증은 CI 완료와 병합/Pages 확인 뒤 아래에 기록한다.
