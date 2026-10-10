# 앱 모음 — 골프 정산 · 모임 정산 · 재무제표 학습 게임 · 이북리더기

구글 로그인(또는 비회원 입장) 한 번으로 네 개의 앱을 쓰는 통합 웹앱입니다.
Supabase 무료 플랜의 프로젝트 개수 제한 때문에 원래 따로 있던 두 앱을
**Supabase 프로젝트 1개 + 배포 도메인 1개**로 합쳤습니다.

배포 주소: https://golf-calculator-six.vercel.app

## 화면 흐름

```
/            로그인(구글 또는 비회원) → 앱 선택 허브
  ├─ 골프 정산      React 화면 전환 (같은 페이지 안)
  ├─ 모임 정산      React 화면 전환 (같은 페이지 안) — 인원 가변, 항목명 직접 입력
  └─ 재무제표 게임   /game/ 으로 이동
  └─ 이북리더기      /reader/ 로 이동
```

네 앱은 **같은 오리진**에 있습니다. Supabase 세션은 브라우저 localStorage에
오리진 단위로 저장되므로, 도메인을 하나로 합쳐야 한 번의 로그인이 양쪽에 모두 적용됩니다.
Supabase 프로젝트 ref가 같으니 세션 키(`sb-<ref>-auth-token`)도 자동으로 일치합니다.

## 폴더 구조

```
.
├── index.html              # React 앱 진입점
├── src/                    # 골프 정산 (React + Vite)
│   ├── App.jsx             #   로그인 → 허브 → 골프 라우팅
│   ├── components/
│   │   ├── LoginPage.jsx   #   구글 로그인 + 비회원 입장 (네 앱 공통 진입점)
│   │   ├── AppHub.jsx      #   앱 선택 화면
│   │   ├── MeetingApp.jsx  #   모임 정산 화면 (Meeting*.jsx 는 모임 전용 카드)
│   │   └── ...
│   └── utils/
│       ├── supabase.js     #   .env의 URL/키로 클라이언트 생성
│       ├── storage.js      #   인증 + 라운드 저장
│       ├── meeting.js      #   모임: 인원 추가·삭제·이름 수정 규칙 (순수 함수)
│       ├── meetingStorage.js # 모임: 작업본·저장 목록 저장
│       └── settlement.js   #   정산 계산 (골프·모임 공용)
├── public/game/            # 재무제표 학습 게임 (바닐라 JS, 빌드 없음)
│   ├── index.html          #   CDN Tailwind + CDN supabase-js
│   └── js/
│       ├── supabase-config.js  # 게임 쪽 Supabase 접속 정보 (하드코딩)
│       ├── auth.js         #   허브가 만든 세션을 복원만 함 (로그인 화면 없음)
│       └── ...
├── quiz/index.html         # 퀴즈게임 페이지(/quiz/) — Vite 두 번째 입력. 코드는 src/quiz/
├── supabase-quiz-schema.sql # 퀴즈게임 테이블 4개, RLS, 수강생 함수
├── public/reader/          # 이북리더기 배포본 (TXT·MD·PDF, 쪽 넘김·목차·메모 — 원본은 AI스터디/2026-09-18_이북리더기)
├── supabase-schema.sql     # 골프·모임 테이블 (current_round, rounds, current_meeting, meetings)
├── tests/                  # 단위 테스트(node --test) + tests/e2e/ 브라우저 테스트(Playwright)
└── vite.config.js          # dev 서버에서 /game/ → /game/index.html 재작성
```

`public/` 아래 파일은 Vite가 빌드 시 `dist/`로 **무변환 복사**합니다.
그래서 게임과 이북리더기는 번들러를 타지 않고 정적 파일 그대로 배포됩니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:5173/
npm run build   # dist/ (dist/game/ 포함)
npm test        # 단위 테스트 (keepalive, 모임 정산 모델·정산 계산)
npm run test:e2e  # 브라우저 테스트 — Supabase를 가짜로 대체하므로 실제 DB에 쓰지 않음
npm run test:quiz # 퀴즈게임 실DB 테스트(권한 12개 + 강사 1명, 수강생 5명 전체 흐름)
                  # 실제 Supabase에 quiz_test 표식을 단 익명 강사를 만들고 끝나면 그 계정만 지운다
                  # 이북리더기는 tests/e2e/reader.spec.mjs (구글 드라이브·GIS도 가짜로 대체)
