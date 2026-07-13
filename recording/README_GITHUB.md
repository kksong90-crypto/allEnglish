# GitHub Pages 업로드

이 `recording` 폴더 전체를 기존 GitHub Pages 저장소 루트에 업로드하세요. 최종 주소는 보통 `https://계정.github.io/저장소/recording/`입니다.

처음 접속하면 녹음 서버 Apps Script의 `/exec` 주소와 `upgradeRecordingMobileV720` 실행 결과에 나온 관리자 PIN을 입력합니다.

Apps Script 웹앱은 API 호출을 위해 **실행 사용자: 나**, **액세스 권한: 모든 사용자**로 새 버전을 배포해야 합니다. API는 PIN 로그인과 서명된 세션 토큰으로 보호되며 토큰은 URL에 넣지 않습니다.
