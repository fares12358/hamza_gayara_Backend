/** Like "مبيعات فرع الجياره": one block per day, day totals, and the blue month total. */
import { excelDate, formula, monthName, newBook, pounds } from './style.js';

export function salesWorkbook(r) {
  const { book, put, merge, height } = newBook('sales');
  const ROW = 24;
  [1, 2, 3].forEach((n) => height(n, ROW));

  merge('B2:E2', `شهر ${monthName(r.month)}`, (row, col, letter) => `title${letter}`);
  [['B', 'اليوم '], ['C', 'اسم العميل'], ['D', 'القيمه'], ['E', 'الاجمالي']].forEach(([letter, label]) =>
    put(`${letter}3`, label, `head${letter}`),
  );

  let n = 4;
  const dayTotals = [];
  r.days.forEach((day, dayIndex) => {
    const first = n;
    day.lines.forEach((line, i) => {
      // The example uses its own borders on the first and last line of a day.
      let kind = 'middle';
      if (i === 0) kind = dayIndex === 0 ? 'first' : 'next';
      else if (i === day.lines.length - 1) kind = 'last';
      height(n, ROW);
      put(`B${n}`, excelDate(day.date), `${kind}B`);
      put(`C${n}`, line.name, `${kind}C`);
      put(`D${n}`, pounds(line.amount), `${kind}D`);
      put(`E${n}`, null, `${kind}E`);
      n += 1;
    });
    height(n, ROW);
    merge(`B${n}:C${n}`, 'الاجمالي ', (row, col, letter) => `total${letter}`);
    put(`D${n}`, null, 'totalD');
    put(`E${n}`, formula(`SUM(D${first}:D${n - 1})`, day.total), 'totalE');
    dayTotals.push(`E${n}`);
    n += 1;
    if (dayIndex < r.days.length - 1) {
      height(n, ROW);
      ['B', 'C', 'D', 'E'].forEach((letter) => put(`${letter}${n}`, null, `gap${letter}`));
      n += 1;
    }
  });

  height(n, ROW);
  height(n + 1, ROW);
  merge(`B${n}:D${n + 1}`, `اجمالي مبيعات شهر ${monthName(r.month)}`, (row, col, letter) => `${row === n ? 'monthTop' : 'monthBottom'}${letter}`);
  merge(`E${n}:E${n + 1}`, dayTotals.length ? formula(dayTotals.join('+'), r.total) : 0, (row) => (row === n ? 'monthTopE' : 'monthBottomE'));
  return book;
}
