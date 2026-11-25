import { createHash } from 'node:crypto';
import { ChequeImage } from './chequeImage.model.js';
import { MAX_IMAGE_BYTES } from './cheques.validation.js';
import { Entry } from '../entries/entries.model.js';
import { draftFor, saveEntries, toEntryDto } from '../entries/entries.service.js';
import { Customer } from '../customers/customers.model.js';
import { ApiError } from '../../utils/ApiError.js';

function decodeJpeg(base64) {
  const data = Buffer.from(base64, 'base64');
  const isJpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (!isJpeg || data.length > MAX_IMAGE_BYTES) throw ApiError.badRequest('صورة الشيك غير صالحة', 'BAD_IMAGE');
  return data;
}

export async function listCheques(limit) {
  const filter = { type: 'cheque', voidedAt: null };
  const [entries, total] = await Promise.all([
    Entry.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Entry.countDocuments(filter),
  ]);
  return { cheques: entries.map(toEntryDto), total };
}

export async function createCheque(input, actor) {
  const customer = await Customer.findOne({ _id: input.customerId, archived: false });
  if (!customer) throw ApiError.notFound('العميل مش موجود');
  const data = input.image ? decodeJpeg(input.image) : null;

  const draft = draftFor('cheque', input, customer);
  const cheque = { number: input.number, bank: input.bank, dueDate: input.dueDate, image: null };

  const [saved] = await saveEntries([{ ...draft, cheque }], {
    actor,
    requestId: input.requestId,
    confirmBackdated: input.confirmBackdated,
    confirmUnusual: input.confirmUnusual,
    extraHash: data ? createHash('sha256').update(data).digest('hex') : '',
    // The photo is saved in the same transaction as the cheque.
    beforeSave: data
      ? async (session) => {
          const [image] = await ChequeImage.create([{ data, contentType: 'image/jpeg', createdBy: actor._id }], { session });
          return { cheque: { ...cheque, image: image._id } };
        }
      : undefined,
  });
  return saved;
}

export async function getImage(id) {
  const image = await ChequeImage.findById(id);
  if (!image) throw ApiError.notFound('الصورة مش موجودة');
  return image;
}
