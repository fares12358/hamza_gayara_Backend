import * as service from './cheques.service.js';
import { listCustomers } from '../customers/customers.service.js';

export async function list(req, res) {
  res.json({ cheques: await service.listCheques() });
}

/** Names and balances for the cheque form. */
export async function customerOptions(req, res) {
  const { customers } = await listCustomers();
  res.json({ customers: customers.map(({ id, name, balance }) => ({ id, name, balance })) });
}

export async function create(req, res) {
  res.status(201).json({ cheque: await service.createCheque(req.valid.body, req.user) });
}

export async function image(req, res) {
  const found = await service.getImage(req.valid.params.id);
  res.set({ 'Content-Type': found.contentType, 'Cache-Control': 'private, no-store' }).send(found.data);
}
