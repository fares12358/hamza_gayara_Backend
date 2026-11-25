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
    LedgerRow.find().lean(),
    Entry.find({ customer: { $ne: null }, voidedAt: null }).lean(),
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

  const shown = [];
  let previousBalance = null;
  for (const row of statement.rows) {
    if (!from || row.date >= from) shown.push(row);
    else previousBalance = row.balance;
  }

  return {
    customer: { ...summarize(customer, statement, settings, now), source: customer.source },
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

export async function createCustomer({ name, openingBalance }, actor) {
  const searchName = normalizeName(name);
  const clash = await Customer.exists({ $or: [{ searchName }, { aliases: name }] });
  if (clash) throw ApiError.conflict('العميل ده موجود بالفعل');

  return withTransaction(async (session) => {
    const [customer] = await Customer.create(
      [{ name, searchName, openingBalance, openingDate: today(env.APP_TIMEZONE), source: 'app' }],
      { session },
    );
    await recordAudit(
      { actor, action: 'create', entity: 'customer', entityId: customer._id, data: { name, openingBalance } },
      session,
    );
    return { id: String(customer._id), name: customer.name };
  });
}
