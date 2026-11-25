import { verifyLogin, setAuthCookie, clearAuthCookie } from './auth.service.js';

export async function login(req, res) {
  const user = await verifyLogin(req.valid.body.username, req.valid.body.password);
  setAuthCookie(res, user);
  res.json({ user: user.toPublic() });
}

export function logout(req, res) {
  clearAuthCookie(res);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: req.user.toPublic() });
}
