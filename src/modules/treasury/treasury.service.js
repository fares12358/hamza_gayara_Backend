import { CashRow } from '../history/history.model.js';
import { Entry } from '../entries/entries.model.js';
import { getSettings } from '../settings/settings.service.js';

export async function getBalance() {
  const [settings, [total]] = await Promise.all([
    getSettings(),
    Entry.aggregate([{ $match: { voidedAt: null } }, { $group: { _id: null, sum: { $sum: '$cashDelta' } } }]),
  ]);
  return settings.cashOpening + (total?.sum ?? 0);
}

export function describeCashEntry(e) {
  const parts = {
    payment: ['تحصيل', e.customerName, e.note],
    cash_sale: ['بيع نقدي', e.note],
    expense: [e.note || e.category || 'مصروف', e.note ? e.category : ''],
    transfer: ['تحويل اموال لفرع العبور', e.note],
  }[e.type];
  return parts.filter(Boolean).join(' · ');
}

/** Sheet rows as imported, then app records with a running balance. "from" empty = all. */
export async function getLedger(from) {
  const dateFilter = from ? { date: { $gte: from } } : {};
  const [settings, sheetRows, entries] = await Promise.all([
    getSettings(),
    CashRow.find(dateFilter).sort({ seq: 1 }).lean(),
    // All app records are needed to keep the running balance right.
    Entry.find({ voidedAt: null, cashDelta: { $ne: 0 } }).sort({ date: 1, createdAt: 1 }).lean(),
  ]);

  const rows = sheetRows.map((r) => ({
    id: String(r._id),
    source: 'sheet',
    date: r.date,
    description: r.description,
    income: r.income,
    expense: r.expense,
    balance: r.balanceAfter,
  }));

  let balance = settings.cashOpening;
  for (const e of entries) {
    balance += e.cashDelta;
    if (from && e.date < from) continue;
    rows.push({
      id: String(e._id),
      source: 'app',
      date: e.date,
      description: describeCashEntry(e),
      income: Math.max(e.cashDelta, 0),
      expense: Math.max(-e.cashDelta, 0),
      balance,
    });
  }

  return {
    balance,
    cashAsOf: settings.cashAsOf,
    rows,
    totals: rows.reduce((t, r) => ({ income: t.income + r.income, expense: t.expense + r.expense }), {
      income: 0,
      expense: 0,
    }),
  };
}
