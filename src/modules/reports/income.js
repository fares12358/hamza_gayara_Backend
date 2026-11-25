/** Income statement of one month: sheet totals plus app records. Pure function. */
export function monthIncome(month, summary, entries) {
  const m = {
    month,
    cashSales: summary?.cashSales ?? 0,
    creditSales: summary?.creditSales ?? 0,
    returns: summary?.returns ?? 0,
    collections: summary?.collections ?? 0,
    chequeCollections: 0,
    transfers: summary?.transfers ?? 0,
  };
  const expenses = new Map();
  const addExpense = (category, amount) => expenses.set(category, (expenses.get(category) ?? 0) + amount);
  for (const x of summary?.expenses ?? []) addExpense(x.category, x.amount);

  for (const e of entries) {
    if (e.date.slice(0, 7) !== month) continue;
    if (e.type === 'cash_sale') m.cashSales += e.amount;
    else if (e.type === 'invoice') {
      m.creditSales += e.amount;
      m.returns += e.returnAmount;
    } else if (e.type === 'payment') m.collections += e.amount;
    else if (e.type === 'cheque') m.chequeCollections += e.amount;
    else if (e.type === 'transfer') m.transfers += e.amount;
    else if (e.type === 'expense') addExpense(e.category || 'مصروفات أخرى', e.amount);
  }

  m.expenses = [...expenses].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  m.netSales = m.cashSales + m.creditSales - m.returns;
  m.expensesTotal = m.expenses.reduce((sum, x) => sum + x.amount, 0);
  // Before cost of goods: the sheets do not contain it.
  m.net = m.netSales - m.expensesTotal;
  return m;
}
