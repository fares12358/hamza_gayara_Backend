/** Like "مصاريف الجياره": categories by month with a Grand Total row. */
import { formula, monthName, newBook, pounds } from './style.js';

export function expensesWorkbook(r) {
  const { book, sheet, template, put, height } = newBook('expenses');
  const letter = (index) => sheet.getColumn(index).letter;
  height(1, template.heights[1]);

  height(2, 24);
  put('B2', 'Row Labels', 'headLabel');
  r.months.forEach((m, i) => put(`${letter(i + 3)}2`, monthName(m), 'headMonth'));

  r.rows.forEach((row, index) => {
    const n = index + 3;
    height(n, 24);
    put(`B${n}`, row.category, 'label');
    r.months.forEach((m, i) => put(`${letter(i + 3)}${n}`, row.values[m] ? pounds(row.values[m]) : null, 'value'));
  });

  const total = r.rows.length + 3;
  height(total, 24);
  put(`B${total}`, 'Grand Total ', 'footLabel');
  r.months.forEach((m, i) => {
    const col = letter(i + 3);
    const value = r.rows.length ? formula(`SUM(${col}3:${col}${total - 1})`, r.monthTotals[m]) : 0;
    put(`${col}${total}`, value, 'footValue');
  });
  return book;
}
