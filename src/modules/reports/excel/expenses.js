/** Like "مصاريف الجياره": categories by month with a Grand Total row. */
import { COLOR, FORMAT, formula, monthName, newSheet, pounds, put } from './style.js';

export function expensesWorkbook(r) {
  const { book, sheet } = newSheet('Sheet1', { rtl: false, zoom: 75, widths: [9.1, 58.6, ...r.months.map(() => 18)] });
  const col = (index) => sheet.getColumn(index).letter;
  const head = { size: 18, bold: true, border: 'medium', fill: COLOR.blueBand };

  put(sheet, 'B2', 'Row Labels', { ...head, align: 'left', rtlText: false });
  r.months.forEach((m, i) => put(sheet, `${col(i + 3)}2`, monthName(m), { ...head, format: FORMAT.accounting }));

  r.rows.forEach((row, i) => {
    const n = i + 3;
    put(sheet, `B${n}`, row.category, { size: 18, bold: true, border: 'medium', align: 'left' });
    r.months.forEach((m, k) =>
      put(sheet, `${col(k + 3)}${n}`, row.values[m] ? pounds(row.values[m]) : null, { size: 18, border: 'medium', format: FORMAT.accounting }),
    );
  });

  const total = r.rows.length + 3;
  put(sheet, `B${total}`, 'Grand Total ', { ...head, align: 'left', rtlText: false });
  r.months.forEach((m, k) => {
    const letter = col(k + 3);
    const value = r.rows.length ? formula(`SUM(${letter}3:${letter}${total - 1})`, r.monthTotals[m]) : 0;
    put(sheet, `${letter}${total}`, value, { ...head, format: FORMAT.accounting });
  });
  return book;
}
