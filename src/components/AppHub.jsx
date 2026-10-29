// 로그인 후 어떤 앱으로 들어갈지 고르는 허브 화면
// 재무제표 게임과 이북리더기는 같은 오리진의 정적 페이지라 공통 배포 주소에서 바로 이어진다.
// 쟈베스 업무관리 시스템은 별도 Vercel 프로젝트(jabez-workspace)라 배포 주소로 연결하고, 로그인은 그 앱의 회사 계정으로 따로 한다.
// 유튜브 다운로더는 Vercel 서버에서 유튜브가 봇 확인으로 막아(2026-10-29 iad1, icn1 시험) 이 맥에서 도는 로컬 앱(8777 포트)으로 연결한다.
export default function AppHub({ username, onSelectGolf, onSelectMeeting, onLogout }) {
  return (
    <div className="hub-page">
      <header className="hub-header">
        <div className="hub-user">
          <span className="hub-user-name">{username}</span>
          <button className="hub-logout" onClick={onLogout}>🚪 로그아웃</button>
        </div>
      </header>

      <main className="hub-main">
        <div className="hub-intro">
          <h1>어떤 앱을 여시겠어요?</h1>
          <p>필요한 도구를 골라 바로 시작하세요</p>
        </div>

        <div className="hub-cards">
          <button type="button" className="hub-card hub-card-golf" onClick={onSelectGolf}>
            <span className="hub-card-icon">⛳</span>
            <span className="hub-card-body">
              <span className="hub-card-title">골프 정산</span>
              <span className="hub-card-desc">라운드 비용을 참가자별로 나눠 정산합니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </button>

          <button type="button" className="hub-card hub-card-meeting" onClick={onSelectMeeting}>
            <span className="hub-card-icon">🧾</span>
            <span className="hub-card-body">
              <span className="hub-card-title">모임 정산</span>
              <span className="hub-card-desc">인원 제한 없이 모임 비용을 나눠 정산합니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </button>

          <a className="hub-card hub-card-game" href="/game/">
            <span className="hub-card-icon">📊</span>
            <span className="hub-card-body">
              <span className="hub-card-title">재무제표 학습 게임</span>
              <span className="hub-card-desc">손익계산서·재무상태표 순서를 드래그로 익힙니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>

          <a className="hub-card hub-card-reader" href="/reader/">
            <span className="hub-card-icon">▧</span>
            <span className="hub-card-body">
              <span className="hub-card-title">이북리더기</span>
              <span className="hub-card-desc">TXT와 Markdown 파일을 내 눈에 맞게 읽습니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>

          <a className="hub-card hub-card-pomodoro" href="/pomodoro/">
            <span className="hub-card-icon">⏱</span>
            <span className="hub-card-body">
              <span className="hub-card-title">뽀모도로 타이머</span>
              <span className="hub-card-desc">다이얼을 움직여 집중과 휴식 시간을 정합니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>

          <a className="hub-card hub-card-quiz" href="/quiz/">
            <span className="hub-card-icon">🙋</span>
            <span className="hub-card-body">
              <span className="hub-card-title">퀴즈게임</span>
              <span className="hub-card-desc">수강생이 QR로 들어와 폰으로 답하는 실시간 퀴즈</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>

          <a className="hub-card hub-card-assistant" href="/assistant/">
            <span className="hub-card-icon">🤖</span>
            <span className="hub-card-body">
              <span className="hub-card-title">노션 비서</span>
              <span className="hub-card-desc">한 줄로 적으면 노션과 구글 캘린더, 구글 할 일에 함께 기록합니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>

          <a className="hub-card hub-card-youtube" href="http://127.0.0.1:8777/">
            <span className="hub-card-icon">📥</span>
            <span className="hub-card-body">
              <span className="hub-card-title">유튜브 다운로더</span>
              <span className="hub-card-desc">유튜브 영상을 mp4나 mp3로 받습니다. 이 맥에서 켜 둔 앱으로 열립니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>

          <a className="hub-card hub-card-jabez" href="https://jabez-workspace.vercel.app/">
            <span className="hub-card-icon">💼</span>
            <span className="hub-card-body">
              <span className="hub-card-title">쟈베스 업무관리 시스템</span>
              <span className="hub-card-desc">부서별 주간 보고를 모으고 회의록과 할 일을 관리합니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>
        </div>
      </main>
    </div>
  );
}
