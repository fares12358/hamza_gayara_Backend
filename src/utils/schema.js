/** Mongoose field for money: whole piasters only. */
export const moneyField = (extra = {}) => ({
  type: Number,
  required: true,
  default: 0,
  validate: { validator: Number.isSafeInteger, message: '{PATH} must be whole piasters' },
  ...extra,
});
