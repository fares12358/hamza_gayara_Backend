import { LoginAttempt } from './loginAttempt.model.js';
import { ApiError } from '../../utils/ApiError.js';

const WINDOW_MS = 15 * 60 * 1000;

async function hit(key) {
  // This only removes an expired counter, never business data.
  await LoginAttempt.deleteOne({ key, expiresAt: { $lte: new Date() } });
  const increase = () =>
    LoginAttempt.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + WINDOW_MS) } },
      { upsert: true, returnDocument: 'after' },
    );
  try {
    return (await increase()).count;
  } catch (error) {
    if (error.code !== 11000) throw error;
    return (await increase()).count; // two first tries arrived together
  }
}

/**
 * rules(req) returns [{ key, max }]. Each try is counted before the password check.
 * A successful request gives its try back.
 */
const attemptLimit = (rules) => async (req, res, next) => {
  const list = rules(req);
  const counts = await Promise.all(list.map((r) => hit(r.key)));
  if (counts.some((count, i) => count > list[i].max)) {
    throw new ApiError(429, 'RATE_LIMIT', 'محاولات كتير، استنى ربع ساعة');
  }
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    Promise.all(list.map((r) => LoginAttempt.updateOne({ key: r.key }, { $inc: { count: -1 } }))).catch((error) =>
      console.error('Could not update login attempts:', error.message),
    );
  });
  next();
};

export const loginLimit = attemptLimit((req) => [
  { key: `login:${req.ip}:${req.valid.body.username}`, max: 10 },
  // Across all addresses, against guessing one account from many places.
  { key: `login-user:${req.valid.body.username}`, max: 50 },
]);

export const passwordLimit = attemptLimit((req) => [{ key: `password:${req.user._id}`, max: 10 }]);
