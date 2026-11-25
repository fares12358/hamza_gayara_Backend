/** Shared look of the exported workbooks, copied from the example Excel files. */
import ExcelJS from 'exceljs';

export const COLOR = {
  black: 'FF000000',
  white: 'FFFFFFFF',
  title: 'FF171616',
  yellow: 'FFFFFF00',
  blue: 'FF5B9BD5',
  blueDark: 'FF2E75B6',
  blueSoft: 'FF9DC3E6',
  blueBand: 'FFDDEBF7',
  gold: 'FFFFD966',
  goldSoft: 'FFFFF2CC',
  grey: 'FFC9C9C9',
  green: 'FFA9D08E',
  orange: 'FFF8CBAD',
  red: 'FFFF0000',
};

export const FORMAT = {
  accounting: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
  whole: '_-* #,##0_-;\\-* #,##0_-;_-* "-"??_-;_-@_-',
  date: 'dd/mm/yyyy',
};

export const pounds = (piasters) => piasters / 100;

/** A real Excel date, so day and month can never be swapped. */
export const excelDate = (iso) => new Date(`${iso}T00:00:00Z`);

export const shortDate = (iso) => iso.split('-').reverse().join('/');

/** A formula saved with its result, so previews that do not calculate still show it. */
export const formula = (text, piasters) => ({ formula: text, result: pounds(piasters) });

const side = (style) => (style ? { style } : undefined);

/** style: { font, size, bold, color, fill, border, sides, format, align, wrap, rtlText } */
export function paint(cell, { font = 'Calibri', size = 11, bold = false, color = COLOR.black, fill, border = 'thin', sides, format, align = 'center', wrap = true, rtlText = true } = {}) {
  cell.font = { name: font, size, bold, color: { argb: color } };
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (border || sides) {
    const [left, right, top, bottom] = sides ?? [border, border, border, border];
    cell.border = { left: side(left), right: side(right), top: side(top), bottom: side(bottom) };
  }
  if (format) cell.numFmt = format;
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: wrap, ...(rtlText && { readingOrder: 'rtl' }) };
}

/** Writes a value and its style. */
export function put(sheet, address, value, style) {
  const cell = sheet.getCell(address);
  cell.value = value;
  paint(cell, style);
  return cell;
}

/** Merges a range and styles every cell in it, so the borders go all around. */
export function merge(sheet, range, value, style) {
  const [from, to] = range.split(':');
  sheet.mergeCells(range);
  const a = sheet.getCell(from);
  const b = sheet.getCell(to);
  for (let row = a.row; row <= b.row; row += 1) {
    for (let col = a.col; col <= b.col; col += 1) paint(sheet.getCell(row, col), style);
  }
  a.value = value;
}

export function newSheet(name, { rtl, widths = [], zoom = 100, rowHeight }) {
  const book = new ExcelJS.Workbook();
  book.created = new Date();
  book.calcProperties.fullCalcOnLoad = true;
  const sheet = book.addWorksheet(name, {
    views: [{ rightToLeft: rtl, zoomScale: zoom }],
    properties: rowHeight ? { defaultRowHeight: rowHeight } : {},
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  widths.forEach((width, i) => {
    if (width) sheet.getColumn(i + 1).width = width;
  });
  return { book, sheet };
}

export const MONTHS = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
export const monthName = (month) => MONTHS[Number(month.slice(5, 7)) - 1];
