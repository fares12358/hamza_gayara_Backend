import { Customer } from './customers.model.js';
import { normalizeName } from './arabic.js';
import { buildStatement, overdueAmount, lastActivity, SETTLED } from './ledger.js';
import { LedgerRow } from '../history/history.model.js';
import { Entry } from '../entries/entries.model.js';
import { getSettings } from '../settings/settings.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { today, addDays } from '../../utils/date.js';
import { withTransaction } from '../../utils/transaction.js';

const groupBy = (list, key) => {
  const map = new Map();
  for (const item of list) {
    const k = String(item[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
};

function summarize(customer, statement, settings, now) {
  return {
    id: String(customer._id),
    name: customer.name,
    aliases: customer.aliases ?? [],
    balance: statement.balance,
    overdue: overdueAmount(customer, statement, now, settings.overdueDays),
    lastActivity: lastActivity(customer, statement),
  };
}

export async function listCustomers() {
  const [customers, sheetRows, entries, settings] = await Promise.all([
    Customer.find({ archived: false }).lean(),
    LedgerRow.find().select('customer seq date balanceAfter returnAmount invoiceAmount paymentAmount permitNo').lean(),
    // Only the fields the balance needs.
    Entry.find({ customer: { $ne: null }, voidedAt: null })
      .select('customer type date amount returnAmount customerDelta createdAt')
      .lean(),
    getSettings(),
  ]);
  const sheetByCustomer = groupBy(sheetRows, 'customer');
  const entriesByCustomer = groupBy(entries, 'customer');
  const now = today(env.APP_TIMEZONE);

  const list = customers.map((c) => {
    const key = String(c._id);
    const statement = buildStatement(c, sheetByCustomer.get(key) ?? [], entriesByCustomer.get(key) ?? []);
    return summarize(c, statement, settings, now);
  });
  list.sort((a, b) => b.balance - a.balance);

  const debtors = list.filter((c) => c.balance > SETTLED);
  return {
    customers: list,
    totals: {
      debt: debtors.reduce((sum, c) => sum + c.balance, 0),
      debtors: debtors.length,
      overdue: list.reduce((sum, c) => sum + (c.overdue ?? 0), 0),
    },
    ledgerAsOf: settings.ledgerAsOf,
    overdueDays: settings.overdueDays,
  };
}

async function loadCustomer(id) {
  const customer = await Customer.findById(id).lean();
  if (!customer) throw ApiError.notFound('العميل مش موجود');
  return customer;
}

/** rangeDays 0 = every row. Older rows become one "previous balance" line. */
export async function getStatement(id, rangeDays) {
  const customer = await loadCustomer(id);
  const [sheetRows, entries, settings] = await Promise.all([
    LedgerRow.find({ customer: id }).lean(),
    Entry.find({ customer: id, voidedAt: null }).lean(),
    getSettings(),
  ]);
  const statement = buildStatement(customer, sheetRows, entries);
  const now = today(env.APP_TIMEZONE);
  const from = rangeDays ? addDays(now, -rangeDays) : '';

  // From the first row inside the period to the end, so the running balance has no gaps.
  const first = from ? statement.rows.findIndex((r) => r.date >= from) : 0;
  const start = first < 0 ? statement.rows.length : first;
  const shown = statement.rows.slice(start);
  const previousBalance = start > 0 ? statement.rows[start - 1].balance : null;

  return {
    customer: { ...summarize(customer, statement, settings, now), source: customer.source, archived: customer.archived },
    openingBalance: customer.openingBalance,
    previousBalance,
    from,
    overdueDays: settings.overdueDays,
    rows: shown,
    totals: shown.reduce(
      (t, r) => ({
        invoices: t.invoices + r.invoiceAmount,
        returns: t.returns + r.returnAmount,
        payments: t.payments + r.paymentAmount,
      }),
      { invoices: 0, returns: 0, payments: 0 },
    ),
  };
}

export async function getBalance(id) {
  const customer = await loadCustomer(id);
  const entries = await Entry.find({ customer: id, voidedAt: null }).select('customerDelta').lean();
  return entries.reduce((sum, e) => sum + e.customerDelta, customer.openingBalance);
}

/** A name or other spelling may belong to one customer only. */
async function assertNamesFree(names, exceptId) {
  const wanted = new Set(names.map(normalizeName));
  const others = await Customer.find(exceptId ? { _id: { $ne: exceptId } } : {}).select('name searchName aliases archived').lean();
  for (const other of others) {
    if ([other.searchName, ...(other.aliases ?? []).map(normalizeName)].some((n) => wanted.has(n))) {
      throw ApiError.conflict(`الاسم ده مستخدم للعميل "${other.name}"${other.archived ? ' (في الأرشيف)' : ''}`);
    }
  }
}

export async function createCustomer({ name, openingBalance }, actor) {
  await assertNamesFree([name]);

  return withTransaction(async (session) => {
    const [customer] = await Customer.create(
      [{ name, searchName: normalizeName(name), openingBalance, openingDate: today(env.APP_TIMEZONE), source: 'app' }],
      { session },
    );
    await recordAudit(
      { actor, action: 'create', entity: 'customer', entityId: customer._id, data: { name, openingBalance } },
      session,
    );
    return { id: String(customer._id), name: customer.name };
  });
}

/** Rename, other spellings, archive. Money fields cannot change here. */
export async function updateCustomer(id, changes, actor) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('العميل مش موجود');
  const before = { name: customer.name, aliases: [...customer.aliases], archived: customer.archived };

  const name = changes.name ?? customer.name;
  let aliases = changes.aliases ?? [...customer.aliases];
  // The old name stays searchable.
  if (name !== before.name) aliases.push(before.name);
  aliases = [...new Set(aliases)].filter((a) => a !== name);
  if (changes.name || changes.aliases) await assertNamesFree([name, ...aliases], customer._id);

  if (changes.archived === true && !customer.archived && Math.abs(await getBalance(id)) >= SETTLED) {
    throw ApiError.conflict('ماينفعش تأرشف عميل رصيده مش خالص');
  }

  customer.set({ name, searchName: normalizeName(name), aliases, archived: changes.archived ?? customer.archived });
  await withTransaction(async (session) => {
    await customer.save({ session });
    await recordAudit(
      {
        actor, action: 'update', entity: 'customer', entityId: customer._id,
        data: { name, before, after: { name, aliases, archived: customer.archived } },
      },
      session,
    );
  });
  return { id: String(customer._id), name };
}

export async function listArchived() {
  const customers = await Customer.find({ archived: true }).sort({ name: 1 }).lean();
  return customers.map((c) => ({ id: String(c._id), name: c.name }));
}
