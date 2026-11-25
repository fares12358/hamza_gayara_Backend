import { Router } from 'express';
import * as controller from './customers.controller.js';
import { createCustomerBody, customerParams, statementQuery } from './customers.validation.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get('/', controller.list);
customersRouter.get('/:id/statement', validate({ params: customerParams, query: statementQuery }), controller.statement);
customersRouter.post('/', ownerOnly, validate({ body: createCustomerBody }), controller.create);
