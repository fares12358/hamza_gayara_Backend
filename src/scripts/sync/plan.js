/**
 * Decides what the workbook adds to the database. Pure function.
 * It only ever ADDS rows after the ones already imported. If anything old differs,
 * or money could be counted twice, it reports a problem and nothing is written.
 */
import { normalizeName } from '../../modules/customers/arabic.js';

const same = (a, b) =>
  a.date === b.date &&
  a.permitNo.trim() === b.permitNo.trim() &&
  a.returnAmount === b.returnAmount &&
  a.invoiceAmount === b.invoiceAmount &&
  a.paymentAmount === b.paymentAmount &&
  a.balanceAfter === b.balanceAfter;

const pounds = (v) => (v / 100).toLocaleString('en-US');

/**
 * db: { customers, ledgerRows, entries (active, with a customer), settings }
 */
export function buildSyncPlan(workbook, db, today) {
  const problems = [];
  const notes = [...workbook.warnings];
  const updates = [];
  const monthly = new Map();
  let identical = 0;

  const find = (name) => {
    const wanted = normalizeName(name);
    return db.customers.find((c) => [c.searchName, ...(c.aliases ?? []).map(normalizeName)].includes(wanted));
  };
  const rowsOf = (customer) =>
    db.ledgerRows.filter((r) => String(r.customer) === String(customer._id)).sort((a, b) => a.seq - b.seq);

  for (const sheet of workbook.customers) {
    const customer = find(sheet.name);
    if (!customer) {
      problems.push(`${sheet.name}: not found in the system. It is not created automatically.`);
      continue;
    }
    const existing = rowsOf(customer);
    if (sheet.rows.length < existing.length) {
      problems.push(`${sheet.name}: the sheet has fewer rows (${sheet.rows.length}) than the system (${existing.length}).`);
      continue;
    }
    const changed = existing.findIndex((row, i) => !same(row, sheet.rows[i]));
    if (changed >= 0) {
      problems.push(`${sheet.name}: sheet row ${sheet.rows[changed].excelRow} (${sheet.rows[changed].date}) differs from the imported row. Old rows are never overwritten.`);
      continue;
    }
    identical += existing.length;
    const added = sheet.rows.slice(existing.length);
    if (!added.length) continue;

    if (customer.archived) problems.push(`${sheet.name}: is archived but has new rows.`);
    if (existing.length && existing.at(-1).balanceAfter !== customer.openingBalance) {
      problems.push(`${sheet.name}: the stored opening balance does not match the last imported row.`);
    }
    let balance = customer.openingBalance;
    for (const row of added) {
      balance += row.invoiceAmount - row.returnAmount - row.paymentAmount;
      if (Math.abs(balance - row.balanceAfter) > 100) {
        problems.push(`${sheet.name}: new row ${row.excelRow} does not follow from the balance before it (expected ${pounds(balance)}, sheet ${pounds(row.balanceAfter)}).`);
      }
      balance = row.balanceAfter;
      if (row.date > today) problems.push(`${sheet.name}: new row ${row.excelRow} has a future date (${row.date}).`);

      const month = row.date.slice(0, 7);
      const total = monthly.get(month) ?? { creditSales: 0, returns: 0 };
      total.creditSales += row.invoiceAmount;
      total.returns += row.returnAmount;
      monthly.set(month, total);
    }

    // A movement typed in the app for the same days would be counted twice.
    const newest = added.map((r) => r.date).sort().at(-1);
    const typed = db.entries.filter((e) => String(e.customer) === String(customer._id) && e.date <= newest);
    if (typed.length) {
      problems.push(`${sheet.name}: ${typed.length} record(s) typed in the app are dated on or before ${newest} (${typed.map((e) => `${e.date} ${e.type} ${pounds(e.amount)}`).join('; ')}). Cancel them in the app first if the sheet already includes them.`);
    }

    updates.push({
      customerId: customer._id,
      name: customer.name,
      fromBalance: customer.openingBalance,
      toBalance: balance,
      newest,
      // seq continues after the imported rows
      rows: added.map(({ excelRow, ...row }, i) => ({ ...row, seq: (existing.at(-1)?.seq ?? -1) + 1 + i })),
    });
  }

  // Customers without their own sheet are only listed with a balance: compare, never change.
  for (const item of workbook.listedOnly) {
    const customer = find(item.name);
    if (!customer) problems.push(`${item.name}: listed in the summary but not found in the system.`);
    else if (customer.openingBalance !== item.balance) {
      notes.push(`${item.name}: the summary shows ${pounds(item.balance)}, the system has ${pounds(customer.openingBalance)}. It has no sheet, so it is NOT changed.`);
    } else notes.push(`${item.name}: no sheet; the summary balance equals the system (${pounds(item.balance)}).`);
  }
  const inWorkbook = new Set([...workbook.customers, ...workbook.listedOnly].map((c) => find(c.name)?.name));
  for (const c of db.customers) {
    if (!inWorkbook.has(c.name)) notes.push(`${c.name}: in the system but not in the workbook. Not changed.`);
  }

  const newest = updates.map((u) => u.newest).sort().at(-1) ?? '';
  return {
    identical,
    updates,
    monthly: [...monthly].map(([month, totals]) => ({ month, ...totals })),
    ledgerAsOf: newest > (db.settings.ledgerAsOf ?? '') ? newest : db.settings.ledgerAsOf,
    problems,
    notes,
    newRows: updates.reduce((n, u) => n + u.rows.length, 0),
  };
}
