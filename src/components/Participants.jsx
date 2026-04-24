const COLORS = ['#4caf50', '#2196f3', '#ff9800', '#f44336'];
const LABELS = ['참가자 1', '참가자 2', '참가자 3', '참가자 4'];

export default function Participants({ participants, onChange }) {
  const named = participants.filter(p => p && p.trim());

  return (
    <section className="card">
      <div className="card-title">
        <span>👥</span> 참가자 입력
      </div>
      <div className="participants-grid">
        {participants.map((p, i) => (
          <div key={i} className="form-group">
            <label style={{ color: COLORS[i] }}>● {LABELS[i]}</label>
            <input
              type="text"
              placeholder="이름 입력"
              value={p}
              onChange={e => {
                const next = [...participants];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
          </div>
        ))}
      </div>
      {named.length > 0 && (
        <div className="participant-badges">
          {participants.map((p, i) =>
            p.trim() ? (
              <span key={i} className="badge" style={{ backgroundColor: COLORS[i] }}>
                {p.trim()}
              </span>
            ) : null
          )}
        </div>
      )}
    </section>
  );
}
