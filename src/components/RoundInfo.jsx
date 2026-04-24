export default function RoundInfo({ date, course, onChange }) {
  return (
    <section className="card">
      <div className="card-title">
        <span>📅</span> 라운드 정보
      </div>
      <div className="round-info-grid">
        <div className="form-group">
          <label><span className="icon-sm">📅</span> 날짜</label>
          <input
            type="date"
            value={date}
            onChange={e => onChange({ date: e.target.value })}
            placeholder="날짜 선택"
          />
        </div>
        <div className="form-group">
          <label><span className="icon-sm">📍</span> 골프장</label>
          <input
            type="text"
            placeholder="골프장 이름 입력"
            value={course}
            onChange={e => onChange({ course: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}
