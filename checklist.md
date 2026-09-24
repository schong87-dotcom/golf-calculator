# 구글 로그인 전환 체크리스트

## 코드 변경
- [x] storage.js: login() 제거, loginWithGoogle() + onAuthChange() 추가
- [x] LoginPage.jsx: 아이디/비번 폼 → 구글 로그인 버튼으로 교체
- [x] App.jsx: onAuthChange 기반 세션 처리로 변경
- [x] App.css: 구글 버튼 스타일 추가

## 외부 설정 (브라우저에서 수동)
- [x] 구글 클라우드 콘솔: OAuth 클라이언트 ID 생성
- [x] Supabase: Google 프로바이더 활성화 (클라이언트 ID/시크릿 입력)
- [x] Supabase: URL Configuration — Site URL(배포 주소) + localhost 추가

## 검증
- [x] npm run build 통과
- [x] 로컬에서 구글 로그인 → 라운드 저장/불러오기 확인
- [x] 커밋
- [x] Vercel 배포 후 실제 주소에서 로그인 확인

---

# 헤더 "골프 정산" 가독성 개선 (2026-08-08)

- [x] 원인 규명: index.css 전역 `h1{color:#222}`가 헤더의 상속 white를 덮어씀
- [x] App.css `.header-title h1`에 `color:#fff` 명시
- [x] 폰트 확대 (h1 18→20px, 부제 11→12px) — 헤더 높이 60→62px, 레이아웃 유지
- [x] npm run build 통과
- [x] 렌더 스크린샷으로 흰 글씨·레이아웃 육안 확인
- [x] 커밋 + GitHub 푸시
- [x] Vercel 프로덕션 배포

---

# 재무제표 게임 통합 (2026-08-22)

목표: Supabase 프로젝트 1개 + 배포 도메인 1개로 합치고, 로그인 후 두 앱을 골라 들어가게 한다.

