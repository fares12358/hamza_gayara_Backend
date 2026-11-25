/** What each record type does to the customer debt and to the cash box. */
export function effectsOf(type, amount, returnAmount = 0) {
  switch (type) {
    case 'invoice':
      return { customerDelta: amount - returnAmount, cashDelta: 0 };
    case 'payment':
      return { customerDelta: -amount, cashDelta: amount };
    case 'cheque':
      return { customerDelta: -amount, cashDelta: 0 };
    case 'debt_add':
      return { customerDelta: amount, cashDelta: 0 };
    case 'debt_reduce':
      return { customerDelta: -amount, cashDelta: 0 };
    case 'cash_sale':
      return { customerDelta: 0, cashDelta: amount };
    case 'expense':
    case 'transfer':
      return { customerDelta: 0, cashDelta: -amount };
    default:
      throw new Error(`Unknown entry type: ${type}`);
  }
}
