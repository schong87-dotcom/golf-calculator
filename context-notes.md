# 컨텍스트 노트

작업 중 내린 결정과 이유를 기록한다. 다음 세션이 이 파일만 읽고 이어갈 수 있게 유지.

## 2026-07-17 구글 로그인 전환

- **결정: 아이디/비번 로그인을 완전히 제거하고 구글 로그인만 남긴다.** (사용자 확인 완료)
  - 이유: 배포 대상이 일반 지인들이라 비밀번호 관리 부담을 없애는 게 낫고, 화면·코드가 단순해짐.
  - 대가: 기존 아이디/비번 계정(가짜 이메일 `u...@golf-app.local` 기반)의 저장 데이터는 접근 불가. 사용자 본인 테스트 데이터뿐이라 감수.
- 기존에 커밋 안 된 storage.js 변경(가입 에러 원문 노출)은 디버그용이었고, login() 자체가 삭제되므로 자연 소멸.
- 세션 처리를 `getSession()` 1회 조회 → `onAuthStateChange` 구독으로 변경.
  - 이유: OAuth 리다이렉트 복귀 직후에는 URL의 인증 코드 교환이 끝나기 전이라 getSession()이 null을 줄 수 있음. SIGNED_IN 이벤트를 받아야 안정적.
  - TOKEN_REFRESHED 등 반복 이벤트에서 loadRound()가 재실행되어 편집 중인 화면을 덮어쓰지 않도록, 최초 1회만 로드하는 ref 가드를 둠.
- 사용자 표시 이름은 구글 프로필의 `user_metadata.full_name` → `name` → 이메일 순으로 사용.
- Supabase 프로젝트: `rjbmxsvwtmqpivrpaahi.supabase.co` / Vercel 프로젝트명: `golf-calculator`.
- 구글 OAuth 리다이렉트 URI는 Supabase 콜백(`https://rjbmxsvwtmqpivrpaahi.supabase.co/auth/v1/callback`) 하나만 등록하면 됨. 앱 주소는 Supabase 쪽 URL Configuration에서 관리.

### 외부 설정 진행 상황 (크롬 자동화로 진행)

- 구글 클라우드: 기존 `gws-cli` 프로젝트(able-hull-493514-u4)에 OAuth 웹 클라이언트 `golf-calculator` 생성 완료.
  - 클라이언트 ID: `450177760064-6g9lk2lcmi6lm0tvgs40pva4n517u1sr.apps.googleusercontent.com`
  - 보안 비밀번호는 생성 직후 1회만 표시되는 정책이라 놓침 → "Add secret"으로 2번째 비밀번호(`****_6pK`) 발급, 사용자 클립보드에 복사해 둠. 비밀번호 값은 보안상 코드/노트에 기록하지 않음.
  - 주의: 앱이 테스트 모드라 테스트 사용자만 로그인 가능. 배포 전에 Google 인증 플랫폼 → 대상(Audience)에서 프로덕션 게시 필요 (기본 스코프만 쓰므로 심사 불필요).
- Supabase: 무료 플랜 미사용으로 프로젝트("Golf Calulator")가 일시정지 상태였음 → Resume 실행, 복원 대기 중 (2026-07-17 저녁). 복원이 끝나면 Google 프로바이더 활성화 + URL Configuration 설정 남음.
- Supabase 대시보드 로그인은 GitHub 계정 (사용자가 직접 로그인).
