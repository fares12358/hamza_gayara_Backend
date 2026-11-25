import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as controller from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const loginBody = z.object({
  username: z.string().trim().toLowerCase().min(1, 'اكتب اسم المستخدم').max(32),
  password: z.string().min(1, 'اكتب كلمة السر').max(72),
});

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'محاولات كتير، استنى ربع ساعة' } },
});

export const authRouter = Router();
authRouter.post('/login', loginLimit, validate({ body: loginBody }), controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', requireAuth, controller.me);
