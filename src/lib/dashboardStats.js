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
import { getBusinessDayKey, isSameBusinessDay } from "./businessDay.js";

/** Order statuses that mean "still in flight". Mirrors the kitchen board. */
export const ACTIVE_STATUSES = ["received", "preparing", "ready"];

/** Every status the lifecycle can produce, in board order. No new ones. */
export const ALL_STATUSES = ["received", "preparing", "ready", "delivered", "canceled"];

/**
 * Does this moment fall in the restaurant's CURRENT trading day?
 *
 * ── Phase 110.2 — why this changed ───────────────────────────────────────
 * This compared device-local calendar dates: getFullYear/getMonth/getDate on
 * the browser's own clock. Two consequences, both wrong for a venue:
 *
 *   1. A laptop in another timezone reported a different "today" than the
 *      restaurant was actually trading, so Orders Today and Revenue Today
 *      could include or omit orders depending on where the manager sat.
 *   2. Midnight split a live shift. A venue serving until 02:00 saw its
 *      takings cut in half at 00:00 — the figures reset in the middle of
 *      service, which is exactly when they are being watched.
 *
 * It also disagreed with the hourly chart in this very file:
 * summarizeRevenueByHour already buckets by getOrderHourInZone, i.e. the
 * RESTAURANT's clock. So one card could be built from two different days.
 *
 * The rule is not invented here. businessDay.js already defines it (Phase
 * 96) and Kitchen's Recently Canceled already uses it: the trading day runs
 * from 04:00 restaurant-local, with the configured timezone falling back to
 * Asia/Amman. This simply applies the same definition to the Overview.
 *
 * `timeZone` is optional so existing callers keep working; without it the
 * old device-local comparison is used, which is what any caller that has no
 * restaurant context should get rather than a silent Asia/Amman assumption.
 */
