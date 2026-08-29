# 학생웹 배정 시험범위 개인 연습 후보

학생웹 후보 `6.3.3-ASSIGNED-EXAM-PRACTICE`는 공개된 주간 단어 계획에 서버가 확인한 `testPlanId`와 시험범위가 있을 때만 `개인 연습` 버튼을 표시한다.

- 클라이언트는 단어장·Section 범위를 조립하지 않고 `testPlanId`만 Student API에 보낸다.
- 기존 시험 화면을 재사용하되 `skipSave`로 공식 점수·오답·즐겨찾기 저장을 막는다.
- 틀린 문제 다시 풀기에도 `skipSave`가 유지된다.
- 녹음체크, 빠른자료, 기존 단어시험·포인트시험 계약은 변경하지 않는다.
- Production과 STAGING 파일에 같은 기능을 넣었다. 공개 Production은 배포하지 않았고, STAGING 파일만 격리 Student API `6.5.5-ASSIGNED-EXAM-PRACTICE` 배포를 사용한다.

검증: `node --test tests/*.mjs`
