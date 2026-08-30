/**
 * menuSortOrder — Phase 67. The one rule for a product's display position.
 *
 * Deliberately its own tiny module rather than an addition to
 * menuPricing.js: sort order is not money, and a file named for pricing is
 * the wrong place to look for it. One exported function, shared by the two
 * callers that need it — the Product editor, for the inline field error, and
 * menuData.js, so the rule survives a caller that never opens the editor.
 *
 * THE RULE
 *   A finite whole number, zero or greater. Nothing else.
 *
 *   Rejected, and each for a reason that was previously a silent failure:
 *     "-3"    reordered the live customer menu with no warning
 *     "1.5"   parseInt truncated it to 1 without telling anyone
 *     "abc"   became NaN, and NaN survives into storage as null
 *     "1e3"   is not how anyone types a position
 *     ""      is handled by the CALLER, not here — see below
 *
 * EMPTY IS NOT AN ERROR — it is a separate, existing meaning
 *   The editor holds this field as a raw string and sends `undefined` when
 *   it is blank. createMenuItem then assigns `maxSort + 1`, which is how a
 *   new product lands at the end of its category without anyone typing a
 *   number; updateMenuItem leaves the stored value alone. That behaviour
 *   predates this phase and is preserved exactly, so this parser is only
 *   ever asked about values that are actually present. Blank never reaches
 *   it, and blank is never blocked.
 *
 * Whole numbers only, and never rounded: a position of 2.5 has no meaning,
 * and quietly turning it into 2 is how the manager ends up with an order
 * they did not choose.
 */

/* Digits only. Rejects "", "-1", "+1", "1.5", "1e3", "abc", " ", "NaN",
   "Infinity" — every one of which parseInt would have partially salvaged
   or turned into NaN. */
const WHOLE_NUMBER = /^\d+$/;

/**
 * @param {unknown} raw — a string from the form, or a Number from a
 *   programmatic caller. Both are accepted; a Number is judged as a number
 *   rather than round-tripped through String().
 * @returns {number|null} an integer >= 0, or null if the value is not a
 *   usable position.
 */
export function parseSortOrder(raw) {
  if (typeof raw === "number") {
    /* Number.isInteger is false for NaN, ±Infinity and every decimal, which
       is exactly the set that used to slip through. */
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }

  const text = String(raw ?? "").trim();
  if (!WHOLE_NUMBER.test(text)) return null;

  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
