import { useState } from 'react';
import { formatNumber } from '../utils/settlement';

export default function CostItem({ item, participants, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(true);
  const named = participants.filter(p => p && p.trim());

  const togglePayer = name => {
    const payers = item.payers.includes(name)
      ? item.payers.filter(p => p !== name)
      : [...item.payers, name];
    onChange({ ...item, payers });
  };

  const toggleExcluded = name => {
    const excluded = item.excluded.includes(name)
      ? item.excluded.filter(p => p !== name)
      : [...item.excluded, name];
    onChange({ ...item, excluded });
  };

  const handleAmountChange = e => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    onChange({ ...item, amount: raw ? Number(raw) : '' });
  };

  return (
    <div className="cost-item">
      <div className="cost-item-header">
        <input
          className="cost-item-name"
          type="text"
          value={item.name}
          onChange={e => onChange({ ...item, name: e.target.value })}
          placeholder="항목명 입력"
        />
        <div className="cost-item-right">
          <div className="amount-input-wrap">
            <input
              className="amount-input"
              type="text"
              inputMode="numeric"
              value={item.amount !== '' ? formatNumber(item.amount) : ''}
              onChange={handleAmountChange}
              placeholder="금액 입력"
            />
            <span className="won">원</span>
          </div>
          <button className="btn-icon" onClick={() => setExpanded(v => !v)} title={expanded ? '접기' : '펼치기'}>
            {expanded ? '▲' : '▼'}
          </button>
          <button className="btn-icon btn-danger" onClick={onDelete} title="삭제">
            🗑
          </button>
        </div>
      </div>

      {expanded && (
        <div className="cost-item-body">
          <div className="checker-group">
            <p className="checker-label payer-label">결제한 사람</p>
            {named.length === 0 ? (
              <p className="hint">먼저 참가자 이름을 입력해주세요</p>
            ) : (
              <div className="checker-list">
                {named.map(name => (
                  <label key={name} className="checker-item">
                    <input
                      type="checkbox"
                      checked={item.payers.includes(name)}
                      onChange={() => togglePayer(name)}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="checker-group">
            <p className="checker-label excluded-label">제외되는 사람</p>
            {named.length === 0 ? (
              <p className="hint">먼저 참가자 이름을 입력해주세요</p>
            ) : (
              <div className="checker-list">
                {named.map(name => (
                  <label key={name} className="checker-item">
                    <input
                      type="checkbox"
                      checked={item.excluded.includes(name)}
                      onChange={() => toggleExcluded(name)}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
