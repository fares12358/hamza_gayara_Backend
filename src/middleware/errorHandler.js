import { ApiError } from '../utils/ApiError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  let known = error instanceof ApiError ? error : null;

  if (!known && error?.code === 11000) known = ApiError.conflict('البيانات دي مسجلة قبل كده', 'DUPLICATE');
  if (!known && error?.type === 'entity.too.large') known = new ApiError(413, 'TOO_LARGE', 'الملف أكبر من المسموح');
  if (!known && error?.type === 'entity.parse.failed') known = ApiError.badRequest('البيانات المرسلة غير صحيحة');

  if (!known) {
    console.error(error);
    known = new ApiError(500, 'SERVER_ERROR', 'حصل خطأ في السيرفر، جرب تاني');
  }

  res.status(known.status).json({ error: { code: known.code, message: known.message, details: known.details } });
}
