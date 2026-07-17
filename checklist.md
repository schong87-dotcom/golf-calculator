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
