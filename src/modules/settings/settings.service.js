import { Settings } from './settings.model.js';

/** Read only: returns defaults while nothing has been saved. */
export async function getSettings() {
  const saved = await Settings.findOne({ key: 'main' }).lean();
  return { cashOpening: 0, cashAsOf: '', ledgerAsOf: '', overdueDays: 7, ...saved };
}
