# 시험용 native 단어장 카탈로그 오류 해결

- 대상: 학생웹앱의 vocabNativePilot=1 조회 경로. 사용자 지시에 따라 관리자 계정으로만 실제 화면 검증.
- 환경: 기존 Student API PRODUCTION URL, immutable49→50. 일반 웹앱·Station 데이터와 배포는 이번 수정에서 변경하지 않음.
- 원본: 기존 배포49 StudentLegacyNativeStorage / StudentLegacyNativeBrowse / StudentLegacyNativeRepository를 읽어 백업한 뒤 수정. native-deployment-before.json 참조.
- 원인: CoreDB의 신규 활성 교재가 시험용 native 카탈로그에 없어서 active books와 native books의 1:1 대조에 실패. 목록 전체가 실패.
- 조치: 기존13권을 그대로 보존한14권 카탈로그를 새 불변 위치에 게시. 신규 교재의52구간/2080단어를52개의 hash검증 자산으로 추가. StudentLegacyNativeStorage의 고정 locator+pin만 갱신. 기존 속성 없음/이전 승인된pair/새 승인된pair만 허용하고 알 수 없는 설정은 계속 거부. ScriptProperties·접근설정·개발HEAD 보존.
- 변경 위치: VocabDB PublishedAssets5825~5876 / ManifestChunks219 / RevisionIndex212 / LegacyBrowseCatalog5~7. 기존 자료 삭제·덮어쓰기 없음.
- VocabDB ID: 1BUN-aHFV9-XPumNTpDM6F1KDHsh1ezqRi_LxkJjPYJ0. 제목에 미연결이 있지만 실제 배포49의 pinned configuration으로 연결됨을 확인.
- 검증: 격리 복제 계약에서52구간 전체2080단어 exact; 기존13권 내용 유지; 잘못된구간·asset hash·pin 거부; 신규/기존 승인속성pair 모두 통과. 실제 Sheets 새 asset/manifest/index/catalog 전내용 읽기 대조PASS.
- 실제 관리자 UAT: 카탈로그14권 응답성공; 숭덕2 101/413각40행; 기존 능률VOCA중등기본Day1 20행; Day전체시험 버튼활성화. 학생계정 로그인·시험시작·제출·인쇄 없음.
- 시험용 URL: https://kksong90-crypto.github.io/allEnglish/?vocabNativePilot=1#vocab
- API deploymentId: AKfycbxLW0buCbPNwp4RPYZo4rq5tgP8OgPmdOKc0nzuOiA0HtFG8-Qzyq_kcK5FV4fzL372fg
- 신규helper SHA256: d235a412250739b14c02c0f2cecc4e364c45447d09a97aa2ed592d7c85feb179
- native-deployment-result.json에서 immutable50 exactsource, 기존URL/접근·개발HEAD 보존 확인.
- 백업: https://docs.google.com/spreadsheets/d/1H6lGfeXepJUQskSAkkHsxZr7LVkJtn-gEp3SCyojZe8/edit?usp=drivesdk
- 롤백: 같은API배포를49로돌리면 이전고정카탈로그로복귀(신규교재가활성인경우 원래pilot오류가다시나므로 일반주소사용). 추가자산은 기존조회와충돌하지않으므로 삭제하지않음.
- 이후교재추가: 일반웹앱/Station등록만으로pilot완료라고보고하지않는다. 승인된CoreDB 교재와동일한 DTO를 native불변자산/카탈로그로게시하고 locator/pin을갱신한뒤 관리자UAT를한다. 학생계정은사용하지않는다.

