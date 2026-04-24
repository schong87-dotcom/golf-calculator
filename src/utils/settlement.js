export function calculateSettlement(participants, items) {
  const named = participants.filter(p => p && p.trim() !== '');
  if (named.length === 0) return null;

  const paid = {};
  const owed = {};
  named.forEach(p => { paid[p] = 0; owed[p] = 0; });

  const itemDetails = items.map(item => {
    const amount = Number(String(item.amount).replace(/,/g, '')) || 0;
    if (amount <= 0) return { ...item, perPerson: 0, sharers: [], effectivePayers: [] };

    const sharers = named.filter(p => !(item.excluded || []).includes(p));
    const effectivePayers = (item.payers || []).filter(p => named.includes(p));

    if (sharers.length === 0) return { ...item, perPerson: 0, sharers, effectivePayers };

    const perPerson = amount / sharers.length;

    if (effectivePayers.length > 0) {
      const perPayerCredit = amount / effectivePayers.length;
      effectivePayers.forEach(p => { paid[p] += perPayerCredit; });
    }

    sharers.forEach(p => { owed[p] += perPerson; });

    return { ...item, amount, perPerson: Math.round(perPerson), sharers, effectivePayers };
  });

  const balances = {};
  named.forEach(p => {
    balances[p] = {
      paid: Math.round(paid[p]),
      owed: Math.round(owed[p]),
      net: Math.round(paid[p] - owed[p]),
    };
  });

  const transfers = resolveTransfers(named, balances);
  return { balances, transfers, itemDetails };
}

function resolveTransfers(participants, balances) {
  const debtors = participants
    .filter(p => balances[p].net < -0.5)
    .map(p => ({ name: p, amount: -balances[p].net }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = participants
    .filter(p => balances[p].net > 0.5)
    .map(p => ({ name: p, amount: balances[p].net }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amount, creditors[j].amount);
    if (amt > 0.5) {
      transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(amt) });
    }
    debtors[i].amount -= amt;
    creditors[j].amount -= amt;
    if (debtors[i].amount < 0.5) i++;
    if (creditors[j].amount < 0.5) j++;
  }

  return transfers;
}

export function formatNumber(n) {
  if (n === undefined || n === null || n === '') return '';
  return Number(String(n).replace(/,/g, '')).toLocaleString('ko-KR');
}

export function parseNumber(s) {
  return Number(String(s).replace(/,/g, '')) || 0;
}
