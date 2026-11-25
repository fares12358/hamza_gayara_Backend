/**
 * Old spreadsheet data. It is written once by the import script (not built yet)
 * and is READ ONLY for the application. Balances are kept exactly as in the sheets.
 */
import mongoose from 'mongoose';
import { moneyField } from '../../utils/schema.js';

// One row of a customer's sheet.
const ledgerRowSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  seq: { type: Number, required: true },
  date: { type: String, required: true },
  permitNo: { type: String, default: '' },
  returnAmount: moneyField(),
  invoiceAmount: moneyField(),
  paymentAmount: moneyField(),
  balanceAfter: moneyField(),
  importKey: { type: String, required: true, unique: true },
});
ledgerRowSchema.index({ customer: 1, seq: 1 });

// One row of the cash box sheet.
const cashRowSchema = new mongoose.Schema({
  seq: { type: Number, required: true, index: true },
  date: { type: String, required: true },
  description: { type: String, default: '' },
  income: moneyField(),
  expense: moneyField(),
  balanceAfter: moneyField(),
  importKey: { type: String, required: true, unique: true },
});

// Sheet totals of one month, used by the income statement.
const monthlySummarySchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true },
  cashSales: moneyField(),
  creditSales: moneyField(),
  returns: moneyField(),
  collections: moneyField(),
  transfers: moneyField(),
  expenses: [{ _id: false, category: { type: String, required: true }, amount: moneyField() }],
});

export const LedgerRow = mongoose.model('LedgerRow', ledgerRowSchema);
export const CashRow = mongoose.model('CashRow', cashRowSchema);
export const MonthlySummary = mongoose.model('MonthlySummary', monthlySummarySchema);
