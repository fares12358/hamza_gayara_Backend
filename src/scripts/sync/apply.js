/** Loads the database state for the plan, and writes the plan in one transaction. */
import { Customer } from '../../modules/customers/customers.model.js';
import { Entry } from '../../modules/entries/entries.model.js';
import { LedgerRow, MonthlySummary } from '../../modules/history/history.model.js';
import { Settings } from '../../modules/settings/settings.model.js';
import { recordAudit } from '../../modules/audit/audit.service.js';
import { withTransaction } from '../../utils/transaction.js';
import { buildSyncPlan } from './plan.js';

/** Read only. */
export async function loadState(session = null) {
  const customers = await Customer.find().session(session).lean();
  const ledgerRows = await LedgerRow.find().session(session).lean();
  const entries = await Entry.find({ customer: { $ne: null }, voidedAt: null }).session(session).lean();
  const settings = (await Settings.findOne({ key: 'main' }).session(session).lean()) ?? {};
  return { customers, ledgerRows, entries, settings };
}

/**
 * Adds the new rows. It changes only: the new ledger rows, the opening balance of
 * those customers, the monthly credit sales and returns, and the "data up to" date.
 * Nothing is deleted and no existing sheet row is touched.
 */
export function applySync(workbook, today, actor) {
  return withTransaction(async (session) => {
    // The plan is made again inside the transaction, from the data as it is now.
    const plan = buildSyncPlan(workbook, await loadState(session), today);
    if (plan.problems.length) throw new Error(`Nothing was written:\n  - ${plan.problems.join('\n  - ')}`);
    if (!plan.newRows) return plan;

    for (const update of plan.updates) {
      await LedgerRow.insertMany(
        update.rows.map((row) => ({ ...row, customer: update.customerId, importKey: `sync:${update.customerId}:${row.seq}` })),
        { session, ordered: true },
      );
      // The opening balance is the final sheet balance. It is protected against edits,
      // so this import script says explicitly that it moves it forward.
      const result = await Customer.updateOne(
        { _id: update.customerId, openingBalance: update.fromBalance },
        { $set: { openingBalance: update.toBalance, openingDate: update.newest } },
        { session, overwriteImmutable: true },
      );
      if (result.modifiedCount !== 1) throw new Error(`${update.name}: the balance changed while importing. Nothing was written.`);
    }
    for (const { month, creditSales, returns } of plan.monthly) {
      await MonthlySummary.updateOne({ month }, { $inc: { creditSales, returns } }, { session, upsert: true });
    }
    const settings = await Settings.findOneAndUpdate(
      { key: 'main' },
      { $set: { ledgerAsOf: plan.ledgerAsOf } },
      { session, returnDocument: 'after' },
    );
    if (actor) {
      await recordAudit(
        {
          actor,
          action: 'import',
          entity: 'sheets',
          entityId: settings._id,
          data: {
            name: 'تحديث حسابات العملاء من الإكسل',
            fingerprint: workbook.fingerprint,
            newRows: plan.newRows,
            customers: plan.updates.map((u) => ({ name: u.name, from: u.fromBalance, to: u.toBalance, rows: u.rows })),
            monthly: plan.monthly,
          },
        },
        session,
      );
    }
    return plan;
  });
}
