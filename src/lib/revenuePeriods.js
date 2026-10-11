/**
 * revenuePeriods.js — Phase 111.0
 *
 * The selected lens for Revenue Analytics: which DAY, WEEK or MONTH is being
 * looked at, and which orders belong to it.
 *
 * ── ONE PRIMITIVE, NOT A SECOND TIMEZONE LAYER ────────────────────────────
 * Everything here is arithmetic on the business-day key that businessDay.js
 * already produces — a plain "YYYY-MM-DD" string answering "which trading
 * date did this moment belong to", with the restaurant's timezone and the
 * 04:00 rollover already applied.
 *
 * That single decision carries the whole module:
 *
 *   • A DAY is one key.
 *   • A WEEK is seven consecutive keys.
 *   • A MONTH is every key whose "YYYY-MM" prefix matches.
 *
 * So an order placed at 02:00 restaurant-local lands on the previous trading
 * date for all three lenses at once, and a month boundary cannot double-count
 * or drop it, because the key it is compared against was decided once. No
 * Intl call in this file touches an order — the only one formats a label.
 *
 * ── WHY ANCHORS ARE KEYS TOO ──────────────────────────────────────────────
 * The selected period is held as one normalised key: the day itself, the
 * week's Sunday, or the month's first. Navigation is then addition on a UTC
 * date built from that key, which is pure date maths — the values came out of
 * the restaurant's clock already, so there is no second conversion to get
 * wrong, and month/year rollover comes free.
 *
 * ── WEEK STARTS SUNDAY ────────────────────────────────────────────────────
 * Taken from the product, not invented: settings.workingHours is keyed
 * sun → sat in that order, and the Working Hours editor renders it that way,
 * so Sunday is already this product's first day of the week. ISO weeks are
 * deliberately not used — nothing in PRO-ORDER asks for week numbers.
 */

import { getBusinessDayKey } from "./businessDay.js";
import { dateLocale } from "../i18n/dateFormat.js";

/** The three lenses, in the order the stepper cycles through them. */
export const PERIOD_TYPES = ["day", "week", "month"];

/** Sunday. See the header — this is the product's existing convention. */
export const WEEK_START_DAY = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Key arithmetic ──────────────────────────────────────────────────────
   A key is "YYYY-MM-DD". It is turned into a UTC midnight Date purely so the
   calendar maths (and rollover) can be done by the engine, then turned back.
   UTC throughout, so no local offset can shift a date by a day. */

