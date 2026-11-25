import { Router } from 'express';
import { z } from 'zod';
import * as controller from './reports.controller.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { MONTH_PATTERN } from '../../utils/date.js';

const incomeQuery = z.object({ month: z.string().regex(MONTH_PATTERN).optional() });

export const reportsRouter = Router();
reportsRouter.use(requireAuth, ownerOnly);

reportsRouter.get('/income', validate({ query: incomeQuery }), controller.income);
