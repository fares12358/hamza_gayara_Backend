import { Router } from 'express';
import * as controller from './entries.controller.js';
import { invoiceBody, cashBody, listQuery, voidBody, entryParams } from './entries.validation.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const entriesRouter = Router();
entriesRouter.use(requireAuth, ownerOnly);

entriesRouter.get('/categories', controller.categories);
entriesRouter.get('/', validate({ query: listQuery }), controller.list);
entriesRouter.post('/invoice', validate({ body: invoiceBody }), controller.invoice);
entriesRouter.post('/cash', validate({ body: cashBody }), controller.cash);
entriesRouter.post('/:id/void', validate({ params: entryParams, body: voidBody }), controller.cancel);
