/**
 * orderTimer — Phase 88 (§7, §10, §11, §12).
 *
 * Decides what the Main Timer should be doing, and nothing else. Kept out of
 * the components because three of them ask the same question (the timer, the
 * status sentence and Confirmation's compact summary) and they must never
 * disagree about whether an order is still cooking.
 *
 * ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ─────────────────────────────
 *   The timer is an ESTIMATE, not a status. §7 and §10 both say so from
 *   different directions: reaching zero must not mean Ready, and Ready must
 *   not be inferred from the clock. So `mode` here is derived from the real
 *   order status FIRST and from the arithmetic second — a countdown can only
 *   ever be running for an order the kitchen still has.
 *
 *   That is why OVERDUE exists as its own mode rather than being "ACTIVE with
 *   a negative number". An estimate that has run out is a thing to say calmly
 *   ("Taking a little longer"), not an error and not a status change.
 *
 * ── WHY IT READS order.createdAt AND order.estimatedPrepMinutes ──────────
 *   Both are frozen on the order at checkout (Phase 26). Nothing here reads
 *   live settings, so changing the restaurant's prep time does not silently
 *   re-time an order that is already in the kitchen, and a historical order
 *   shows the promise that was actually made to that guest.
 */

export const TIMER_MODE = {
  /** Counting down: the kitchen still has it and the estimate has time left. */
  ACTIVE: "active",
  /** The estimate has elapsed but the order is genuinely still not ready. */
  OVERDUE: "overdue",
  /** Ready or Delivered — the countdown is over, whatever the clock says. */
  SETTLED: "settled",
  /** Nothing to show: canceled, or an order carrying no estimate at all. */
  NONE: "none",
};

const IN_KITCHEN = ["received", "preparing"];

/**
 * @param {object|null} order
 * @param {number} [now] — epoch ms; injectable so this is testable and so a
 *   caller can render several rows against one consistent instant.
 * @returns {{mode: string, remainingMs?: number, remainingMinutes?: number, endsAt?: number}}
 */
export function getTimerState(order, now = Date.now()) {
  if (!order) return { mode: TIMER_MODE.NONE };

  /* Status is asked FIRST, deliberately. A delivered order whose estimate
     still has four minutes on it is not counting down, and a canceled one has
     no timer at all — neither case should reach the arithmetic below. */
  if (order.status === "canceled") return { mode: TIMER_MODE.NONE };
  if (!IN_KITCHEN.includes(order.status)) return { mode: TIMER_MODE.SETTLED };

  const minutes = order.estimatedPrepMinutes;
  /* Orders placed before Phase 26 carry no estimate. Nothing is invented for
     them — they simply have no timer, exactly as on every other surface. */
  if (!Number.isInteger(minutes) || minutes <= 0) return { mode: TIMER_MODE.NONE };

  const started = Date.parse(order.createdAt);
  if (!Number.isFinite(started)) return { mode: TIMER_MODE.NONE };

  const endsAt = started + minutes * 60000;
  const remainingMs = endsAt - now;

  if (remainingMs <= 0) {
    return { mode: TIMER_MODE.OVERDUE, remainingMs: 0, remainingMinutes: 0, endsAt };
  }

  return {
    mode: TIMER_MODE.ACTIVE,
    remainingMs,
    /* Phase 88.2 §10 — the display is a real MM:SS countdown now, so what the
       timer needs is whole SECONDS. Rounded up for the same reason the minute
       figure was: the guest should see 00:01 for the whole final second, not
       00:00 while food is still coming. */
    remainingSeconds: Math.ceil(remainingMs / 1000),
    remainingMinutes: Math.ceil(remainingMs / 60000),
    endsAt,
  };
}

/**
 * Phase 88.2 §10 — MM:SS for display.
 *
 * Takes seconds rather than a timestamp on purpose: every caller has already
 * derived the remainder from the order's own timestamps through
 * getTimerState(), and passing the derived value keeps this a pure formatter
 * with nothing of its own to get out of step.
 *
 * Minutes are NOT clamped to two digits — an estimate over an hour renders as
 * "72:30" rather than silently wrapping to "12:30". That is a promise made to
 * a guest; it should never quietly become a smaller number.
 */
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