```

## Supabase

- 프로젝트 ref: `cgkocnezpitydxrflxom` (이름 `finance-statement-game`, 서울 리전)
- 테이블 5개가 한 프로젝트에 있고, 모두 RLS로 **본인 행만** 접근합니다.
  - `current_round` — 골프: 작업 중인 라운드 (사용자당 1행)
  - `rounds` — 골프: 저장된 라운드 히스토리
  - `current_meeting` — 모임: 작업 중인 모임 (사용자당 1행)
  - `meetings` — 모임: 저장된 모임 히스토리
  - `game_records` — 게임: 게임별 기록
  - `quiz_quizzes`, `quiz_sessions`, `quiz_participants`, `quiz_responses` — 퀴즈게임 (아래 「퀴즈게임」 절)
- 로그인은 **구글 OAuth**와 **비회원 입장(Supabase 익명 로그인)** 두 가지입니다. 게임에 있던 이름+비밀번호 로그인은 통합하면서 제거했습니다.
  - 비회원은 이메일 없는 익명 계정(`auth.users.is_anonymous = true`)이라 RLS가 그대로 적용되어 자기 기록만 봅니다.
    화면에는 이름 대신 「비회원」으로 나옵니다. 세션이 그 브라우저에만 있어서 **로그아웃하면 그 기록으로 돌아올 수 없고**,
    그래서 비회원 로그아웃에만 경고를 띄웁니다.
  - 켜는 스위치는 Supabase Auth 설정 `external_anonymous_users_enabled`입니다. 끄면 버튼이 오류 문구를 띄웁니다.
    남용 방지는 기본 한도(IP당 시간당 30회)만 걸려 있고 CAPTCHA는 없습니다.
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

## 퀴즈게임 (/quiz/)

슬라이도처럼 강사가 문제를 띄우고 수강생이 QR로 들어와 폰으로 답한다. 강사가 한 문제씩 넘기는 라이브형이다.

- **강사** — 허브에서 로그인(구글 또는 비회원) 뒤 「퀴즈게임」 카드. 퀴즈 만들기 → 진행 시작 → 빔프로젝터에 QR과 6자리 입장코드.
  문제 유형은 객관식(보기 2개부터 개수 제한 없음), 예/아니오, 주관식, 목록형(「관광도시 N개 쓰기」, 맞춘 개수만큼 점수).
  정답은 미리 넣어 두고 「정답 공개」를 눌러야 수강생에게 간다. 정답을 비워 두면 채점 없는 설문이 된다.
- **수강생** — 로그인 없음. `/quiz/?c=입장코드`에서 이름만 넣는다. 기기에 토큰이 남아 새로고침해도 같은 사람이다.
  Supabase 익명 로그인을 쓰지 않는 이유는 IP당 시간당 30회 한도 때문이다. 같은 와이파이의 강의실이면 30명에서 막힌다.
- **채점** — 띄어쓰기, 대소문자, 문장부호를 무시한다(`src/quiz/scoring.js`). 목록형은 같은 답 중복을 한 번만 센다.
  마감 뒤 「정답 목록에 없는 답」을 많이 쓴 순으로 보여 주고, 「새 정답으로 인정」 또는 「다른 표기로 묶기」 한 번에 전원 재채점한다.
  인정한 답은 그 진행에만 남고 원래 퀴즈에는 들어가지 않는다.
- **보안** — 수강생은 테이블을 직접 읽지 못하고(RLS) 함수 세 개(`quiz_join`, `quiz_player_state`, `quiz_submit`)로만 접근한다.
  문제는 허용 목록 방식(`quiz_public_question`)으로 정답 필드를 빼고 내려간다. 강사는 본인 퀴즈와 세션만 본다.
- **실시간** — 바뀌면 Realtime 채널로 신호만 보내고(`httpSend`) 받는 쪽이 다시 읽는다. 수강생 채널 `quiz-<코드>`와
  강사 채널 `quiz-host-<코드>`를 나눠 한 사람의 제출이 다른 수강생 폰을 깨우지 않는다. 신호가 빠져도 몇 초마다 다시 읽는다.

## 배포

`main`에 push해도 **자동 배포되지 않습니다**(Git 연동 없음, 2026-09-25와 2026-10-11에 확인). 직접 올립니다.

```bash
# .vercel/project.json 이 golf-calculator(prj_eqHLlSM4baDoxtwiqVzsZ0v5nuGr)를 가리키는 폴더에서
vercel --prod --yes          # 끝나면 golf-calculator-six.vercel.app 으로 연결(Aliased)된다
curl -s https://golf-calculator-six.vercel.app/quiz/ | grep '<title>'   # 운영에 새 파일이 있는지 확인
QUIZ_BASE_URL=https://golf-calculator-six.vercel.app npx playwright test -c playwright.quiz.config.mjs  # 운영 주소로 퀴즈 E2E
```
