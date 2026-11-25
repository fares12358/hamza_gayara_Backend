import mongoose from 'mongoose';

// Photos are shrunk in the browser first, so they stay small enough for MongoDB.
const chequeImageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const ChequeImage = mongoose.model('ChequeImage', chequeImageSchema);
