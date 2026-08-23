/**
 * format — small shared display-formatting helpers used across customer,
 * kitchen, and admin screens. Extracted during the Phase 24 production
 * polish pass: `fmtPrice` was previously copy-pasted into 11 different
 * files with two subtly different implementations (some handled a
 * falsy/undefined amount defensively, some didn't) — this is the one
 * canonical version every screen now imports instead.
 */

/**
 * @param {number|string|null|undefined} amount
 * @returns {string} e.g. "JOD 12.500"
 */
export function fmtPrice(amount) {
  return `JOD ${parseFloat(amount || 0).toFixed(3)}`;
}
