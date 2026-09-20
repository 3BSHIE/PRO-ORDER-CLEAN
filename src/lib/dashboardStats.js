/**
 * dashboardStats — Phase 30. The ONE place Overview numbers are computed.
 *
 * Every figure on the dashboard — the summary cards and the drill-down
 * breakdowns behind them — comes from these functions. That is the point:
 * before this phase the card values were computed inline in
 * AdminDashboardScreen, and adding a second (modal) consumer would have meant
 * two copies of the same arithmetic that could quietly disagree. A card and
 * its breakdown are now guaranteed to add up because they are literally the
 * same computation.
 *
 * Pure functions only — no storage access, no React. Callers pass an
 * already-restaurant-scoped order array.
 *
 * ── Time scope (unchanged from Phase 24, deliberately) ────────────────────
 *   The existing Overview mixes two scopes, and this phase preserves it
 *   rather than silently changing approved numbers:
 *     • "Orders Today" / "Revenue Today"  → today only
 *     • every status count (Waiting Prep, Preparing, Ready to Serve,
 *       Completed, Canceled, Active Orders) → ALL stored orders
 *   Each drill-down therefore states its own scope, and always matches the
 *   scope of the card that opened it.
 *
 * ── Revenue rule (see summarizeRevenue) ───────────────────────────────────
 *   Documented in full on that function. Short version: canceled orders are
 *   excluded outright; everything else lands in exactly one of Collected or
 *   Pending, so nothing is double-counted and nothing unpaid is presented as
 *   money taken.
 */

import { PAYMENT_METHODS } from "../data/paymentMethods.js";
import { getRestaurantClockParts } from "./categoryVisibility.js";

/** Order statuses that mean "still in flight". Mirrors the kitchen board. */
export const ACTIVE_STATUSES = ["received", "preparing", "ready"];

/** Every status the lifecycle can produce, in board order. No new ones. */
export const ALL_STATUSES = ["received", "preparing", "ready", "delivered", "canceled"];

/**
 * Same calendar day as `reference`, in the device's local time — identical
 * to the comparison the Overview has used since Phase 18.
 */
