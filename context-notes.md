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

## 2026-08-22 재무제표 게임과 통합 (Supabase 프로젝트 1개로)

### 배경 — 사용자 전제와 실제가 달랐다

사용자는 "재무제표 게임 Supabase는 살아있고 골프정산기는 꺼져 있다"고 알고 있었으나,
`supabase projects list` 실측 결과 **둘 다 INACTIVE**였다. 조직 내 유일한 ACTIVE는 yun-secretary.

| 프로젝트 | ref | 리전 | 상태(2026-08-22) |
|---|---|---|---|
| yun-secretary | rigjtnxlxiuxcopymdcc | 서울 | ACTIVE_HEALTHY |
| finance-statement-game | cgkocnezpitydxrflxom | 서울 | INACTIVE |
| Golf Calulator | rjbmxsvwtmqpivrpaahi | 도쿄 | INACTIVE |
| schong87-Project-Manage | gpgmybgwumrwexmiljaw | 서울 | INACTIVE |
| schong87-dotcom's Project | mihpjizfwhdgiqvjzorw | 시드니 | INACTIVE |

통합해도 1주 미사용 자동 일시정지는 그대로 남는다. 다만 한쪽만 써도 둘 다 살아있는 효과는 생긴다.

### 핵심 설계 판단 — 왜 Vercel 배포까지 합쳐야 하는가

**Supabase만 합치면 "로그인 후 앱 선택"이 성립하지 않는다.** Supabase 세션은 브라우저
localStorage에 `sb-<projectRef>-auth-token` 키로 저장되고, localStorage는 오리진 단위로 격리된다.
DB가 같아도 도메인이 다르면 세션이 공유되지 않아 앱마다 다시 로그인해야 한다.
한 도메인 아래 경로로 나누면(`/` 허브, `/game/` 게임) 두 앱이 같은 localStorage 키를 읽어
**한 번 로그인으로 양쪽이 로그인 상태**가 된다. 프로젝트 ref가 같으므로 키 이름도 자동으로 일치한다.

### 왜 골프정산기 레포를 베이스로 삼는가

- 골프=React+Vite, 게임=바닐라 정적 HTML(빌드 없음, CDN Tailwind + CDN supabase-js)로 스택이 다르다.
- 게임을 React로 포팅하면 2,000줄 재작성이다. 과하다.
- 반대로 게임 파일을 골프 레포의 `public/game/`에 그대로 두면 Vite가 빌드 시 `dist/game/`으로
  **무변환 복사**한다. 코드 재작성이 사실상 없다. 그래서 Vite가 이미 있는 골프 레포가 베이스다.
- 게임을 Vite의 multi-page input으로 넣는 방법도 있으나, 게임 JS가 IIFE + window 전역 + script 태그
  순서 의존이라 번들러를 태우면 깨질 위험이 있다. public/ 무변환 복사가 안전하다.

### 통합 Supabase를 finance-statement-game으로 정한 이유

- 서울 리전(골프는 도쿄)이라 응답이 빠르다.
- 이미 신형 publishable key(`sb_publishable_...`)를 쓴다.
- 테이블 이름이 겹치지 않는다 — 게임 `game_records` vs 골프 `current_round`/`rounds`.
  통합 프로젝트에 골프 스키마만 추가 실행하면 된다.
- 대가: 골프정산기의 기존 저장 데이터는 버린다(사용자 확인 완료). 도쿄 프로젝트를 되살려
  export/import하는 비용보다 버리는 편이 싸다고 판단.

### 로그인을 구글 하나로 통일

게임에는 이름+비밀번호 로그인이 있었고, 내부적으로 이름을 UTF-8 hex로 펴서
`u<hex>@fsg.local` 가짜 이메일 계정을 만들었다. **Supabase에서 이 계정과 구글 계정은 별개 계정**이라
기록이 합쳐지지 않는다. 허브 로그인을 구글로 통일하기로 했으므로(사용자 확인 완료)
기존 이름+비번 계정의 게임 기록은 접근 불가가 된다. 게임의 signIn/migrateLegacy 코드는 제거한다.

### 구현 중 걸린 것 — dev 서버가 `/game/`을 가로챈다

