/** Like "حركه خزنه الجياره": title, double header, carried balance, running balance formulas. */
import { COLOR, FORMAT, excelDate, formula, merge, monthName, newSheet, pounds, put, shortDate } from './style.js';

export function cashboxWorkbook(r) {
  const { book, sheet } = newSheet('Sheet1', { rtl: true, widths: [14, 52.1, 19.1, 19.1, 19.1] });
  const arial = { font: 'Arial', bold: true, border: 'medium' };
  const money = { ...arial, format: FORMAT.accounting };

  merge(sheet, 'A2:E2', `حركه خزنه الجياره ${r.to.slice(0, 4)}`, { ...arial, size: 24, color: COLOR.title });
  ['التاريخ', 'اسم العميل / البيان', 'ايراد', 'مصروف', 'الرصيد'].forEach((label, i) => {
    const col = 'ABCDE'[i];
    merge(sheet, `${col}3:${col}4`, label, { ...money, size: 14, color: i === 1 ? COLOR.title : COLOR.black });
  });

  const before = new Date(Date.parse(r.from) - 86_400_000).toISOString().slice(0, 10);
  const carried = r.from.endsWith('-01')
    ? `رصيد مرحل من نهاية ${monthName(before)} ${before.slice(0, 4)}`
    : `رصيد مرحل حتى ${shortDate(before)}`;
  merge(sheet, 'A5:D5', carried, { ...arial, size: 14, fill: COLOR.yellow });
  put(sheet, 'E5', pounds(r.opening), { ...money, size: 14, fill: COLOR.yellow });

  r.rows.forEach((row, i) => {
    const n = i + 6;
    put(sheet, `A${n}`, excelDate(row.date), { ...arial, format: FORMAT.date, rtlText: false });
    put(sheet, `B${n}`, row.description, { ...arial, color: COLOR.title });
    put(sheet, `C${n}`, row.income ? pounds(row.income) : null, money);
    put(sheet, `D${n}`, row.expense ? pounds(row.expense) : null, money);
    put(sheet, `E${n}`, formula(`E${n - 1}+C${n}-D${n}`, row.balance), money);
  });
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 5 }];
  sheet.pageSetup.printTitlesRow = '2:4';
  return book;
}
