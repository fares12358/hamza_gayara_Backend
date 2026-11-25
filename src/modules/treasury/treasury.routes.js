import { Router } from 'express';
import { z } from 'zod';
import * as controller from './treasury.controller.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { businessDate } from '../../utils/zodFields.js';

const ledgerQuery = z.object({ from: z.union([z.literal(''), businessDate]).default('') });

export const treasuryRouter = Router();
treasuryRouter.use(requireAuth, ownerOnly);

treasuryRouter.get('/balance', controller.balance);
treasuryRouter.get('/', validate({ query: ledgerQuery }), controller.ledger);
