# 앱 모음 — 골프 정산 · 재무제표 학습 게임

구글 로그인 한 번으로 두 개의 앱을 쓰는 통합 웹앱입니다.
Supabase 무료 플랜의 프로젝트 개수 제한 때문에 원래 따로 있던 두 앱을
**Supabase 프로젝트 1개 + 배포 도메인 1개**로 합쳤습니다.

배포 주소: https://golf-calculator-six.vercel.app

## 화면 흐름

```
/            로그인(구글) → 앱 선택 허브
  ├─ 골프 정산      React 화면 전환 (같은 페이지 안)
  └─ 재무제표 게임   /game/ 으로 이동
```

두 앱은 **같은 오리진**에 있습니다. Supabase 세션은 브라우저 localStorage에
오리진 단위로 저장되므로, 도메인을 하나로 합쳐야 한 번의 로그인이 양쪽에 모두 적용됩니다.
Supabase 프로젝트 ref가 같으니 세션 키(`sb-<ref>-auth-token`)도 자동으로 일치합니다.

## 폴더 구조

```
.
├── index.html              # React 앱 진입점
├── src/                    # 골프 정산 (React + Vite)
│   ├── App.jsx             #   로그인 → 허브 → 골프 라우팅
│   ├── components/
│   │   ├── LoginPage.jsx   #   구글 로그인 (두 앱 공통 진입점)
│   │   ├── AppHub.jsx      #   앱 선택 화면
│   │   └── ...
│   └── utils/
│       ├── supabase.js     #   .env의 URL/키로 클라이언트 생성
│       └── storage.js      #   인증 + 라운드 저장
├── public/game/            # 재무제표 학습 게임 (바닐라 JS, 빌드 없음)
│   ├── index.html          #   CDN Tailwind + CDN supabase-js
│   └── js/
│       ├── supabase-config.js  # 게임 쪽 Supabase 접속 정보 (하드코딩)
│       ├── auth.js         #   허브가 만든 세션을 복원만 함 (로그인 화면 없음)
│       └── ...
├── supabase-schema.sql     # 골프 테이블 (current_round, rounds)
└── vite.config.js          # dev 서버에서 /game/ → /game/index.html 재작성
```

`public/` 아래 파일은 Vite가 빌드 시 `dist/`로 **무변환 복사**합니다.
그래서 게임은 번들러를 타지 않고 원본 그대로 배포됩니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:5173/
npm run build   # dist/ (dist/game/ 포함)
```

## Supabase

- 프로젝트 ref: `cgkocnezpitydxrflxom` (이름 `finance-statement-game`, 서울 리전)
- 테이블 3개가 한 프로젝트에 있고, 모두 RLS로 **본인 행만** 접근합니다.
  - `current_round` — 골프: 작업 중인 라운드 (사용자당 1행)
  - `rounds` — 골프: 저장된 라운드 히스토리
  - `game_records` — 게임: 게임별 기록
- 로그인은 **구글 OAuth 하나**입니다. 게임에 있던 이름+비밀번호 로그인은 통합하면서 제거했습니다.
- 접속 정보가 두 군데에 있습니다. 프로젝트를 옮길 때는 **둘 다** 바꿔야 합니다.
  - React 쪽: `.env` / `.env.local` + Vercel 환경변수 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
  - 게임 쪽: `public/game/js/supabase-config.js`
- publishable key(`sb_publishable_...`)는 브라우저에 공개되는 것이 정상입니다.
  실제 방어선은 RLS이며, `service_role`/`secret` 키는 저장소에 절대 넣지 않습니다.

### 주의 — 무료 플랜 자동 일시정지

1주간 요청이 없으면 프로젝트가 일시정지되고 두 앱 모두 로그인이 실패합니다.
Supabase 대시보드에서 Resume하면 몇 분 뒤 복구됩니다.
통합했으므로 **둘 중 하나만 써도 함께 살아있습니다.**

## 배포

`main`에 push하면 Vercel(`golf-calculator`)이 자동 배포합니다.
