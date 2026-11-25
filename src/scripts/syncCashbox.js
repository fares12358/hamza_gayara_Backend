/**
 * Adds what is new in the cash box workbook. It never imports old rows again.
 *
 *   node src/scripts/syncCashbox.js
 *       Practice run on a temporary database made from the old HTML data (what was
 *       imported). Does not read .env and does not connect to Atlas.
 *
 *   node src/scripts/syncCashbox.js --check --database=NAME
 *       Compares with the real database and shows what would be added. Writes nothing.
 *
 *   node src/scripts/syncCashbox.js --write --database=NAME --fingerprint=VALUE
 *       Writes. Needs a backup of NAME made in the last 24 hours (npm run backup),
 *       unless the user decides to go without one and adds --skip-backup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readCashWorkbook } from './sync/readCashbox.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { values: args } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    write: { type: 'boolean', default: false },
    'skip-backup': { type: 'boolean', default: false },
    database: { type: 'string' },
    fingerprint: { type: 'string' },
    file: { type: 'string', default: path.resolve(backendDir, '../docs/exsels_data/حركه خزنه الجياره 2026 (1) (1) (1) (1).xlsx') },
    html: { type: 'string', default: path.resolve(backendDir, '../الجيارة (1).html') },
  },
});

const pounds = (v) => (v / 100).toLocaleString('en-US');

function report(title, workbook, plan) {
  const changes = plan.monthly.flatMap((m) => [
    `- Month ${m.month}: cash sales +${pounds(m.cashSales)} · transfers +${pounds(m.transfers)} · collections +${pounds(m.collections)}`,
    ...Object.entries(m.expenses).map(([category, amount]) => `  - expense ${category} +${pounds(amount)}`),
  ]);
  const lines = [
    `# ${title}`,
    '',
    `- File: \`${path.basename(args.file)}\` · fingerprint \`${workbook.fingerprint}\``,
    `- Rows already in the system and identical: ${plan.identical}`,
    `- **New rows: ${plan.newRows}**`,
    ...(plan.newRows ? [`- Cash balance: ${pounds(plan.fromBalance)} → **${pounds(plan.toBalance)}**, data up to ${plan.cashAsOf}`] : []),
    '- Customer balances are NOT changed.',
    '',
    '## Problems (these block the import)',
    ...(plan.problems.length ? plan.problems.map((p) => `- ${p}`) : ['- none']),
    '',
    '## Notes',
    ...(plan.notes.length ? plan.notes.map((n) => `- ${n}`) : ['- none']),
    '',
    '## Monthly totals',
    ...(changes.length ? changes : ['Nothing.']),
    '',
    '## New rows',
    '| Date | Description | Income | Expense | Balance | Category |',
    '|---|---|---|---|---|---|',
    ...plan.rows.map((r) => `| ${r.date} | ${r.description} | ${r.income ? pounds(r.income) : ''} | ${r.expense ? pounds(r.expense) : ''} | ${pounds(r.balanceAfter)} | ${r.category ?? ''} |`),
    '',
    '## Money received from customers (compared with their accounts, same amount within 3 days)',
    ...plan.payments.map((p) => `- ${p.date} ${p.description}: ${pounds(p.amount)} — ${p.inCustomerAccount ? 'also in a customer account' : 'NOT found in a customer account'}`),
    '',
  ];
  const folder = path.join(backendDir, 'seed-reports');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `cashbox-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`Identical rows: ${plan.identical} | new rows: ${plan.newRows} | problems: ${plan.problems.length}`);
  console.log(`Report (contains real data): ${file}`);
}

/** Reads the saved result back and compares every sheet row with the database. */
async function verify(workbook, today) {
  const { loadCashState } = await import('./sync/cashApply.js');
  const { buildCashPlan } = await import('./sync/cashPlan.js');
  const state = await loadCashState();
  const after = buildCashPlan(workbook, state, today);
  const last = workbook.rows.at(-1).balanceAfter;
  return !after.problems.length && !after.newRows && after.identical === workbook.rows.length && Math.abs(state.settings.cashOpening - last) <= 100;
}

