/**
 * counts — Phase 43.
 *
 * Two helpers for the only counted phrases in the customer UI. Deliberately
 * tiny: this is not a pluralization framework and must not grow into one.
 *
 * The problem: English needs "1 item" vs "3 items", and Arabic needs far more
 * than that — singular, dual, a 3–10 plural and an 11+ form, each with its own
 * noun ending. Reproducing that faithfully means four or five variants per
 * phrase and a rule table, for two short labels.
 *
 * So the Arabic copy sidesteps the grammar instead of encoding it. Rather than
 * "{n} صنف", which is wrong for most values of n, the plural key puts the
 * number after a fixed noun phrase — "الأصناف: 15" — which reads naturally and
 * is grammatical for every number. Only the genuine singular gets its own
 * wording. English keeps the ordinary singular/plural it always had.
 *
 * Each language therefore chooses its own shape through the normal
 * translations file; nothing here assumes the two languages phrase a count the
 * same way.
 */

/**
 * "1 item" / "15 items"  ·  "صنف واحد" / "الأصناف: 15"
 *
 * @param {(key:string, fallback?:string)=>string} t — from useLanguage()
 * @param {number} n
 */
export function formatItemCount(t, n) {
  return n === 1
    ? t("customer.itemCountOne", "1 item")
    : t("customer.itemCountOther", "{n} items").replace("{n}", n);
}

/**
 * '1 result for "x"' / '3 results for "x"'
 * 'نتيجة واحدة للبحث عن "x"' / 'نتائج البحث عن "x": 3'
 *
 * The query is substituted, never translated — it is what the guest typed.
 *
 * @param {(key:string, fallback?:string)=>string} t
 * @param {number} n
 * @param {string} query
 */
export function formatResultCount(t, n, query) {
  const template =
    n === 1
      ? t("customer.resultCountOne", '1 result for "{q}"')
      : t("customer.resultCountOther", '{n} results for "{q}"');
  return template.replace("{n}", n).replace("{q}", query);
}
/**
 * "24 tables" / "1 table"  ·  "الطاولات: 24" / "طاولة واحدة"
 * filtered: "3 of 24 tables"  ·  "3 من أصل 24 طاولة"
 *
 * Phase 58. Same sidestep as the two helpers above — the Arabic plural puts
 * the number after a fixed noun phrase instead of inflecting the noun, so one
 * string is grammatical for every value of n.
 *
 * When `shown` is less than `total` the phrase names both numbers: that
 * difference is the signal that a search or filter is currently narrowing
 * the list, which is the whole reason the count is on screen.
 *
 * @param {(key:string, fallback?:string)=>string} t
 * @param {number} shown  — rows after search + filter
 * @param {number} total  — rows before either
 */
export function formatTableCount(t, shown, total) {
  if (shown !== total) {
    return t("admin.tableCountFiltered", "{n} of {total} tables")
      .replace("{n}", shown)
      .replace("{total}", total);
  }
  return shown === 1
    ? t("admin.tableCountOne", "1 table")
    : t("admin.tableCountOther", "{n} tables").replace("{n}", shown);
}
