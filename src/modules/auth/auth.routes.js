import { Router } from 'express';
import { z } from 'zod';
import * as controller from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { loginLimit, passwordLimit } from './attemptLimit.js';
import { password as newPassword } from '../users/users.validation.js';

const loginBody = z.object({
  username: z.string().trim().toLowerCase().min(1, 'اكتب اسم المستخدم').max(32),
  password: z.string().min(1, 'اكتب كلمة السر').max(72),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1, 'اكتب كلمة السر الحالية').max(72),
  newPassword,
});

export const authRouter = Router();
authRouter.post('/login', validate({ body: loginBody }), loginLimit, controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', requireAuth, controller.me);
authRouter.patch('/password', requireAuth, validate({ body: passwordBody }), passwordLimit, controller.password);
