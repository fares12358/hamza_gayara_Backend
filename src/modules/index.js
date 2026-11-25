import { Router } from 'express';
import { authRouter } from './auth/auth.routes.js';
import { usersRouter } from './users/users.routes.js';
import { customersRouter } from './customers/customers.routes.js';
import { entriesRouter } from './entries/entries.routes.js';
import { chequesRouter } from './cheques/cheques.routes.js';
import { treasuryRouter } from './treasury/treasury.routes.js';
import { reportsRouter } from './reports/reports.routes.js';
import { auditRouter } from './audit/audit.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (req, res) => res.json({ ok: true }));
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/entries', entriesRouter);
apiRouter.use('/cheques', chequesRouter);
apiRouter.use('/treasury', treasuryRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/audit', auditRouter);
