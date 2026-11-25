/**
 * Builds the reports that used to be typed by hand in Excel.
 * Pure functions: they read data and never change it. Money is whole piasters.
 */
import { addDays } from '../../utils/date.js';
import { overdueAmount, SETTLED } from '../customers/ledger.js';
import { monthIncome } from './income.js';

const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);
const change = (row) => row.invoiceAmount - row.returnAmount - row.paymentAmount;
const daysApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * A few sheet rows have a mistyped date (for example another year). The report keeps
 * their position among the neighbouring rows. "place" is the middle date of 5 rows.
 */
export function placeSheetRows(rows) {
  return rows.map((row, i) => {
    const near = rows.slice(Math.max(0, i - 2), i + 3).map((r) => r.date).sort();
    const place = near[Math.floor(near.length / 2)];
    return { ...row, place, misdated: daysApart(place, row.date) > 20 };
  });
}

// ---------- 1. cash box ----------
export function cashboxReport({ sheetRows, appRows, cashOpening, from, to }) {
  const sheet = placeSheetRows(sheetRows);
  const first = sheet[0];
  const start = first ? first.balanceAfter - first.income + first.expense : cashOpening;

  const all = [
    ...sheet.map((r) => ({ date: r.date, place: r.place, misdated: r.misdated, description: r.description, income: r.income, expense: r.expense })),
    ...appRows.map((r) => ({ ...r, place: r.date, misdated: false })),
  ].sort((a, b) => a.place.localeCompare(b.place)); // stable: sheet order is kept inside a day

  let balance = start;
  let opening = start;
  const rows = [];
  for (const row of all) {
    balance += row.income - row.expense;
    if (row.place < from) opening = balance;
    else if (row.place <= to) {
      rows.push({ date: row.date, description: row.description, income: row.income, expense: row.expense, balance, misdated: row.misdated });
    }
  }
  return {
    from,
    to,
    opening,
    rows,
    closing: rows.at(-1)?.balance ?? opening,
    income: sum(rows, (r) => r.income),
    expense: sum(rows, (r) => r.expense),
  };
}

// ---------- 2. daily sales ----------
export const CASH_SALE_LABEL = 'نقدا مبيعات الجياره';
export const isSheetCashSale = (description) => /نقدا\s*مبيعات/.test(description);

/** lines: [{ date, cash: true, amount } | { date, cash: false, name, amount }] */
export function salesReport({ month, lines }) {
  const byDay = new Map();
  for (const line of lines) {
    if (line.date.slice(0, 7) !== month || !line.amount) continue;
    if (!byDay.has(line.date)) byDay.set(line.date, { cash: 0, customers: new Map() });
    const day = byDay.get(line.date);
    if (line.cash) day.cash += line.amount;
    else day.customers.set(line.name, (day.customers.get(line.name) ?? 0) + line.amount);
  }

  const days = [...byDay.keys()].sort().map((date) => {
    const day = byDay.get(date);
    const list = [
      ...(day.cash ? [{ name: CASH_SALE_LABEL, amount: day.cash, cash: true }] : []),
      ...[...day.customers].map(([name, amount]) => ({ name, amount, cash: false })),
    ];
    return { date, lines: list, cash: day.cash, credit: sum(list.filter((l) => !l.cash), (l) => l.amount), total: sum(list, (l) => l.amount) };
  });

  const customers = new Map();
  for (const d of days) for (const l of d.lines) if (!l.cash) customers.set(l.name, (customers.get(l.name) ?? 0) + l.amount);

  return {
    month,
    days,
    cashTotal: sum(days, (d) => d.cash),
    creditTotal: sum(days, (d) => d.credit),
    total: sum(days, (d) => d.total),
    customers: [...customers].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
  };
}

// ---------- 3. customer debts on one day ----------
/** customers: [{ name, archived, statement }] */
export function debtsReport({ customers, date }) {
  const rows = [];
  for (const { name, archived, statement } of customers) {
    // The balance at the end of "date" = today's balance without everything dated later.
    const closing = statement.balance - sum(statement.rows.filter((r) => r.date > date), change);
    const onDay = statement.rows.filter((r) => r.date === date);
    const goods = sum(onDay, (r) => r.invoiceAmount - r.returnAmount);
    const payments = sum(onDay, (r) => r.paymentAmount);
    const previous = closing - goods + payments;
    if (archived && !previous && !goods && !payments) continue;
    rows.push({ name, previous, goods, payments, closing });
  }
  rows.sort((a, b) => b.closing - a.closing);
  return {
    date,
    previousDate: addDays(date, -1),
    rows,
    totals: {
      previous: sum(rows, (r) => r.previous),
      goods: sum(rows, (r) => r.goods),
      payments: sum(rows, (r) => r.payments),
      closing: sum(rows, (r) => r.closing),
    },
  };
}

