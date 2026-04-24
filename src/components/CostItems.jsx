import CostItem from './CostItem';
import { formatNumber } from '../utils/settlement';

let nextId = Date.now();

export default function CostItems({ items, participants, onChange }) {
  const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const updateItem = (id, updated) => {
    onChange(items.map(item => (item.id === id ? updated : item)));
  };

  const deleteItem = id => {
    onChange(items.filter(item => item.id !== id));
  };

  const addItem = () => {
    onChange([
      ...items,
      { id: ++nextId, name: '', amount: '', payers: [], excluded: [] },
    ]);
  };

  return (
    <section className="card">
      <div className="card-title-row">
        <div className="card-title">
          <span>💳</span> 비용 입력
        </div>
        {totalAmount > 0 && (
          <div className="total-amount">
            <span>총 금액</span>
            <span className="total-amount-value">{formatNumber(totalAmount)}원</span>
          </div>
        )}
      </div>

      <div className="cost-items-list">
        {items.map(item => (
          <CostItem
            key={item.id}
            item={item}
            participants={participants}
            onChange={updated => updateItem(item.id, updated)}
            onDelete={() => deleteItem(item.id)}
          />
        ))}
      </div>

      <button className="btn-add-item" onClick={addItem}>
        + 비용 항목 추가
      </button>
    </section>
  );
}
