// 로그인 후 어떤 앱으로 들어갈지 고르는 허브 화면
// 재무제표 게임은 같은 오리진의 정적 페이지(/game/)라 Supabase 세션이 그대로 이어진다.
export default function AppHub({ username, onSelectGolf, onLogout }) {
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
          <p>한 번 로그인하면 두 앱 모두 그대로 이어집니다</p>
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

          <a className="hub-card hub-card-game" href="/game/">
            <span className="hub-card-icon">📊</span>
            <span className="hub-card-body">
              <span className="hub-card-title">재무제표 학습 게임</span>
              <span className="hub-card-desc">손익계산서·재무상태표 순서를 드래그로 익힙니다</span>
            </span>
            <span className="hub-card-arrow">›</span>
          </a>
        </div>
      </main>
    </div>
  );
}