// ---------- shared by ageing and late invoices ----------
/** Invoices of a customer, newest first. */
function charges(customer, statement) {
  const list = statement.rows
    .map((r) => ({ date: r.date, amount: r.invoiceAmount - r.returnAmount }))
    .filter((c) => c.amount > 0);
  if (customer.source === 'app' && customer.openingBalance > 0) {
    list.push({ date: customer.openingDate, amount: customer.openingBalance });
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Spreads "amount" over the newest invoices. This means: payments are taken to have
 * covered the OLDEST invoices first. "rest" is what no invoice explains.
 */
function spread(list, amount) {
  const parts = [];
  let rest = amount;
  for (const charge of list) {
    if (rest <= 0) break;
    const part = Math.min(rest, charge.amount);
    parts.push({ date: charge.date, invoice: charge.amount, part });
    rest -= part;
  }
  return { parts, rest: Math.max(0, rest) };
}

// ---------- 4. debt ageing ----------
export function agingReport({ customers, today, days }) {
  const year = today.slice(0, 4);
  const lastYear = String(Number(year) - 1);
  const rows = [];

  for (const { customer, statement, archived } of customers) {
    const total = statement.balance;
    if (archived || Math.abs(total) < SETTLED) continue;
    const buckets = {};
    let older = 0;
    if (total < 0) {
      buckets[today.slice(0, 7)] = total; // a credit has no age
    } else {
      const { parts, rest } = spread(charges(customer, statement), total);
      older = rest;
      for (const p of parts) {
        const month = p.date.slice(0, 7);
        if (p.date.slice(0, 4) < lastYear) older += p.part;
        else buckets[month] = (buckets[month] ?? 0) + p.part;
      }
    }
    // Due = the system's late amount. null: it cannot be known.
    const due = overdueAmount(customer, statement, today, days);
    rows.push({ name: customer.name, total, due, notDue: due === null ? null : total - due, months: buckets, older });
  }
  rows.sort((a, b) => b.total - a.total);

  // Months of this year from the current one back, then last year from December.
  const thisYear = Array.from({ length: Number(today.slice(5, 7)) }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).reverse();
  const used = rows.flatMap((r) => Object.keys(r.months)).filter((m) => m.startsWith(lastYear)).map((m) => Number(m.slice(5)));
  const lowest = Math.min(11, ...used);
  const previousYear = Array.from({ length: 13 - lowest }, (_, i) => `${lastYear}-${String(12 - i).padStart(2, '0')}`);
  const months = [...thisYear, ...previousYear];

  return {
    asOf: today,
    overdueDays: days,
    months,
    hasOlder: rows.some((r) => r.older),
    rows,
    totals: {
      total: sum(rows, (r) => r.total),
      due: sum(rows, (r) => r.due ?? 0),
      notDue: sum(rows, (r) => r.notDue ?? 0),
      older: sum(rows, (r) => r.older),
      months: Object.fromEntries(months.map((m) => [m, sum(rows, (r) => r.months[m] ?? 0)])),
    },
  };
}

// ---------- 5. late invoices ----------
export function lateReport({ customers, today, days }) {
  const cut = addDays(today, -days);
  const blocks = [];
  for (const { customer, statement, archived } of customers) {
    const late = archived ? 0 : overdueAmount(customer, statement, today, days) ?? 0;
    if (late <= SETTLED) continue;
    const { parts, rest } = spread(charges(customer, statement).filter((c) => c.date <= cut), late);
    const lines = parts.map((p) => ({ date: p.date, invoice: p.invoice, late: p.part }));
    if (rest > 0) lines.push({ date: '', invoice: null, late: rest });
    blocks.push({ name: customer.name, late, total: statement.balance, lines });
  }
  blocks.sort((a, b) => b.late - a.late);
  return { asOf: today, cut, overdueDays: days, blocks, totals: { late: sum(blocks, (b) => b.late), debt: sum(blocks, (b) => b.total) } };
}

// ---------- 6. expenses by month ----------
export function expensesReport({ year, today, summaries, entries }) {
  const lastMonth = year === today.slice(0, 4) ? Number(today.slice(5, 7)) : 12;
  const months = Array.from({ length: lastMonth }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const summaryOf = new Map(summaries.map((s) => [s.month, s]));
  const table = new Map();
  for (const month of months) {
    for (const x of monthIncome(month, summaryOf.get(month), entries).expenses) {
      if (!table.has(x.category)) table.set(x.category, {});
      table.get(x.category)[month] = x.amount;
    }
  }
  const rows = [...table]
    .map(([category, values]) => ({ category, values, total: sum(Object.values(values), (v) => v) }))
    .sort((a, b) => b.total - a.total);
  const monthTotals = Object.fromEntries(months.map((m) => [m, sum(rows, (r) => r.values[m] ?? 0)]));
  return { year, months, rows, monthTotals, total: sum(rows, (r) => r.total) };
}
