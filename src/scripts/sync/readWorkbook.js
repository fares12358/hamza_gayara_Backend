/**
 * Reads the customer accounts workbook ("العملاء"): one sheet per customer and a
 * summary sheet. Read only. Nothing is corrected: unclear rows stop the process.
 */
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { toPiasters } from '../seed/source.js';
import { normalizeName } from '../../modules/customers/arabic.js';
import { isRealDate } from '../../utils/date.js';

const SUMMARY_SHEET = 'مديونيات العملاء';
const FIRST_ROW = 4;

/** The shown value of a cell: formula results, rich text and errors included. */
function valueOf(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) v = v.result ?? v.richText?.map((t) => t.text).join('') ?? v.error ?? null;
  return v ?? null;
}

const blank = (v) => v === null || String(v).trim() === '' || String(v).trim() === '-';

function money(v, where) {
  return blank(v) ? 0 : toPiasters(v, where);
}

function dateOf(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v ?? '').trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function readSheet(sheet) {
  const header = (address) => String(valueOf(sheet.getCell(address)) ?? '').trim();
  if (header('B3') !== 'التاريخ' || header('G3') !== 'إجمالي المتبقي') {
    throw new Error(`Sheet "${sheet.name}" does not have the expected columns`);
  }
  const rows = [];
  sheet.eachRow((row, n) => {
    if (n < FIRST_ROW) return;
    const [date, permit, ret, inv, pay, bal] = [2, 3, 4, 5, 6, 7].map((c) => valueOf(row.getCell(c)));
    // Prepared empty lines at the end of a sheet.
    if (date === null && [ret, inv, pay].every((v) => blank(v) || v === 0)) return;
    const at = `sheet "${sheet.name.trim()}" row ${n}`;
    const day = dateOf(date);
    if (!isRealDate(day)) throw new Error(`${at}: unreadable date "${date}"`);
    const returnAmount = money(ret, at);
    const invoiceAmount = money(inv, at);
    const paymentAmount = money(pay, at);
    let balanceAfter;
    if (bal === null && row.getCell(7).value?.formula) {
      // ExcelJS leaves out a saved formula result of 0. Accept it only if the row really adds up to 0.
      const expected = (rows.at(-1)?.balanceAfter ?? 0) + invoiceAmount - returnAmount - paymentAmount;
      if (Math.abs(expected) > 100) throw new Error(`${at}: the balance has no saved value. Open the file in Excel and save it.`);
      balanceAfter = 0;
    } else {
      if (blank(bal)) throw new Error(`${at}: no balance`);
      balanceAfter = money(bal, at);
    }
    rows.push({
      excelRow: n,
      date: day,
      permitNo: blank(permit) ? '' : String(permit).trim(),
      returnAmount,
      invoiceAmount,
      paymentAmount,
      balanceAfter,
    });
  });
  return rows;
}

/** { customers: [{ name, rows }], listedOnly: [{ name, balance }], warnings, fingerprint } */
export async function readCustomerWorkbook(file) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  const summary = book.worksheets.find((s) => s.name.trim() === SUMMARY_SHEET);
  if (!summary) throw new Error(`The workbook has no "${SUMMARY_SHEET}" sheet`);

  const used = new Set();
  const customers = [];
  const listed = [];
  summary.eachRow((row, n) => {
    if (n < FIRST_ROW) return;
    // Main list: name in B, balance in E as a formula that points to the customer's sheet.
    const formula = row.getCell(5).value?.formula ?? '';
    const target = formula.match(/^'?([^'!]+?)'?!/)?.[1];
    const name = String(valueOf(row.getCell(2)) ?? '').trim();
    if (name && target) {
      // The formula decides which sheet is current (some names have an older copy).
      const sheet = book.worksheets.find((s) => s.name === target);
      if (!sheet) throw new Error(`The summary points to a missing sheet "${target}"`);
      used.add(sheet.id);
      customers.push({ name, sheet, summaryBalance: money(valueOf(row.getCell(5)), `summary row ${n}`) });
    }
    // Second list: name in K, balance in N.
    const other = String(valueOf(row.getCell(11)) ?? '').trim();
    if (other) listed.push({ name: other, balance: money(valueOf(row.getCell(14)), `summary row ${n}`) });
  });

  const warnings = [];
  const listedOnly = [];
  for (const item of listed) {
    const sheets = book.worksheets.filter((s) => !used.has(s.id) && normalizeName(s.name) === normalizeName(item.name));
    if (sheets.length === 1) {
      used.add(sheets[0].id);
      customers.push({ name: item.name, sheet: sheets[0], summaryBalance: item.balance });
    } else listedOnly.push(item);
  }

  const result = customers.map(({ name, sheet, summaryBalance }) => {
    const rows = readSheet(sheet);
    const last = rows.at(-1)?.balanceAfter ?? 0;
    if (summaryBalance !== last) {
      warnings.push(`${name}: the summary sheet shows ${summaryBalance / 100}, the customer's sheet ends with ${last / 100}. The sheet is used.`);
    }
    return { name, rows };
  });
  for (const sheet of book.worksheets) {
    if (sheet.id !== summary.id && !used.has(sheet.id)) warnings.push(`Sheet "${sheet.name}" is not used (a copy or a working sheet).`);
  }

  const fingerprint = createHash('sha256').update(JSON.stringify([result, listedOnly])).digest('hex').slice(0, 12);
  return { customers: result, listedOnly, warnings, fingerprint };
}
