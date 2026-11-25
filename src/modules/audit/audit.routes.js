import { Router } from 'express';
import { z } from 'zod';
import * as controller from './audit.controller.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100) });

// Read only: nothing can change or remove the audit log through the API.
export const auditRouter = Router();
auditRouter.use(requireAuth, ownerOnly);
auditRouter.get('/', validate({ query: listQuery }), controller.list);
