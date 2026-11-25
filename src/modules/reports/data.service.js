/** Loads what each report needs. READ ONLY: nothing here saves or changes data. */
import {
  agingReport, cashboxReport, debtsReport, expensesReport, isSheetCashSale, lateReport, placeSheetRows, salesReport,
} from './builders.js';
import { Customer } from '../customers/customers.model.js';
import { buildStatement } from '../customers/ledger.js';
import { Entry } from '../entries/entries.model.js';
import { CashRow, LedgerRow, MonthlySummary } from '../history/history.model.js';
import { getSettings } from '../settings/settings.service.js';
import { describeCashEntry } from '../treasury/treasury.service.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { today } from '../../utils/date.js';

const shortDate = (iso) => iso.split('-').reverse().join('/');
const unique = (list) => [...new Set(list)].sort();

/** Says when part of the asked period is after the last date of the old sheets. */
function coverage(lastAsked, asOf, what) {
  return asOf && lastAsked > asOf
    ? [`${what} من الشيتات مسجلة لحد ${shortDate(asOf)}. بعد التاريخ ده التقرير فيه الحركات اللي اتسجلت من النظام بس.`]
    : [];
}

async function loadCustomers() {
  const [customers, sheetRows, entries] = await Promise.all([
    Customer.find().lean(),
    LedgerRow.find().lean(),
    Entry.find({ customer: { $ne: null }, voidedAt: null }).lean(),
  ]);
  const group = (list) => {
    const map = new Map();
    for (const item of list) {
      const key = String(item.customer);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  };
  const rows = group(sheetRows);
  const records = group(entries);
  return customers.map((customer) => ({
    customer,
    name: customer.name,
    archived: customer.archived,
    statement: buildStatement(customer, rows.get(String(customer._id)) ?? [], records.get(String(customer._id)) ?? []),
  }));
}

const loaders = {
  async cashbox({ from, to }, now, settings) {
    const end = to || now;
    const start = from || `${end.slice(0, 7)}-01`;
    if (start > end) throw ApiError.badRequest('تاريخ البداية بعد تاريخ النهاية');
    const [sheetRows, entries] = await Promise.all([
      CashRow.find().sort({ seq: 1 }).lean(),
      Entry.find({ voidedAt: null, cashDelta: { $ne: 0 } }).sort({ date: 1, createdAt: 1 }).lean(),
    ]);
    const appRows = entries.map((e) => ({
      date: e.date,
      description: describeCashEntry(e),
      income: Math.max(e.cashDelta, 0),
      expense: Math.max(-e.cashDelta, 0),
    }));
    const report = cashboxReport({ sheetRows, appRows, cashOpening: settings.cashOpening, from: start, to: end });
    const notes = coverage(end, settings.cashAsOf, 'حركة الخزنة');
    if (report.rows.some((r) => r.misdated)) notes.push('فيه صف تاريخه شكله مكتوب غلط في الشيت. ظاهر بتاريخه الأصلي في مكانه بين الصفوف.');
    return { report, notes, options: {} };
  },

  async sales({ month }, now, settings) {
    const [cashRows, ledgerRows, entries, customers] = await Promise.all([
      CashRow.find().sort({ seq: 1 }).lean(),
      LedgerRow.find({ invoiceAmount: { $gt: 0 } }).lean(),
      Entry.find({ voidedAt: null, type: { $in: ['cash_sale', 'invoice'] } }).sort({ createdAt: 1 }).lean(),
      Customer.find().select('name').lean(),
    ]);
    const names = new Map(customers.map((c) => [String(c._id), c.name]));
    const placed = placeSheetRows(cashRows);
    const lines = [
      ...placed.filter((r) => isSheetCashSale(r.description)).map((r) => ({ date: r.date, cash: true, amount: r.income })),
      ...ledgerRows.map((r) => ({ date: r.date, cash: false, name: names.get(String(r.customer)) ?? '', amount: r.invoiceAmount })),
      ...entries.map((e) =>
        e.type === 'cash_sale'
          ? { date: e.date, cash: true, amount: e.amount }
          : { date: e.date, cash: false, name: names.get(String(e.customer)) ?? e.customerName, amount: e.amount },
      ),
    ];
    const months = unique([now.slice(0, 7), ...lines.map((l) => l.date.slice(0, 7))]);
    const selected = month || now.slice(0, 7);
    const report = salesReport({ month: selected, lines });
    const end = `${selected}-31`;
    const notes = [
      'قيمة الفاتورة قبل خصم المرتجع، زي شيت المبيعات.',
      ...coverage(end, settings.cashAsOf, 'المبيعات النقدية'),
      ...coverage(end, settings.ledgerAsOf, 'فواتير العملاء'),
      ...placed
        .filter((r) => r.misdated && isSheetCashSale(r.description) && r.place.slice(0, 7) === selected)
        .map((r) => `صف مبيعات نقدية مكتوب بتاريخ ${shortDate(r.date)} ومكانه في الشيت جنب ${shortDate(r.place)}. مش محسوب في الشهر ده، راجعه.`),
    ];
    return { report, notes, options: { months } };
  },

  async debts({ date }, now, settings) {
    const customers = await loadCustomers();
    // Default: the latest day that has any customer movement.
    const latest = customers.flatMap((c) => c.statement.rows.map((r) => r.date)).filter((d) => d <= now).sort().at(-1);
    const day = date || latest || now;
    if (day > now) throw ApiError.badRequest('التاريخ في المستقبل');
    return { report: debtsReport({ customers, date: day }), notes: coverage(day, settings.ledgerAsOf, 'حسابات العملاء'), options: {} };
  },

  async aging(query, now, settings) {
    const report = agingReport({ customers: await loadCustomers(), today: now, days: settings.overdueDays });
    return {
      report,
      notes: [
        'توزيع المديونية على الشهور بيفترض إن الدفعات بتسدد أقدم الفواتير الأول.',
        `"مستحق الدفع" هو المتأخر أكتر من ${settings.overdueDays} أيام حسب حساب النظام. العميل اللي تأخيره غير معروف خانته فاضية.`,
      ],
      options: {},
    };
  },

  async late(query, now, settings) {
    const report = lateReport({ customers: await loadCustomers(), today: now, days: settings.overdueDays });
    return {
      report,
      notes: [
        `المتأخر = أكتر من ${settings.overdueDays} أيام حسب حساب النظام.`,
        'الفواتير المعروضة محسوبة على إن الدفعات بتسدد أقدم الفواتير الأول.',
      ],
      options: {},
    };
  },

  async expenses({ year }, now) {
    const [summaries, entries] = await Promise.all([
      MonthlySummary.find().lean(),
      Entry.find({ voidedAt: null, type: 'expense' }).select('type date amount category returnAmount').lean(),
    ]);
    const years = unique([now.slice(0, 4), ...summaries.map((s) => s.month.slice(0, 4)), ...entries.map((e) => e.date.slice(0, 4))]);
    const report = expensesReport({ year: year || now.slice(0, 4), today: now, summaries, entries });
    return { report, notes: ['نفس أرقام المصروفات في قائمة الدخل.'], options: { years } };
  },
};

export const REPORT_KEYS = Object.keys(loaders);

export async function getReport(key, query) {
  const settings = await getSettings();
  return loaders[key](query, today(env.APP_TIMEZONE), settings);
}
