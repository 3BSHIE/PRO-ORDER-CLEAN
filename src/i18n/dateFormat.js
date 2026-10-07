/**
 * dateFormat.js — Phase 110.3
 *
 * One place that answers "which locale formats a date the guest or the staff
 * actually reads?", and the answer is the APP language, never the device.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Eight surfaces printed timestamps. Seven of them called
 *
 *     new Date(iso).toLocaleString(undefined, …)
 *
 * and `undefined` means "whatever locale this browser happens to be set to".
 * A guest reading an Arabic menu on an English phone saw "Oct 7, 1:23 AM" in
 * their order list; the same build on an Arabic phone showed Arabic — the UI
 * changed under the restaurant without anyone choosing it.
 *
 * The eighth, the Feedback day heading, had already been fixed by hand in
 * Phase 94 §80 with `language === "ar" ? "ar" : "en"` inline. That decision
 * was right and is simply moved here so there is one copy of it rather than
 * nine.
 *
 * ── LOCALE IS NOT TIMEZONE ────────────────────────────────────────────────
 * This module only decides how a moment is SPELLED: month name, field order,
 * AM/PM marker. Which moment it is remains the caller's business, and the
 * restaurant's timezone rules (businessDay.js, 04:00, Asia/Amman fallback)
 * are untouched by anything here. Grouping, revenue and the business day
 * never read this file.
 *
 * ── DIGITS ────────────────────────────────────────────────────────────────
 * "ar" formats with Latin digits in the engines this app targets
 * ("7 أكتوبر، 1:23 ص"), which matches the rest of the product: prices, order
 * ids and the counted phrases in counts.js are all Latin-digit. No
 * `-u-nu-` extension is requested, so the platform default stands.
 */

/**
 * The BCP-47 tag for an app language. The product ships exactly two
 * languages (language.js), and this deliberately returns the bare tags
 * rather than regional ones: the app has never standardised on a region, and
 * inventing "en-GB" or "ar-JO" here would silently restyle every date.
 *
 * @param {"en"|"ar"|string|undefined} language
 * @returns {"en"|"ar"}
 */
export function dateLocale(language) {
  return language === "ar" ? "ar" : "en";
}

/** The shape six surfaces share: "Oct 7, 1:23 AM" / "7 أكتوبر، 1:23 ص". */
const DATE_TIME = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * A timestamp spelled in the app's language.
 *
 * Returns "" for anything that is not a real date — an empty field, a
 * half-written record, a hand-edited value. The call sites this replaces
 * returned the raw ISO string from their catch block, and an unparseable
 * value never reached that catch at all: `new Date("x").toLocaleString()`
 * does not throw, it returns the literal "Invalid Date". Neither string is
 * something to show a guest, so both now render as nothing.
 *
 * @param {string|Date} value — ISO string or Date
 * @param {"en"|"ar"} language — from useLanguage()
 * @param {object} [options] — Intl options; defaults to the shared shape
 * @returns {string}
 */
export function formatDateTime(value, language, options = DATE_TIME) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString(dateLocale(language), options);
  } catch {
    /* An engine that rejects the options object still owes the reader
       something truthful rather than an ISO string. */
    return "";
  }
}

/**
 * Time of day only — "1:23 AM" / "1:23 ص".
 *
 * Used where a date heading above the row already answers "which day", so
 * repeating the date on every row underneath it would be noise (Phase 94 §5).
 */
export function formatTimeOfDay(value, language) {
  return formatDateTime(value, language, { hour: "numeric", minute: "2-digit" });
}
