import { z } from 'zod';
import { REPORT_KEYS } from './data.service.js';
import { MONTH_PATTERN } from '../../utils/date.js';
import { businessDate } from '../../utils/zodFields.js';

export const incomeQuery = z.object({ month: z.string().regex(MONTH_PATTERN).optional() });

export const reportParams = z.object({ report: z.enum(REPORT_KEYS) });

// Each report uses only the fields it needs.
export const reportQuery = z.object({
  from: businessDate.optional(),
  to: businessDate.optional(),
  date: businessDate.optional(),
  month: z.string().regex(MONTH_PATTERN).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
});
