import * as service from './treasury.service.js';

export async function balance(req, res) {
  res.json({ balance: await service.getBalance() });
}

export async function ledger(req, res) {
  res.json(await service.getLedger(req.valid.query.from));
}
