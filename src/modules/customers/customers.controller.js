import * as service from './customers.service.js';

export async function list(req, res) {
  res.json(await service.listCustomers());
}

export async function statement(req, res) {
  res.json(await service.getStatement(req.valid.params.id, req.valid.query.range));
}

export async function create(req, res) {
  res.status(201).json({ customer: await service.createCustomer(req.valid.body, req.user) });
}

export async function update(req, res) {
  res.json({ customer: await service.updateCustomer(req.valid.params.id, req.valid.body, req.user) });
}

export async function archived(req, res) {
  res.json({ customers: await service.listArchived() });
}
