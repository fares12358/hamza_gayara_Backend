import { verifyLogin, setAuthCookie, clearAuthCookie, revokeSessions, changePassword } from './auth.service.js';
import { AUTH_COOKIE } from '../../middleware/auth.js';

export async function login(req, res) {
  const user = await verifyLogin(req.valid.body.username, req.valid.body.password);
  setAuthCookie(res, user);
  res.json({ user: user.toPublic() });
}

export async function logout(req, res) {
  if (req.cookies?.[AUTH_COOKIE]) await revokeSessions(req.cookies[AUTH_COOKIE]);
  clearAuthCookie(res);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: req.user.toPublic() });
}

export async function password(req, res) {
  const user = await changePassword(req.user._id, req.valid.body.currentPassword, req.valid.body.newPassword);
  setAuthCookie(res, user); // this device stays signed in, the others do not
  res.status(204).end();
}
