import mongoose from 'mongoose';
import { moneyField } from '../../utils/schema.js';

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  // Cash balance that app records are added to (from the sheet).
  cashOpening: moneyField(),
  // Last dates covered by the imported sheets. Empty until the import.
  cashAsOf: { type: String, default: '' },
  ledgerAsOf: { type: String, default: '' },
  overdueDays: { type: Number, default: 7, min: 1 },
});

export const Settings = mongoose.model('Settings', settingsSchema);
