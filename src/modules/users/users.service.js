import bcrypt from 'bcryptjs';
import { User } from './users.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { withTransaction } from '../../utils/transaction.js';

export const hashPassword = (plain) => bcrypt.hash(plain, 12);

export async function listUsers() {
  const users = await User.find().sort({ createdAt: 1 });
  return users.map((u) => u.toPublic());
}

export async function createUser({ name, username, password, role }, actor) {
  if (await User.exists({ username })) throw ApiError.conflict('اسم المستخدم ده موجود');
  const passwordHash = await hashPassword(password);
  return withTransaction(async (session) => {
    const [user] = await User.create([{ name, username, role, passwordHash }], { session });
    await recordAudit({ actor, action: 'create', entity: 'user', entityId: user._id, data: { username, role } }, session);
    return user.toPublic();
  });
}

export async function updateUser(id, changes, actor) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('المستخدم مش موجود');

  const isSelf = String(user._id) === String(actor._id);
  // Prevents locking everyone out of the owner account.
  if (isSelf && (changes.active === false || (changes.role && changes.role !== 'owner'))) {
    throw ApiError.badRequest('ماينفعش توقف أو تغيّر صلاحية حسابك');
  }

  const { password, ...rest } = changes;
  Object.assign(user, rest);
  if (password) user.passwordHash = await hashPassword(password);
  if (password || changes.active === false || changes.role) user.tokenVersion += 1;

  await withTransaction(async (session) => {
    await user.save({ session });
    await recordAudit(
      { actor, action: 'update', entity: 'user', entityId: user._id, data: { ...rest, passwordChanged: Boolean(password) } },
      session,
    );
  });
  return { user: user.toPublic(), document: user };
}
