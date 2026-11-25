import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../users/users.model.js';
import { AUTH_COOKIE } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';

// Compared when the username is unknown, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export async function verifyLogin(username, password) {
  const user = await User.findOne({ username }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) throw ApiError.unauthorized('اسم المستخدم أو كلمة السر غلط');
  return user;
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: '/api',
});

export function setAuthCookie(res, user) {
  const token = jwt.sign({ sub: String(user._id), v: user.tokenVersion }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${env.JWT_EXPIRES_DAYS}d`,
  });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions(), maxAge: env.JWT_EXPIRES_DAYS * 86_400_000 });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
}
