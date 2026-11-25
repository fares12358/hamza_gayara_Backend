/**
 * The income statement groups the cash rows. These rules come from the old data:
 * cash sales, transfers, collections and total expenses match every month exactly,
 * and the expense words match November 2026 category by category.
 * An expense that matches no rule stops the update: it is never guessed silently.
 */
export const isCashSale = (text) => /نقدا\s*مبيعات/.test(text);
export const isTransfer = (text) => /تحويل/.test(text);

const RULES = [
  // [category, words, needsCheck]
  // Wording seen only once: "مصروف تفتيش ... تعليمات ...". Shown in the report to be confirmed.
  ['مصروفات أخرى', /مصروف تفتيش/, true],
  ['مصروفات أخرى', /صابون|تعليمات محمود/],
  // May 2026 only adds up with cleaning tools under this category.
  ['أدوات ومكتبية', /ادوات نظاف|دفتر|دفاتر|اقلام|اساتي?ك|سلوتيب/],
  ['مائدة', /مائد|مايد|للمائده|انبوب/],
  ['كهرباء', /كهرب/],
  ['انتقالات', /مواصلات|توصيل|انتقال/],
  ['إكراميات', /اكرامي/],
  ['مرتبات وأجور', /راتب|مرتب|البواب/],
  ['صيانة', /صيان/],
  ['سلف', /سلف/],
  ['علاج', /علاج/],
];

/** { category, needsCheck } or null when no rule matches. */
export function expenseCategory(text) {
  const rule = RULES.find(([, words]) => words.test(text));
  return rule ? { category: rule[0], needsCheck: Boolean(rule[2]) } : null;
}
