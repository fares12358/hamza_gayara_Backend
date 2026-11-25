/** Like "مديونيات عملاء فرع الجياره": an Excel table (TableStyleMedium2) with yellow balances. */
import { formula, newBook, pounds, shortDate } from './style.js';

export function debtsWorkbook(r) {
  const { book, sheet, put } = newBook('debts');
  const headers = [
    'اسم العميل',
    `مديونيه يوم ${shortDate(r.previousDate)}`,
    'البضاعه المستلمه',
    'دفعات العميل',
    `مديونيه يوم ${shortDate(r.date)}`,
  ];
  // An Excel table needs at least one row.
  const rows = r.rows.length ? r.rows : [{ name: '', previous: 0, goods: 0, payments: 0, closing: 0 }];

  sheet.addTable({
    name: 'Table1',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showFirstColumn: false, showLastColumn: false, showRowStripes: true, showColumnStripes: false },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows: rows.map((row, i) => [
      row.name,
      pounds(row.previous),
      row.goods ? pounds(row.goods) : null,
      row.payments ? pounds(row.payments) : null,
      formula(`B${i + 2}+C${i + 2}-D${i + 2}`, row.closing),
    ]),
  });

  // The cell styles of the example, on top of the table style.
  'ABCDE'.split('').forEach((letter) => put(`${letter}1`, undefined, `head${letter}`));
  rows.forEach((row, i) => {
    const kind = i === rows.length - 1 ? 'last' : 'data';
    'ABCDE'.split('').forEach((letter) => put(`${letter}${i + 2}`, undefined, `${kind}${letter}`));
  });
  return book;
}
