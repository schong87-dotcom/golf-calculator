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

### 완료 (2026-07-17 밤)

- Supabase Google 프로바이더 활성화 완료 (클라이언트 ID + 시크릿 입력, 시크릿은 사용자가 직접 붙여넣음).
- 구글 앱 프로덕션 게시 완료 → 아무 구글 계정이나 로그인 가능.
- 프로덕션 배포 완료. **공개 주소: https://golf-calculator-six.vercel.app**
- Supabase URL Configuration 최종값: Site URL = 배포 주소, Redirect URLs = 배포 주소 + http://localhost:5173.
- 로컬/배포 양쪽에서 구글 로그인 → 라운드 저장/불러오기 검증 완료.
- 주의: Supabase 무료 플랜은 1주 미사용 시 프로젝트 일시정지됨 → 대시보드에서 Resume 필요. 복원 직후 대시보드가 빈 화면이면 강력 새로고침(cmd+shift+r).
- App.jsx의 `getSavedRounds` import는 미사용(전환 전부터 존재) → lint 에러 1건. 다음 정리 때 제거 후보.

## 2026-08-08 헤더 "골프 정산" 가독성 개선

- **증상**: 로그인 후 첫 화면 상단 헤더의 "골프 정산" 글자가 초록 배경 위에서 검게 보여 잘 안 읽힘.
- **원인**: `index.css:17`의 전역 규칙 `h1, h2, h3 { color: #222 }`. `.app-header`에 `color: white`가 있어도, 상속된 색은 h1에 직접 매칭되는 규칙을 이기지 못한다(상속은 특정도 경쟁에 참여하지 않음). 그래서 h1만 #222로 찍혔고, 형제인 `<p>`는 직접 매칭 규칙이 없어 흰색을 정상 상속받고 있었다.
- **해결**: `.header-title h1`에 `color: #fff`를 명시. 특정도 (0,1,1) > (0,0,1)로 전역 h1 규칙을 이긴다. 전역 `h1` 규칙 자체는 건드리지 않음 — 다른 화면의 제목들이 밝은 배경 위에 있어 함께 흰색이 되면 전부 안 보이게 된다.
- **로그인 화면은 의도적으로 제외**: `.login-header h1`은 밝은 배경(#f0f4f0) 위 진초록(#2d5a3d)이라 대비가 충분하다. 흰색으로 바꾸면 오히려 안 보임.
- **폰트 크기**: h1 18px → 20px, 부제 p 11px → 12px. 헤더 높이는 로고(40px) + padding(10px×2) = 60px가 지배하고 제목 블록은 약 38px → 42px로만 커져서, 헤더가 60px → 62px로 2px 늘 뿐 레이아웃은 유지된다. 480px 미디어쿼리에도 헤더 h1 크기를 덮는 규칙이 없어 모바일에서도 동일하게 적용.
- 검증: `npm run build` 통과, 빌드 산출 CSS에 `.header-title h1{color:#fff;font-size:20px...}` 확인, 헤더 마크업을 빌드 CSS로 렌더해 흰 글씨·레이아웃 유지 스크린샷으로 확인.
- 참고: `node_modules/.bin`이 비어 있어 `vite: command not found`가 났음 → `npm install` 재실행으로 해결.
