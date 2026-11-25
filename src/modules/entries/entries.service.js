import { randomUUID } from 'node:crypto';
import { Entry } from './entries.model.js';
import { effectsOf } from './effects.js';
import { Customer } from '../customers/customers.model.js';
import { assertSameRequest, checkDates, checkUnusual, hashRequest } from './safety.js';
import { recordAudit } from '../audit/audit.service.js';
import { ApiError } from '../../utils/ApiError.js';
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

const findByRequest = async (requestId) => {
  const first = await Entry.findOne({ requestId }).lean();
  return first ? Entry.find({ groupId: first.groupId }).sort({ createdAt: 1 }).lean() : null;
};

const replay = (saved, drafts, hash) => {
  assertSameRequest(saved, drafts, hash);
  return saved.map(toEntryDto);
};

/** Saves one or more linked records together. Safe to retry with the same requestId. */
export async function saveEntries(drafts, { actor, requestId, confirmBackdated, confirmUnusual, beforeSave, extraHash }) {
  const hash = hashRequest(drafts, extraHash);
  const existing = await findByRequest(requestId);
  if (existing) return replay(existing, drafts, hash);

  await checkDates(drafts, confirmBackdated);
  await checkUnusual(drafts, confirmUnusual);
  const groupId = randomUUID();

  try {
    return await withTransaction(async (session) => {
      const extra = beforeSave ? await beforeSave(session) : {};
      const docs = drafts.map(({ customerIsFromSheet, ...draft }, index) => ({
        ...draft,
        ...extra,
        groupId,
        requestId: index === 0 ? requestId : `${requestId}:${index}`,
        requestHash: hash,
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
      if (saved) return replay(saved, drafts, hash);
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

/** Corrects a customer debt (for example a wrong opening figure) without editing any record. */
export async function createAdjustment(input, actor) {
  const customer = await findCustomer(input.customerId);
  const type = input.direction === 'add' ? 'debt_add' : 'debt_reduce';
  return saveEntries([draftFor(type, input, customer)], { actor, ...input });
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

  // A hidden customer must not get a balance again without being seen.
  if (entry.customer && (await Customer.exists({ _id: entry.customer, archived: true }))) {
    throw ApiError.conflict('العميل في الأرشيف. رجّعه الأول وبعدين الغي الحركة.');
  }

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
