export default function Header({ onSave, onReset, onLogout, onOpenHistory, canSave }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          className={`btn-header-save ${canSave ? '' : 'disabled'}`}
          onClick={canSave ? onSave : undefined}
          title="저장"
        >
          💾 저장
        </button>

        <div className="header-title">
          <span className="header-logo">⛳</span>
          <div>
            <h1>골프 정산</h1>
            <p>라운드 비용 계산기</p>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn-header-icon" onClick={onOpenHistory} title="저장 목록">
            📂
          </button>
          <button className="btn-header-text" onClick={onReset} title="초기화">
            🔄<span className="btn-label"> 초기화</span>
          </button>
          <button className="btn-header-text" onClick={onLogout} title="로그아웃">
            🚪<span className="btn-label"> 로그아웃</span>
          </button>
        </div>
      </div>
    </header>
  );
}
