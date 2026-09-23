// 모임 정산의 날짜·모임 이름 입력 카드 (골프의 RoundInfo에 해당)
export default function MeetingInfo({ date, title, onChange }) {
  return (
    <section className="card">
      <div className="card-title">
        <span>📅</span> 모임 정보
      </div>
      <div className="round-info-grid">
        <div className="form-group">
          <label><span className="icon-sm">📅</span> 날짜</label>
          <input
            type="date"
            value={date}
            onChange={e => onChange({ date: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label><span className="icon-sm">📍</span> 모임 이름</label>
          <input
            type="text"
            placeholder="예: 9월 동창회"
            value={title}
            onChange={e => onChange({ title: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}
