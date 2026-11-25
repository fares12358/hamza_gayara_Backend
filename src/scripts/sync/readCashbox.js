/** Reads the cash box workbook ("حركه خزنه"). Read only: unclear rows stop the process. */
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { toPiasters } from '../seed/source.js';
import { isRealDate } from '../../utils/date.js';

// Older sheet first. "offset": Sheet2 starts one column later.
const SHEETS = [
  { name: 'Sheet2', offset: 1 },
  { name: 'Sheet1', offset: 0 },
];
const FIRST_ROW = 6; // row 5 is the carried balance

function valueOf(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    // ExcelJS leaves out a saved formula result of 0.
    v = v.result ?? v.richText?.map((t) => t.text).join('') ?? (v.formula || v.sharedFormula ? 0 : null);
  }
  return v ?? null;
}

/**
 * In this workbook, real date cells hold day and month SWAPPED (typed as day/month on a
 * month/day computer). Later days could not be swapped and were saved as text d/m/y.
 * The update checks every old row against the system, so a wrong rule cannot pass.
 */
export function cashDate(value) {
  if (value instanceof Date) {
    const [year, month, day] = value.toISOString().slice(0, 10).split('-');
    return `${year}-${day}-${month}`;
  }
  const m = String(value ?? '').trim().match(/^(\d{1,2})[/\\](\d{1,2})[/\\](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

export async function readCashWorkbook(file) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  const rows = [];
  for (const { name, offset } of SHEETS) {
    const sheet = book.getWorksheet(name);
    if (!sheet) throw new Error(`The cash box workbook has no "${name}"`);
    sheet.eachRow((row, n) => {
      if (n < FIRST_ROW) return;
      const [date, text, income, expense, balance] = [1, 2, 3, 4, 5].map((c) => valueOf(row.getCell(c + offset)));
      const description = String(text ?? '').trim();
      if (!description && !income && !expense) return; // empty line
      const at = `${name} row ${n}`;
      const day = cashDate(date);
      rows.push({
        at,
        // A mistyped or missing date is only accepted for rows that are already imported.
        date: isRealDate(day) ? day : '',
        description,
        income: toPiasters(income || 0, at),
        expense: toPiasters(expense || 0, at),
        balanceAfter: toPiasters(balance ?? 0, at),
      });
    });
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 12);
  return { rows, fingerprint };
}
