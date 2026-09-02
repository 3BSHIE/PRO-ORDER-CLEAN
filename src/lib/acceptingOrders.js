/**
 * acceptingOrders — Phase 79. The single source of truth for whether a
 * restaurant is taking NEW orders right now.
 *
 * Nothing here reads or writes storage. Callers pass the mode plus the
 * restaurant's settings, so the Admin card, the customer menu, the cart's
 * checkout button and the order-creation gate all reach the same verdict
 * from the same function. That is the whole point of this module: the rule
 * is stated once, and four surfaces that must never disagree cannot.
 *
 * ── THREE MODES, NOT A BOOLEAN ──────────────────────────────────────────
 *   auto    follow the configured Working Hours
 *   open    manual override — accept orders even outside those hours
 *   closed  manual override — stop new orders even during those hours
 *
 * A boolean could not distinguish "closed because it is 3am" from "closed
 * because the manager closed us", and those are different facts: the first
 * ends by itself, the second does not. The override never edits the
 * schedule, and the schedule never edits the override — returning to auto
 * hands control straight back to the hours already stored.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────
 *   Not Busy Mode. Busy Mode means "open, but food takes longer" and only
 *   ever moves the prep-time estimate. This means "not taking new orders at
 *   all". Neither reads the other, in either direction — a busy restaurant
 *   is still open, and a closed one is still closed however fast its kitchen
 *   happens to be.
 *
 *   Not table validity, not category availability, not product availability.
 *   Those answer "can this guest order THIS", from a QR token, a category
 *   flag or a product flag. This answers "is the venue taking orders at
 *   all", and it is checked after access is already established.
 *
 * ── FAIL-OPEN ──────────────────────────────────────────────────────────
 *   Missing or unparseable Working Hours in auto mode result in orders being
 *   ACCEPTED, never blocked — the same principle categoryVisibility.js
 *   applies to schedules, for the same reason. Silently refusing a paying
 *   guest because a time field is malformed is far worse than briefly taking
 *   an order a few minutes outside hours, and a restaurant that never opened
 *   Settings must not be dark by default.
 */

import {
  FALLBACK_TIME_ZONE,
  parseTimeToMinutes,
  getCurrentMinutesInTimeZone,
  isWithinWindow,
} from "./categoryVisibility.js";

/* Re-exported so consumers of this module never need to reach into
   categoryVisibility.js for the restaurant clock's default. */
export { FALLBACK_TIME_ZONE };

export const ACCEPTING_ORDERS_MODES = ["auto", "open", "closed"];

/** Phase 79 §28 — existing restaurants have no stored mode and adopt this. */
export const DEFAULT_ACCEPTING_ORDERS_MODE = "auto";

/* Index-aligned with Date.prototype.getDay() and with the day keys the
   Working Hours editor already writes into settings.workingHours.closedDays
   (see the DAYS list in AdminSettingsScreen.jsx). Reused rather than
   redefined so the two can never drift. */
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Fold any stored/user value into a mode this module understands.
 * @param {unknown} raw
 * @returns {"auto"|"open"|"closed"}
 */
export function normalizeAcceptingOrdersMode(raw) {
  return ACCEPTING_ORDERS_MODES.includes(raw) ? raw : DEFAULT_ACCEPTING_ORDERS_MODE;
}

/**
 * Which weekday it is *in the restaurant's timezone*, not the viewer's.
 *
 * The sibling of getCurrentMinutesInTimeZone(): same Intl mechanism, same
 * degradation to the device clock when an IANA name is unusable, so the
 * hour and the day can never come from two different clocks.
 *
 * @param {string} timeZone — IANA name, e.g. "Asia/Amman"
 * @param {Date} [now]
 * @returns {"sun"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat"}
 */
export function getWeekdayKeyInTimeZone(timeZone, now = new Date()) {
  try {
    if (timeZone) {
      const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
        .format(now)
        .toLowerCase();
      if (WEEKDAY_KEYS.includes(label)) return label;
    }
  } catch {
    // Unknown/unsupported timezone — fall through to the device clock.
  }
  return WEEKDAY_KEYS[now.getDay()];
}

/** The previous day's key — used to attribute an overnight tail correctly. */
function previousWeekdayKey(key) {
  const index = WEEKDAY_KEYS.indexOf(key);
  return WEEKDAY_KEYS[(index + 6) % 7];
}

