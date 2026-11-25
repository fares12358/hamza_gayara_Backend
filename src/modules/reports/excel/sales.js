/** Like "مبيعات فرع الجياره": one block per day, day totals, month total. */
import { COLOR, FORMAT, excelDate, formula, merge, monthName, newSheet, pounds, put } from './style.js';

export function salesWorkbook(r) {
  const { book, sheet } = newSheet('Sheet1', { rtl: true, widths: [9.1, 18.6, 24.9, 22.3, 24.1], rowHeight: 23.25 });
  const base = { size: 18, border: 'medium' };
  const money = { ...base, border: 'thin', format: FORMAT.accounting };

  merge(sheet, 'B2:E2', `شهر ${monthName(r.month)} ${r.month.slice(0, 4)}`, { ...base, fill: COLOR.yellow });
  [['B', 'اليوم'], ['C', 'اسم العميل'], ['D', 'القيمه'], ['E', 'الاجمالي']].forEach(([col, label]) => put(sheet, `${col}3`, label, base));

  let n = 4;
  const dayTotals = [];
  for (const day of r.days) {
    const first = n;
    for (const line of day.lines) {
      put(sheet, `B${n}`, excelDate(day.date), { ...money, format: FORMAT.date, sides: ['medium', 'thin', 'thin', 'thin'], rtlText: false });
      put(sheet, `C${n}`, line.name, { ...base, border: 'thin' });
      put(sheet, `D${n}`, pounds(line.amount), money);
      put(sheet, `E${n}`, null, { ...money, sides: ['thin', 'medium', 'thin', 'thin'] });
      n += 1;
    }
    merge(sheet, `B${n}:C${n}`, 'الاجمالي', { ...base, fill: COLOR.yellow });
    put(sheet, `D${n}`, null, base);
    put(sheet, `E${n}`, formula(`SUM(D${first}:D${n - 1})`, day.total), { ...money, border: 'medium', fill: COLOR.yellow });
    dayTotals.push(`E${n}`);
    n += 2; // a blank line between days, as in the example
  }

  merge(sheet, `B${n}:D${n + 1}`, `اجمالي مبيعات شهر ${monthName(r.month)}`, { ...base, size: 20, bold: true, fill: COLOR.yellow });
  merge(sheet, `E${n}:E${n + 1}`, dayTotals.length ? formula(dayTotals.join('+'), r.total) : 0, { ...money, border: 'medium', size: 20, bold: true, fill: COLOR.yellow });
  return book;
}
