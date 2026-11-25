/** Like "مديونيات عملاء فرع الجياره": banded table, yellow balances, closing = previous + goods - payments. */
import { COLOR, FORMAT, formula, newSheet, pounds, put, shortDate } from './style.js';

export function debtsWorkbook(r) {
  const { book, sheet } = newSheet('Sheet1', { rtl: true, widths: [20, 23.1, 16.4, 14.6, 22.1], zoom: 145 });
  const header = { size: 10, color: COLOR.white, fill: COLOR.blue };
  [
    'اسم العميل',
    `مديونيه يوم ${shortDate(r.previousDate)}`,
    'البضاعه المستلمه',
    'دفعات العميل',
    `مديونيه يوم ${shortDate(r.date)}`,
  ].forEach((label, i) => put(sheet, `${'ABCDE'[i]}1`, label, header));

  r.rows.forEach((row, i) => {
    const n = i + 2;
    const cell = { size: 10, bold: true, fill: i % 2 === 0 ? COLOR.blueBand : undefined };
    const money = { ...cell, format: FORMAT.accounting };
    put(sheet, `A${n}`, row.name, cell);
    put(sheet, `B${n}`, pounds(row.previous), { ...money, fill: COLOR.yellow });
    put(sheet, `C${n}`, row.goods ? pounds(row.goods) : null, money);
    put(sheet, `D${n}`, row.payments ? pounds(row.payments) : null, money);
    put(sheet, `E${n}`, formula(`B${n}+C${n}-D${n}`, row.closing), { ...money, fill: COLOR.yellow });
  });
  if (r.rows.length) sheet.autoFilter = `A1:E${r.rows.length + 1}`;
  return book;
}
