// The cash box update, with made-up data on a temporary in-memory database.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { buildPlan } from '../src/scripts/seed/source.js';
import { cashDate } from '../src/scripts/sync/readCashbox.js';
import { expenseCategory } from '../src/scripts/sync/cashCategories.js';

const source = {
  treasuryBase: 150,
  treasuryAsof: '2026-01-02',
  ledgerAsof: '2026-01-02',
  treasury: [
    ['2026-01-01', 'نقدا مبيعات تجريبية', 200, 0, 200],
    ['2026-01-02', 'فاتوره كهرباء', 0, 50, 150],
  ],
  customers: [],
  monthly: { '2026-01': { cash: 200, credit: 0, returns: 0, collect: 0, transfer: 0, exp: { كهرباء: 50 } } },
};

const row = (date, description, income, expense, balanceAfter) => ({
  at: `row ${date}`, date, description, income: income * 100, expense: expense * 100, balanceAfter: balanceAfter * 100,
});
const OLD = [row('2026-01-01', 'نقدا مبيعات تجريبية', 200, 0, 200), row('2026-01-02', 'فاتوره كهرباء', 0, 50, 150)];
const NEW = [
  row('2026-01-03', 'نقدا مبيعات تجريبية', 1000, 0, 1150),
  row('2026-01-03', 'عميل وهمي', 300, 0, 1450),
  row('2026-01-03', 'مصاريف مائده', 0, 20, 1430),
  row('2026-01-03', 'فاتوره كهرباء', 0, 30, 1400),
  row('2026-01-03', 'تحويل اموال تجريبي', 0, 900, 500),
];
const book = (extra) => ({ rows: [...OLD, ...extra].map((r) => ({ ...r })), fingerprint: 'test' });

let replset;
let m;

before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: 'no-env-file-in-tests',
    NODE_ENV: 'test',
    MONGODB_URI: replset.getUri('gayara_cash_test'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  });
  const db = await import('../src/config/db.js');
  const { importPlan } = await import('../src/scripts/seed/load.js');
  const { applyCashSync, loadCashState } = await import('../src/scripts/sync/cashApply.js');
  const { buildCashPlan } = await import('../src/scripts/sync/cashPlan.js');
  const { CashRow, MonthlySummary } = await import('../src/modules/history/history.model.js');
  const { Settings } = await import('../src/modules/settings/settings.model.js');
  m = { db, applyCashSync, loadCashState, buildCashPlan, CashRow, MonthlySummary, Settings };
  await db.connectDatabase(process.env.MONGODB_URI);
  await importPlan(buildPlan(source));
});

after(async () => {
  await m?.db.disconnectDatabase();
  await replset?.stop();
});

const plan = async (workbook) => m.buildCashPlan(workbook, await m.loadCashState(), '2026-02-01');

test('swapped date cells and text dates are read correctly', () => {
  assert.equal(cashDate(new Date('2026-02-05T00:00:00Z')), '2026-05-02');
  assert.equal(cashDate('24/11/2026'), '2026-11-24');
  assert.equal(cashDate('10\\6\\2026'), '2026-06-10');
  assert.equal(cashDate('?'), '');
});

test('an unknown expense, a changed old row and a wrong balance all block', async () => {
  assert.equal(expenseCategory('شيء جديد تماما'), null);
  assert.match((await plan(book([row('2026-01-03', 'شيء جديد تماما', 0, 5, 145)]))).problems[0], /no expense category/);
  const changed = book(NEW);
  changed.rows[0].income += 100;
  assert.match((await plan(changed)).problems[0], /differs/);
  assert.match((await plan(book([row('2026-01-03', 'عميل وهمي', 10, 0, 999)]))).problems[0], /does not follow/);
  await assert.rejects(m.applyCashSync(changed, '2026-02-01'), /Nothing was written/);
  assert.equal(await m.CashRow.countDocuments(), 2);
});

test('new rows are added once, with the balance and the monthly figures', async () => {
  await m.applyCashSync(book(NEW), '2026-02-01');
  assert.equal(await m.CashRow.countDocuments(), 7);
  const settings = await m.Settings.findOne().lean();
  assert.deepEqual([settings.cashOpening, settings.cashAsOf], [50000, '2026-01-03']);
  const month = await m.MonthlySummary.findOne({ month: '2026-01' }).lean();
  assert.deepEqual([month.cashSales, month.collections, month.transfers], [120000, 30000, 90000]);
  assert.deepEqual(Object.fromEntries(month.expenses.map((x) => [x.category, x.amount])), { كهرباء: 8000, مائدة: 2000 });

  const again = await m.applyCashSync(book(NEW), '2026-02-01');
  assert.equal(again.newRows, 0);
  assert.equal(await m.CashRow.countDocuments(), 7);
});
