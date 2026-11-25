import { Router } from 'express';
import * as controller from './reports.controller.js';
import { incomeQuery, reportParams, reportQuery } from './reports.validation.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

// Owner only, and only GET: reports never change data.
export const reportsRouter = Router();
reportsRouter.use(requireAuth, ownerOnly);

reportsRouter.get('/income', validate({ query: incomeQuery }), controller.income);
reportsRouter.get('/:report', validate({ params: reportParams, query: reportQuery }), controller.view);
reportsRouter.get('/:report/export', validate({ params: reportParams, query: reportQuery }), controller.download);
