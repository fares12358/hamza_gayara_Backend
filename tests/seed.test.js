// Import safety, with made-up data on a temporary in-memory database.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { readHtmlData, buildPlan, inspectPlan, toPiasters } from '../src/scripts/seed/source.js';

const sample = {
  treasuryBase: 150.5,
  treasuryAsof: '2026-01-02',
  ledgerAsof: '2026-01-03',
  treasury: [
    ['2026-01-01', 'بيع تجريبي', 200, 0, 200],
    ['2026-01-02', 'مصروف تجريبي', 0, 49.5, 150.5],
  ],
  customers: [
    { name: 'عميل وهمي', balance: 70.25, asof: '2026-01-03', rows: [['2026-01-01', 5, 0, 100, 0, 100], ['2026-01-03', '', 0, 0, 29.75, 70.25]] },
    { name: 'تاجر وهمي', balance: -10, asof: '2026-01-03', rows: [] },
  ],
  monthly: { '2026-01': { cash: 200, credit: 100, returns: 0, collect: 29.75, transfer: 0, exp: { صيانة: 49.5 } } },
};
const html = `<html><script type="application/json" id="seed">${JSON.stringify(sample)}</script></html>`;

let replset;
let modules;

before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: 'no-env-file-in-tests',
    NODE_ENV: 'test',
    MONGODB_URI: replset.getUri('gayara_seed_test'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  });
  const db = await import('../src/config/db.js');
  const load = await import('../src/scripts/seed/load.js');
  const { verifyImport } = await import('../src/scripts/seed/verify.js');
  const { Customer } = await import('../src/modules/customers/customers.model.js');
  const { LedgerRow, CashRow } = await import('../src/modules/history/history.model.js');
  modules = { db, load, verifyImport, Customer, LedgerRow, CashRow };
  await db.connectDatabase(process.env.MONGODB_URI);
});

after(async () => {
  await modules?.db.disconnectDatabase();
  await replset?.stop();
});

test('money keeps piasters and never rounds a real fraction away', () => {
  assert.equal(toPiasters(0.29, 'x'), 29);
  assert.equal(toPiasters(1118787.84, 'x'), 111878784);
  assert.throws(() => toPiasters(1.005, 'x'), /two decimals/);
  assert.throws(() => toPiasters('5', 'x'), /not a number/);
});

test('bad source data stops the import', () => {
  const bad = structuredClone(sample);
  bad.treasury[0][0] = '2026-02-30';
  assert.throws(() => buildPlan(bad), /bad date/);
  const twins = structuredClone(sample);
  twins.customers[1].name = 'عميل وهمى';
  assert.throws(() => buildPlan(twins), /same name/);
});

test('a failed import writes nothing', async () => {
  const plan = buildPlan(readHtmlData(html));
  plan.cashRows[1].importKey = plan.cashRows[0].importKey; // fails after customers are inserted
  await assert.rejects(modules.load.importPlan(plan));
  assert.deepEqual(await modules.load.findExistingData(), []);
});

test('import matches the source exactly and cannot run twice', async () => {
  const data = readHtmlData(html);
  const plan = buildPlan(data);
  assert.equal(inspectPlan(plan).cashLastMatches, true);

  await modules.load.importPlan(plan);
  const result = await modules.verifyImport(data);
  assert.deepEqual(result.failures, []);
  assert.equal(result.cashBalance, 15050);

  await assert.rejects(modules.load.importPlan(plan), /already has data/);
  assert.equal(await modules.Customer.countDocuments(), 2);
  assert.equal(await modules.CashRow.countDocuments(), 2);
});

test('verification notices a changed number', async () => {
  const changed = structuredClone(sample);
  changed.customers[0].rows[0][3] = 101;
  const result = await modules.verifyImport(changed);
  assert.equal(result.failures.length, 1);
});