export function isSameDay(iso, reference = new Date(), timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  if (timeZone) return isSameBusinessDay(timeZone, date, reference);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

/**
 * Today's slice of an order list, in the restaurant's business day when a
 * timezone is supplied.
 */
export function filterToday(orders, reference = new Date(), timeZone) {
  return (orders || []).filter((o) => isSameDay(o.createdAt, reference, timeZone));
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

/* ═══════════════════════════════════════════════════════════════════════
   Phase 111.0 — the selected-period analytics

   Four more readers over an ALREADY-SCOPED list, written to the same rule
   the three above follow: a canceled order contributes nothing to money or
   to items sold. That is what lets every figure in Revenue Analytics —
   headline, chart, payments, top items, peak times and the breakdown —
   come from one filtered list and stay incapable of disagreeing.

   None of these knows what a period IS. revenuePeriods.js decides which
   orders are in scope; these only summarise whatever they are handed, which
   is why DAY, WEEK and MONTH need no separate code paths here.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The best-selling products in a scoped list.
 *
 * ── WHAT A LINE CONTRIBUTES ─────────────────────────────────────────────
 *   qty     line.quantity
 *   revenue line.lineTotal — unitPrice × quantity, where unitPrice is the
 *           base price plus every selected choice and paid add-on. That is
 *           the product's own line arithmetic (customerCart.js), so an item
 *           sold with extras is credited with what the guest actually paid
 *           for it rather than with its menu price.
 *
 *   This is LINE revenue, so the five rows sum to item takings and not to
 *   the section's Total Revenue: the service charge is an order-level
 *   amount and belongs to no single dish. The column is labelled Revenue
 *   against the items it describes, and nothing claims the two reconcile.
 *
 * ── IDENTITY ────────────────────────────────────────────────────────────
 *   Grouped by itemId, the stable product id, so two orders of the same
 *   dish with different customizations are one row. The displayed name is
 *   the line's own resolved snapshot (Phase 97.7 §23) — the same string
 *   Kitchen, Live Orders and the receipt show.
 *
 * ── ORDERING ────────────────────────────────────────────────────────────
 *   Quantity first, as §15 asks. Ties break on revenue, then on name, so
 *   the list is fully deterministic: two dishes that sold 12 each never
 *   swap places between two four-second polls.
 *
 * @param {Array<object>} orders — already scoped
 * @param {number} [limit]
 * @returns {Array<{itemId:string, name:string, qty:number, revenue:number}>}
 */
export function summarizeTopItems(orders, limit = 5) {
  const byItem = new Map();

  for (const order of orders || []) {
    if (order.status === "canceled") continue;
    for (const line of order.items || []) {
      const itemId = line?.itemId || line?.id;
      if (!itemId) continue;
      const qty = Number(line.quantity) || 0;
      const revenue = Number(line.lineTotal) || 0;
      const existing = byItem.get(itemId);
      if (existing) {
        existing.qty += qty;
        existing.revenue += revenue;
      } else {
        byItem.set(itemId, {
          itemId,
          name: typeof line.name === "string" ? line.name : itemId,
          qty,
          revenue,
        });
      }
    }
  }

  return [...byItem.values()]
    .map((row) => ({ ...row, revenue: round3(row.revenue) }))
    .filter((row) => row.qty > 0)
    .sort((a, b) =>
      b.qty - a.qty ||
      b.revenue - a.revenue ||
      a.name.localeCompare(b.name)
    )
    .slice(0, limit);
}

/**
 * The busiest hours in a scoped list, by ORDER COUNT.
 *
 * Counting orders, not money: "when is the kitchen under pressure" is a
 * different question from "when did we take the most", and the chart above
 * already answers the second one. An hour of many small orders is the one
 * that needs staff.
 *
 * Hours come from getOrderHourInZone — the restaurant's clock, never the
 * viewer's — so this stays truthful for a manager checking in from abroad.
 * An order whose timestamp cannot be placed is skipped rather than being
 * booked into hour 0.
 *
 * Ties break on the earlier hour, so the list is deterministic.
 *
 * @param {Array<object>} orders — already scoped
 * @param {string} timeZone
 * @param {number} [limit]
 * @returns {Array<{hour:number, orders:number}>}
 */
export function summarizePeakTimes(orders, timeZone, limit = 3) {
  const counts = new Array(HOURS_IN_DAY).fill(0);

  for (const order of orders || []) {
    if (order.status === "canceled") continue;
    const hour = getOrderHourInZone(order.createdAt, timeZone);
    if (hour === null) continue;
    counts[hour] += 1;
  }

  return counts
    .map((count, hour) => ({ hour, orders: count }))
    .filter((row) => row.orders > 0)
    .sort((a, b) => b.orders - a.orders || a.hour - b.hour)
    .slice(0, limit);
}

/**
 * Revenue per business day, for the WEEK and MONTH charts.
 *
 * The day axis is supplied by the caller (revenuePeriods.listRangeKeys), not
 * derived from the data, for the reason the hourly chart fixes 24 buckets: a
 * quiet Tuesday is information, and an axis that grew and shrank with the
 * first and last order would move the same bar between two refreshes.
 *
 * Shares summarizeRevenueByHour's guarantee — canceled excluded, everything
 * else contributes its order total — so sum(buckets) === the headline total
 * for the same list.
 *
 * @param {Array<object>} orders — already scoped
 * @param {string} timeZone
 * @param {Array<string>} dayKeys — business-day keys, in order
 * @returns {{buckets:Array<{key:string,total:number,orders:number}>,
 *            total:number, peak:number, peakKey:string|null, unplaced:number}}
 */
export function summarizeRevenueByDayKey(orders, timeZone, dayKeys) {
  const index = new Map();
  const buckets = (dayKeys || []).map((key) => {
    const bucket = { key, total: 0, orders: 0 };
    index.set(key, bucket);
    return bucket;
  });

  let total = 0;
  let unplaced = 0;

  for (const order of orders || []) {
    if (order.status === "canceled") continue;
    const amount = Number(order.total) || 0;
    total += amount;

    const key = getBusinessDayKey(timeZone, order.createdAt);
    const bucket = key ? index.get(key) : null;
    if (!bucket) {
      /* In practice unreachable: the caller filtered this list by the same
         key. Reported rather than dropped, exactly as the hourly chart does,
         so a chart can never quietly sum to less than its own headline. */
      unplaced += amount;
      continue;
    }
    bucket.total += amount;
    bucket.orders += 1;
  }

  let peak = 0;
  let peakKey = null;
  for (const bucket of buckets) {
    bucket.total = round3(bucket.total);
    if (bucket.total > peak) {
      peak = bucket.total;
      peakKey = bucket.key;
    }
  }

  return { buckets, total: round3(total), peak, peakKey, unplaced: round3(unplaced) };
}

/**
 * Orders and revenue per status, for the breakdown's Order Breakdown.
 *
 * Statuses are ALL_STATUSES — the product's own list, in its own order. No
 * status is invented and none is merged.
 *
 * Canceled carries `revenue: null`, not 0. Zero would be a claim that those
 * orders earned nothing; null says they are not counted as revenue at all,
 * which is the actual rule, and lets the row print a dash instead of a
 * figure that invites the question "why is it zero".
 *
 * @param {Array<object>} orders — already scoped
 * @returns {Array<{status:string, orders:number, revenue:number|null}>}
 */
export function summarizeStatusRevenue(orders) {
  const rows = new Map(
    ALL_STATUSES.map((status) => [status, { status, orders: 0, revenue: 0 }])
  );

  for (const order of orders || []) {
    const row = rows.get(order.status);
    if (!row) continue;
    row.orders += 1;
    if (order.status !== "canceled") row.revenue += Number(order.total) || 0;
  }

  return ALL_STATUSES.map((status) => {
    const row = rows.get(status);
    return {
      status,
      orders: row.orders,
      revenue: status === "canceled" ? null : round3(row.revenue),
    };
  });
}

/**
 * The payment picture as a whole: what was collected, by method, PLUS what
 * is still owed at the table — Phase 111.1.
 *
 * ── WHY THIS IS NOT revenueMethodShares ─────────────────────────────────
 * revenueMethodShares answers "of the money we have taken, how was it
 * taken?", and shares against COLLECTED for that reason. It stays exactly
 * as it is, because the Payment Breakdown table is explicitly a breakdown
 * of collected revenue and relabelling it would change what a figure a
 * manager has been reading for several phases means.
 *
 * This answers a different question — "where does the period's whole total
 * stand?" — so it shares against TOTAL and adds the outstanding slice. The
 * two cannot disagree, because both read the same summarizeRevenue output.
 *
 * ── WHY PENDING IS ONE SLICE AND NOT TWO ────────────────────────────────
 * An unpaid order does carry a chosen method: the guest picks Cash or Card
 * at checkout and the order is written with paymentStatus
 * "pending_at_table" (customerOrders.js). Splitting the outstanding amount
 * by that intention would print "Cash" twice with two different meanings —
 * money in the till and money someone intends to hand over — which is
 * exactly the mislabelling to avoid. What is true of all of it is that it
 * is pending at the table, which is also the name the data itself uses.
 *
 * ── THE ARITHMETIC ──────────────────────────────────────────────────────
 * collected(by method) + pending === total, guaranteed by summarizeRevenue
 * putting every non-canceled order in exactly one bucket, so the shares sum
 * to 1 without being normalised. Zero total yields share 0 everywhere
 * rather than a division by zero.
 *
 * @param {object} revenue — summarizeRevenue() output
 * @returns {Array<{id:string, kind:"collected"|"pending", amount:number,
 *                  count:number, share:number}>}
 */
export function revenueDistribution(revenue) {
  const total = Number(revenue?.total) || 0;
  const shareOf = (amount) => (total > 0 ? (Number(amount) || 0) / total : 0);

  const rows = (revenue?.byMethod || []).map((method) => ({
    id: method.id,
    kind: "collected",
    amount: method.amount,
    count: method.count,
    share: shareOf(method.amount),
  }));

  /* Always present, even at zero: an enabled method with no takings is
     shown as zero for the same reason — silence and zero are different
     facts, and a period with nothing outstanding is worth stating. */
  rows.push({
    id: "pending_at_table",
    kind: "pending",
    amount: Number(revenue?.pending) || 0,
    count: Number(revenue?.pendingCount) || 0,
    share: shareOf(revenue?.pending),
  });

  return withWholePercents(rows);
}

/**
 * Integer percentages that add up to 100.
 *
 * Rounding each share on its own is what produces 40% + 26% + 35% = 101%,
 * and a financial chart whose legend does not add up invites the reader to
 * distrust the figures beside it. Largest remainder: floor everything, then
 * hand the leftover points to the rows that were rounded down hardest.
 *
 * `share` is left untouched — the ring is drawn from the exact fraction, so
 * the arcs stay true while only the printed labels are reconciled.
 */
function withWholePercents(rows) {
  const exact = rows.map((row) => (Number(row.share) || 0) * 100);
  const sum = exact.reduce((a, b) => a + b, 0);
  /* Nothing to distribute: an empty period shows a dash, not 0%. */
  if (sum <= 0) return rows.map((row) => ({ ...row, percent: 0 }));

  const floors = exact.map((value) => Math.floor(value));
  let remaining = Math.round(sum) - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, i) => ({ i, remainder: value - floors[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);

  const percents = [...floors];
  for (let k = 0; k < order.length && remaining > 0; k += 1) {
    percents[order[k].i] += 1;
    remaining -= 1;
  }
  return rows.map((row, i) => ({ ...row, percent: percents[i] }));
}
