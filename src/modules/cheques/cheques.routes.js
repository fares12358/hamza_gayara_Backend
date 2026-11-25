import express, { Router } from 'express';
import * as controller from './cheques.controller.js';
import { chequeBody, imageParams } from './cheques.validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

// Owner and staff. Cancelling a cheque goes through /entries (owner only).
export const chequesRouter = Router();
chequesRouter.use(requireAuth);

chequesRouter.get('/', controller.list);
chequesRouter.get('/customer-options', controller.customerOptions);
chequesRouter.get('/images/:id', validate({ params: imageParams }), controller.image);
chequesRouter.post('/', validate({ body: chequeBody }), controller.create);
