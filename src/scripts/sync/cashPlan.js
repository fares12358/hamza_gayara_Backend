/**
 * Decides what the cash box workbook adds. Pure function. Like the customer update it
 * only ADDS rows after identical old rows, and blocks anything doubtful.
 */
import { expenseCategory, isCashSale, isTransfer } from './cashCategories.js';
import { addDays } from '../../utils/date.js';

const pounds = (v) => (v / 100).toLocaleString('en-US');
const ONE_POUND = 100;

const same = (excel, saved) =>
  excel.date === saved.date &&
  excel.description === saved.description.trim() &&
  excel.income === saved.income &&
  excel.expense === saved.expense &&
  Math.abs(excel.balanceAfter - saved.balanceAfter) <= ONE_POUND;

/** The monthly figures that the cash rows decide. */
function monthTotals(rows) {
  const months = new Map();
  for (const r of rows) {
    const month = r.date.slice(0, 7);
    const m = months.get(month) ?? { cashSales: 0, transfers: 0, collections: 0, otherExpenses: 0 };
    if (isCashSale(r.description)) m.cashSales += r.income;
    else m.collections += r.income;
    if (isTransfer(r.description)) m.transfers += r.expense;
    else m.otherExpenses += r.expense;
    months.set(month, m);
  }
  return months;
}

/** db: { cashRows, summaries, entries (active, cashDelta != 0), ledgerRows, settings } */
export function buildCashPlan(workbook, db, today) {
  const problems = [];
  const notes = [];
  const saved = [...db.cashRows].sort((a, b) => a.seq - b.seq);
  const rows = workbook.rows;
  const empty = { identical: 0, rows: [], monthly: [], payments: [], newRows: 0, problems, notes };

  if (rows.length < saved.length) {
    problems.push(`The sheet has fewer rows (${rows.length}) than the system (${saved.length}).`);
    return empty;
  }
  const changed = saved.findIndex((row, i) => !same(rows[i], row));
  if (changed >= 0) {
    problems.push(`${rows[changed].at} differs from the imported row of ${saved[changed].date}. Old rows are never overwritten.`);
    return empty;
  }
  const added = rows.slice(saved.length);

  // The rules for the monthly figures must hold for the data that is already there.
  const history = monthTotals(saved);
  for (const summary of db.summaries) {
    const calc = history.get(summary.month);
    if (!calc) continue;
    const expenses = summary.expenses.reduce((t, x) => t + x.amount, 0);
    const pairs = [['cash sales', calc.cashSales, summary.cashSales], ['transfers', calc.transfers, summary.transfers], ['collections', calc.collections, summary.collections], ['expenses', calc.otherExpenses, expenses]];
    for (const [label, a, b] of pairs) {
      // Rows with a mistyped date may sit in another month than their total.
      if (Math.abs(a - b) > ONE_POUND) notes.push(`Month ${summary.month}: ${label} from the rows is ${pounds(a)}, the monthly total is ${pounds(b)}.`);
    }
  }

  let balance = db.settings.cashOpening ?? 0;
  if (saved.length && Math.abs(saved.at(-1).balanceAfter - balance) > ONE_POUND) {
    problems.push('The stored cash balance does not match the last imported row.');
  }
  const earliest = db.settings.cashAsOf ? addDays(db.settings.cashAsOf, -7) : '';
  const expensesByMonth = new Map();
  for (const r of added) {
    // The old dates were checked against the system. New ones must look sensible too.
    if (!r.date || r.date > today || (earliest && r.date < earliest)) {
      problems.push(`${r.at}: the date "${r.date || 'unreadable'}" does not look right. Fix it in Excel.`);
    }
    balance += r.income - r.expense;
    if (Math.abs(balance - r.balanceAfter) > ONE_POUND) {
      problems.push(`${r.at}: the balance does not follow (expected ${pounds(balance)}, sheet ${pounds(r.balanceAfter)}).`);
    }
    balance = r.balanceAfter;
    if (r.expense && !isTransfer(r.description)) {
      const found = expenseCategory(r.description);
      if (!found) problems.push(`${r.at}: no expense category for "${r.description}" (${pounds(r.expense)}).`);
      else {
        r.category = found.category;
        if (found.needsCheck) notes.push(`Please confirm: "${r.description}" (${pounds(r.expense)}) is counted under ${found.category}.`);
        const month = r.date.slice(0, 7);
        const byCategory = expensesByMonth.get(month) ?? {};
        byCategory[found.category] = (byCategory[found.category] ?? 0) + r.expense;
        expensesByMonth.set(month, byCategory);
      }
    }
  }

  const newest = added.map((r) => r.date).sort().at(-1) ?? '';
  // A movement typed in the app for the same days would be counted twice.
  const typed = added.length ? db.entries.filter((e) => e.date <= newest) : [];
  if (typed.length) {
    problems.push(`${typed.length} cash record(s) typed in the app are dated on or before ${newest}. Cancel them in the app first if the sheet already includes them.`);
  }

  const monthly = [...monthTotals(added)].map(([month, m]) => ({
    month,
    cashSales: m.cashSales,
    transfers: m.transfers,
    collections: m.collections,
    expenses: expensesByMonth.get(month) ?? {},
  }));

  // For the report: which collections also appear as a payment in a customer account.
  const used = new Set();
  const payments = added
    .filter((r) => r.income && !isCashSale(r.description))
    .map((r) => {
      const match = db.ledgerRows.find(
        (l) => !used.has(String(l._id)) && l.paymentAmount === r.income && l.date >= addDays(r.date || today, -3) && l.date <= addDays(r.date || today, 3),
      );
      if (match) used.add(String(match._id));
      return { date: r.date, description: r.description, amount: r.income, inCustomerAccount: Boolean(match) };
    });

  const { cashOpening = 0, cashAsOf = '' } = db.settings;
  return {
    identical: saved.length,
    rows: added.map(({ at, ...row }, i) => ({ ...row, seq: (saved.at(-1)?.seq ?? -1) + 1 + i })),
    monthly,
    payments,
    newRows: added.length,
    fromBalance: cashOpening,
    toBalance: added.length ? balance : cashOpening,
    cashAsOf: newest > cashAsOf ? newest : cashAsOf,
    problems,
    notes,
  };
}