async function dryRun(workbook) {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // Set before any app module reads the environment. .env is not loaded at all.
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: path.join(backendDir, 'no-env-file-for-dry-run'),
    NODE_ENV: 'test',
    MONGODB_URI: replset.getUri('gayara_cash_dry_run'),
    JWT_SECRET: 'dry-run-only-dry-run-only-dry-run-only',
  });
  const db = await import('../config/db.js');
  try {
    const { readHtmlData, buildPlan } = await import('./seed/source.js');
    const { importPlan } = await import('./seed/load.js');
    const { loadCashState: loadState, applyCashSync: applySync } = await import('./sync/cashApply.js');
    const { buildCashPlan: buildSyncPlan } = await import('./sync/cashPlan.js');
    const { today } = await import('../utils/date.js');
    const now = today('Africa/Cairo');
    await db.connectDatabase(process.env.MONGODB_URI);
    await importPlan(buildPlan(readHtmlData(fs.readFileSync(args.html, 'utf8'))));

    const plan = buildSyncPlan(workbook, await loadState(), now);
    report('Cash box update: practice run', workbook, plan);
    if (plan.problems.length) {
      process.exitCode = 1;
      return;
    }
    await applySync(workbook, now);
    const matches = await verify(workbook, now);
    const again = await applySync(workbook, now);
    console.log(`After the update every sheet row is in the system: ${matches ? 'yes' : 'NO'}`);
    console.log(`Running it a second time adds: ${again.newRows} rows`);
    console.log('Nothing was written to your database.');
    if (!matches || again.newRows) process.exitCode = 1;
    else console.log(`\nFingerprint: ${workbook.fingerprint}`);
  } finally {
    await db.disconnectDatabase();
    await replset.stop();
  }
}

function recentBackup(database) {
  const folder = path.join(backendDir, 'backups');
  if (!fs.existsSync(folder)) return null;
  return fs
    .readdirSync(folder)
    .filter((f) => f.startsWith(`${database}-`) && f.endsWith('.gybk'))
    .find((f) => Date.now() - fs.statSync(path.join(folder, f)).mtimeMs < 24 * 60 * 60 * 1000);
}

async function realDatabase(workbook) {
  if (args.write && args.fingerprint !== workbook.fingerprint) {
    throw new Error('Missing or wrong --fingerprint. Run the practice run, read its report, then use the value it prints.');
  }
  const { env } = await import('../config/env.js');
  const named = new URL(env.MONGODB_URI).pathname.slice(1);
  if (!named || args.database !== named) {
    throw new Error(`--database must be exactly the database named in MONGODB_URI ("${named || 'none'}")`);
  }
  if (args.write && args['skip-backup']) console.log('Writing WITHOUT a backup (--skip-backup).');
  else if (args.write && !recentBackup(named)) {
    throw new Error(`No backup of "${named}" from the last 24 hours in backend/backups. Run: npm run backup`);
  }

  const { default: mongoose } = await import('mongoose');
  const { loadCashState: loadState, applyCashSync: applySync } = await import('./sync/cashApply.js');
  const { buildCashPlan: buildSyncPlan } = await import('./sync/cashPlan.js');
  const { User } = await import('../modules/users/users.model.js');
  const { today } = await import('../utils/date.js');
  const now = today(env.APP_TIMEZONE);

  // Nothing may be created while connecting.
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  try {
    console.log(`Database: ${mongoose.connection.name}`);
    const plan = buildSyncPlan(workbook, await loadState(), now);
    report(args.write ? 'Cash box update: import' : 'Cash box update: check (nothing written)', workbook, plan);
    if (plan.problems.length) {
      for (const p of plan.problems) console.log(`  - ${p}`);
      throw new Error('There are problems. Nothing was written.');
    }
    if (!args.write) return console.log('Check only. Nothing was written.');
    if (!plan.newRows) return console.log('Nothing new. Nothing was written.');

    const owner = await User.findOne({ role: 'owner', active: true });
    if (!owner) throw new Error('No active owner user found');
    await applySync(workbook, now, owner);
    const matches = await verify(workbook, now);
    console.log(matches ? 'Saved and verified: every sheet row is in the system.' : 'VERIFICATION FAILED. Keep the backup and the report, and ask for help.');
    if (!matches) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

try {
  const workbook = await readCashWorkbook(args.file);
  await (args.check || args.write ? realDatabase(workbook) : dryRun(workbook));
} catch (error) {
  console.error('Stopped:', error.message);
  process.exitCode = 1;
}
