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

### 무료 플랜 자동 일시정지와 자동 깨우기

무료 플랜은 7일간 요청이 없으면 프로젝트를 일시정지시키고, 그러면 두 앱 모두 로그인이 실패합니다.
화면은 "불러오는 중..."에서 멈추고 Supabase 도메인은 DNS조차 잡히지 않습니다.

이를 막기 위해 **매일 한 번 자동으로 DB를 깨우는 크론**이 돌고 있습니다.

- `api/keepalive.js` — PostgREST를 거쳐 실제 DB까지 도달하는 SELECT 1건을 보냅니다.
- `vercel.json`의 `crons` — 매일 03:00 UTC(한국 정오)에 호출합니다.
  Hobby 플랜은 하루 1회가 상한이며, 7일 기준이라 이걸로 충분합니다.
- Vercel 서버에서 도는 스케줄이라 **개발자 PC가 꺼져 있어도 동작합니다.**

상태를 직접 보려면 https://golf-calculator-six.vercel.app/api/keepalive 를 열어보면 됩니다.
`{"ok":true,...}` 가 나오면 정상입니다.

```bash
vercel crons ls              # 등록된 크론 확인
vercel crons run /api/keepalive   # 지금 즉시 한 번 실행
npm test                     # keepalive 분기별 단위 테스트
```

**이미 정지된 프로젝트는 크론으로 깨어나지 않습니다.** 크론은 정지되기 전에 막는 장치입니다.
정지된 뒤에는 대시보드에서 수동 복원해야 합니다.

- 대시보드: https://supabase.com/dashboard/project/cgkocnezpitydxrflxom → **Restore project**
- 또는 Management API (토큰은 macOS 키체인의 `Supabase CLI` 항목에 있습니다)

```bash
curl -X POST "https://api.supabase.com/v1/projects/cgkocnezpitydxrflxom/restore" \
  -H "Authorization: Bearer $(security find-generic-password -s 'Supabase CLI' -w)" \
  -H "Content-Type: application/json" -d '{}'
```

## 배포

`main`에 push하면 Vercel(`golf-calculator`)이 자동 배포합니다.
