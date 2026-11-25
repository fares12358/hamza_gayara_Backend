/**
 * Customer balance rules. Pure functions, no database.
 * They copy the behaviour of the old HTML app (see docs/musninslogic.md).
 * All money is whole piasters.
 */
import { addDays } from '../../utils/date.js';

/** Half a pound: smaller balances count as settled. */
export const SETTLED = 50;

const byDateThenCreated = (a, b) =>
  a.date.localeCompare(b.date) || new Date(a.createdAt) - new Date(b.createdAt);

/**
 * Sheet rows first (shown exactly as imported), then app records by date.
 * The balance continues from customer.openingBalance, not from the last sheet row.
 */
export function buildStatement(customer, sheetRows, entries) {
  const rows = [...sheetRows]
    .sort((a, b) => a.seq - b.seq)
    .map((r) => ({
      id: String(r._id),
      source: 'sheet',
      type: 'sheet',
      date: r.date,
      permitNo: r.permitNo,
      returnAmount: r.returnAmount,
      invoiceAmount: r.invoiceAmount,
      paymentAmount: r.paymentAmount,
      balance: r.balanceAfter,
    }));

  let balance = customer.openingBalance;
  let latest = rows.reduce((max, r) => (r.date > max ? r.date : max), '');
  for (const e of [...entries].sort(byDateThenCreated)) {
    balance += e.customerDelta;
    const isInvoice = e.type === 'invoice';
    const isCharge = isInvoice || e.type === 'debt_add';
    const outOfOrder = e.date < latest;
    if (!outOfOrder) latest = e.date;
    rows.push({
      outOfOrder,
      id: String(e._id),
      source: 'app',
      type: e.type,
      date: e.date,
      permitNo: e.type === 'cheque' ? e.cheque?.number ?? '' : e.permitNo,
      returnAmount: isInvoice ? e.returnAmount : 0,
      invoiceAmount: isCharge ? e.amount : 0,
      paymentAmount: isCharge ? 0 : e.amount,
      balance,
      note: e.note,
      imageId: e.cheque?.image ? String(e.cheque.image) : '',
    });
  }
  return { rows, balance };
}

/**
 * The balance as it was at the end of "date". App records count by their own date,
 * even when they were typed later. Returns null when nothing is known by then.
 */
function balanceAt(customer, statement, date) {
  const sheet = statement.rows.filter((r) => r.source === 'sheet');
  const app = statement.rows.filter((r) => r.source === 'app' && r.date <= date);

  let at = null;
  if (customer.source === 'app' && customer.openingDate && customer.openingDate <= date) at = customer.openingBalance;
  for (const row of sheet) if (row.date <= date) at = row.balance;
  if (!app.length) return at;

  // App records continue from the opening balance once the whole sheet is covered.
  const sheetCovered = sheet.every((r) => r.date <= date);
  const base = sheetCovered ? customer.openingBalance : at ?? 0;
  return app.reduce((sum, r) => sum + r.invoiceAmount - r.returnAmount - r.paymentAmount, base);
}

/**
 * Late debt = the balance as it was (today - days), limited to the current balance.
 * Payments are not applied to the oldest debt first (rule copied from the old app).
 * Returns null when it cannot be known.
 */
export function overdueAmount(customer, statement, today, days) {
  const hasSheetRows = statement.rows.some((r) => r.source === 'sheet');
  if (customer.source === 'sheet' && !hasSheetRows) return null;

  const at = balanceAt(customer, statement, addDays(today, -days));
  if (at === null || statement.balance <= SETTLED) return 0;
  return Math.max(0, Math.min(statement.balance, at));
}

export function lastActivity(customer, statement) {
  const latest = statement.rows.reduce((max, r) => (r.date > max ? r.date : max), '');
  return latest || customer.openingDate || '';
}
