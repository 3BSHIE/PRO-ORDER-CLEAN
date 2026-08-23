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
