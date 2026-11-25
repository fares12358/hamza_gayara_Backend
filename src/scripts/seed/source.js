/**
 * Reads the data embedded in the old HTML app and turns it into database documents.
 * Pure functions. Nothing is corrected: values are imported as they are,
 * and every doubt is listed for the user.
 */
import { createHash } from 'node:crypto';
import { normalizeName } from '../../modules/customers/arabic.js';
import { isRealDate } from '../../utils/date.js';

export function readHtmlData(html) {
  const match = html.match(/<script type="application\/json" id="seed">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('The data block <script id="seed"> was not found in the HTML file');
  const data = JSON.parse(match[1]);
  for (const key of ['treasury', 'customers', 'monthly', 'treasuryBase', 'treasuryAsof', 'ledgerAsof']) {
    if (data[key] === undefined) throw new Error(`The HTML data has no "${key}"`);
  }
  return data;
}

/** Pounds to whole piasters. Fails instead of rounding a real fraction away. */
export function toPiasters(value, where) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${where}: not a number (${value})`);
  const piasters = Math.round(value * 100);
  if (Math.abs(value * 100 - piasters) > 1e-4) throw new Error(`${where}: more than two decimals (${value})`);
  return piasters;
}

const text = (value) => String(value ?? '');

function checkDate(value, where) {
  if (!isRealDate(value)) throw new Error(`${where}: bad date "${value}"`);
  return value;
}

export function buildPlan(data) {
  const customers = data.customers.map((c, i) => {
    const where = `customer ${i + 1}`;
    const name = text(c.name).trim();
    if (!name) throw new Error(`${where}: empty name`);
    return {
      doc: {
        name,
        searchName: normalizeName(name),
        aliases: [],
        openingBalance: toPiasters(c.balance, `${where} balance`),
        openingDate: checkDate(c.asof, `${where} as-of date`),
        source: 'sheet',
      },
      rows: c.rows.map((r, seq) => {
        const at = `${where} row ${seq + 1}`;
        return {
          seq,
          date: checkDate(r[0], at),
          permitNo: text(r[1]),
          returnAmount: toPiasters(r[2], at),
          invoiceAmount: toPiasters(r[3], at),
          paymentAmount: toPiasters(r[4], at),
          balanceAfter: toPiasters(r[5], at),
          importKey: `ledger:${i}:${seq}`,
        };
      }),
    };
  });

  const seen = new Map();
  for (const { doc } of customers) {
    if (seen.has(doc.searchName)) {
      throw new Error(`Two customers have the same name after spelling is normalized: "${seen.get(doc.searchName)}" and "${doc.name}"`);
    }
    seen.set(doc.searchName, doc.name);
  }

  const cashRows = data.treasury.map((r, seq) => {
    const at = `cash row ${seq + 1}`;
    return {
      seq,
      date: checkDate(r[0], at),
      description: text(r[1]),
      income: toPiasters(r[2], at),
      expense: toPiasters(r[3], at),
      balanceAfter: toPiasters(r[4], at),
      importKey: `cash:${seq}`,
    };
  });

  const monthly = Object.entries(data.monthly).map(([month, m]) => {
    const money = (key) => toPiasters(m[key] ?? 0, `${month} ${key}`);
    return {
      month,
      cashSales: money('cash'),
      creditSales: money('credit'),
      returns: money('returns'),
      collections: money('collect'),
      transfers: money('transfer'),
      expenses: Object.entries(m.exp ?? {}).map(([category, amount]) => ({
        category,
        amount: toPiasters(amount, `${month} ${category}`),
      })),
    };
  });

  const settings = {
    key: 'main',
    cashOpening: toPiasters(data.treasuryBase, 'cash balance'),
    cashAsOf: checkDate(data.treasuryAsof, 'cash as-of date'),
    ledgerAsOf: checkDate(data.ledgerAsof, 'ledger as-of date'),
  };

  const plan = { customers, cashRows, monthly, settings };
  // Identifies exactly this data. A write must quote the value shown by the dry run.
  const fingerprint = createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0, 12);
  return { ...plan, fingerprint };
}

/** One pound: differences up to this are treated as rounding in the sheets. */
const TOLERANCE = 100;

function chainBreaks(rows, change) {
  const breaks = [];
  for (let i = 1; i < rows.length; i += 1) {
    const expected = rows[i - 1].balanceAfter + change(rows[i]);
    if (Math.abs(expected - rows[i].balanceAfter) > TOLERANCE) {
      breaks.push({ row: i + 1, date: rows[i].date, expected, found: rows[i].balanceAfter });
    }
  }
  return breaks;
}

const orderBreaks = (rows) =>
  rows.flatMap((r, i) => (i && r.date < rows[i - 1].date ? [{ row: i + 1, date: r.date, previous: rows[i - 1].date }] : []));

/** Problems found inside the source data. They do not stop the import. */
export function inspectPlan(plan) {
  const { customers, cashRows, settings } = plan;
  const perCustomer = (find) =>
    customers.flatMap((c) => find(c).map((item) => ({ customer: c.doc.name, ...item })));

  return {
    ledgerChain: perCustomer((c) => chainBreaks(c.rows, (r) => r.invoiceAmount - r.returnAmount - r.paymentAmount)),
    ledgerOrder: perCustomer((c) => orderBreaks(c.rows)),
    ledgerLastRow: customers
      .filter((c) => c.rows.length && Math.abs(c.rows.at(-1).balanceAfter - c.doc.openingBalance) > TOLERANCE)
      .map((c) => ({ customer: c.doc.name, lastRow: c.rows.at(-1).balanceAfter, stored: c.doc.openingBalance })),
    withoutRows: customers.filter((c) => !c.rows.length).map((c) => c.doc.name),
    ledgerAfterCutoff: perCustomer((c) =>
      c.rows.filter((r) => r.date > settings.ledgerAsOf).map((r) => ({ row: r.seq + 1, date: r.date })),
    ),
    cashChain: chainBreaks(cashRows, (r) => r.income - r.expense),
    cashOrder: orderBreaks(cashRows),
    cashAfterCutoff: cashRows.filter((r) => r.date > settings.cashAsOf).map((r) => ({ row: r.seq + 1, date: r.date })),
    cashLastMatches:
      cashRows.length > 0 && Math.abs(cashRows.at(-1).balanceAfter - settings.cashOpening) <= TOLERANCE,
  };
}
