/**
 * businessDay — which trading day a moment belongs to.
 *
 * Phase 96 §19/§46.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * A restaurant serving past midnight is still working the same shift at
 * 01:30 that it started at 19:00. A calendar day would split that shift in
 * two, so Kitchen's "Recently Canceled" would empty itself mid-service — the
 * one moment the list matters most.
 *
 * The boundary is 04:00 in the RESTAURANT's timezone: anything before it
 * belongs to the previous day's business day.
 *
 * ── WHY A NEW MODULE, GIVEN §19 SAYS NOT TO INVENT A SECOND ONE ───────────
 * There was no existing business-day implementation to reuse — only timezone
 * primitives. acceptingOrders.js has a related but different idea
 * (`serviceDay`), which answers "which weekday's OPENING HOURS row governs
 * right now" for an overnight shift; it is tied to the working-hours schedule
 * and yields a weekday key, not a dated one. This answers "which trading date
 * is it", which is what a history list needs.
 *
 * So this is one small helper, and it reuses the existing clock primitive
 * (getRestaurantClockParts) rather than reimplementing timezone handling. The
 * fallback chain is that function's: configured zone → Asia/Amman.
 */

import { getRestaurantClockParts } from "./categoryVisibility.js";

/** Service rolls over at 04:00, not midnight. */
export const BUSINESS_DAY_START_HOUR = 4;

/**
 * The business day a moment falls in, as a stable "YYYY-MM-DD" key.
 *
 * Keys are compared, never parsed back into dates, so the string form is the
 * whole contract: two moments in the same trading day produce the same key.
 *
 * @param {string} timeZone — IANA name; falls back to Asia/Amman
 * @param {Date|string|number} [when]
 * @returns {string|null} "YYYY-MM-DD", or null if the moment is unusable
 */
export function getBusinessDayKey(timeZone, when = new Date()) {
  const date = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(date.getTime())) return null;

  const parts = getRestaurantClockParts(timeZone, date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  if (!parts) return null;

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  /* Some engines render midnight as "24" under hour12:false, which would
     otherwise push the day forward by one. */
  const hour = Number(get("hour")) % 24;

  if (![year, month, day, hour].every(Number.isFinite)) return null;

  /* UTC arithmetic on an already-localised Y/M/D: the values came out of the
     restaurant's clock, so this is pure date maths, never a second timezone
     conversion. It also gives correct month/year rollover for free. */
  const keyDate = new Date(Date.UTC(year, month - 1, day));
  if (hour < BUSINESS_DAY_START_HOUR) {
    keyDate.setUTCDate(keyDate.getUTCDate() - 1);
  }
  return keyDate.toISOString().slice(0, 10);
}

/**
 * Is this moment inside the business day that is current right now?
 *
 * @param {string} timeZone
 * @param {Date|string|number} when
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isSameBusinessDay(timeZone, when, now = new Date()) {
  const a = getBusinessDayKey(timeZone, when);
  if (!a) return false;
  return a === getBusinessDayKey(timeZone, now);
}
