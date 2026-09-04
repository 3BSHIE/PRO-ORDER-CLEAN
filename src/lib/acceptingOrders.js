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
  getRestaurantClockParts,
  resolveTimeZone,
} from "./categoryVisibility.js";

/* Re-exported so consumers of this module never need to reach into
   categoryVisibility.js for the restaurant clock's default. */
export { FALLBACK_TIME_ZONE };

export const ACCEPTING_ORDERS_MODES = ["auto", "open", "closed"];

/** Phase 79 §28 — existing restaurants have no stored mode and adopt this. */
export const DEFAULT_ACCEPTING_ORDERS_MODE = "auto";

/* The project's one weekday vocabulary. Index-aligned with
   Date.prototype.getDay(), and the same keys the pre-79.1 `closedDays` array
   already used, so the migration in normalizeWorkingHours() needs no
   translation table and no second naming system was introduced. The Settings
   editor imports this list rather than declaring its own. */
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** A day with no usable stored row. 00:00–00:00 means open around the clock. */
const DEFAULT_DAY = { isClosed: false, openTime: "00:00", closeTime: "00:00" };

/**
 * Fold any stored/user value into a mode this module understands.
 * @param {unknown} raw
 * @returns {"auto"|"open"|"closed"}
 */
export function normalizeAcceptingOrdersMode(raw) {
  return ACCEPTING_ORDERS_MODES.includes(raw) ? raw : DEFAULT_ACCEPTING_ORDERS_MODE;
}

/**
 * Which weekday it is *in the restaurant's timezone*, never the viewer's.
 *
 * The sibling of getCurrentMinutesInTimeZone(), and deliberately routed
 * through the same getRestaurantClockParts() chain — configured zone, then
 * Asia/Amman, and no device step at all. Resolving the DAY through one chain
 * and the HOUR through another is precisely how a schedule ends up reading
 * Friday's hours against Saturday's clock.
 *
 * @param {string} timeZone — IANA name, e.g. "Asia/Amman"
 * @param {Date} [now]
 * @returns {"sun"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat"}
 */
export function getWeekdayKeyInTimeZone(timeZone, now = new Date()) {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const parts = getRestaurantClockParts(timeZone, at, { weekday: "short" });
  const label = parts?.find((p) => p.type === "weekday")?.value?.toLowerCase();
  if (WEEKDAY_KEYS.includes(label)) return label;

  /* Unreachable unless the engine cannot format Asia/Amman either. UTC, not
     the device — deterministic and identical for every viewer. */
  return WEEKDAY_KEYS[at.getUTCDay()];
}

/**
 * Fold any stored working-hours value into the canonical seven-day shape.
 *
 * ── WHY THIS IS THE READ LAYER ──────────────────────────────────────────
 *   Called by settingsData.getSettings(), so every consumer in the app — the
 *   Admin card, the Settings editor, the customer menu, the cart, the
 *   order-creation gate — receives the new shape and only the new shape. The
 *   legacy fields are dropped here rather than carried alongside, which is
 *   what makes it impossible for an old openTime and a new mon.openTime to
 *   drift apart as two competing sources of truth.
 *
 * ── MIGRATION ───────────────────────────────────────────────────────────
 *   The pre-79.1 shape was one window plus a list of closed days:
 *     { openTime: "10:00", closeTime: "23:00", closedDays: ["fri"] }
 *   Every day inherits that window, and days named in closedDays become
 *   isClosed. No schedule information is lost: the old model simply could
 *   not express more than this.
 *
 * ── IDEMPOTENT ──────────────────────────────────────────────────────────
 *   Running this on already-migrated data returns the same seven rows. A day
 *   row present in the input always wins over the legacy window, so a
 *   half-migrated object (which the old shallow settings merge could produce)
 *   resolves towards the new shape rather than being dragged back.
 *
 *   Malformed times are PRESERVED rather than repaired. Silently rewriting
 *   "25:00" to a default would hide a real misconfiguration from the manager;
 *   the evaluator reports it as an invalid schedule instead, and only for the
 *   day it actually affects.
 *
 * @param {unknown} raw — a stored workingHours value of either shape
 * @returns {Record<string, {isClosed:boolean, openTime:string, closeTime:string}>}
 */
