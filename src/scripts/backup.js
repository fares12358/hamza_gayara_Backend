/**
 * npm run backup
 * Saves every collection of the database in MONGODB_URI to an encrypted file
 * in backend/backups/. It only READS the database.
 * Copy the file to a second safe place (another disk or private cloud folder).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { pack, requirePassphrase } from './backupFile.js';

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backups');
const SKIP = new Set(['loginattempts']);

try {
  const passphrase = requirePassphrase();
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, autoIndex: false, autoCreate: false });
  const database = mongoose.connection.db;
  const names = (await database.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !SKIP.has(n));

  // One snapshot, so that balances and records belong to the same moment.
  const session = mongoose.connection.getClient().startSession({ snapshot: true });
  const collections = {};
  try {
    for (const name of names) collections[name] = await database.collection(name).find({}, { session }).toArray();
  } finally {
    await session.endSession();
  }

  const createdAt = new Date();
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${database.databaseName}-${createdAt.toISOString().replace(/[:.]/g, '-')}.gybk`);
  fs.writeFileSync(file, pack({ database: database.databaseName, createdAt, collections }, passphrase), { flag: 'wx' });

  for (const name of names) console.log(`${name}: ${collections[name].length}`);
  console.log(`Saved: ${file}`);
} catch (error) {
  console.error('Backup failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
