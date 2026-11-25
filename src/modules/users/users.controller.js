import * as service from './users.service.js';
import { setAuthCookie } from '../auth/auth.service.js';

export async function list(req, res) {
  res.json({ users: await service.listUsers() });
}

export async function create(req, res) {
  res.status(201).json({ user: await service.createUser(req.valid.body, req.user) });
}

export async function update(req, res) {
  const { user, document } = await service.updateUser(req.valid.params.id, req.valid.body, req.user);
  // Keep the owner signed in after changing their own password.
  if (String(document._id) === String(req.user._id)) setAuthCookie(res, document);
  res.json({ user });
}
