import { z } from 'zod';
import { ROLES } from './users.model.js';
import { objectId } from '../../utils/zodFields.js';

export const password = z.string().min(8, 'كلمة السر لازم 8 حروف على الأقل').max(72);
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'اسم المستخدم: حروف إنجليزي وأرقام، من 3 لـ 32');

export const createUserBody = z.object({
  name: z.string().trim().min(2, 'اكتب الاسم').max(80),
  username,
  password,
  role: z.enum(ROLES).default('staff'),
});

export const updateUserBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    role: z.enum(ROLES),
    active: z.boolean(),
    password,
  })
  .partial();

export const userParams = z.object({ id: objectId });