## 결정 사항 (사용자 확인 완료)
- Supabase는 `finance-statement-game`(cgkocnezpitydxrflxom, 서울)을 살려서 통합 대상으로 쓴다.
- 골프정산기의 기존 Supabase 데이터(도쿄 프로젝트)는 버린다.
- 로그인은 구글 하나로 통일한다. 게임의 이름+비밀번호 로그인은 제거한다.
- 배포는 Vercel `golf-calculator`(https://golf-calculator-six.vercel.app)를 재사용한다.

## 코드 통합
- [x] 재무제표 게임 파일을 `public/game/`으로 복사 (index.html + js/*)
- [x] 게임 auth.js: 이름+비번 로그인·legacy 이관 제거, 구글 세션만 사용
- [x] 게임 app.js: 로그인 화면 제거 → 세션 없으면 허브(`/`)로 보냄
- [x] 게임 헤더에 "앱 선택" 복귀 버튼 추가
- [x] `src/components/AppHub.jsx` 신규 — 앱 선택 카드 2장
- [x] `src/App.jsx`: 로그인 → 허브 → 골프정산기 흐름으로 변경
- [x] 골프 Header에 "앱 선택" 복귀 버튼 추가
- [x] `.env` / `.env.local`을 통합 Supabase 값으로 교체

## 외부 설정
- [x] Supabase `finance-statement-game` 프로젝트 Resume
- [x] 골프 스키마(current_round, rounds)를 통합 프로젝트에 적용
- [x] Supabase URL Configuration에 golf-calculator 주소 + localhost:5173 등록
- [x] vite.config.js: dev 서버가 `/game/`을 SPA fallback으로 가로채는 문제 해결
- [x] Vercel `golf-calculator` 환경변수 2개 교체

## 검증
- [x] npm run build 통과
- [x] 로컬: 구글 로그인 1회 → 골프/게임 양쪽 모두 로그인 상태 유지 확인
- [x] 로컬: 라운드 저장/불러오기 + 게임 기록 저장 확인
- [x] 커밋 + 배포
- [x] 배포 주소에서 동일 검증

## 옛 주소 통합 (2026-08-22 추가)
- [x] `finance-statement-game` 레포에 vercel.json 리다이렉트 추가 (모든 경로 → 통합 주소 루트)
- [x] 그 레포 README 상단에 통합 안내 + 실제 서비스 코드 위치 표시
- [x] index.html: 탭 제목을 통합 앱 이름으로, lang을 ko로 수정
- [x] 옛 주소 전 경로(`/`, `/game/`, `/js/app.js`, 임의 경로) 307 리다이렉트 확인
- [x] 브라우저로 옛 주소 접근 → 통합 허브 표시 + 로그인 유지 확인

# Supabase 자동 깨우기 (2026-09-04)

계기: 2026-09-03 밤 접속 불가. Supabase가 미사용 7일 초과로 INACTIVE 상태였다.
사용자 요청 — "자동깨우기 만들어줘. 컴퓨터가 꺼져있어도 가능하게."

- [x] Supabase 프로젝트 수동 복원 (Management API restore → ACTIVE_HEALTHY)
- [x] `api/keepalive.js` 작성 — PostgREST 경유 SELECT로 DB까지 도달
- [x] `vercel.json` crons 추가 — 매일 03:00 UTC (Hobby 상한이 하루 1회)
- [x] `tests/keepalive.test.mjs` 6개 작성, `npm test` 스크립트 추가 → 6 pass
- [x] `.gitignore`에 `00_프롬프트/` 추가 (public 레포에 대화기록 유출 방지)
- [x] 빌드 통과 + dist/game 유지 확인
- [x] 배포 후 `/api/keepalive` → `{"ok":true,"status":200}` 확인
- [x] `vercel crons ls`로 등록 확인, `vercel crons run`으로 실제 트리거 확인
- [x] 허브·게임 화면, 옛 주소 리다이렉트 모두 안 깨진 것 확인
- [ ] Google Drive 폴더의 손상된 .git 정리 (사용자 결정 대기)

# 모임 정산 추가 (2026-09-24)

요청 — 골프 정산과 같은 방식(결제한 사람·부담하는 사람 체크)이되, 인원을 + 버튼으로 늘리고(기본 4명)
비용 항목명은 비워 두고 직접 채운다. 사용자 선택 — **앱 허브에 4번째 앱으로 추가, 클라우드 저장, 운영 배포까지.**

## 요구 → 판정 조건 → 테스트

| 원문 | 판정 조건 | 테스트 |
|---|---|---|
| 결제자·부담자 체크 방식은 똑같이 | 항목마다 결제한 사람·제외되는 사람 체크가 참가자 수만큼. 6명·3항목 순액·송금이 손계산과 일치 | 단위 「6명 순액/송금」, E2E 「6명 3개 항목」 |
| + 버튼으로 인원 추가, 기본 4명 | 첫 화면 이름 칸 4개. + 인원 추가마다 1칸 증가(12칸까지 확인), 새 칸에 커서 | E2E 「기본 4개이고 + 인원 추가」 |
| 4명 미만도 있음 | × 로 삭제, 3명 정산 가능, 2칸 밑으로는 삭제 버튼 없음 | E2E 「3명으로 줄여도」, 단위 「최소 2칸」 |
| 항목은 비워 두고 직접 채움 | 첫 화면 항목명 빈칸, 골프 항목명(그린피 등) 없음, 항목 추가 가능 | E2E 「이름이 빈칸으로 시작」 |
| 앱 허브에 추가·클라우드 저장 | 허브 카드 → 모임 화면. 저장 → meetings, 입력 → current_meeting, 저장 목록에서 불러오기, 새로고침 후 유지 | E2E 3개 + 운영 DB RLS 시험 |
| (골프 영향 없음) | 골프 4칸·기본 항목명 4개·인원 추가 버튼 없음 | E2E 「골프 정산은 그대로다」 |

## 작업
- [x] 테스트 먼저 작성 → 빨강 확인 (단위: 모듈 없음 / E2E: 모임 10개 실패, 골프 1개 통과)
- [x] `src/utils/meeting.js` 모델 (인원 추가·삭제·이름 수정 시 체크 이동, 겹치는 이름)
- [x] 모임 화면 컴포넌트 4개 + 허브 카드 + 로그인 화면·탭 제목 문구
- [x] 공용 부품 확장 (팔레트 12색, 헤더 props, 체크박스 key)
- [x] 작업본 저장 직렬화 — 역순 도착 버그 수정 (수정 빼면 10/10 실패, 넣으면 10/10 통과)
- [x] Supabase `current_meeting`·`meetings` + RLS 적용, 익명 조회 0행·익명 저장 42501 확인
- [x] `npm test` 24 pass, `npm run test:e2e` 11 pass, `npm run build` 통과, lint 신규 오류 0 (전체 96건은 기존)
- [x] 커밋 2개 + 푸시 (b86a5ac, 4fb674a)
- [x] Vercel 운영 배포 — 운영 번들에 모임 문구·테이블명 확인, /game/·/reader/·keepalive 200
- [x] 운영 DB에서 실제 사용자 uid 권한으로 저장·조회·수정·삭제 1건씩 성공, 남의 uid 저장 42501 (트랜잭션 되돌림, 0행)
- [ ] 실제 구글 로그인 화면으로 저장·불러오기 클릭 확인 — 크롬 확장 미연결로 못 함

# 비회원으로 입장하기 (2026-09-24)

요청 — 로그인 방식을 하나 더. 「비회원으로 입장하기」를 누르면 그냥 쓰게. 배포까지.

| 원문 | 판정 조건 | 테스트 |
|---|---|---|
| 로그인 방식 하나 추가 | 로그인 화면에 구글 버튼과 「비회원으로 입장하기」가 함께 있음 | guest.spec 1 |
| 누르면 그냥 사용 | 누르면 구글 로그인 없이 허브, 이름 「비회원」 / 모임·골프 저장이 익명 uid로 / 게임이 허브로 튕기지 않음 | guest.spec 2·3·4·8, 운영 확인 |
| (유지) | 새로고침해도 비회원 상태 유지, 다시 가입하지 않음 | guest.spec 5 |
| (경고) | 비회원 로그아웃만 경고(취소하면 남음), 구글 사용자는 지금처럼 확인창 없음 | guest.spec 6·7·8 |
| (실패 시) | 익명 로그인이 꺼져 있으면 오류 문구, 로그인 화면에 남음 | guest.spec 9 |

- [x] 테스트 먼저 → 빨강 확인 (8 실패, 구글 로그아웃 1개는 기존 동작이라 통과)
- [x] `storage.loginAsGuest` + 익명 사용자 이름 '비회원' (안 하면 username이 비어 로그인 화면에 갇힘)
- [x] 로그인 화면 버튼·구분선·안내 문구, 비회원 로그아웃 경고 (허브·게임)
- [x] Supabase `external_anonymous_users_enabled = true`
- [x] `npm test` 24 pass, `npm run test:e2e` 20 pass, build 통과, lint 96건 그대로(신규 0)
- [x] 커밋 2개 + 푸시 (23c361d, 25a0276), Vercel 운영 배포 — 번들에 새 문구 확인
- [x] 운영 주소 실측 — 비회원 입장 → 허브 「비회원」 → 모임 저장(meetings·current_meeting 각 1행, is_anonymous=true)
      → /game/ 진입 「비회원」 표시 → 구글 버튼은 accounts.google.com으로 이동. 시험 익명 계정은 삭제(연쇄 삭제로 0행)
