/**
 * operationalAttention — what needs a person RIGHT NOW, derived from the data
 * the operational screens already keep.
 *
 * Phase 97.8.
 *
 * ── WHY THIS IS A LIB AND NOT DASHBOARD CODE ──────────────────────────────
 * "Delayed" already had a definition, living as a module-local function in
 * AdminLiveOrdersScreen. Overview needs the same verdict, and §8 is explicit
 * that there must not be a second definition — two copies would drift the
 * first time an estimate rule changed, and a ticket would read Delayed on one
 * screen and fine on the other. So the definition MOVED here and Live Orders
 * imports it back; nothing about its behaviour changed.
 *
 * ── THIS IS AN ACTION QUEUE, NOT ANALYTICS ────────────────────────────────
 * Every item answers "someone should do something about this now". Nothing is
 * scored, weighted or ranked; ordering is a fixed list of conditions, oldest
 * first within each. No threshold is invented — a condition is surfaced
 * because the existing model already says it is true, and elapsed time is
 * shown as context rather than used as a gate.
 */

/** The four approved conditions (§7). Stable keys, never shown to a user. */
export const ATTENTION_KIND = {
  DELAYED: "delayed",
  STAFF_CALL: "staffCall",
  READY: "ready",
  PENDING_PAYMENT: "pendingPayment",
};

/* Condition order IS the priority order (§15) — a fixed list, deterministic,
   with no weighting. Delayed first because the kitchen is already behind a
   promise the guest was given; a staff call next because a person is sitting
   there having asked; Ready next because food is going cold; an unpaid
   delivered order last because nobody is waiting on it mid-service. */
const KIND_PRIORITY = [
  ATTENTION_KIND.DELAYED,
  ATTENTION_KIND.STAFF_CALL,
  ATTENTION_KIND.READY,
  ATTENTION_KIND.PENDING_PAYMENT,
];

/* Only an order still in the kitchen can be late. Kept next to isOrderDelayed
   because the two are one rule. */
const IN_KITCHEN_STATUSES = ["received", "preparing"];

/**
 * Whole minutes since an ISO timestamp, or null if it cannot be read.
 * Moved verbatim from AdminLiveOrdersScreen so both screens age things the
 * same way.
 */
export function elapsedMinutes(iso, now = Date.now()) {
  const started = Date.parse(iso);
  if (!Number.isFinite(started)) return null;
  return Math.max(0, Math.floor((now - started) / 60000));
}

/**
 * Is this order past the preparation estimate it was given?
 *
 * Moved from AdminLiveOrdersScreen unchanged. An order with no estimate is
 * never late, because there is nothing to be late against and inventing a
 * threshold would fabricate a promise nobody made.
 *
 * @param {object} order
 * @param {number|null} mins — elapsed minutes since createdAt
 */
export function isOrderDelayed(order, mins) {
  if (mins === null) return false;
  if (!IN_KITCHEN_STATUSES.includes(order.status)) return false;
  const estimate = order.estimatedPrepMinutes;
  if (!Number.isInteger(estimate) || estimate <= 0) return false;
  return mins > estimate;
}

/**
 * When an order first reached a status, from its own history.
 *
 * §12 asks for the Ready timestamp rather than a guess, and statusHistory
 * already records it. Falls back to updatedAt, then createdAt, so an order
 * written before history existed still ages sensibly instead of showing
 * nothing.
 */
function firstReachedAt(order, status) {
  const entry = (order.statusHistory || []).find((h) => h.status === status);
  return entry?.at || order.updatedAt || order.createdAt;
}

/**
 * Build the attention queue.
 *
 * ── WHY ONE ORDER CANNOT PRODUCE TWO ROWS (§14) ───────────────────────────
 * The three order-derived conditions are keyed on mutually exclusive
 * statuses: delayed needs received/preparing, ready needs ready, and an
 * unpaid bill is only actionable once the food is delivered. So the statuses
 * partition them and no order can appear twice — duplicate handling falls out
 * of the conditions rather than needing a de-duplication pass that could hide
 * real urgency. A staff call is a separate entity and stands on its own row,
 * which is correct: the table wants a person, whatever its order is doing.
 *
 * @param {object} params
 * @param {object[]} params.orders       this restaurant's orders
 * @param {object[]} params.staffCalls   open staff calls only
 * @param {number}   [params.now]
 * @returns {Array<{id,kind,orderId,tableNumber,minutes,amount,destination}>}
 */
export function buildAttentionItems({ orders = [], staffCalls = [], now = Date.now() } = {}) {
  const items = [];

  for (const order of orders) {
    const mins = elapsedMinutes(order.createdAt, now);

    if (isOrderDelayed(order, mins)) {
      items.push({
        id: `delayed-${order.orderId}`,
        kind: ATTENTION_KIND.DELAYED,
        orderId: order.orderId,
        tableNumber: order.tableNumber,
        minutes: mins,
        amount: null,
        destination: "liveOrders",
      });
      continue;
    }

    if (order.status === "ready") {
      items.push({
        id: `ready-${order.orderId}`,
        kind: ATTENTION_KIND.READY,
        orderId: order.orderId,
        tableNumber: order.tableNumber,
        /* Aged from when it BECAME ready, not from when it was placed: this
           is "waiting to be served", not "late to cook" (§12). */
        minutes: elapsedMinutes(firstReachedAt(order, "ready"), now),
        amount: null,
        destination: "liveOrders",
      });
      continue;
    }

    /* §13 — the existing payment semantics, narrowed to the case that is
       actually actionable. Every in-progress order is unpaid by definition
       (the guest pays at the table when they are done), so surfacing those
       would fill the queue with rows nobody can act on. A DELIVERED order
       that is still unpaid is the one a cashier has to chase, and it uses
       only fields that already exist. */
    if (order.status === "delivered" && order.paymentStatus !== "paid") {
      items.push({
        id: `payment-${order.orderId}`,
        kind: ATTENTION_KIND.PENDING_PAYMENT,
        orderId: order.orderId,
        tableNumber: order.tableNumber,
        minutes: elapsedMinutes(firstReachedAt(order, "delivered"), now),
        amount: Number(order.total) || 0,
        destination: "liveOrders",
      });
    }
  }

  for (const call of staffCalls) {
    items.push({
      id: `call-${call.id}`,
      kind: ATTENTION_KIND.STAFF_CALL,
      orderId: null,
      tableNumber: call.tableNumber,
      minutes: elapsedMinutes(call.createdAt, now),
      amount: null,
      destination: "staffCalls",
    });
  }

  /* Condition order first, then longest-waiting within it. A null age sorts
     last rather than throwing off the comparison. */
  return items.sort((a, b) => {
    const byKind = KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind);
    if (byKind !== 0) return byKind;
    return (b.minutes ?? -1) - (a.minutes ?? -1);
  });
}
