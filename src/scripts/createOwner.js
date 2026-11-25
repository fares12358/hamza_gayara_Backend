/**
 * Creates the first owner account from OWNER_NAME, OWNER_USERNAME and OWNER_PASSWORD.
 * Only adds one user. Does nothing if an owner already exists.
 */
import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../modules/users/users.model.js';
import { createUserBody } from '../modules/users/users.validation.js';
import { hashPassword } from '../modules/users/users.service.js';
import { recordAudit } from '../modules/audit/audit.service.js';

const input = createUserBody.safeParse({
  name: process.env.OWNER_NAME,
  username: process.env.OWNER_USERNAME,
  password: process.env.OWNER_PASSWORD,
  role: 'owner',
});

if (!input.success) {
  console.error('Set OWNER_NAME, OWNER_USERNAME and OWNER_PASSWORD (8+ characters) in backend/.env');
  for (const issue of input.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

try {
  const connection = await connectDatabase(env.MONGODB_URI);
  console.log(`Database: ${connection.name}`);
  if (await User.exists({ role: 'owner' })) {
    console.log('An owner already exists. Nothing was changed.');
  } else {
    const { password, ...user } = input.data;
    const owner = await User.create({ ...user, passwordHash: await hashPassword(password) });
    await recordAudit({ actor: owner, action: 'create', entity: 'user', entityId: owner._id, data: { username: user.username, role: 'owner' } });
    console.log(`Owner "${user.username}" created. Now remove OWNER_PASSWORD from .env.`);
  }
} catch (error) {
  console.error('Failed:', error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
