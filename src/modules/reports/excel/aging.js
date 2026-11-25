/** Like "مديونيه": due / not due and the debt split by month, with the large coloured headers. */
import { COLOR, FORMAT, formula, merge, newSheet, pounds, put } from './style.js';

export function agingWorkbook(r) {
  const months = [...r.months, ...(r.hasOlder ? ['older'] : [])];
  // A narrow frame, row names in C, totals in D..F, one column per month from G.
  const { book, sheet } = newSheet('Sheet1', {
    rtl: false,
    zoom: 66,
    widths: [1, 4.1, 47.1, 27.6, 32.6, 25.9, ...months.map(() => 25.9)],
  });
  const col = (index) => sheet.getColumn(index).letter;
  const firstMonth = 7;
  const lastCol = col(firstMonth + months.length - 1);
  const year = r.asOf.slice(0, 4);
  const big = { size: 20, bold: true, border: 'medium', format: FORMAT.whole, rtlText: false };
  const isThisYear = (m) => m.startsWith(year);
  const monthFill = (m) => (isThisYear(m) ? COLOR.orange : COLOR.goldSoft);

  sheet.getRow(2).height = 22.5;
  merge(sheet, `C2:${lastCol}2`, `اعمار مديونيه عملاء الجياره حتى ${r.asOf.split('-').reverse().join('/')}`, { ...big, size: 16 });
  merge(sheet, 'E3:E5', 'غير مستحق الدفع', { ...big, size: 26, fill: COLOR.grey });
  merge(sheet, 'F3:F5', 'مستحق الدفع', { ...big, size: 26, fill: COLOR.grey });
  merge(sheet, `G3:${lastCol}3`, 'تاريخ اعمار المديونيه المتاخره', { ...big, size: 24, color: COLOR.red, fill: COLOR.goldSoft });

  // Row 4: the year above its months.
  let index = firstMonth;
  const groups = [
    [year, months.filter(isThisYear), COLOR.orange],
    [String(Number(year) - 1), months.filter((m) => !isThisYear(m) && m !== 'older'), COLOR.goldSoft],
    ['اقدم', months.filter((m) => m === 'older'), COLOR.goldSoft],
  ];
  for (const [label, list, fill] of groups) {
    if (!list.length) continue;
    const style = { ...big, size: 36, color: COLOR.red, fill };
    const range = `${col(index)}4:${col(index + list.length - 1)}4`;
    if (list.length > 1) merge(sheet, range, Number(label) || label, style);
    else put(sheet, `${col(index)}4`, Number(label) || label, style);
    sheet.getRow(4).height = 48;
    index += list.length;
  }

  put(sheet, 'C5', 'اسم العميل', { ...big, fill: COLOR.blueDark });
  put(sheet, 'D5', 'اجمالي المديونيه', { ...big, fill: COLOR.blueDark });
  months.forEach((m, i) => put(sheet, `${col(firstMonth + i)}5`, m === 'older' ? '-' : Number(m.slice(5)), { ...big, fill: monthFill(m) }));

  r.rows.forEach((row, i) => {
    const n = i + 6;
    const value = (m) => (m === 'older' ? row.older : row.months[m] ?? 0);
    put(sheet, `C${n}`, row.name, { ...big, rtlText: true });
    put(sheet, `D${n}`, formula(`SUM(G${n}:${lastCol}${n})`, row.total), big);
    put(sheet, `E${n}`, row.due === null ? null : formula(`D${n}-F${n}`, row.notDue), { ...big, fill: COLOR.green });
    put(sheet, `F${n}`, row.due === null ? null : pounds(row.due), { ...big, fill: COLOR.green });
    months.forEach((m, k) => put(sheet, `${col(firstMonth + k)}${n}`, value(m) ? pounds(value(m)) : null, { ...big, fill: monthFill(m) }));
  });

  const total = r.rows.length + 6;
  const last = total - 1;
  const totalStyle = { ...big, size: 28, color: COLOR.white, fill: COLOR.blueDark };
  const column = (letter, piasters) => (r.rows.length ? formula(`SUM(${letter}6:${letter}${last})`, piasters) : 0);
  sheet.getRow(total).height = 38;
  put(sheet, `C${total}`, 'الاجمالي', totalStyle);
  put(sheet, `D${total}`, column('D', r.totals.total), totalStyle);
  put(sheet, `E${total}`, column('E', r.totals.notDue), totalStyle);
  put(sheet, `F${total}`, column('F', r.totals.due), totalStyle);
  months.forEach((m, k) => {
    const letter = col(firstMonth + k);
    put(sheet, `${letter}${total}`, column(letter, m === 'older' ? r.totals.older : r.totals.months[m]), totalStyle);
  });
  return book;
}
