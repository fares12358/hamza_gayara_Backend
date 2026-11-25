/**
 * Reads the imported data back through the app's own services and compares it
 * with the ORIGINAL HTML values. Read only.
 * Import this file after the environment is set: the services read it.
 */
import { listCustomers, getStatement } from '../../modules/customers/customers.service.js';
import { getLedger, getBalance } from '../../modules/treasury/treasury.service.js';
import { getIncome } from '../../modules/reports/reports.service.js';

const p = (pounds) => Math.round((pounds ?? 0) * 100);

export async function verifyImport(data) {
  const failures = [];
  let checked = 0;
  const same = (label, expected, actual) => {
    checked += 1;
    if (expected !== actual) failures.push(`${label}: HTML ${expected} / app ${actual}`);
  };

  const list = await listCustomers();
  same('number of customers', data.customers.length, list.customers.length);
  same(
    'total debt',
    data.customers.reduce((sum, c) => sum + (c.balance > 0.5 ? p(c.balance) : 0), 0),
    list.totals.debt,
  );

  const customers = [];
  for (const source of data.customers) {
    const name = source.name.trim();
    const found = list.customers.find((c) => c.name === name);
    if (!found) {
      failures.push(`customer missing: ${name}`);
      continue;
    }
    same(`${name} balance`, p(source.balance), found.balance);

    const { rows } = await getStatement(found.id, 0);
    same(`${name} number of rows`, source.rows.length, rows.length);
    source.rows.forEach((r, i) => {
      const expected = [r[0], String(r[1] ?? ''), p(r[2]), p(r[3]), p(r[4]), p(r[5])].join('|');
      const row = rows[i];
      const actual = row && [row.date, row.permitNo, row.returnAmount, row.invoiceAmount, row.paymentAmount, row.balance].join('|');
      same(`${name} row ${i + 1}`, expected, actual);
    });

    customers.push({ name, balance: found.balance, overdue: found.overdue, rows: rows.length, lastActivity: found.lastActivity });
  }

  const cashBalance = await getBalance();
  same('cash balance', p(data.treasuryBase), cashBalance);
  const ledger = await getLedger('');
  same('number of cash rows', data.treasury.length, ledger.rows.length);
  data.treasury.forEach((r, i) => {
    const row = ledger.rows[i];
    const expected = [r[0], r[1], p(r[2]), p(r[3]), p(r[4])].join('|');
    const actual = row && [row.date, row.description, row.income, row.expense, row.balance].join('|');
    same(`cash row ${i + 1}`, expected, actual);
  });

  const months = [];
  for (const [month, m] of Object.entries(data.monthly)) {
    const { selected } = await getIncome(month);
    same(`${month} cash sales`, p(m.cash), selected.cashSales);
    same(`${month} credit sales`, p(m.credit), selected.creditSales);
    same(`${month} returns`, p(m.returns), selected.returns);
    same(`${month} collections`, p(m.collect), selected.collections);
    same(`${month} transfers`, p(m.transfer), selected.transfers);
    const categories = Object.entries(m.exp ?? {});
    same(`${month} expense categories`, categories.length, selected.expenses.length);
    for (const [category, amount] of categories) {
      same(`${month} ${category}`, p(amount), selected.expenses.find((x) => x.category === category)?.amount);
    }
    months.push(selected);
  }

  return { checked, failures, customers, cashBalance, totals: list.totals, months };
}