function keyToUtcDate(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDateToKey(date) {
  return date.toISOString().slice(0, 10);
}

/** `key` moved by `days`, which may be negative. */
export function addDays(key, days) {
  const date = keyToUtcDate(key);
  if (!date) return key;
  return utcDateToKey(new Date(date.getTime() + days * DAY_MS));
}

/** The Sunday of the week `key` falls in. */
function startOfWeekKey(key) {
  const date = keyToUtcDate(key);
  if (!date) return key;
  const shift = (date.getUTCDay() - WEEK_START_DAY + 7) % 7;
  return addDays(key, -shift);
}

/** The first of the month `key` falls in. */
function startOfMonthKey(key) {
  const date = keyToUtcDate(key);
  if (!date) return key;
  return utcDateToKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

/** The last calendar day of the month `key` falls in. */
function endOfMonthKey(key) {
  const date = keyToUtcDate(key);
  if (!date) return key;
  /* Day 0 of the NEXT month is the last day of this one. */
  return utcDateToKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/**
 * Normalise any business-day key to the anchor for a period type.
 *
 * @param {string} key — "YYYY-MM-DD"
 * @param {"day"|"week"|"month"} type
 * @returns {string} anchor key
 */
export function normalizeAnchor(key, type) {
  if (type === "week") return startOfWeekKey(key);
  if (type === "month") return startOfMonthKey(key);
  return key;
}

/**
 * The anchor for the period that is current RIGHT NOW on the restaurant's
 * clock — today's trading date, this week, or this month.
 *
 * @param {string} timeZone — IANA name; businessDay.js falls back to Asia/Amman
 * @param {"day"|"week"|"month"} type
 * @param {Date} [now]
 * @returns {string|null}
 */
export function currentAnchor(timeZone, type, now = new Date()) {
  const key = getBusinessDayKey(timeZone, now);
  return key ? normalizeAnchor(key, type) : null;
}

/**
 * Step an anchor by whole periods. `delta` is -1 for previous, +1 for next.
 *
 * Month stepping goes through the engine's month arithmetic rather than
 * adding 28–31 days, so January 31 → February cannot overshoot.
 */
export function shiftAnchor(anchor, type, delta) {
  if (!delta) return anchor;
  if (type === "day") return addDays(anchor, delta);
  if (type === "week") return addDays(anchor, delta * 7);

  const date = keyToUtcDate(anchor);
  if (!date) return anchor;
  return utcDateToKey(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1))
  );
}

/**
 * The inclusive business-day key range an anchor covers.
 *
 * @returns {{type:string, anchor:string, startKey:string, endKey:string}}
 */
export function getPeriodRange(anchor, type) {
  const normalized = normalizeAnchor(anchor, type);
  if (type === "week") {
    return { type, anchor: normalized, startKey: normalized, endKey: addDays(normalized, 6) };
  }
  if (type === "month") {
    return { type, anchor: normalized, startKey: normalized, endKey: endOfMonthKey(normalized) };
  }
  return { type, anchor: normalized, startKey: normalized, endKey: normalized };
}

/**
 * Is this the period the restaurant is currently trading in?
 *
 * Drives the forward arrow's disabled state: there is nothing to see past
 * the current period, and offering to walk into it invites the manager to
 * read an empty chart as a bad day (§7).
 */
export function isCurrentPeriod(anchor, type, timeZone, now = new Date()) {
  const current = currentAnchor(timeZone, type, now);
  return current !== null && normalizeAnchor(anchor, type) === current;
}

/** Every business-day key in a range, in order. Used for the chart's x-axis. */
export function listRangeKeys(range) {
  const keys = [];
  if (!range) return keys;
  let key = range.startKey;
  /* Bounded by the longest period this module can produce (31 days) plus
     slack, so a malformed range can never spin. */
  for (let i = 0; i < 40; i += 1) {
    keys.push(key);
    if (key === range.endKey) break;
    key = addDays(key, 1);
  }
  return keys;
}

/**
 * The orders that belong to a period.
 *
 * Each order is placed by its OWN business-day key, then compared as a
 * string: "2026-10-05" <= "2026-10-07" <= "2026-10-11" is both correct and
 * cheap for zero-padded ISO dates, and it means the 04:00 rule is applied
 * exactly once per order regardless of which lens is selected.
 *
 * An order whose createdAt cannot be placed on the clock is excluded rather
 * than defaulted into the current period — the same stance filterToday takes.
 */
export function filterOrdersToPeriod(orders, timeZone, range) {
  if (!range) return [];
  return (orders || []).filter((order) => {
    const key = getBusinessDayKey(timeZone, order?.createdAt);
    return key !== null && key >= range.startKey && key <= range.endKey;
  });
}

/**
 * The label the navigation control prints, in the APP language (Phase 110.3).
 *
 *   day    "Oct 11, 2026"          ·  "11 أكتوبر 2026"
 *   week   "Oct 11 – 17, 2026"     ·  "11–17 أكتوبر 2026"
 *          "Sep 27 – Oct 3, 2026"  ·  "27 سبتمبر – 3 أكتوبر 2026"
 *          "Dec 28, 2025 – Jan 3, 2026" across a year boundary
 *   month  "October 2026"          ·  "أكتوبر 2026"
 *
 * The week form is Intl's own `formatRange`, not two formatted dates glued
 * together: it is what decides that a week inside one month prints the month
 * once, and it gets the Arabic shape right — "11–17 أكتوبر 2026" puts the
 * month after the range, which no amount of concatenating in English word
 * order would produce. The manual fallback below exists only for an engine
 * without it, and is deliberately the dumb version.
 *
 * Dates are formatted with timeZone "UTC" deliberately: the key was built
 * from the restaurant's clock and then turned into a UTC midnight, so UTC is
 * the only zone that reads it back unchanged. Formatting it in any other zone
 * would re-apply an offset the key has already accounted for.
 */
export function formatPeriodLabel(range, language) {
  if (!range) return "";
  const locale = dateLocale(language);
  const start = keyToUtcDate(range.startKey);
  if (!start) return "";

  if (range.type === "month") {
    return start.toLocaleDateString(locale, {
      month: "long", year: "numeric", timeZone: "UTC",
    });
  }

  const dayOpts = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  if (range.type === "day") return start.toLocaleDateString(locale, dayOpts);

  const end = keyToUtcDate(range.endKey);
  if (!end) return "";
  try {
    const formatter = new Intl.DateTimeFormat(locale, dayOpts);
    if (typeof formatter.formatRange === "function") {
      return formatter.formatRange(start, end);
    }
  } catch {
    /* fall through to the plain form */
  }
  return (
    start.toLocaleDateString(locale, dayOpts) +
    " – " +
    end.toLocaleDateString(locale, dayOpts)
  );
}

/**
 * A short label for one business-day key, for the week and month chart axes.
 *
 *   week   "Sun", "Mon" …
 *   month  "1", "2" … (the bare day number; a month axis of 31 dates is a
 *          wall of text, and the tick spacing is the chart's business)
 */
export function formatDayKeyLabel(key, type, language) {
  const date = keyToUtcDate(key);
  if (!date) return "";
  if (type === "month") return String(date.getUTCDate());
  return date.toLocaleDateString(dateLocale(language), { weekday: "short", timeZone: "UTC" });
}
