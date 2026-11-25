/**
 * Like "مديونيه": an orange frame around the table, due / not due, and the debt split by
 * month under large year headers. The example has no title text.
 */
import { formula, newBook, pounds } from './style.js';

export function agingWorkbook(r) {
  const months = [...r.months, ...(r.hasOlder ? ['older'] : [])];
  const year = r.asOf.slice(0, 4);
  const current = months.filter((m) => m.startsWith(year));
  const previous = months.filter((m) => !current.includes(m));

  // Columns: frame (A, B), name, total, not due, due, months..., frame. Widths of the example.
  const monthWidth = (m, i) => {
    if (m.startsWith(year)) return i < 5 ? 25.86 : 18.57;
    return m === 'older' ? 22.43 : 20.43;
  };
  const widths = [1, 4.140625, 47.140625, 27.5703125, 32.5703125, 25.85546875, ...months.map(monthWidth), 3.5703125];
  const { book, sheet, template, put, merge, height } = newBook('aging', { widths });
  const { heights } = template;

  const letter = (index) => sheet.getColumn(index).letter;
  const FIRST = 7; // column G
  const lastIndex = FIRST + months.length - 1;
  const last = letter(lastIndex);
  const frame = letter(lastIndex + 1);
  const totalRow = r.rows.length + 6;

  [1, 2, 3, 4].forEach((n) => height(n, heights[n]));

  // The orange frame.
  for (let i = 2; i <= lastIndex + 1; i += 1) {
    put(`${letter(i)}2`, null, 'frame');
    put(`${letter(i)}${totalRow + 1}`, null, 'frame');
  }
  for (let n = 3; n <= totalRow; n += 1) {
    put(`B${n}`, null, 'frame');
    put(`${frame}${n}`, null, 'frame');
  }
  height(totalRow + 1, heights[18]);

  // Headers.
  put('C3', null, 'blank1');
  put('D3', null, 'blank2');
  put('C4', null, 'blank3');
  put('D4', null, 'blank4');
  merge('E3:E5', 'غير مستحق الدفع', (row) => `notDue${row}`);
  merge('F3:F5', 'مستحق الدفع', (row) => `due${row}`);
  merge(`G3:${last}3`, 'تاريخ اعمار المديونيه المتاخره ', (row, col) => {
    if (col === FIRST) return 'spanFirst';
    return col === lastIndex ? 'spanLast' : 'spanMiddle';
  });

  const yearHeader = (list, start, label, roleAt) => {
    if (!list.length) return;
    const range = `${letter(start)}4:${letter(start + list.length - 1)}4`;
    if (list.length === 1) put(`${letter(start)}4`, label, roleAt(0, 1));
    else merge(range, label, (row, col) => roleAt(col - start, list.length));
  };
  yearHeader(current, FIRST, Number(year), (i, count) => {
    if (i === 0) return 'yearFirst';
    return i === count - 1 ? 'yearLast' : 'yearMiddle';
  });
  yearHeader(previous, FIRST + current.length, Number(year) - 1, (i) => (i === 0 ? 'oldFirst' : 'oldLast'));

  put('C5', 'اسم العميل', 'headName');
  put('D5', 'اجمالي المديونيه ', 'headTotal');
  // Like the example: wide month columns are written on the left, narrow ones in the middle.
  const isWide = (i) => i < 5;
  months.forEach((m, i) => {
    let role = isWide(i) ? 'monthLeft' : 'monthCenter';
    if (m === current.at(-1) && !isWide(i)) role = 'monthLast';
    if (!m.startsWith(year)) role = i === months.length - 1 ? 'oldMonthLast' : 'oldMonth';
    // Month numbers are plain numbers, whatever format the copied style has.
    put(`${letter(FIRST + i)}5`, m === 'older' ? 'اقدم' : Number(m.slice(5)), role, { numFmt: 'General' });
  });
  height(5, 27);

  const cellRole = (m, i) => {
    if (!m.startsWith(year)) return 'cellOld';
    return isWide(i) ? 'cellLeft' : 'cellCenter';
  };
  r.rows.forEach((row, index) => {
    const n = index + 6;
    height(n, 27);
    put(`C${n}`, row.name, 'name');
    put(`D${n}`, formula(`SUM(G${n}:${last}${n})`, row.total), 'total');
    put(`E${n}`, row.due === null ? null : formula(`D${n}-F${n}`, row.notDue), 'notDue');
    put(`F${n}`, row.due === null ? null : pounds(row.due), 'due');
    months.forEach((m, i) => {
      const value = m === 'older' ? row.older : row.months[m] ?? 0;
      put(`${letter(FIRST + i)}${n}`, value ? pounds(value) : null, cellRole(m, i));
    });
  });

  const lastData = totalRow - 1;
  const column = (col, piasters) => (r.rows.length ? formula(`SUM(${col}6:${col}${lastData})`, piasters) : 0);
  height(totalRow, heights[17]);
  put(`C${totalRow}`, 'الاجمالي ', 'footName');
  put(`D${totalRow}`, column('D', r.totals.total), 'footNumber');
  put(`E${totalRow}`, column('E', r.totals.notDue), 'footNumber');
  put(`F${totalRow}`, column('F', r.totals.due), 'footNumber');
  months.forEach((m, i) => {
    const col = letter(FIRST + i);
    put(`${col}${totalRow}`, column(col, m === 'older' ? r.totals.older : r.totals.months[m]), m.startsWith(year) ? 'footMonth' : 'footOld');
  });
  return book;
}
