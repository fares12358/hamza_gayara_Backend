export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'سجّل الدخول الأول') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'مفيش صلاحية للعملية دي') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'مش موجود') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message, code = 'CONFLICT', details) {
    return new ApiError(409, code, message, details);
  }
}
