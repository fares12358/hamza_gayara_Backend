/** Builds the reconciliation report (Markdown). It contains REAL data: never commit it. */
const money = (piasters) => (piasters / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

const table = (headers, rows) =>
  [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const list = (items, format) => (items.length ? items.map((i) => `- ${format(i)}`).join('\n') : '- none');

export function buildReport({ mode, sourceName, plan, problems, result }) {
  const ledgerRows = plan.customers.reduce((n, c) => n + c.rows.length, 0);
  const passed = result.failures.length === 0;

  return `# Import report: ${mode}

- Source: \`${sourceName}\`
- Data fingerprint: \`${plan.fingerprint}\`
- Sheet data up to: customers ${plan.settings.ledgerAsOf}, cash box ${plan.settings.cashAsOf}
- **Verification: ${passed ? 'PASSED' : 'FAILED'}** (${result.checked} comparisons, ${result.failures.length} differences)

## What is imported

${table(['Data', 'Count'], [
    ['Customers', plan.customers.length],
    ['Customer sheet rows', ledgerRows],
    ['Cash box rows', plan.cashRows.length],
    ['Monthly summaries', plan.monthly.length],
  ])}

## Main totals (as the app shows them)

${table(['Figure', 'Pounds'], [
    ['Cash box balance', money(result.cashBalance)],
    ['Total customer debt', money(result.totals.debt)],
    ['Customers in debt', result.totals.debtors],
    ['Late debt (today, old rule)', money(result.totals.overdue)],
  ])}

## Customers

${table(['Customer', 'Balance', 'Late', 'Sheet rows', 'Last movement'], result.customers.map((c) => [
    c.name, money(c.balance), c.overdue === null ? 'unknown' : money(c.overdue), c.rows, c.lastActivity,
  ]))}

## Months

${table(['Month', 'Net sales', 'Expenses', 'Net', 'Collections', 'Transfers'], result.months.map((m) => [
    m.month, money(m.netSales), money(m.expensesTotal), money(m.net), money(m.collections), money(m.transfers),
  ]))}

## Differences between the HTML and the app

${list(result.failures.slice(0, 50), (f) => f)}

## Problems inside the source data (imported as they are, please check)

Row numbers count from 1 inside the HTML data. They are not Excel row numbers.

### Customer rows where the balance does not follow from the row before
${list(problems.ledgerChain, (b) => `${b.customer}, row ${b.row} (${b.date}): expected ${money(b.expected)}, sheet says ${money(b.found)}, difference ${money(b.found - b.expected)}`)}

### Customer rows out of date order
${list(problems.ledgerOrder, (b) => `${b.customer}, row ${b.row}: ${b.date} comes after ${b.previous}`)}

### Last row differs from the customer's balance
${list(problems.ledgerLastRow, (b) => `${b.customer}: last row ${money(b.lastRow)}, balance ${money(b.stored)}`)}

### Customers with no sheet rows (late debt cannot be calculated)
${list(problems.withoutRows, (n) => n)}

### Customer rows dated after ${plan.settings.ledgerAsOf}
${list(problems.ledgerAfterCutoff, (b) => `${b.customer}, row ${b.row}: ${b.date}`)}

### Cash box
- Rows where the balance does not follow: ${problems.cashChain.length}
${list(problems.cashChain, (b) => `row ${b.row} (${b.date}): difference ${money(b.found - b.expected)}`)}
- Rows out of date order:
${list(problems.cashOrder, (b) => `row ${b.row}: ${b.date} comes after ${b.previous}`)}
- Rows dated after ${plan.settings.cashAsOf}: ${problems.cashAfterCutoff.length}
- Last row equals the starting cash balance: ${problems.cashLastMatches ? 'yes' : 'NO'}
`;
}
