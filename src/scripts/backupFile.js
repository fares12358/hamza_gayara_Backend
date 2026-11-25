/**
 * Backup file format: "GYBK1" + salt + iv + tag + AES-256-GCM(gzip(extended JSON)).
 * The key comes from BACKUP_PASSPHRASE. Without it the file cannot be read.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import mongoose from 'mongoose';

const MAGIC = Buffer.from('GYBK1');
const { EJSON } = mongoose.mongo.BSON;

export function requirePassphrase() {
  const value = process.env.BACKUP_PASSPHRASE ?? '';
  if (value.length < 12) throw new Error('Set BACKUP_PASSPHRASE (12 characters or more) in backend/.env');
  return value;
}

export function pack(data, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  const body = Buffer.concat([cipher.update(gzipSync(EJSON.stringify(data, { relaxed: false }))), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function unpack(file, passphrase) {
  if (!file.subarray(0, 5).equals(MAGIC)) throw new Error('This is not a gayara backup file');
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, file.subarray(5, 21), 32), file.subarray(21, 33));
  decipher.setAuthTag(file.subarray(33, 49));
  let compressed;
  try {
    compressed = Buffer.concat([decipher.update(file.subarray(49)), decipher.final()]);
  } catch {
    throw new Error('Wrong BACKUP_PASSPHRASE, or the file is damaged');
  }
  return EJSON.parse(gunzipSync(compressed).toString('utf8'), { relaxed: false });
}
