// Pure business rules. All data here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, overdueAmount } from '../src/modules/customers/ledger.js';
import { normalizeName } from '../src/modules/customers/arabic.js';
import { effectsOf } from '../src/modules/entries/effects.js';
import { monthIncome } from '../src/modules/reports/income.js';
import { today, isRealDate } from '../src/utils/date.js';

const entry = (type, date, amount, extra = {}) => ({
  _id: `${type}-${date}-${amount}`,
  type,
  date,
  amount,
  returnAmount: 0,
  createdAt: `${date}T10:00:00Z`,
  ...effectsOf(type, amount, extra.returnAmount),
  ...extra,
});

test('each record type changes debt and cash as in the old app', () => {
  assert.deepEqual(effectsOf('invoice', 1000, 100), { customerDelta: 900, cashDelta: 0 });
  assert.deepEqual(effectsOf('payment', 300), { customerDelta: -300, cashDelta: 300 });
  assert.deepEqual(effectsOf('cheque', 300), { customerDelta: -300, cashDelta: 0 });
  assert.deepEqual(effectsOf('cash_sale', 50), { customerDelta: 0, cashDelta: 50 });
  assert.deepEqual(effectsOf('expense', 50), { customerDelta: 0, cashDelta: -50 });
  assert.deepEqual(effectsOf('transfer', 50), { customerDelta: 0, cashDelta: -50 });
});

test('balance starts from the sheet balance and keeps sheet rows unchanged', () => {
  const customer = { openingBalance: 100000, source: 'sheet' };
  const sheet = [{ _id: 's1', seq: 1, date: '2026-01-01', returnAmount: 0, invoiceAmount: 5, paymentAmount: 0, balanceAfter: 99999 }];
  const result = buildStatement(customer, sheet, [entry('invoice', '2026-02-01', 50000), entry('payment', '2026-02-02', 30000)]);
  assert.equal(result.rows[0].balance, 99999);
  assert.equal(result.balance, 120000);
});

test('late debt copies the old rule', () => {
  const customer = { openingBalance: 10000, openingDate: '2026-01-01', source: 'app' };
  const statement = buildStatement(customer, [], [entry('invoice', '2026-03-09', 5000), entry('payment', '2026-03-10', 10000)]);
  assert.equal(statement.balance, 5000);
  assert.equal(overdueAmount(customer, statement, '2026-03-10', 7), 5000);
});

test('late debt is unknown for a sheet customer without rows, and zero when settled', () => {
  const sheet = { openingBalance: 10000, source: 'sheet' };
  assert.equal(overdueAmount(sheet, buildStatement(sheet, [], []), '2026-03-10', 7), null);
  const fresh = { openingBalance: 40, openingDate: '2026-01-01', source: 'app' };
  assert.equal(overdueAmount(fresh, buildStatement(fresh, [], []), '2026-03-10', 7), 0);
});

test('income statement adds app records to sheet totals', () => {
  const summary = { cashSales: 1000, creditSales: 500, returns: 0, collections: 0, transfers: 0, expenses: [{ category: 'صيانة', amount: 100 }] };
  const m = monthIncome('2026-02', summary, [
    entry('invoice', '2026-02-03', 200, { returnAmount: 20 }),
    entry('expense', '2026-02-04', 50, { category: 'صيانة' }),
    entry('cheque', '2026-02-05', 70),
    entry('cash_sale', '2026-03-01', 999),
  ]);
  assert.equal(m.netSales, 1680);
  assert.equal(m.expensesTotal, 150);
  assert.equal(m.net, 1530);
  assert.equal(m.chequeCollections, 70);
});

test('Arabic spellings of one name match', () => {
  assert.equal(normalizeName('  ثلاجة   أحمد '), normalizeName('ثلاجه احمد'));
});

test('dates use the business time zone and reject impossible days', () => {
  assert.equal(today('Africa/Cairo', new Date('2026-01-01T23:30:00Z')), '2026-01-02');
  assert.equal(isRealDate('2026-02-30'), false);
  assert.equal(isRealDate('2026-02-28'), true);
});
