// The customer workbook update, with made-up data on a temporary in-memory database.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { buildPlan } from '../src/scripts/seed/source.js';

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gayara-sync-'));
const OLD = [['2026-01-01', 1, 0, 100, 0, 100], ['2026-01-02', 2, 0, 0, 40, 60]];
const NEW = ['2026-01-05', 3, 5, 200, 50, 205];

const source = {
  treasuryBase: 0,
  treasuryAsof: '2026-01-02',
  ledgerAsof: '2026-01-02',
  treasury: [],
  customers: [
    { name: 'عميل وهمي', balance: 60, asof: '2026-01-02', rows: OLD },
    { name: 'تاجر وهمي', balance: 30, asof: '2026-01-02', rows: [] },
  ],
  monthly: { '2026-01': { cash: 0, credit: 100, returns: 0, collect: 40, transfer: 0, exp: {} } },
};

async function workbook(rows, { listed = 30 } = {}) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('عميل وهمي ');
  ['SN', 'التاريخ', 'رقم الإذن', 'مرتجع', 'إجمالي الإذن', 'الدفعة', 'إجمالي المتبقي'].forEach((h, i) => (sheet.getCell(3, i + 1).value = h));
  rows.forEach((r, i) => {
    [new Date(`${r[0]}T00:00:00Z`), r[1], r[2] || '-', r[3] || '-', r[4] || '-', r[5]].forEach((v, k) => (sheet.getCell(i + 4, k + 2).value = v));
  });
  const summary = book.addWorksheet('مديونيات العملاء');
  summary.getCell('B4').value = 'عميل وهمي';
  summary.getCell('E4').value = { formula: `'عميل وهمي '!G${rows.length + 3}`, result: rows.at(-1)[5] };
  summary.getCell('K4').value = 'تاجر وهمي';
  summary.getCell('N4').value = listed;
  book.addWorksheet('نسخة قديمة');
  const file = path.join(folder, `${Math.random().toString(36).slice(2)}.xlsx`);
  await book.xlsx.writeFile(file);
  return m.read(file);
}

let replset;
let m;

before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: 'no-env-file-in-tests',
    NODE_ENV: 'test',
    MONGODB_URI: replset.getUri('gayara_sync_test'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  });
  const db = await import('../src/config/db.js');
  const { readCustomerWorkbook } = await import('../src/scripts/sync/readWorkbook.js');
  const { applySync, loadState } = await import('../src/scripts/sync/apply.js');
  const { buildSyncPlan } = await import('../src/scripts/sync/plan.js');
  const { importPlan } = await import('../src/scripts/seed/load.js');
  const { Customer } = await import('../src/modules/customers/customers.model.js');
  const { LedgerRow, MonthlySummary } = await import('../src/modules/history/history.model.js');
  const { Entry } = await import('../src/modules/entries/entries.model.js');
  const { Settings } = await import('../src/modules/settings/settings.model.js');
  m = { db, read: readCustomerWorkbook, applySync, loadState, buildSyncPlan, Customer, LedgerRow, MonthlySummary, Entry, Settings };
  await db.connectDatabase(process.env.MONGODB_URI);
  await importPlan(buildPlan(source));
});

after(async () => {
  await m?.db.disconnectDatabase();
  await replset?.stop();
  fs.rmSync(folder, { recursive: true, force: true });
});

const plan = async (book) => m.buildSyncPlan(book, await m.loadState(), '2026-02-01');

test('a changed old row blocks the whole update', async () => {
  const changed = [[...OLD[0].slice(0, 3), 101, 0, 101], OLD[1], NEW];
  const book = await workbook(changed);
  assert.match((await plan(book)).problems[0], /differs/);
  await assert.rejects(m.applySync(book, '2026-02-01'), /Nothing was written/);
  assert.equal(await m.LedgerRow.countDocuments(), 2);
});

test('a record already typed in the app blocks it, to avoid counting twice', async () => {
  const customer = await m.Customer.findOne({ name: 'عميل وهمي' });
  const entry = await m.Entry.create({
    type: 'payment', date: '2026-01-05', amount: 5000, customerDelta: -5000, cashDelta: 5000,
    customer: customer._id, groupId: 'g1', requestId: 'sync-test-0001', createdBy: customer._id,
  });
  assert.match((await plan(await workbook([...OLD, NEW]))).problems[0], /typed in the app/);
  await entry.deleteOne(); // test data only
});

test('only the new row is added, with balance, month and date; a second run adds nothing', async () => {
  const book = await workbook([...OLD, NEW], { listed: 99 });
  const first = await plan(book);
  assert.deepEqual([first.identical, first.newRows, first.problems.length], [2, 1, 0]);
  assert.ok(first.notes.some((n) => n.includes('NOT changed')));

  await m.applySync(book, '2026-02-01');
  assert.equal(await m.LedgerRow.countDocuments(), 3);
  const customer = await m.Customer.findOne({ name: 'عميل وهمي' }).lean();
  assert.equal(customer.openingBalance, 20500);
  assert.equal((await m.Customer.findOne({ name: 'تاجر وهمي' }).lean()).openingBalance, 3000);
  const month = await m.MonthlySummary.findOne({ month: '2026-01' }).lean();
  assert.deepEqual([month.creditSales, month.returns, month.collections], [30000, 500, 4000]);
  assert.equal((await m.Settings.findOne().lean()).ledgerAsOf, '2026-01-05');

  const second = await m.applySync(book, '2026-02-01');
  assert.equal(second.newRows, 0);
  assert.equal(await m.LedgerRow.countDocuments(), 3);
});

test('a sheet with fewer rows than the system is refused', async () => {
  assert.match((await plan(await workbook(OLD))).problems[0], /fewer rows/);
});
