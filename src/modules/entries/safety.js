/** Checks that run before money records are saved. */
import { createHash } from 'node:crypto';
import { Entry } from './entries.model.js';
import { SETTLED } from '../customers/ledger.js';
import { getBalance as getCustomerBalance } from '../customers/customers.service.js';
import { getBalance as getCashBalance } from '../treasury/treasury.service.js';
import { getSettings } from '../settings/settings.service.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { today } from '../../utils/date.js';

/** Identifies everything the user entered. "extra" covers files such as the cheque photo. */
export function hashRequest(drafts, extra = '') {
  const fields = drafts.map((d) => [
    d.type, d.date, d.amount, d.returnAmount, String(d.customer ?? ''), d.permitNo, d.category, d.note,
    d.cheque ? [d.cheque.number, d.cheque.bank, d.cheque.dueDate] : null,
  ]);
  return createHash('sha256').update(JSON.stringify([fields, extra])).digest('hex');
}

const reused = (message) => ApiError.conflict(message, 'REQUEST_REUSED');

/**
 * A repeated requestId must carry exactly the same data and still be active.
 * Otherwise say so: never report a save that did not happen.
 */
export function assertSameRequest(saved, drafts, hash) {
  if (saved.some((e) => e.voidedAt)) {
    throw reused('المحاولة دي اتسجلت قبل كده واتلغت. راجع الحركات، ولو محتاج تسجلها تاني اضغط حفظ مرة كمان.');
  }
  const key = (e) => [e.type, e.date, e.amount, e.returnAmount, String(e.customer ?? '')].join('|');
  // Records saved before the hash existed are compared by their main fields.
  const same = saved[0].requestHash
    ? saved[0].requestHash === hash
    : saved.map(key).sort().join() === drafts.map(key).sort().join();
  if (!same) throw reused('المحاولة اللي فاتت اتسجلت ببيانات مختلفة. راجع آخر الحركات قبل ما تسجل تاني.');
}

/**
 * A date inside the period already covered by the sheets may count money twice,
 * so the user has to confirm it.
 */
export async function checkDates(drafts, confirmed) {
  const now = today(env.APP_TIMEZONE);
  if (drafts.some((d) => d.date > now)) throw ApiError.badRequest('التاريخ في المستقبل، راجعه', 'FUTURE_DATE');
  if (confirmed) return;

  const { cashAsOf, ledgerAsOf } = await getSettings();
  for (const draft of drafts) {
    const inLedger = draft.customerDelta !== 0 && draft.customerIsFromSheet && ledgerAsOf && draft.date <= ledgerAsOf;
    const inCash = draft.cashDelta !== 0 && cashAsOf && draft.date <= cashAsOf;
    if (inLedger || inCash) {
      throw ApiError.conflict(
        'التاريخ ده داخل فترة الشيتات القديمة، وممكن الحركة تتحسب مرتين. متأكد إنها مش مسجلة في الشيت؟',
        'BACKDATED',
        { ledgerAsOf, cashAsOf },
      );
    }
  }
}

const sum = (list, key) => list.reduce((total, item) => total + item[key], 0);

/**
 * Allowed, but often a typing mistake: the user has to confirm.
 * This is a warning, not a lock: two users saving at the same moment can both pass.
 */
export async function checkUnusual(drafts, confirmed) {
  if (confirmed) return;
  const warnings = [];

  const cashChange = sum(drafts, 'cashDelta');
  if (cashChange < 0 && (await getCashBalance()) + cashChange < 0) {
    warnings.push('رصيد الخزنة هيبقى بالسالب.');
  }

  const customerId = drafts.find((d) => d.customer)?.customer;
  const debtChange = sum(drafts, 'customerDelta');
  if (customerId && debtChange < 0 && (await getCustomerBalance(customerId)) + debtChange < -SETTLED) {
    warnings.push('المبلغ أكبر من مديونية العميل، وهيبقى ليه رصيد.');
  }

  for (const d of drafts) {
    if (d.type !== 'cheque' || !d.cheque?.number) continue;
    const sameOwner = [{ customer: d.customer }, ...(d.cheque.bank ? [{ 'cheque.bank': d.cheque.bank }] : [])];
    if (await Entry.exists({ type: 'cheque', voidedAt: null, 'cheque.number': d.cheque.number, $or: sameOwner })) {
      warnings.push(`فيه شيك متسجل بنفس الرقم (${d.cheque.number}).`);
    }
  }

  if (warnings.length) throw ApiError.conflict(`${warnings.join(' ')} متأكد إن البيانات صح؟`, 'UNUSUAL', { warnings });
}
