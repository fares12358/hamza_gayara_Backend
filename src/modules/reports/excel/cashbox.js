/** Like "حركه خزنه الجياره": title, double header, carried balance, running balance formulas. */
import { excelDate, formula, monthName, newBook, pounds, shortDate } from './style.js';

export function cashboxWorkbook(r) {
  const { book, template, put, merge, height } = newBook('cashbox');
  const { heights } = template;
  height(1, heights[1]);
  height(2, heights[2]);
  height(4, heights[4]);
  height(5, heights[5]);

  merge('A2:E2', `حركه خزنه الجياره ${r.to.slice(0, 4)}`, (row, col, letter) => `title${letter}`);
  ['التاريخ', 'اسم العميل / البيان', 'ايراد', 'مصروف', 'الرصيد '].forEach((label, i) => {
    const letter = 'ABCDE'[i];
    merge(`${letter}3:${letter}4`, label, (row) => `${row === 3 ? 'head1' : 'head2'}${letter}`);
  });

  const before = new Date(Date.parse(r.from) - 86_400_000).toISOString().slice(0, 10);
  const carried = r.from.endsWith('-01')
    ? `رصيد مرحل من نهاية ${monthName(before)}  ${before.slice(0, 4)}`
    : `رصيد مرحل حتى ${shortDate(before)}`;
  merge('A5:D5', carried, (row, col, letter) => `carried${letter}`);
  put('E5', pounds(r.opening), 'carriedE');

  r.rows.forEach((row, i) => {
    const n = i + 6;
    height(n, heights[6]);
    const newDay = i > 0 && r.rows[i - 1].date !== row.date;
    put(`A${n}`, excelDate(row.date), newDay ? 'nextDayA' : 'dataA');
    put(`B${n}`, row.description, 'dataB');
    put(`C${n}`, row.income ? pounds(row.income) : null, 'dataC');
    put(`D${n}`, row.expense ? pounds(row.expense) : null, 'dataD');
    // As in the example: the balance is yellow on every transfer row.
    put(`E${n}`, formula(`E${n - 1}+C${n}-D${n}`, row.balance), row.description.includes('تحويل') ? 'transferE' : 'dataE');
  });
  return book;
}
