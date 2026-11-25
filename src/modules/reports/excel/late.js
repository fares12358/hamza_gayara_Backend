/** Like "فواتير المديونيه المتاخره": a coloured block for every late customer. */
import { COLOR, FORMAT, excelDate, merge, newSheet, pounds, put } from './style.js';

export function lateWorkbook(r) {
  const { book, sheet } = newSheet('Sheet1', { rtl: true, widths: [17.9, 21.7, 21.7, 27] });
  const base = { size: 18 };
  const money = { ...base, format: FORMAT.accounting };

  let n = 1;
  for (const block of r.blocks) {
    merge(sheet, `A${n}:D${n}`, block.name, { ...base, fill: COLOR.blueSoft });
    n += 1;
    ['التاريخ', 'اجمالي الفاتوره', 'المديونيه التاخره', 'اجمالي مديونيه العميل'].forEach((label, i) =>
      put(sheet, `${'ABCD'[i]}${n}`, label, { ...base, fill: COLOR.gold }),
    );
    sheet.getRow(n).height = 28;
    n += 1;

    const first = n;
    for (const line of block.lines) {
      put(sheet, `A${n}`, line.date ? excelDate(line.date) : 'رصيد اقدم', { ...base, format: FORMAT.date, rtlText: !line.date });
      put(sheet, `B${n}`, pounds(line.invoice ?? line.late), money);
      sheet.getRow(n).height = 28;
      n += 1;
    }
    // The two totals cover all the rows of the block.
    for (const [col, value, fill] of [['C', block.late, COLOR.grey], ['D', block.total, COLOR.green]]) {
      const style = { ...money, fill };
      if (n - first > 1) merge(sheet, `${col}${first}:${col}${n - 1}`, pounds(value), style);
      else put(sheet, `${col}${first}`, pounds(value), style);
    }
  }
  if (!r.blocks.length) merge(sheet, 'A1:D1', 'مفيش فواتير متاخره', { ...base, fill: COLOR.blueSoft });
  return book;
}
