// 저장된 모임 목록 팝업. 누르면 불러오고 🗑 로 지운다 (골프의 HistoryModal에 해당)
import { useState, useEffect } from 'react';
import { getSavedMeetings } from '../utils/meetingStorage';

export default function MeetingHistoryModal({ onLoad, onDelete, onClose }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSavedMeetings().then(data => {
      setMeetings(data);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (e, dbId) => {
    e.stopPropagation();
    if (!window.confirm('이 저장 기록을 삭제하시겠습니까?')) return;
    await onDelete(dbId);
    setMeetings(prev => prev.filter(m => m.dbId !== dbId));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📂 저장된 모임</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {loading ? (
          <p className="modal-empty">불러오는 중...</p>
        ) : meetings.length === 0 ? (
          <p className="modal-empty">저장된 모임이 없습니다.</p>
        ) : (
          <ul className="history-list">
            {meetings.map(m => {
              const names = m.participants.filter(p => p && p.trim());
              return (
                <li key={m.dbId} className="history-item" onClick={() => { onLoad(m); onClose(); }}>
                  <div className="history-info">
                    <p className="history-title">{m.title || '(모임 이름 미입력)'}</p>
                    <p className="history-meta">
                      {m.date || '날짜 미입력'} &nbsp;·&nbsp; {names.length}명 &nbsp;·&nbsp; {names.join(', ')}
                    </p>
                  </div>
                  <button
                    className="btn-icon btn-danger"
                    onClick={e => handleDelete(e, m.dbId)}
                    title="삭제"
                  >
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
