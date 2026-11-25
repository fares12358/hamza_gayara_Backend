/**
 * Imports the data of the old HTML app.
 *
 *   npm run seed:dry
 *       Practice import into a temporary database. Does not read .env
 *       and does not connect to Atlas.
 *
 *   node src/scripts/seed.js --write --database=NAME --fingerprint=VALUE
 *       Real import into the database in .env. NAME must match the database in
 *       MONGODB_URI and VALUE must match the dry run. Refuses if data exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readHtmlData, buildPlan, inspectPlan } from './seed/source.js';
import { buildReport } from './seed/report.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { values: args } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    database: { type: 'string' },
    fingerprint: { type: 'string' },
    source: { type: 'string', default: path.resolve(backendDir, '../الجيارة (1).html') },
  },
});

function saveReport(mode, plan, problems, result) {
  const folder = path.join(backendDir, 'seed-reports');
  fs.mkdirSync(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(folder, `${mode}-${stamp}.md`);
  const report = buildReport({ mode, sourceName: path.basename(args.source), plan, problems, result });
  fs.writeFileSync(file, report);
  return file;
}

function summary(plan, result, file) {
  console.log(`Customers: ${plan.customers.length} | cash rows: ${plan.cashRows.length} | months: ${plan.monthly.length}`);
  console.log(`Verification: ${result.checked} comparisons, ${result.failures.length} differences`);
  console.log(`Report: ${file}`);
}

async function dryRun(data, plan, problems) {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // Set before any app module reads the environment. .env is not loaded at all.
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: path.join(backendDir, 'no-env-file-for-dry-run'),
    NODE_ENV: 'test',
    MONGODB_URI: replset.getUri('gayara_dry_run'),
    JWT_SECRET: 'dry-run-only-dry-run-only-dry-run-only',
  });

  const db = await import('../config/db.js');
  try {
    const { importPlan } = await import('./seed/load.js');
    const { verifyImport } = await import('./seed/verify.js');
    await db.connectDatabase(process.env.MONGODB_URI);
    await importPlan(plan);
    const result = await verifyImport(data);

    // Running the import a second time must be refused.
    const secondRunRefused = await importPlan(plan).then(() => false, () => true);
    if (!secondRunRefused) result.failures.push('a second import was NOT refused');

    summary(plan, result, saveReport('dry-run', plan, problems, result));
    console.log(`Second import refused: ${secondRunRefused ? 'yes' : 'NO'}`);
    console.log('Nothing was written to your database.');
    if (result.failures.length) process.exitCode = 1;
    else console.log(`\nFingerprint: ${plan.fingerprint}`);
  } finally {
    await db.disconnectDatabase();
    await replset.stop();
  }
}

async function realImport(data, plan, problems) {
  if (args.fingerprint !== plan.fingerprint) {
    throw new Error('Missing or wrong --fingerprint. Run the dry run, read its report, then use the value it prints.');
  }
  const { env } = await import('../config/env.js');
  const named = new URL(env.MONGODB_URI).pathname.slice(1);
  if (!named) throw new Error('MONGODB_URI has no database name. Add it after the host, for example /gayara_test');
  if (args.database !== named) {
    throw new Error(`--database must be exactly the database in MONGODB_URI ("${named}")`);
  }

  const { default: mongoose } = await import('mongoose');
  const { findExistingData, prepareCollections, importPlan } = await import('./seed/load.js');
  const { verifyImport } = await import('./seed/verify.js');
  const { User } = await import('../modules/users/users.model.js');

  // Nothing may be created while we are only checking.
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  try {
    console.log(`Database: ${mongoose.connection.name}`);
    const existing = await findExistingData();
    if (existing.length) {
      throw new Error(`The database already has data, so nothing was imported (${existing.join(', ')})`);
    }
    const owner = await User.findOne({ role: 'owner', active: true });
    if (!owner) throw new Error('Create the owner first: npm run create-owner');

    await prepareCollections();
    await importPlan(plan, owner);
    console.log('Import saved. Reading it back to verify...');

    const result = await verifyImport(data);
    summary(plan, result, saveReport('import', plan, problems, result));
    if (result.failures.length) {
      process.exitCode = 1;
      console.error('VERIFICATION FAILED. Do not use this database. Keep the report and ask for help.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

try {
  const data = readHtmlData(fs.readFileSync(args.source, 'utf8'));
  const plan = buildPlan(data);
  const problems = inspectPlan(plan);
  await (args.write ? realImport : dryRun)(data, plan, problems);
} catch (error) {
  console.error('Stopped:', error.message);
  process.exitCode = 1;
}
