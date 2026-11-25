import mongoose from 'mongoose';

export const ROLES = ['owner', 'staff'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'staff' },
    active: { type: Boolean, default: true },
    // Raising this number logs the user out everywhere.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), name: this.name, username: this.username, role: this.role, active: this.active };
};

export const User = mongoose.model('User', userSchema);
