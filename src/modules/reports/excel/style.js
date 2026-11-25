/** Builds workbooks that use the exact look of the example Excel files (templates.js). */
import ExcelJS from 'exceljs';
import { TEMPLATES, THEMES } from './templates.js';

export const pounds = (piasters) => piasters / 100;

/** A real Excel date, so day and month can never be swapped. */
export const excelDate = (iso) => new Date(`${iso}T00:00:00Z`);

export const shortDate = (iso) => iso.split('-').reverse().join('/');

/** A formula saved with its result, so previews that do not calculate still show it. */
export const formula = (text, piasters) => ({ formula: text, result: pounds(piasters) });

export const MONTHS = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
export const monthName = (month) => MONTHS[Number(month.slice(5, 7)) - 1];

/**
 * A new workbook with the example's color theme, view and page settings.
 * Returns helpers that style cells by the role they have in the example.
 */
export function newBook(key, { widths, sheetName = 'Sheet1' } = {}) {
  const template = TEMPLATES[key];
  const book = new ExcelJS.Workbook();
  book.created = new Date();
  book.calcProperties.fullCalcOnLoad = true;
  // The examples use Office theme colors: without their theme the colors would differ.
  book._themes = { theme1: THEMES[template.theme] };

  const sheet = book.addWorksheet(sheetName, {
    views: [template.view],
    pageSetup: { ...template.pageSetup },
    properties: { defaultRowHeight: template.defaultRowHeight },
  });
  (widths ?? template.widths).forEach((width, i) => {
    if (width) sheet.getColumn(i + 1).width = width;
  });

  /** Writes a value with the style of "role". "extra" changes only what must differ. */
  const put = (address, value, role, extra) => {
    const cell = typeof address === 'string' ? sheet.getCell(address) : sheet.getCell(address.row, address.col);
    const style = template.styles[role];
    if (!style) throw new Error(`Unknown style role "${role}" in ${key}`);
    cell.style = { ...structuredClone(style), ...extra };
    if (value !== undefined) cell.value = value;
    return cell;
  };

  /**
   * Merges a range, then styles every cell of it. "roleAt(row, col)" gives each cell
   * its own role, so the outer borders are the same as in the example.
   */
  const merge = (range, value, roleAt) => {
    const [from, to] = range.split(':').map((a) => sheet.getCell(a));
    const bounds = { top: Number(from.row), left: Number(from.col), bottom: Number(to.row), right: Number(to.col) };
    sheet.mergeCells(range);
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        put({ row, col }, undefined, typeof roleAt === 'function' ? roleAt(row, col, sheet.getColumn(col).letter) : roleAt);
      }
    }
    sheet.getCell(bounds.top, bounds.left).value = value;
  };

  const height = (row, points) => {
    if (points) sheet.getRow(row).height = points;
  };

  return { book, sheet, template, put, merge, height };
}
