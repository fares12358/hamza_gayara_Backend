/** Loads the database state for the cash plan, and writes the plan in one transaction. */
import { Entry } from '../../modules/entries/entries.model.js';
import { CashRow, LedgerRow, MonthlySummary } from '../../modules/history/history.model.js';
import { Settings } from '../../modules/settings/settings.model.js';
import { recordAudit } from '../../modules/audit/audit.service.js';
import { withTransaction } from '../../utils/transaction.js';
import { buildCashPlan } from './cashPlan.js';

/** Read only. */
export async function loadCashState(session = null) {
  const cashRows = await CashRow.find().session(session).lean();
  const summaries = await MonthlySummary.find().session(session).lean();
  const entries = await Entry.find({ voidedAt: null, cashDelta: { $ne: 0 } }).session(session).lean();
  const ledgerRows = await LedgerRow.find({ paymentAmount: { $gt: 0 } }).session(session).lean();
  const settings = (await Settings.findOne({ key: 'main' }).session(session).lean()) ?? {};
  return { cashRows, summaries, entries, ledgerRows, settings };
}

/**
 * Adds the new cash rows. It changes only: those rows, the cash balance and its date,
 * and the monthly cash sales, transfers, collections and expenses. Customer balances
 * are not touched. Nothing is deleted and no existing row is changed.
 */
export function applyCashSync(workbook, today, actor) {
  return withTransaction(async (session) => {
    const plan = buildCashPlan(workbook, await loadCashState(session), today);
    if (plan.problems.length) throw new Error(`Nothing was written:\n  - ${plan.problems.join('\n  - ')}`);
    if (!plan.newRows) return plan;

    await CashRow.insertMany(
      plan.rows.map(({ category, ...row }) => ({ ...row, importKey: `sync:cash:${row.seq}` })),
      { session, ordered: true },
    );
    for (const change of plan.monthly) {
      const summary =
        (await MonthlySummary.findOne({ month: change.month }).session(session)) ?? new MonthlySummary({ month: change.month });
      summary.cashSales += change.cashSales;
      summary.transfers += change.transfers;
      summary.collections += change.collections;
      for (const [category, amount] of Object.entries(change.expenses)) {
        const line = summary.expenses.find((x) => x.category === category);
        if (line) line.amount += amount;
        else summary.expenses.push({ category, amount });
      }
      await summary.save({ session });
    }
    const settings = await Settings.findOneAndUpdate(
      { key: 'main', cashOpening: plan.fromBalance },
      { $set: { cashOpening: plan.toBalance, cashAsOf: plan.cashAsOf } },
      { session, returnDocument: 'after' },
    );
    if (!settings) throw new Error('The cash balance changed while importing. Nothing was written.');
    if (actor) {
      await recordAudit(
        {
          actor,
          action: 'import',
          entity: 'sheets',
          entityId: settings._id,
          data: {
            name: 'تحديث حركة الخزنة من الإكسل',
            fingerprint: workbook.fingerprint,
            newRows: plan.newRows,
            from: plan.fromBalance,
            to: plan.toBalance,
            monthly: plan.monthly,
            rows: plan.rows,
          },
        },
        session,
      );
    }
    return plan;
  });
}
