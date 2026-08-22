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
