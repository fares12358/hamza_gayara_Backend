import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../users/users.model.js';
import { AUTH_COOKIE } from '../../middleware/auth.js';
import { hashPassword } from '../users/users.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { withTransaction } from '../../utils/transaction.js';

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

/** Ends the session on the server too: a copied cookie stops working. Signs out every device. */
export async function revokeSessions(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return; // nothing valid to end
  }
  await User.updateOne({ _id: payload.sub, tokenVersion: payload.v }, { $inc: { tokenVersion: 1 } });
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash');
  // 400, not 401: the app must not treat a typing mistake as an ended session.
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('كلمة السر الحالية غلط', 'WRONG_PASSWORD');
  }
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1;
  await withTransaction(async (session) => {
    await user.save({ session });
    await recordAudit({ actor: user, action: 'password', entity: 'user', entityId: user._id, data: {} }, session);
  });
  return user;
}
