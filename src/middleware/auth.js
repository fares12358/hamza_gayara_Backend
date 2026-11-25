import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../modules/users/users.model.js';
import { ApiError } from '../utils/ApiError.js';

export const AUTH_COOKIE = 'gayara_token';

/** Reads the login cookie and loads the user, so disabled accounts lose access at once. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.unauthorized('انتهت الجلسة، سجّل الدخول تاني');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active || user.tokenVersion !== payload.v) throw ApiError.unauthorized();

  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) throw ApiError.forbidden();
  next();
};

export const ownerOnly = requireRole('owner');
