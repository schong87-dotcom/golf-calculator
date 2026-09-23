// 모임 정산 참가자 입력 카드. 기본 4칸에서 + 인원 추가로 늘리고, × 로 지운다(최소 2칸).
import { useState } from 'react';
import { colorAt } from '../utils/palette';
import { MIN_PARTICIPANTS } from '../utils/meeting';

export default function MeetingParticipants({ participants, duplicates, onRename, onAdd, onRemove }) {
  // 방금 추가한 칸에만 커서를 준다. 인덱스 key라 새 칸은 새로 마운트되어 autoFocus가 먹는다.
  const [focusIndex, setFocusIndex] = useState(null);
  const namedCount = participants.filter(p => p && p.trim()).length;
  const canRemove = participants.length > MIN_PARTICIPANTS;

  const handleAdd = () => {
    setFocusIndex(participants.length);
    onAdd();
  };

  return (
    <section className="card">
      <div className="card-title-row">
        <div className="card-title">
          <span>👥</span> 참가자 입력
        </div>
        {namedCount > 0 && (
          <div className="total-amount">
            <span>참가 인원</span>
            <span className="total-amount-value">{namedCount}명</span>
          </div>
        )}
      </div>

      <div className="participants-grid">
        {participants.map((p, i) => (
          <div key={i} className="form-group">
            <div className="participant-label-row">
              <label style={{ color: colorAt(i) }}>● 참가자 {i + 1}</label>
              {canRemove && (
                <button
                  type="button"
                  className="btn-remove-participant"
                  onClick={() => onRemove(i)}
                  aria-label={`참가자 ${i + 1} 삭제`}
                  title="삭제"
                >
                  ×
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="이름 입력"
              value={p}
              autoFocus={i === focusIndex}
              onChange={e => onRename(i, e.target.value)}
            />
          </div>
        ))}
      </div>

      <button type="button" className="btn-add-item" onClick={handleAdd}>
        + 인원 추가
      </button>

      {duplicates.length > 0 && (
        <p className="error-msg participant-warning">
          이름이 겹칩니다 — {duplicates.join(', ')}. 정산하려면 구분해서 입력해 주세요 (예: 김민수A).
        </p>
      )}

      {namedCount > 0 && (
        <div className="participant-badges">
          {participants.map((p, i) =>
            p.trim() ? (
              <span key={i} className="badge" style={{ backgroundColor: colorAt(i) }}>
                {p.trim()}
              </span>
            ) : null
          )}
        </div>
      )}
    </section>
  );
}
