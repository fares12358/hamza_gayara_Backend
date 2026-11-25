import { Router } from 'express';
import * as controller from './users.controller.js';
import { createUserBody, updateUserBody, userParams } from './users.validation.js';
import { requireAuth, ownerOnly } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, ownerOnly);

usersRouter.get('/', controller.list);
usersRouter.post('/', validate({ body: createUserBody }), controller.create);
usersRouter.patch('/:id', validate({ params: userParams, body: updateUserBody }), controller.update);