export function isSameDay(iso, reference = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

/** Today's slice of an order list. */
export function filterToday(orders, reference = new Date()) {
  return (orders || []).filter((o) => isSameDay(o.createdAt, reference));
}

/**
 * Revenue breakdown for a scoped order list.
 *
 * THE RULE, stated exactly:
 *   1. Canceled orders are excluded entirely, whatever their paymentStatus.
 *      (An order can be marked paid and cancelled afterwards — the app
 *      allows that — and the Overview has always excluded canceled orders
 *      from revenue. Treating such an order as refunded is the safer read,
 *      and keeps this function agreeing with the existing card.)
 *   2. Every remaining order contributes its `total` to exactly ONE bucket,
 *      chosen by paymentStatus:
 *        "paid"             → collected (and to its payment method's row)
 *        "pending_at_table" → pending
 *      paymentStatus only ever holds those two values (see customerOrders.js),
 *      so collected + pending === total, always. One bucket per order is what
 *      makes double-counting structurally impossible.
 *   3. `total` therefore equals the existing "Revenue Today" card, which sums
 *      non-canceled orders regardless of payment. The card is unchanged; the
 *      breakdown is what makes clear how much of it is actually in hand.
 *
 * Method rows: driven by paymentMethods.js so names and order stay consistent
 * with the rest of the app. A method that is functionally disabled (Online
 * Payment) is listed only when real records exist for it.
 *
 * @param {Array<object>} orders — already scoped (e.g. today's orders)
 * @returns {{total:number, collected:number, pending:number,
 *            paidCount:number, pendingCount:number, canceledCount:number,
 *            countedOrders:number, byMethod:Array<{id:string,amount:number,count:number}>}}
 */
export function summarizeRevenue(orders) {
  const list = orders || [];

  const methodTotals = {};
  let total = 0;
  let collected = 0;
  let pending = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let canceledCount = 0;
  let countedOrders = 0;

  for (const order of list) {
    if (order.status === "canceled") {
      canceledCount += 1;
      continue; // rule 1
    }

    const amount = Number(order.total) || 0;
    total += amount;
    countedOrders += 1;

    if (order.paymentStatus === "paid") {
      collected += amount;
      paidCount += 1;

      const methodId = order.paymentMethod?.id || "unknown";
      if (!methodTotals[methodId]) methodTotals[methodId] = { amount: 0, count: 0 };
      methodTotals[methodId].amount += amount;
      methodTotals[methodId].count += 1;
    } else {
      pending += amount;
      pendingCount += 1;
    }
  }

  /* Known methods first, in paymentMethods.js order; a method that is not
     functionally enabled appears only once it has actually been used. Any
     method id found on an order but missing from the catalogue is appended
     so money can never silently vanish from the breakdown. */
  const byMethod = PAYMENT_METHODS.filter(
    (m) => m.enabled || (methodTotals[m.id]?.count || 0) > 0
  ).map((m) => ({
    id: m.id,
    amount: round3(methodTotals[m.id]?.amount || 0),
    count: methodTotals[m.id]?.count || 0,
  }));

  const knownIds = new Set(PAYMENT_METHODS.map((m) => m.id));
  for (const [id, entry] of Object.entries(methodTotals)) {
    if (!knownIds.has(id)) {
      byMethod.push({ id, amount: round3(entry.amount), count: entry.count });
    }
  }

  return {
    total: round3(total),
    collected: round3(collected),
    pending: round3(pending),
    paidCount,
    pendingCount,
    canceledCount,
    countedOrders,
    byMethod,
  };
}

/**
 * Per-status counts for a scoped order list, plus the two roll-ups the
 * Overview already shows.
 *
 * @param {Array<object>} orders — already scoped
 * @returns {{received:number, preparing:number, ready:number,
 *            delivered:number, canceled:number,
 *            active:number, completed:number, total:number}}
 */
export function summarizeOrderStatuses(orders) {
  const list = orders || [];
  const counts = { received: 0, preparing: 0, ready: 0, delivered: 0, canceled: 0 };

  for (const order of list) {
    if (counts[order.status] !== undefined) counts[order.status] += 1;
  }

  return {
    ...counts,
    active: ACTIVE_STATUSES.reduce((sum, s) => sum + counts[s], 0),
    completed: counts.delivered,
    total: list.length,
  };
}

/* Money is stored to 3 decimals (JOD); rounding each aggregate once keeps
   floating-point drift out of the displayed totals. */
function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/* ═══════════════════════════════════════════════════════════════════════
   Phase 100.1 — Revenue Analytics

   Three additive helpers. summarizeRevenue above is UNTOUCHED: these read
   its output or the same order list, so the analytics section and the card
   it grew out of cannot disagree, exactly as the drill-down could not.
   ═══════════════════════════════════════════════════════════════════════ */

export const HOURS_IN_DAY = 24;

/**
 * Which hour (0–23) an ISO timestamp falls in, ON THE RESTAURANT'S CLOCK.
 *
 * Routed through getRestaurantClockParts — the project's one restaurant
 * clock — rather than Date#getHours(), so a manager in another timezone is
 * not shown their own hours against the venue's takings. Returns null for a
 * timestamp the engine cannot place, so the caller can account for the money
 * instead of silently dropping it into hour 0.
 *
 * @param {string} iso
 * @param {string} timeZone — IANA name; falls back to Asia/Amman internally
 * @returns {number|null}
 */
export function getOrderHourInZone(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  /* hourCycle h23 so midnight is 00 and never 24 — h24 would index past the
     end of the bucket array. */
  const parts = getRestaurantClockParts(timeZone, date, {
    hour: "2-digit",
    hourCycle: "h23",
  });
  const raw = parts?.find((part) => part.type === "hour")?.value;
  const hour = Number(raw);
  if (!Number.isFinite(hour)) return null;
  return ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
}

/**
 * Revenue per hour of the restaurant's day, for an already-scoped list.
 *
 * ── WHY 24 FIXED BUCKETS ────────────────────────────────────────────────
 *   The axis never shifts. A window that grew and shrank with the first and
 *   last order would move the same bar to a different place on the screen
 *   between two refreshes, and an empty hour is itself information in a
 *   restaurant — a quiet stretch is worth seeing.
 *
 * ── THE ONE RULE THIS SHARES WITH summarizeRevenue ──────────────────────
 *   Canceled orders are excluded, everything else contributes its total.
 *   That is what makes sum(buckets) === summarizeRevenue(same list).total,
 *   so the chart can never disagree with the figure printed above it.
 *
 *   `unplaced` is the escape hatch for that guarantee: money whose
 *   timestamp could not be resolved to an hour is reported rather than
 *   dropped, so a caller can say so instead of drawing a chart that quietly
 *   sums to less than its own headline. In practice it is always 0, because
 *   filterToday already rejects an unparseable createdAt.
 *
 * @param {Array<object>} orders — already scoped (e.g. today's orders)
 * @param {string} timeZone
 * @returns {{buckets:Array<{hour:number,total:number,collected:number,pending:number,orders:number}>,
 *            total:number, peak:number, peakHour:number|null, unplaced:number}}
 */
export function summarizeRevenueByHour(orders, timeZone) {
  const buckets = Array.from({ length: HOURS_IN_DAY }, (unused, hour) => ({
    hour, total: 0, collected: 0, pending: 0, orders: 0,
  }));
  let unplaced = 0;
  let total = 0;

  for (const order of orders || []) {
    if (order.status === "canceled") continue;
    const amount = Number(order.total) || 0;
    total += amount;

    const hour = getOrderHourInZone(order.createdAt, timeZone);
    if (hour === null) {
      unplaced += amount;
      continue;
    }
    const bucket = buckets[hour];
    bucket.total += amount;
    bucket.orders += 1;
    if (order.paymentStatus === "paid") bucket.collected += amount;
    else bucket.pending += amount;
  }

  let peak = 0;
  let peakHour = null;
  for (const bucket of buckets) {
    bucket.total = round3(bucket.total);
    bucket.collected = round3(bucket.collected);
    bucket.pending = round3(bucket.pending);
    if (bucket.total > peak) {
      peak = bucket.total;
      peakHour = bucket.hour;
    }
  }

  return { buckets, total: round3(total), peak, peakHour, unplaced: round3(unplaced) };
}

/**
 * Average order value for a revenue summary.
 *
 * ── THE DENOMINATOR, STATED EXACTLY ─────────────────────────────────────
 *   countedOrders — the non-canceled orders that contributed to `total`.
 *   Not paidCount: dividing the full total by the paid count would inflate
 *   the average with money the paid orders did not earn. Not the raw list
 *   length either, because canceled orders are not in `total` and would
 *   deflate it. total / countedOrders is the only pairing where numerator
 *   and denominator describe the same set of orders.
 *
 * Returns null rather than NaN or Infinity when nothing has been counted, so
 * the caller renders a dash instead of a broken figure.
 *
 * @param {{total:number, countedOrders:number}} revenue
 * @returns {number|null}
 */
export function averageOrderValue(revenue) {
  const counted = revenue?.countedOrders || 0;
  if (counted <= 0) return null;
  return round3((Number(revenue.total) || 0) / counted);
}

/**
 * Each payment method's share of COLLECTED revenue.
 *
 * Collected is the right denominator because byMethod only accrues on paid
 * orders — sharing against `total` would make Cash and Card add up to less
 * than 100% with no visible reason. Zero collected yields share 0 for every
 * row rather than a division by zero.
 *
 * @param {{collected:number, byMethod:Array<{id:string,amount:number,count:number}>}} revenue
 * @returns {Array<{id:string, amount:number, count:number, share:number}>}
 */
export function revenueMethodShares(revenue) {
  const collected = Number(revenue?.collected) || 0;
  return (revenue?.byMethod || []).map((method) => ({
    ...method,
    share: collected > 0 ? (Number(method.amount) || 0) / collected : 0,
  }));
}