export function normalizeWorkingHours(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  /* Legacy window, used only for days that have no row of their own. */
  const legacyOpen = typeof source.openTime === "string" ? source.openTime.trim() : "";
  const legacyClose = typeof source.closeTime === "string" ? source.closeTime.trim() : "";
  const legacyClosedDays = Array.isArray(source.closedDays) ? source.closedDays : [];
  const hasLegacy = !!legacyOpen || !!legacyClose || legacyClosedDays.length > 0;

  /* How many genuine day rows the input already carries. This is what
     separates "nothing has ever been configured" from "a seven-day schedule
     with a row missing" — see the absent-row branch below. */
  const dayRowCount = WEEKDAY_KEYS.filter(
    (key) => source[key] && typeof source[key] === "object"
  ).length;

  const result = {};
  for (const key of WEEKDAY_KEYS) {
    const row = source[key];

    if (row && typeof row === "object") {
      result[key] = {
        isClosed: !!row.isClosed,
        openTime: typeof row.openTime === "string" ? row.openTime.trim() : "",
        closeTime: typeof row.closeTime === "string" ? row.closeTime.trim() : "",
      };
      continue;
    }

    if (hasLegacy) {
      result[key] = {
        isClosed: legacyClosedDays.includes(key),
        openTime: legacyOpen || DEFAULT_DAY.openTime,
        closeTime: legacyClose || DEFAULT_DAY.closeTime,
      };
      continue;
    }

    if (dayRowCount > 0) {
      /* A row is missing from an otherwise-populated schedule. That is a
         corrupted record, not a fresh restaurant, so it is left blank for the
         evaluator to report as an invalid schedule (which still accepts
         orders) rather than being invented as a plausible-looking 24-hour
         day. Notably it does NOT inherit a sibling weekday's hours: quietly
         serving Monday's schedule on Tuesday would be a wrong answer
         presented as a confident one. */
      result[key] = { isClosed: false, openTime: "", closeTime: "" };
      continue;
    }

    result[key] = { ...DEFAULT_DAY };
  }

  return result;
}

/** A full seven-day schedule with every day open around the clock. */
export function defaultWorkingHours() {
  return normalizeWorkingHours(null);
}

/** The previous day's key — used to attribute an overnight tail correctly. */
function previousWeekdayKey(key) {
  const index = WEEKDAY_KEYS.indexOf(key);
  return WEEKDAY_KEYS[(index + 6) % 7];
}

/**
 * Read one weekday row into the numbers the evaluator works with.
 *
 * `usable` is false when the row's times cannot be parsed — a blank row from
 * a corrupted schedule, or a manager's typo. The caller decides what that
 * means; this only reports it.
 */
function readDay(row) {
  const openTime = row?.openTime || "";
  const closeTime = row?.closeTime || "";
  const from = parseTimeToMinutes(openTime);
  const until = parseTimeToMinutes(closeTime);

  return {
    isClosed: !!row?.isClosed,
    openTime,
    closeTime,
    from,
    until,
    usable: from !== null && until !== null,
    /* 00:00 → 00:00 means around the clock, never zero hours (§17). A
       restaurant that types the same value twice plainly means "all day", and
       reading it as "never open" would silently shut a venue that believed it
       had just configured itself as 24-hour. */
    alwaysOpen: from !== null && from === until,
    overnight: from !== null && until !== null && until < from,
  };
}

