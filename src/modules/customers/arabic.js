/** Makes common Arabic spellings equal: أ/إ/آ -> ا, ة -> ه, ى -> ي. */
export function normalizeName(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
