/**
 * format — small shared display-formatting helpers used across customer,
 * kitchen, and admin screens. Extracted during the Phase 24 production
 * polish pass: `fmtPrice` was previously copy-pasted into 11 different
 * files with two subtly different implementations (some handled a
 * falsy/undefined amount defensively, some didn't) — this is the one
 * canonical version every screen now imports instead.
 */

/**
 * Phase 82.1 — the one currency this version prices in.
 *
 * fmtPrice has hardcoded "JOD" since Phase 24, and every price across
 * Customer, Kitchen and Admin goes through it. Settings has also carried an
 * editable `currency` text field since Phase 23 that nothing has ever read —
 * so a manager could type "USD", save successfully, and still see JOD on
 * every screen. Phase 82 classified that as a P0 pre-backend blocker: a
 * setting that saves and does nothing.
 *
 * The field stays in the data model (it is exactly the seam multi-currency
 * will grow from), but v1 resolves it to one value, and this constant is that
 * value — shared by the formatter below and by settingsData's normalizer, so
 * the stored value and the displayed one cannot drift apart again.
 */
export const SUPPORTED_CURRENCY = "JOD";

/**
 * Resolve any stored currency to what v1 can actually price in.
 *
 * Anything unsupported — a legacy "USD" from the old free-text field, an
 * empty string, a missing key, a non-string — resolves to JOD. Nothing is
 * dropped or thrown: the currency the product charges in is not somewhere to
 * surface a validation error, and JOD is what the totals were always in
 * regardless of what the field said.
 *
 * There is deliberately no branch here. v1 supports exactly one currency, so
 * a conditional would be theatre — every input has the same answer. When a
 * second currency is genuinely supported, the branch belongs in this function
 * and every caller already routes through it.
 *
 * @returns {"JOD"}
 */
export function normalizeCurrency() {
  return SUPPORTED_CURRENCY;
}

/**
 * @param {number|string|null|undefined} amount
 * @returns {string} e.g. "JOD 12.500"
 */
export function fmtPrice(amount) {
  return `${SUPPORTED_CURRENCY} ${parseFloat(amount || 0).toFixed(3)}`;
}
