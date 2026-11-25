import { monthIncome } from './income.js';
import { MonthlySummary } from '../history/history.model.js';
import { Entry } from '../entries/entries.model.js';
import { getSettings } from '../settings/settings.service.js';
import { env } from '../../config/env.js';
import { today } from '../../utils/date.js';

export async function getIncome(requestedMonth) {
  const current = today(env.APP_TIMEZONE).slice(0, 7);
  const month = requestedMonth || current;
  const year = month.slice(0, 4);

  const [summaries, entries, settings] = await Promise.all([
    MonthlySummary.find().lean(),
    Entry.find({ voidedAt: null }).select('type date amount returnAmount category').lean(),
    getSettings(),
  ]);
  const summaryOf = new Map(summaries.map((s) => [s.month, s]));

  // Months that have data, plus the current one.
  const months = [...new Set([current, ...summaryOf.keys(), ...entries.map((e) => e.date.slice(0, 7))])].sort();

  return {
    months,
    selected: monthIncome(month, summaryOf.get(month), entries),
    year,
    yearRows: months
      .filter((m) => m.startsWith(year) && m <= current)
      .map((m) => {
        const { netSales, expensesTotal, net } = monthIncome(m, summaryOf.get(m), entries);
        return { month: m, netSales, expensesTotal, net };
      }),
    cashAsOf: settings.cashAsOf,
  };
}
