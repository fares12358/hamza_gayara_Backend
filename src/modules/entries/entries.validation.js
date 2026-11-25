import { z } from 'zod';
import { EXPENSE_CATEGORIES, ENTRY_TYPES } from './entries.model.js';
import { businessDate, objectId, optionalMoney, positiveMoney, requestId, shortText } from '../../utils/zodFields.js';

const common = {
  date: businessDate,
  note: shortText,
  requestId,
  confirmBackdated: z.boolean().default(false),
};

export const invoiceBody = z
  .object({
    ...common,
    customerId: objectId,
    permitNo: shortText,
    amount: positiveMoney,
    returnAmount: optionalMoney.default(0),
    paidAmount: optionalMoney.default(0),
  })
  .refine((v) => v.returnAmount <= v.amount, {
    message: 'المرتجع أكبر من الفاتورة',
    path: ['returnAmount'],
  });

export const cashBody = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('payment'), customerId: objectId, amount: positiveMoney }),
  z.object({ ...common, type: z.literal('cash_sale'), amount: positiveMoney }),
  z.object({ ...common, type: z.literal('expense'), category: z.enum(EXPENSE_CATEGORIES), amount: positiveMoney }),
  z.object({ ...common, type: z.literal('transfer'), amount: positiveMoney }),
]);

export const listQuery = z.object({
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : []))
    .pipe(z.array(z.enum(ENTRY_TYPES))),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const voidBody = z.object({ reason: shortText });
export const entryParams = z.object({ id: objectId });
