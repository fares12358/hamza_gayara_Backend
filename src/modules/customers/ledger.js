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
  for (const e of [...entries].sort(byDateThenCreated)) {
    balance += e.customerDelta;
    const isInvoice = e.type === 'invoice';
    rows.push({
      id: String(e._id),
      source: 'app',
      type: e.type,
      date: e.date,
      permitNo: e.type === 'cheque' ? e.cheque?.number ?? '' : e.permitNo,
      returnAmount: isInvoice ? e.returnAmount : 0,
      invoiceAmount: isInvoice ? e.amount : 0,
      paymentAmount: isInvoice ? 0 : e.amount,
      balance,
      note: e.note,
      imageId: e.cheque?.image ? String(e.cheque.image) : '',
    });
  }
  return { rows, balance };
}

/**
 * Late debt = the balance at the last row on or before (today - days),
 * limited to the current balance. Returns null when it cannot be known.
 */
export function overdueAmount(customer, statement, today, days) {
  const hasSheetRows = statement.rows.some((r) => r.source === 'sheet');
  if (customer.source === 'sheet' && !hasSheetRows) return null;

  const cut = addDays(today, -days);
  let at = null;
  if (customer.source === 'app' && customer.openingDate && customer.openingDate <= cut) at = customer.openingBalance;
  for (const row of statement.rows) if (row.date <= cut) at = row.balance;

  if (at === null || statement.balance <= SETTLED) return 0;
  return Math.max(0, Math.min(statement.balance, at));
}

export function lastActivity(customer, statement) {
  return statement.rows.at(-1)?.date ?? customer.openingDate ?? '';
}
