import mongoose from 'mongoose';

// Counts failed password tries. Stored in the database so that every server instance
// (for example on Vercel) shares the count. Old counters are removed by MongoDB.
const loginAttemptSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);
