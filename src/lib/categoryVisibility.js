/**
 * categoryVisibility — Phase 28. Pure functions deciding whether a category
 * should be shown to a customer right now.
 *
 * Nothing here reads or writes storage: callers pass the category plus the
 * restaurant's timezone, so the same logic serves the customer menu, the
 * Admin category list, and the Cashier's operational card without any of
 * them disagreeing about the rule.
 *
 * Two independent manual flags, deliberately kept separate:
 *
 *   isActive   — CATALOG state. Owned by Category Management (Admin-only,
 *                three-layer guarded since Phase 21). "Is this category part
 *                of the menu at all?"
 *   isVisible  — OPERATIONAL state, added this phase. Owned jointly by Admin
 *                and Cashier. "Is this category being served right now?"
 *                (the everyday 86'd-for-today switch)
 *
 * They are not merged because the phase requires a Cashier toggle that does
 * NOT hand Cashier a Category Management field. Writing isActive from an
 * operational screen would do exactly that; a separate field keeps the
 * Admin-only catalog boundary intact.
 *
 * Schedule is a third, independent axis: it never mutates isVisible. A
 * category outside its window is hidden while the clock says so and returns
 * on its own — the stored flags are untouched.
 *
 * Fail-open principle:
 *   An unparseable time, a half-configured schedule, or an unusable timezone
 *   results in the category being SHOWN, never hidden. Accidentally hiding
 *   food a restaurant is actually selling is the worse failure.
 */

/** Restaurant timezone used when Settings has nothing usable. */
export const FALLBACK_TIME_ZONE = "Asia/Amman";

/**
 * "HH:MM" (24-hour) → minutes since midnight, or null if unparseable.
 * @param {string} value
 * @returns {number|null}
 */
export function parseTimeToMinutes(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Minutes since midnight *in the restaurant's timezone*, not the browser's.
 *
 * Uses Intl.DateTimeFormat, which every supported browser ships — no
 * timezone library is pulled in for this. An invalid IANA name makes
 * Intl throw a RangeError, which is caught and degrades to the device clock
 * rather than breaking the menu.
 *
 * @param {string} timeZone — IANA name, e.g. "Asia/Amman"
 * @param {Date} [now]
 * @returns {number}
 */
export function getCurrentMinutesInTimeZone(timeZone, now = new Date()) {
  try {
    if (timeZone) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);

      const hour = Number(parts.find((p) => p.type === "hour")?.value);
      const minute = Number(parts.find((p) => p.type === "minute")?.value);

      if (Number.isInteger(hour) && Number.isInteger(minute)) {
        /* Some engines render midnight as "24" under hour12:false; the
           modulo normalizes that back to 0 rather than yielding 1440. */
        return (hour % 24) * 60 + minute;
      }
    }
  } catch {
    // Unknown/unsupported timezone — fall through to the device clock.
  }
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Is `nowMinutes` inside the window, including windows that wrap past
 * midnight (20:00 → 02:00)?
 *
 * Start is inclusive, end is exclusive: a 07:00→12:00 breakfast is visible
 * at exactly 07:00 and gone at exactly 12:00, which is what "after 12:00 the
 * category disappears" means.
 *
 * A zero-length window (start === end) is treated as always-on rather than
 * never-on — a category that could never appear is certainly not what an
 * admin meant to configure.
 */
export function isWithinWindow(nowMinutes, fromMinutes, untilMinutes) {
  if (fromMinutes === untilMinutes) return true;
  if (fromMinutes < untilMinutes) {
    return nowMinutes >= fromMinutes && nowMinutes < untilMinutes;
  }
  // Wraps midnight: visible from `from` to 23:59, and from 00:00 to `until`.
  return nowMinutes >= fromMinutes || nowMinutes < untilMinutes;
}

/**
 * Full visibility verdict, with the reason — so Admin/Cashier UI can explain
 * *why* something is hidden instead of just showing a dead toggle.
 *
 * Precedence: catalog → manual → schedule.
 *
 * @param {object} category
 * @param {{timeZone?: string, now?: Date}} [context]
 * @returns {{visible: boolean, reason: "ok"|"inactive"|"manual"|"schedule", scheduled: boolean}}
 */
export function getCategoryVisibilityState(category, { timeZone, now } = {}) {
  const scheduled = category?.visibilityMode === "scheduled";

  if (!category) return { visible: false, reason: "inactive", scheduled: false };

  // Catalog switch (Admin-only, pre-existing).
  if (category.isActive === false) {
    return { visible: false, reason: "inactive", scheduled };
  }

  // Operational switch (Admin + Cashier, this phase). Undefined on categories
  // created before Phase 28, which must keep behaving as visible.
  if (category.isVisible === false) {
    return { visible: false, reason: "manual", scheduled };
  }

  if (!scheduled) return { visible: true, reason: "ok", scheduled };

  const fromMinutes = parseTimeToMinutes(category.visibleFrom);
  const untilMinutes = parseTimeToMinutes(category.visibleUntil);

  // Half-configured or malformed schedule — fail open.
  if (fromMinutes === null || untilMinutes === null) {
    return { visible: true, reason: "ok", scheduled };
  }

  const nowMinutes = getCurrentMinutesInTimeZone(timeZone || FALLBACK_TIME_ZONE, now);
  const withinWindow = isWithinWindow(nowMinutes, fromMinutes, untilMinutes);

  return {
    visible: withinWindow,
    reason: withinWindow ? "ok" : "schedule",
    scheduled,
  };
}

/**
 * Convenience boolean for the customer menu.
 * @param {object} category
 * @param {{timeZone?: string, now?: Date}} [context]
 * @returns {boolean}
 */
export function isCategoryVisibleNow(category, context) {
  return getCategoryVisibilityState(category, context).visible;
}

/** "07:00 → 12:00", or "" when no usable schedule is configured. */
export function formatSchedule(category) {
  if (category?.visibilityMode !== "scheduled") return "";
  const from = (category.visibleFrom || "").trim();
  const until = (category.visibleUntil || "").trim();
  if (!from || !until) return "";
  return `${from} → ${until}`;
}
