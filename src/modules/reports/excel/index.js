import { cashboxWorkbook } from './cashbox.js';
import { salesWorkbook } from './sales.js';
import { debtsWorkbook } from './debts.js';
import { agingWorkbook } from './aging.js';
import { lateWorkbook } from './late.js';
import { expensesWorkbook } from './expenses.js';

const writers = {
  cashbox: cashboxWorkbook,
  sales: salesWorkbook,
  debts: debtsWorkbook,
  aging: agingWorkbook,
  late: lateWorkbook,
  expenses: expensesWorkbook,
};

/** The file is built from the same data the screen shows. */
export async function toExcel(key, report) {
  return Buffer.from(await writers[key](report).xlsx.writeBuffer());
}
