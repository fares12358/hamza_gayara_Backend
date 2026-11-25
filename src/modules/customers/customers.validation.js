import { z } from 'zod';
import { objectId, signedMoney } from '../../utils/zodFields.js';

export const createCustomerBody = z.object({
  name: z.string().trim().min(2, 'اكتب اسم العميل').max(100),
  openingBalance: signedMoney.default(0),
});

const customerName = z.string().trim().min(2, 'اكتب اسم العميل').max(100);

export const updateCustomerBody = z
  .object({ name: customerName, aliases: z.array(customerName).max(20), archived: z.boolean() })
  .partial();

export const customerParams = z.object({ id: objectId });

export const statementQuery = z.object({
  range: z.coerce.number().int().min(0).max(3650).default(90),
});
