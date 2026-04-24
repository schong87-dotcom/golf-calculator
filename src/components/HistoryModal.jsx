import { useState, useEffect } from 'react';
import { getSavedRounds } from '../utils/storage';

export default function HistoryModal({ onLoad, onDelete, onClose }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSavedRounds().then(data => {
      setRounds(data);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (e, dbId) => {
    e.stopPropagation();
    if (!window.confirm('이 저장 기록을 삭제하시겠습니까?')) return;
    await onDelete(dbId);
    setRounds(prev => prev.filter(r => r.dbId !== dbId));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📂 저장된 라운드</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {loading ? (
          <p className="modal-empty">불러오는 중...</p>
        ) : rounds.length === 0 ? (
          <p className="modal-empty">저장된 라운드가 없습니다.</p>
        ) : (
          <ul className="history-list">
            {rounds.map(r => (
              <li key={r.dbId} className="history-item" onClick={() => { onLoad(r); onClose(); }}>
                <div className="history-info">
                  <p className="history-title">{r.course || '(골프장 미입력)'}</p>
                  <p className="history-meta">
                    {r.date || '날짜 미입력'} &nbsp;·&nbsp;
                    {r.participants.filter(Boolean).join(', ')}
                  </p>
                </div>
                <button
                  className="btn-icon btn-danger"
                  onClick={e => handleDelete(e, r.dbId)}
                  title="삭제"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
