/** Writes a plan to the database. Only inserts: it never updates or deletes. */
import mongoose from 'mongoose';
import { Customer } from '../../modules/customers/customers.model.js';
import { LedgerRow, CashRow, MonthlySummary } from '../../modules/history/history.model.js';
import { Settings } from '../../modules/settings/settings.model.js';
import { Entry } from '../../modules/entries/entries.model.js';
import { ChequeImage } from '../../modules/cheques/chequeImage.model.js';
import { User } from '../../modules/users/users.model.js';
import { AuditLog } from '../../modules/audit/audit.model.js';
import { recordAudit } from '../../modules/audit/audit.service.js';
import { withTransaction } from '../../utils/transaction.js';

// Business data. All of it must be empty before an import. Users are not touched.
const MUST_BE_EMPTY = [Customer, LedgerRow, CashRow, MonthlySummary, Settings, Entry, ChequeImage];

export async function findExistingData(session = null) {
  const found = [];
  for (const model of MUST_BE_EMPTY) {
    const count = await model.countDocuments().session(session);
    if (count) found.push(`${model.collection.collectionName}: ${count}`);
  }
  return found;
}

/** Collections and indexes must exist before the transaction. */
export async function prepareCollections() {
  for (const model of [...MUST_BE_EMPTY, User, AuditLog]) {
    await model.createCollection().catch((error) => {
      if (error.code !== 48) throw error; // 48: already exists
    });
    await model.createIndexes();
  }
}

/** Everything is saved together or nothing is. */
export function importPlan(plan, actor) {
  return withTransaction(async (session) => {
    const existing = await findExistingData(session);
    if (existing.length) {
      throw new Error(`The database already has data, so nothing was imported (${existing.join(', ')})`);
    }

    const customers = plan.customers.map((c) => ({ _id: new mongoose.Types.ObjectId(), ...c.doc }));
    const ledgerRows = plan.customers.flatMap((c, i) => c.rows.map((r) => ({ ...r, customer: customers[i]._id })));

    const options = { session, ordered: true };
    await Customer.insertMany(customers, options);
    await LedgerRow.insertMany(ledgerRows, options);
    await CashRow.insertMany(plan.cashRows, options);
    await MonthlySummary.insertMany(plan.monthly, options);
    const [settings] = await Settings.create([plan.settings], { session });

    const counts = {
      customers: customers.length,
      ledgerRows: ledgerRows.length,
      cashRows: plan.cashRows.length,
      months: plan.monthly.length,
    };
    if (actor) {
      await recordAudit(
        { actor, action: 'import', entity: 'sheets', entityId: settings._id, data: { fingerprint: plan.fingerprint, ...counts } },
        session,
      );
    }
    return counts;
  });
}