/**
 * Evaluate the seven-day Working Hours against the restaurant clock.
 *
 * ── EACH DAY IS ITS OWN WINDOW (Phase 79.1) ─────────────────────────────
 *   Every weekday carries an independent isClosed / openTime / closeTime, so
 *   Friday can run 18:00 → 02:00 while Sunday is shut and Thursday closes at
 *   17:00, with no manual override involved. There is no longer any shared
 *   weekly window: nothing outside a day's own row can decide that day.
 *
 * ── WHICH DAY IS SERVING RIGHT NOW ──────────────────────────────────────
 *   An overnight window makes "today" and "the day whose shift is running"
 *   two different questions, and only the second one governs. The order of
 *   the two checks below is the whole rule:
 *
 *     1. Is YESTERDAY's shift still running into this morning?
 *        Only an overnight row can be, and only before its closing time.
 *     2. Otherwise TODAY's own row decides.
 *
 *   That ordering is what makes Saturday 01:00 belong to Friday. It also
 *   means today's own overnight row is read as starting at `from` and running
 *   to midnight — its early-morning half was yesterday's business, already
 *   handled by step 1, and counting it twice would open a restaurant at 01:00
 *   on the strength of a shift that has not begun.
 *
 *   Each direction of §26 falls out of this without a special case:
 *     Friday open 18:00–02:00, Saturday closed → Sat 01:00 OPEN  (step 1)
 *                                              → Sat 02:01 closed (step 2)
 *     Friday closed, Saturday open             → Sat 01:00 closed
 *        because step 1 skips a closed Friday, and Saturday's own shift has
 *        not started yet.
 *
 * ── FAIL-OPEN, PER DAY ──────────────────────────────────────────────────
 *   A day whose times will not parse reports `invalid`, which the caller
 *   turns into "accept orders". The blast radius is exactly one day: Tuesday
 *   being malformed cannot affect Wednesday, because Wednesday's verdict
 *   never reads Tuesday's row (§18). A malformed YESTERDAY simply forfeits
 *   step 1 — the tail cannot be computed, so today's own row answers — rather
 *   than making every morning permanently open.
 *
 * @param {object} workingHours — either shape; normalized on the way in
 * @param {{timeZone?: string, now?: Date}} [context]
 * @returns {{open: boolean, reason: "ok"|"closed_day"|"outside_hours"|"invalid",
 *            openTime: string|null, closeTime: string|null,
 *            overnight: boolean, alwaysOpen: boolean,
 *            serviceDay: string, today: string,
 *            overnightFromPreviousDay: boolean,
 *            schedule: object, timeZone: string}}
 */
export function getWorkingHoursState(workingHours, { timeZone, now } = {}) {
  /* The zone actually used, so everything downstream — the clock, the
     weekday and the reported timeZone — agrees on one answer (§8). */
  const zone = resolveTimeZone(timeZone);
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  const schedule = normalizeWorkingHours(workingHours);

  /* Both from getRestaurantClockParts' chain, so the day and the hour are
     always the same restaurant's — never one from Intl and one from the
     device (§8). */
  const today = getWeekdayKeyInTimeZone(zone, at);
  const nowMinutes = getCurrentMinutesInTimeZone(zone, at);

  const base = { today, schedule, timeZone: zone };

  /* ── Step 1: is yesterday's overnight shift still running? ─────────── */
  const yesterdayKey = previousWeekdayKey(today);
  const yesterday = readDay(schedule[yesterdayKey]);

  if (
    !yesterday.isClosed &&
    yesterday.usable &&
    yesterday.overnight &&
    nowMinutes < yesterday.until
  ) {
    return {
      ...base,
      open: true,
      reason: "ok",
      openTime: yesterday.openTime,
      closeTime: yesterday.closeTime,
      overnight: true,
      alwaysOpen: false,
      serviceDay: yesterdayKey,
      overnightFromPreviousDay: true,
    };
  }

  /* ── Step 2: today's own row ───────────────────────────────────────── */
  const current = readDay(schedule[today]);
  const shared = {
    ...base,
    serviceDay: today,
    overnightFromPreviousDay: false,
    overnight: current.overnight,
    alwaysOpen: current.alwaysOpen,
  };

  /* Checked before parsing, because "closed" is a complete answer on its own
     — a day the restaurant is shut does not need usable times, and a manager
     who closes a day should not then be told their schedule is invalid. */
  if (current.isClosed) {
    return {
      ...shared,
      open: false,
      reason: "closed_day",
      openTime: current.openTime,
      closeTime: current.closeTime,
    };
  }

  if (!current.usable) {
    return {
      ...shared,
      open: true,
      reason: "invalid",
      openTime: null,
      closeTime: null,
      overnight: false,
      alwaysOpen: false,
    };
  }

  const within = current.alwaysOpen
    ? true
    : current.overnight
      /* Evening half only — see the comment above about not counting the
         early-morning half twice. */
      ? nowMinutes >= current.from
      : nowMinutes >= current.from && nowMinutes < current.until;

  return {
    ...shared,
    open: within,
    reason: within ? "ok" : "outside_hours",
    openTime: current.openTime,
    closeTime: current.closeTime,
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
  const timeZone = resolveTimeZone(settings?.timeZone);

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
