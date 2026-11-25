import { z } from 'zod';
import { businessDate, objectId, positiveMoney, requestId, shortText } from '../../utils/zodFields.js';

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export const chequeBody = z.object({
  customerId: objectId,
  date: businessDate,
  amount: positiveMoney,
  number: shortText,
  bank: shortText,
  dueDate: z.union([z.literal(''), businessDate]).default(''),
  note: shortText,
  requestId,
  confirmBackdated: z.boolean().default(false),
  confirmUnusual: z.boolean().default(false),
  // JPEG photo as base64, without the "data:" prefix.
  image: z.string().max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4).default(''),
});

export const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(2000).default(50) });

export const imageParams = z.object({ id: objectId });
