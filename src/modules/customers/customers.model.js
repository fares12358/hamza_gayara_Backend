import mongoose from 'mongoose';
import { moneyField } from '../../utils/schema.js';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Spelling-independent form of the name. Stops duplicate customers.
    searchName: { type: String, required: true, unique: true },
    aliases: [{ type: String, trim: true }],
    // sheet: final sheet balance. app: debt typed when the customer was added.
    openingBalance: moneyField({ immutable: true }),
    openingDate: { type: String, default: '' },
    source: { type: String, enum: ['sheet', 'app'], default: 'app', immutable: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Customer = mongoose.model('Customer', customerSchema);
