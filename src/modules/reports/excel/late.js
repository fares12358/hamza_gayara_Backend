/** Like "فواتير المديونيه المتاخره": a coloured block for every late customer. */
import { excelDate, newBook, pounds } from './style.js';

export function lateWorkbook(r) {
  const { book, put, merge, height } = newBook('late');

  let n = 1;
  r.blocks.forEach((block, blockIndex) => {
    const nameKind = blockIndex === 0 ? 'firstName' : 'name';
    height(n, 23.25);
    merge(`A${n}:D${n}`, block.name, (row, col, letter) => `${nameKind}${letter}`);
    n += 1;
    height(n, 24);
    ['التاريخ', 'اجمالي الفاتوره', 'المديونيه التاخره ', 'اجمالي مديونيه العميل'].forEach((label, i) =>
      put(`${'ABCD'[i]}${n}`, label, `head${'ABCD'[i]}`),
    );
    n += 1;

    const first = n;
    const several = block.lines.length > 1;
    const kind = several ? 'multi' : 'single';
    for (const line of block.lines) {
      height(n, several ? 27.95 : 23.25);
      put(`A${n}`, line.date ? excelDate(line.date) : 'رصيد اقدم', `${kind}A`);
      put(`B${n}`, pounds(line.invoice ?? line.late), `${kind}B`);
      if (!several) {
        put(`C${n}`, pounds(block.late), 'singleC');
        put(`D${n}`, pounds(block.total), 'singleD');
      }
      n += 1;
    }
    if (several) {
      // The two totals cover all the rows of the block.
      merge(`C${first}:C${n - 1}`, pounds(block.late), 'multiC');
      merge(`D${first}:D${n - 1}`, pounds(block.total), 'multiD');
    }
  });
  if (!r.blocks.length) merge('A1:D1', 'مفيش فواتير متاخره', (row, col, letter) => `firstName${letter}`);
  return book;
}
