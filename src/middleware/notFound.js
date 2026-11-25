import { ApiError } from '../utils/ApiError.js';

export function notFound(req) {
  throw ApiError.notFound(`المسار مش موجود: ${req.method} ${req.originalUrl}`);
}
