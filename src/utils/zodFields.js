import { z } from 'zod';
import { isRealDate } from './date.js';

const MAX_PIASTERS = 100_000_000_000; // one billion pounds

/** Money fields are whole piasters. */
export const positiveMoney = z.number().int('المبلغ غير صحيح').positive('اكتب مبلغ أكبر من صفر').max(MAX_PIASTERS);
export const optionalMoney = z.number().int('المبلغ غير صحيح').min(0, 'المبلغ ماينفعش يكون بالسالب').max(MAX_PIASTERS);
export const signedMoney = z.number().int('المبلغ غير صحيح').min(-MAX_PIASTERS).max(MAX_PIASTERS);

export const businessDate = z.string().refine(isRealDate, 'التاريخ غير صحيح');
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'المعرّف غير صحيح');
export const shortText = z.string().trim().max(200).default('');
export const requestId = z.string().min(8).max(64).regex(/^[\w-]+$/);
