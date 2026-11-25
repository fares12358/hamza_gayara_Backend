/**
 * Check a backup file (does not touch any database):
 *   node src/scripts/restore.js --file backups/NAME.gybk --check
 *
 * Restore into a NEW, EMPTY database. Point MONGODB_URI at it first:
 *   node src/scripts/restore.js --file backups/NAME.gybk --database=gayara_restore_test
 *
 * It never overwrites or deletes: it refuses if the database has any document.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { unpack, requirePassphrase } from './backupFile.js';

const { values: args } = parseArgs({
  options: { file: { type: 'string' }, database: { type: 'string' }, check: { type: 'boolean', default: false } },
});

try {
  if (!args.file) throw new Error('Give the backup with --file');
  const backup = unpack(fs.readFileSync(args.file), requirePassphrase());
  const entries = Object.entries(backup.collections);
  console.log(`Backup of "${backup.database}" made ${new Date(backup.createdAt).toISOString()}`);
  for (const [name, docs] of entries) console.log(`  ${name}: ${docs.length}`);

  if (!args.check) {
    const named = new URL(env.MONGODB_URI).pathname.slice(1);
    if (!named || args.database !== named) {
      throw new Error(`--database must be exactly the database named in MONGODB_URI ("${named || 'none'}")`);
    }
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, autoIndex: false, autoCreate: false });
    const database = mongoose.connection.db;
    for (const { name } of await database.listCollections({}, { nameOnly: true }).toArray()) {
      if (name !== 'loginattempts' && !name.startsWith('system.') && (await database.collection(name).countDocuments())) {
        throw new Error(`The database is not empty (${name}). Nothing was written. Use a new database name.`);
      }
    }
    for (const [name, docs] of entries) {
      // EJSON keeps the number types exactly as they were.
      if (docs.length) await database.collection(name).insertMany(docs, { ordered: true });
      const count = await database.collection(name).countDocuments();
      if (count !== docs.length) throw new Error(`${name}: expected ${docs.length}, found ${count}. Do not use this database.`);
    }
    console.log('Restored. Start the server once to create the indexes, then compare the totals in the app.');
  }
} catch (error) {
  console.error('Stopped:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
