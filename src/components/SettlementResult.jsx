import { formatNumber } from '../utils/settlement';

const COLORS = ['#4caf50', '#2196f3', '#ff9800', '#f44336'];
const BG_COLORS = ['#e8f5e9', '#e3f2fd', '#fff3e0', '#ffebee'];

function getParticipantColor(name, participants) {
  const idx = participants.indexOf(name);
  return idx >= 0 ? COLORS[idx] : '#888';
}

function getParticipantBg(name, participants) {
  const idx = participants.indexOf(name);
  return idx >= 0 ? BG_COLORS[idx] : '#f5f5f5';
}

function Avatar({ name, participants }) {
  const color = getParticipantColor(name, participants);
  return (
    <span className="avatar" style={{ backgroundColor: color }}>
      {name.slice(0, 1)}
    </span>
  );
}

export default function SettlementResult({ result, participants }) {
  if (!result) return null;
  const { balances, transfers, itemDetails } = result;
  const named = participants.filter(p => p && p.trim());

  return (
    <div className="settlement-result">
      <section className="card">
        <div className="card-title">
          <span>📊</span> 참가자별 정산 현황
        </div>
        <div className="balance-list">
          {named.map(name => {
            const b = balances[name];
            const isPositive = b.net > 0;
            const isNegative = b.net < 0;
            return (
              <div
                key={name}
                className="balance-card"
                style={{ backgroundColor: getParticipantBg(name, participants) }}
              >
                <div className="balance-card-left">
                  <Avatar name={name} participants={participants} />
                  <div>
                    <p className="balance-name">{name}</p>
                    <p className="balance-detail">
                      결제 {formatNumber(b.paid)}원 &nbsp;·&nbsp; 부담 {formatNumber(b.owed)}원
                    </p>
                  </div>
                </div>
                <div className="balance-card-right">
                  <span className={`balance-tag ${isPositive ? 'tag-receive' : 'tag-pay'}`}>
                    {isPositive ? '받아야 할' : isNegative ? '내야 할' : '정산 완료'}
                  </span>
                  <span
                    className="balance-net"
                    style={{ color: isPositive ? '#2e7d32' : isNegative ? '#c62828' : '#555' }}
                  >
                    {isPositive ? '+' : ''}{formatNumber(b.net)}원
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {transfers.length > 0 && (
        <section className="card">
          <div className="card-title">
            <span>💸</span> 최종 송금 내역
          </div>
          <div className="transfer-list">
            {transfers.map((t, i) => (
              <div key={i} className="transfer-row">
                <div className="transfer-from">
                  <Avatar name={t.from} participants={participants} />
                  <span>{t.from}</span>
                </div>
                <div className="transfer-arrow">→</div>
                <div className="transfer-to">
                  <Avatar name={t.to} participants={participants} />
                  <span>{t.to}</span>
                </div>
                <div className="transfer-amount">
                  <span className="transfer-amount-badge">{formatNumber(t.amount)}원</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-title">
          <span>📋</span> 비용 상세 내역
        </div>
        <table className="cost-table">
          <tbody>
            {itemDetails.map(item => {
              if (!item.amount || item.amount <= 0) return null;
              return (
                <tr key={item.id}>
                  <td>
                    <p className="cost-table-name">{item.name}</p>
                    <p className="cost-table-detail">
                      {item.effectivePayers && item.effectivePayers.length > 0
                        ? `결제: ${item.effectivePayers.join(', ')}`
                        : '결제자 없음'}
                      {item.excluded && item.excluded.length > 0
                        ? `, 제외: ${item.excluded.join(', ')}`
                        : ''}
                      {item.perPerson > 0
                        ? `, 1인당 ${formatNumber(item.perPerson)}원`
                        : ''}
                    </p>
                  </td>
                  <td className="cost-table-amount">{formatNumber(item.amount)}원</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="cost-table-total">
              <td>총 계</td>
              <td>
                {formatNumber(
                  itemDetails.reduce((s, i) => s + (Number(i.amount) || 0), 0)
                )}원
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