Vite dev 서버는 확장자 없는 경로를 SPA fallback으로 처리해 React의 index.html을 돌려준다.
그래서 `/game/js/auth.js`는 정상인데 `/game/`만 골프 앱이 떴다. `/game/index.html`은 정상 동작.
`vite.config.js`에 미들웨어 플러그인 하나를 넣어 `/game`·`/game/`을 `/game/index.html`로 재작성했다.
`configureServer`에서 `server.middlewares.use()`를 직접 호출하면 Vite 내부 미들웨어보다 앞에 붙는다.
빌드 산출물에는 영향이 없다 — 프로덕션은 Vercel이 디렉터리 인덱스로 처리한다.

### 검증 결과 (로컬, 2026-08-22)

- 구글 로그인 1회 → 허브 → `/game/` 이동 시 **로그인 화면 없이 곧바로 게임 모드 화면**. 세션 공유 확인.
- 게임 → 허브 복귀도 로그인 유지. 양방향 확인.
- 게임 카드에 기존 구글 계정 기록(최고 31초·2회)이 그대로 표시됨 → 게임 데이터 보존 확인.
- 골프에서 골프장명 입력 → `current_round`에 실제로 upsert됨을 DB 조회로 확인 후 테스트 행 삭제.
- 통합 DB 상태: `current_round`·`rounds`·`game_records` 3개 테이블 모두 RLS on, 정책 정상.

### Supabase 조작은 Management API로 했다

CLI에는 resume 명령이 없다(`supabase projects`는 list/create/api-keys/delete뿐).
액세스 토큰은 macOS 키체인의 `Supabase CLI` 항목에 있고, 다음 엔드포인트를 curl로 호출했다.

- `POST /v1/projects/{ref}/restore` — 일시정지 해제 (몇 분 뒤 ACTIVE_HEALTHY)
- `POST /v1/projects/{ref}/database/query` — SQL 실행 (스키마 적용·조회)
- `PATCH /v1/projects/{ref}/config/auth` — site_url, uri_allow_list 변경

주의: 파이썬 urllib으로 호출하면 Cloudflare가 403(error 1010)으로 막는다. curl은 통과한다.

### 남은 정리 대상 (이번 작업 범위 밖)

- Vercel `finance-statement-game` 프로젝트와 그 레포는 아직 살아 있다. 옛 주소로 들어오면
  통합 전 코드(이름+비번 로그인 포함)가 그대로 뜬다. Supabase의 `uri_allow_list`에도 남겨두었다.
  옛 주소를 통합 주소로 리다이렉트하거나 프로젝트를 정리할지는 별도 결정 필요.
- 도쿄의 `Golf Calulator` 프로젝트(rjbmxsvwtmqpivrpaahi)는 이제 쓰지 않는다. 삭제 여부는 사용자 결정.
- `App.jsx`의 `getSavedRounds` 미사용 import는 통합 전부터 있던 lint 에러다. 손대지 않았다.

### 배포 (2026-08-22)

- **Vercel `golf-calculator`는 GitHub 자동 배포가 연결돼 있지 않다.** main에 push해도 배포가 안 걸린다.
  `vercel --prod --yes`로 직접 배포해야 한다. (옛 게임 레포는 push 자동배포라 README에 적혀 있었는데,
  골프 쪽은 다르다. 헷갈리기 쉬우니 기록해 둔다.)
- 환경변수는 `vercel env rm` → `vercel env add`로 교체했다. Sensitive 타입이라 `vercel env pull`로는
  값이 `[SENSITIVE]`로만 나온다. 검증은 배포된 번들을 직접 grep해서 했다.
- 배포 검증 (실측)
  - `https://golf-calculator-six.vercel.app/game/` → HTTP 200, `<title>재무제표 학습 게임</title>`.
    Vercel이 디렉터리 인덱스를 알아서 서빙하므로 vercel.json 없이 동작한다.
  - React 번들과 `game/js/supabase-config.js` 둘 다 `cgkocnezpitydxrflxom`을 가리킨다.
  - 실제 구글 로그인 → 허브 → `/game/` 직접 접근 시 로그인 화면 없이 게임 화면 + 기존 기록 표시.

### 작업 환경 마찰

