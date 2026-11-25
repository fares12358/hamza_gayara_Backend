import mongoose from 'mongoose';
import { moneyField } from '../../utils/schema.js';

export const ENTRY_TYPES = ['invoice', 'payment', 'cheque', 'cash_sale', 'expense', 'transfer'];

export const EXPENSE_CATEGORIES = [
  'كهرباء', 'صيانة', 'مائدة', 'إكراميات', 'مرتبات وأجور', 'سلف',
  'انتقالات', 'أدوات ومكتبية', 'علاج', 'عهدة مصروفات', 'مصروفات أخرى',
];

const { ObjectId } = mongoose.Schema.Types;
const fixed = { immutable: true };

/**
 * Every record made in the app. Money fields cannot change after saving:
 * a wrong record is cancelled (voidedAt) and entered again.
 */
const entrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ENTRY_TYPES, required: true, ...fixed },
    date: { type: String, required: true, ...fixed },
    amount: moneyField({ min: 1, ...fixed }),
    returnAmount: moneyField({ min: 0, ...fixed }),
    // How this record changes the customer debt and the cash box.
    customerDelta: moneyField(fixed),
    cashDelta: moneyField(fixed),
    customer: { type: ObjectId, ref: 'Customer', default: null, ...fixed },
    customerName: { type: String, default: '', ...fixed },
    permitNo: { type: String, default: '', ...fixed },
    category: { type: String, default: '', ...fixed },
    note: { type: String, default: '', ...fixed },
    cheque: {
      type: new mongoose.Schema(
        {
          number: { type: String, default: '' },
          bank: { type: String, default: '' },
          dueDate: { type: String, default: '' },
          image: { type: ObjectId, ref: 'ChequeImage', default: null },
        },
        { _id: false },
      ),
      default: undefined,
      ...fixed,
    },
    // Links an invoice with the payment saved together with it.
    groupId: { type: String, required: true, index: true, ...fixed },
    // The same request sent twice is saved once.
    requestId: { type: String, required: true, unique: true, ...fixed },
    createdBy: { type: ObjectId, ref: 'User', required: true, ...fixed },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: ObjectId, ref: 'User', default: null },
    voidReason: { type: String, default: '' },
  },
  { timestamps: true },
);

entrySchema.index({ customer: 1, date: 1 });
entrySchema.index({ date: 1, type: 1 });

export const Entry = mongoose.model('Entry', entrySchema);