/**
 * Evaluate the configured Working Hours against the restaurant clock.
 *
 * ── OVERNIGHT WINDOWS ───────────────────────────────────────────────────
 *   The stored model is two "HH:MM" strings plus a list of closed days, and
 *   it already permits a close time earlier than the open time. isWithinWindow
 *   (Phase 28) reads that as a window wrapping past midnight, so 18:00 → 02:00
 *   genuinely means "open from six in the evening until two the next
 *   morning" rather than "invalid" or "always closed". No second scheduling
 *   model was introduced — the existing daily window is simply read
 *   truthfully.
 *
 *   The one subtlety an overnight window forces is which DAY the early hours
 *   belong to. At 01:00 on Saturday a 18:00 → 02:00 restaurant is still
 *   working Friday night's service, so Friday's closed-day flag is the one
 *   that governs — checking Saturday's would close a venue that is mid-shift
 *   and open one that is meant to be dark. The "service day" below is that
 *   attribution, and it is six lines rather than a scheduler.
 *
 * ── 24-HOUR WINDOWS ─────────────────────────────────────────────────────
 *   openTime === closeTime is treated as always open, matching how Phase 28
 *   already reads a zero-length category window. A restaurant that sets both
 *   to the same value plainly means "round the clock", never "never".
 *
 * @param {{openTime?: string, closeTime?: string, closedDays?: string[]}} workingHours
 * @param {{timeZone?: string, now?: Date}} [context]
 * @returns {{open: boolean, reason: "ok"|"closed_day"|"outside_hours"|"invalid",
 *            openTime: string|null, closeTime: string|null,
 *            overnight: boolean, alwaysOpen: boolean, serviceDay: string}}
 */
export function getWorkingHoursState(workingHours, { timeZone, now } = {}) {
  const zone = timeZone || FALLBACK_TIME_ZONE;
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  const openTime = (workingHours?.openTime || "").trim();
  const closeTime = (workingHours?.closeTime || "").trim();
  const fromMinutes = parseTimeToMinutes(openTime);
  const untilMinutes = parseTimeToMinutes(closeTime);

  const todayKey = getWeekdayKeyInTimeZone(zone, at);

  /* Half-configured or malformed hours: fail open, and say so, so the Admin
     card can show the manager that auto mode currently has nothing usable to
     follow rather than leaving them guessing. */
  if (fromMinutes === null || untilMinutes === null) {
    return {
      open: true,
      reason: "invalid",
      openTime: null,
      closeTime: null,
      overnight: false,
      alwaysOpen: false,
      serviceDay: todayKey,
    };
  }

  const nowMinutes = getCurrentMinutesInTimeZone(zone, at);
  const overnight = untilMinutes < fromMinutes;
  /* Reported rather than left for callers to re-derive: the Admin card prints
     "Open 24 hours" instead of a meaningless "00:00–00:00" range. */
  const alwaysOpen = untilMinutes === fromMinutes;

  /* Which day's schedule is currently in force. Only an overnight window can
     put "now" on a different service day from the calendar day, and only
     while now is inside the tail that ran past midnight. */
  const inOvernightTail = overnight && nowMinutes < untilMinutes;
  const serviceDay = inOvernightTail ? previousWeekdayKey(todayKey) : todayKey;

  const closedDays = Array.isArray(workingHours?.closedDays) ? workingHours.closedDays : [];
  if (closedDays.includes(serviceDay)) {
    return {
      open: false, reason: "closed_day",
      openTime, closeTime, overnight, alwaysOpen, serviceDay,
    };
  }

  const within = isWithinWindow(nowMinutes, fromMinutes, untilMinutes);
  return {
    open: within,
    reason: within ? "ok" : "outside_hours",
    openTime,
    closeTime,
    overnight,
    alwaysOpen,
    serviceDay,
  };
}

/**
 * THE verdict. Everything that needs to know whether a new order may be
 * created calls this and nothing else.
 *
 * @param {"auto"|"open"|"closed"} mode
 * @param {object} settings — restaurant settings (workingHours, timeZone)
 * @param {{now?: Date}} [context]
 * @returns {{
 *   mode: "auto"|"open"|"closed",
 *   accepting: boolean,
 *   reason: "forced_open"|"forced_closed"|"within_hours"|"outside_hours"
 *          |"closed_day"|"invalid_schedule",
 *   timeZone: string,
 *   workingHours: ReturnType<typeof getWorkingHoursState>
 * }}
 */
export function getAcceptingOrdersState(mode, settings, { now } = {}) {
  const normalized = normalizeAcceptingOrdersMode(mode);
  const timeZone = settings?.timeZone || FALLBACK_TIME_ZONE;

  /* Evaluated in every mode, not only auto. The Admin card shows the manager
     what the schedule WOULD say while an override is in force — which is the
     information that tells them whether returning to auto reopens the
     restaurant or leaves it closed. It has no effect on the verdict below. */
  const workingHours = getWorkingHoursState(settings?.workingHours, { timeZone, now });

  if (normalized === "open") {
    return { mode: normalized, accepting: true, reason: "forced_open", timeZone, workingHours };
  }
  if (normalized === "closed") {
    return { mode: normalized, accepting: false, reason: "forced_closed", timeZone, workingHours };
  }

  /* auto — the schedule decides. The three reasons are kept distinct rather
     than collapsed into one "closed", because "we are shut on Mondays" and
     "we open at ten" are different sentences to put in front of a manager. */
  if (workingHours.reason === "invalid") {
    return { mode: normalized, accepting: true, reason: "invalid_schedule", timeZone, workingHours };
  }
  return {
    mode: normalized,
    accepting: workingHours.open,
    reason: workingHours.open ? "within_hours" : workingHours.reason,
    timeZone,
    workingHours,
  };
}
