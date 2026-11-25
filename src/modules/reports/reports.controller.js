import { getIncome } from './reports.service.js';

export async function income(req, res) {
  res.json(await getIncome(req.valid.query.month));
}
