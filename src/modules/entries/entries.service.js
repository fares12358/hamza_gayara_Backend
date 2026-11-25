import { randomUUID } from 'node:crypto';
import { Entry } from './entries.model.js';
import { effectsOf } from './effects.js';
import { Customer } from '../customers/customers.model.js';
import { getSettings } from '../settings/settings.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { today } from '../../utils/date.js';
import { withTransaction } from '../../utils/transaction.js';

export function toEntryDto(e) {
  return {
    id: String(e._id),
    type: e.type,
    date: e.date,
    amount: e.amount,
    returnAmount: e.returnAmount,
    customerId: e.customer ? String(e.customer) : null,
    customerName: e.customerName,
    permitNo: e.permitNo,
    category: e.category,
    note: e.note,
    groupId: e.groupId,
    createdAt: e.createdAt,
    cheque: e.cheque
      ? {
          number: e.cheque.number,
          bank: e.cheque.bank,
          dueDate: e.cheque.dueDate,
          imageId: e.cheque.image ? String(e.cheque.image) : '',
        }
      : undefined,
  };
}

async function findCustomer(id) {
  const customer = await Customer.findOne({ _id: id, archived: false });
  if (!customer) throw ApiError.notFound('العميل مش موجود');
  return customer;
}

/**
 * A date inside the period already covered by the sheets may count money twice,
 * so the user has to confirm it.
 */
async function checkDates(drafts, confirmed) {
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

const findByRequest = async (requestId) => {
  const first = await Entry.findOne({ requestId }).lean();
  if (!first) return null;
  return (await Entry.find({ groupId: first.groupId }).sort({ createdAt: 1 }).lean()).map(toEntryDto);
};

/**
 * A repeated requestId must carry the same data. Otherwise the first attempt was
 * saved and the user changed the form before retrying: say so, never pretend.
 */
function assertSameRequest(saved, drafts) {
  const key = (e, customer) => [e.type, e.date, e.amount, e.returnAmount, customer ?? ''].join('|');
  const before = saved.map((e) => key(e, e.customerId)).sort().join();
  const now = drafts.map((d) => key(d, d.customer && String(d.customer))).sort().join();
  if (before !== now) {
    throw ApiError.conflict(
      'المحاولة اللي فاتت اتسجلت ببيانات مختلفة. راجع آخر الحركات قبل ما تسجل تاني.',
      'REQUEST_REUSED',
    );
  }
  return saved;
}

/** Saves one or more linked records together. Safe to retry with the same requestId. */
export async function saveEntries(drafts, { actor, requestId, confirmBackdated, beforeSave }) {
  const existing = await findByRequest(requestId);
  if (existing) return assertSameRequest(existing, drafts);

  await checkDates(drafts, confirmBackdated);
  const groupId = randomUUID();

  try {
    return await withTransaction(async (session) => {
      const extra = beforeSave ? await beforeSave(session) : {};
      const docs = drafts.map(({ customerIsFromSheet, ...draft }, index) => ({
        ...draft,
        ...extra,
        groupId,
        requestId: index === 0 ? requestId : `${requestId}:${index}`,
        createdBy: actor._id,
      }));
      const saved = await Entry.create(docs, { session, ordered: true });
      for (const entry of saved) {
        await recordAudit(
          { actor, action: 'create', entity: 'entry', entityId: entry._id, data: toEntryDto(entry) },
          session,
        );
      }
      return saved.map(toEntryDto);
    });
  } catch (error) {
    // Two copies of the same request arrived together: return the saved one.
    if (error?.code === 11000) {
      const saved = await findByRequest(requestId);
      if (saved) return assertSameRequest(saved, drafts);
    }
    throw error;
  }
}

export function draftFor(type, input, customer) {
  const returnAmount = type === 'invoice' ? input.returnAmount ?? 0 : 0;
  return {
    type,
    date: input.date,
    amount: input.amount,
    returnAmount,
    ...effectsOf(type, input.amount, returnAmount),
    customer: customer?._id ?? null,
    customerName: customer?.name ?? '',
    customerIsFromSheet: customer?.source === 'sheet',
    permitNo: input.permitNo ?? '',
    category: input.category ?? '',
    note: input.note ?? '',
  };
}

export async function createInvoice(input, actor) {
  const customer = await findCustomer(input.customerId);
  const drafts = [draftFor('invoice', input, customer)];
  if (input.paidAmount > 0) {
    drafts.push(
      draftFor('payment', { ...input, amount: input.paidAmount, note: 'دفعة مع الفاتورة' }, customer),
    );
  }
  return saveEntries(drafts, { actor, ...input });
}

export async function createCashMovement(input, actor) {
  const customer = input.type === 'payment' ? await findCustomer(input.customerId) : null;
  return saveEntries([draftFor(input.type, input, customer)], { actor, ...input });
}

export async function listRecent({ types, limit }) {
  const filter = { voidedAt: null, ...(types.length && { type: { $in: types } }) };
  const entries = await Entry.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return entries.map(toEntryDto);
}

/** Cancels a record. Cancelling an invoice also cancels the payment saved with it. */
export async function voidEntry(id, reason, actor) {
  const entry = await Entry.findOne({ _id: id, voidedAt: null });
  if (!entry) throw ApiError.notFound('الحركة مش موجودة أو اتلغت قبل كده');

  return withTransaction(async (session) => {
    const filter = entry.type === 'invoice' ? { groupId: entry.groupId, voidedAt: null } : { _id: entry._id, voidedAt: null };
    const targets = await Entry.find(filter).session(session);
    for (const target of targets) {
      target.voidedAt = new Date();
      target.voidedBy = actor._id;
      target.voidReason = reason;
      await target.save({ session });
      await recordAudit(
        { actor, action: 'void', entity: 'entry', entityId: target._id, data: { reason, ...toEntryDto(target) } },
        session,
      );
    }
    return targets.map((t) => String(t._id));
  });
}
