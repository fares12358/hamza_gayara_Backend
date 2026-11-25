import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Blocks write requests sent by other websites. */
export function originCheck(req, res, next) {
  const origin = req.get('origin');
  if (SAFE.has(req.method) || !origin) return next();
  const sameHost = origin === `${req.protocol}://${req.get('host')}`;
  if (!sameHost && !env.clientOrigins.includes(origin)) throw ApiError.forbidden('الطلب جاي من مصدر غير مسموح');
  next();
}
