import { getIncome } from './reports.service.js';
import { getReport } from './data.service.js';
import { toExcel } from './excel/index.js';

export async function income(req, res) {
  res.json(await getIncome(req.valid.query.month));
}

export async function view(req, res) {
  res.json(await getReport(req.valid.params.report, req.valid.query));
}

export async function download(req, res) {
  const { report } = await getReport(req.valid.params.report, req.valid.query);
  const file = await toExcel(req.valid.params.report, report);
  res
    .set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${req.valid.params.report}.xlsx"`,
    })
    .send(file);
}