이 레포는 Google Drive 스트리밍 폴더에 있어 파일 I/O가 느리다. `vite build`가 실제 빌드는 1분 30초인데
전체로는 6분 넘게 걸린다(첫 빌드 기준, 이후 캐시되면 수백 ms). 빌드가 멈춘 것처럼 보여도 기다리면 된다.

## 2026-08-22 옛 게임 주소를 통합 주소로 리다이렉트

`finance-statement-game.vercel.app`은 별개 배포라 통합 후에도 옛 코드(이름+비번 로그인 포함)가
그대로 떠 있었고 `/game/`은 404였다. 두 주소 어디로 들어와도 같은 화면이 나오게 해달라는 요청.

**미러 배포(두 도메인에 같은 코드)는 쓰면 안 된다.** Supabase 세션은 브라우저 localStorage에
오리진 단위로 저장되므로, 도메인이 둘이면 한쪽에서 로그인해도 다른 쪽은 로그아웃 상태다.
통합의 목적인 "한 번 로그인으로 두 앱"이 정면으로 깨진다. 그래서 리다이렉트가 유일한 답이다.

`finance-statement-game` 레포에 `vercel.json` 하나를 넣어 모든 경로를 통합 주소 **루트**로 보냈다.
경로를 이어붙이지 않은(`/$1` 아님) 이유는 옛 주소의 `/js/app.js` 같은 경로가 통합 앱에는 없어
404가 나기 때문이다. 어디로 들어와도 허브가 뜨는 게 요청에 맞다.

- `permanent: false`(307)를 썼다. 308은 브라우저가 영구 캐시해 되돌리기 어렵다.
- Vercel은 redirects를 정적 파일보다 먼저 평가하므로, 레포의 옛 게임 파일을 지우지 않아도 동작한다.
  파일은 롤백 가능하도록 남기고 README 상단에 통합 안내만 달았다.
- 그 프로젝트는 GitHub 자동 배포가 연결돼 있어 push만으로 반영됐다(골프 쪽과 다르다).
- 검증: `/`, `/game/`, `/js/app.js`, 임의 경로 모두 307 → 통합 주소. 따라가면 HTTP 200.

곁들여 `index.html`의 `<title>`이 `golf-calculator`, `lang`이 `en`으로 남아 있어
`앱 모음 — 골프 정산 · 재무제표 게임` / `ko`로 고쳤다.

## 2026-09-04 Supabase 자동 깨우기 + Google Drive에서 .git 손상

### 사건 — 접속 불가

2026-09-03 밤 사용자가 접속이 안 된다고 알림. 화면이 "불러오는 중..."에서 멈춰 있었다.
원인은 Supabase 프로젝트가 `INACTIVE`(무료 플랜 7일 미사용 자동 일시정지).
`cgkocnezpitydxrflxom.supabase.co` 는 DNS조차 해석되지 않았다. Vercel 사이트 자체는 HTTP 200으로 멀쩡했다.
→ Management API `POST /v1/projects/{ref}/restore` 로 복원, 몇 분 뒤 ACTIVE_HEALTHY. **데이터는 그대로였다.**

### 자동 깨우기 설계

"컴퓨터가 꺼져 있어도 되게" 라는 요구가 핵심이라 로컬 cron/launchd는 탈락했다.
Vercel Cron은 Vercel 서버에서 실행되므로 개발자 PC와 무관하다.

- 찌르는 방식은 `/rest/v1/game_records?select=id&limit=1`. RLS 때문에 익명에는 0행이 오지만
  요청은 PostgREST를 거쳐 **실제 DB까지 도달**한다. Supabase는 이 도달을 활동으로 집계한다.
  service_role 키를 쓸 필요가 없어 보안 노출면이 늘지 않는다.
- 스케줄 `0 3 * * *`. **Hobby 플랜은 cron 하루 1회가 상한**이다. 기준이 7일이라 충분하다.
- `CRON_SECRET` 인증은 넣지 않았다. 이 엔드포인트는 SELECT만 하고 아무 상태도 바꾸지 않아
  외부에서 호출돼도 피해가 없고, 오히려 깨우는 데 도움이 된다.
- **한계: 이미 정지된 프로젝트는 크론으로 깨어나지 않는다.** 그래서 연결 실패(DNS 실패) 시
  503과 함께 "대시보드 수동 복원 필요" 힌트를 응답에 담았다.

