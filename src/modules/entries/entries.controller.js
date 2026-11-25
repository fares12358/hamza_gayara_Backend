import * as service from './entries.service.js';
import { EXPENSE_CATEGORIES } from './entries.model.js';

export function categories(req, res) {
  res.json({ categories: EXPENSE_CATEGORIES });
}

export async function list(req, res) {
  res.json({ entries: await service.listRecent(req.valid.query) });
}

export async function invoice(req, res) {
  res.status(201).json({ entries: await service.createInvoice(req.valid.body, req.user) });
}

export async function cash(req, res) {
  res.status(201).json({ entries: await service.createCashMovement(req.valid.body, req.user) });
}

export async function cancel(req, res) {
  const voided = await service.voidEntry(req.valid.params.id, req.valid.body.reason, req.user);
  res.json({ voided });
}
