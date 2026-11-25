import { Router } from 'express';
import * as controller from './customers.controller.js';
import { createCustomerBody, updateCustomerBody, customerParams, statementQuery } from './customers.validation.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get('/', controller.list);
customersRouter.get('/archived', ownerOnly, controller.archived);
customersRouter.get('/:id/statement', validate({ params: customerParams, query: statementQuery }), controller.statement);
customersRouter.post('/', ownerOnly, validate({ body: createCustomerBody }), controller.create);
customersRouter.patch('/:id', ownerOnly, validate({ params: customerParams, body: updateCustomerBody }), controller.update);