검증: `npm test` 6 pass, 배포 후 엔드포인트 `{"ok":true,"status":200}`,
`vercel crons ls`에 등록 확인, `vercel crons run`으로 실제 트리거 성공.
vercel.json을 새로 만들었지만 허브·`/game/`·옛 주소 리다이렉트 모두 그대로 동작한다.

### ⚠️ Google Drive 폴더에서 .git 저장소가 손상된다

작업 중 `git commit`이 `error: invalid object ... for '.gitignore'` / `for 'eslint.config.js'` 로 실패했다.
`git fsck` 결과 **여러 tree/blob이 통째로 사라져 있었다**(broken link 15건 이상).
`.git/objects/` 의 해당 파일이 파일시스템에 없다.

원인은 Google Drive 스트리밍 모드다. 클라우드에만 두고 로컬에서 파일을 비우는 방식이라
`.git/objects/` 의 수많은 작은 파일과 충돌한다. `mv .git .git.broken` 조차 반영되지 않았고,
정상 클론의 `.git`을 덮어써도 잠시 뒤 다시 객체가 사라졌다.

**대처: 로컬 디스크(scratchpad)에 새로 clone해서 거기서 커밋·푸시·배포했다.**
원격 main과 로컬 main이 `f604dc5`로 정확히 일치해 잃은 커밋은 없었다.

**앞으로 이 레포에서 git 작업을 할 때는 Google Drive 폴더를 신뢰하지 말 것.**
근본 해결은 저장소를 Google Drive 밖(예: `~/projects/golf-calculator`)으로 옮기거나,
Google Drive에서 해당 폴더를 "오프라인 사용 가능"으로 고정하는 것이다.

### 곁들여 — public 레포에 대화기록이 올라갈 뻔했다

훅(CLAUDE.md 17항)이 만드는 `00_프롬프트/` 폴더가 `.gitignore`에 없어 `git add -A` 시
공개 저장소에 커밋될 뻔했다. `.gitignore`에 추가했다. **이 레포는 PUBLIC이다.**

### 결정 — 저장소는 Google Drive에 그대로 둔다 (2026-09-04)

사용자 판단: "구글드라이버에 그대로 둘게. 여기 저기 있으면 복잡해져."
폴더를 옮기지 않는 대신, 깨지면 아래 절차로 복구한다. **원격(GitHub)에 모든 커밋이 있으므로
로컬 .git이 깨져도 잃는 것은 없다.** 커밋되지 않은 작업 파일만 조심하면 된다.

**복구 절차 (git이 `invalid object` / `broken link`를 뱉을 때)**

```bash
GD="<이 폴더>"
SCR=/tmp/golf-fresh                       # 로컬 디스크 어디든

cp "$GD/.env" /tmp/env.backup             # 1. gitignore된 파일 백업 (.env 필수)
git clone https://github.com/schong87-dotcom/golf-calculator.git "$SCR"   # 2. 성한 저장소 확보
rm -rf "$GD/.git" && cp -R "$SCR/.git" "$GD/.git"                        # 3. .git 교체
cd "$GD" && git reset --hard origin/main  # 4. 추적 파일을 원격 최신으로
git fsck --no-dangling                    # 5. 이상 없으면 출력이 비어 있다
npm test                                  # 6. 최종 확인
```

- 커밋·푸시가 그 폴더에서 계속 실패하면, 로컬 clone에서 커밋·푸시·배포하고
  나중에 위 3~4단계로 Google Drive 폴더를 따라오게 하면 된다(2026-09-04에 그렇게 했다).
- `reset --hard`는 추적 파일만 되돌린다. `.env`, `node_modules`, `dist`, `00_프롬프트/`는 건드리지 않는다.
- 복구 후 `README 2.md`, `checklist 2.md` 같은 **Google Drive 충돌 사본**이 생길 수 있다.
  전부 옛 버전이므로 현재 파일과 diff로 확인한 뒤 지운다.

**예방**: Finder에서 이 폴더를 우클릭 → Google Drive 메뉴에서 **오프라인 액세스**를 켜두면
로컬에 파일이 항상 유지되어 evict가 줄어든다. 다만 완전한 보장은 아니다.
