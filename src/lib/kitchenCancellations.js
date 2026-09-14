/**
 * kitchenCancellations — Kitchen's record of orders cancelled out from under
 * it, and whether anyone has seen them yet.
 *
 * Phase 96 §15–§19, §45–§46.
 *
 * ── THE PROBLEM THIS SOLVES ───────────────────────────────────────────────
 * When Admin or Cashier cancels an order, the order's status changes and its
 * Kitchen card simply stops matching Received/Preparing — so it vanishes. A
 * cook who was plating that dish, or who had stepped to the pass, gets no
 * signal at all. The food keeps cooking.
 *
 * So a cancellation that lands while the order is OPERATIONALLY RELEVANT to
 * Kitchen (Received or Preparing) is recorded here as an alert that persists
 * until someone explicitly acknowledges it. Sound is not acknowledgment: a
 * noise in an empty kitchen has told nobody anything (§18).
 *
 * ── WHY A SNAPSHOT AND NOT A LOOKUP (§45) ─────────────────────────────────
 * Each record copies the few operational facts Kitchen needs — table, order
 * id, when it was cancelled, which state it was in, and the item lines — so
 * the alert stays readable after the order has left every active list. It
 * deliberately copies NO money and no customer contact data: Kitchen has no
 * business holding either (§4), and duplicating them would create a second
 * place for them to go stale.
 *
 * The underlying order record is never touched. This module only ever writes
 * its own key, so Admin history and any future backend audit trail keep the
 * full truth (§46).
 *
 * ── STORAGE ───────────────────────────────────────────────────────────────
 * `pro_order_kitchen_cancellations:<slug>` holds one array of records:
 *
 *   { orderId, tableNumber, priorStatus, canceledAt, businessDay,
 *     items: [{ name, quantity }], acknowledgedAt|null, soundNotifiedAt|null }
 *
 * priorStatus is null when the order carries no usable history — the alert is
 * still raised (Phase 96.1 §2). A cancellation is operationally important even
 * when its metadata is incomplete, and guessing "Preparing" would be worse
 * than saying plainly that the prior state is unknown.
 *
 * soundNotifiedAt is what makes the cancellation chime idempotent PER EVENT
 * rather than per session (Phase 96.1 §1). Phase 96 suppressed the sound on
 * the first pass after mount so a refresh could not replay a backlog — but
 * that also silenced every cancellation that arrived while the kitchen screen
 * was locked, which is exactly the case the alert exists for. Now the record
 * remembers whether its own sound has ever been emitted, so it can be played
 * late (on the next open) and still never twice.
 *
 * Unacknowledged records drive the alert panel; acknowledged ones become the
 * read-only "Recently Canceled" list. Both are filtered to the CURRENT
 * business day on read, so yesterday's shift never appears — without
 * deleting anything (§46).
 */

import { getBusinessDayKey } from "./businessDay.js";

const KEY_PREFIX = "pro_order_kitchen_cancellations";

export const KITCHEN_CANCELLATION_CHANGE_EVENT = "pro-order-kitchen-cancellation-change";

/* A cancellation only matters to Kitchen if Kitchen still had work to do on
   it. An order cancelled after it was already Ready, or one that was never
   cooking, raises nothing. */
export const KITCHEN_RELEVANT_STATUSES = ["received", "preparing"];

function storageKey(restaurantSlug) {
  return `${KEY_PREFIX}:${restaurantSlug}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(
      new CustomEvent(KITCHEN_CANCELLATION_CHANGE_EVENT, { detail: { restaurantSlug } })
    );
  } catch {
    // no-op outside a browser
  }
}

function readAll(restaurantSlug) {
  try {
    const raw = localStorage.getItem(storageKey(restaurantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(restaurantSlug, records) {
  try {
    localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(records));
  } catch {
    // localStorage unavailable — fail silently, matching every other module
  }
  notifyChange(restaurantSlug);
}

/**
 * Everything recorded for this restaurant, newest first, filtered to the
 * business day that is current right now.
 *
 * Filtering happens on READ rather than by pruning storage, so a record is
 * never destroyed — it simply stops being this shift's concern (§46).
 *
 * @param {string} restaurantSlug
 * @param {string} timeZone
 * @returns {Array<object>}
 */
export function getKitchenCancellations(restaurantSlug, timeZone) {
  const today = getBusinessDayKey(timeZone);
  return readAll(restaurantSlug)
    .filter((r) => r && r.businessDay === today)
    .sort((a, b) => new Date(b.canceledAt) - new Date(a.canceledAt));
}

/**
 * Record a cancellation Kitchen has not seen yet.
 *
 * Idempotent by orderId: the board re-detects the same cancelled order on
 * every 4s poll until its card is gone, and a duplicate record would mean a
 * duplicate alert and a second sound. Returns null when nothing was written,
 * which is also how the caller knows not to play anything (§16).
 *
 * @param {string} restaurantSlug
 * @param {object} order — the cancelled order, read not mutated
 * @param {string|null} priorStatus — the Kitchen state it was in before being
 *        cancelled, or null when the order carries no usable history (§2)
 * @param {string} timeZone
 * @returns {object|null} the new record, or null if already recorded
 */
export function recordKitchenCancellation(restaurantSlug, order, priorStatus, timeZone) {
  if (!order?.orderId) return null;

  const existing = readAll(restaurantSlug);
  if (existing.some((r) => r.orderId === order.orderId)) return null;

  /* Cancellation time comes from the order's own history where possible, so
     the alert reports when it was actually cancelled rather than when this
     board happened to notice. */
  const fromHistory = order.statusHistory?.find((e) => e.status === "canceled")?.at;
  const canceledAt = fromHistory || order.updatedAt || new Date().toISOString();

  const record = {
    orderId: order.orderId,
    tableNumber: order.tableNumber ?? null,
    priorStatus,
    canceledAt,
    businessDay: getBusinessDayKey(timeZone, canceledAt),
    /* Names and quantities only — enough to know what to stop cooking. */
    items: (order.items || []).map((line) => ({
      name: line.name,
      quantity: line.quantity,
    })),
    acknowledgedAt: null,
    /* Never heard yet. The board claims this the first time it actually
       plays the sound for this record. */
    soundNotifiedAt: null,
  };

  writeAll(restaurantSlug, [...existing, record]);
  return record;
}

/**
 * Mark one cancellation as seen. It leaves the alert panel and becomes part
 * of the read-only Recently Canceled list — it is never deleted, because the
 * record of what was cancelled is the useful part (§19).
 *
 * @param {string} restaurantSlug
 * @param {string} orderId
 * @returns {boolean} whether anything changed
 */
export function acknowledgeKitchenCancellation(restaurantSlug, orderId) {
  const all = readAll(restaurantSlug);
  const idx = all.findIndex((r) => r.orderId === orderId && !r.acknowledgedAt);
  if (idx === -1) return false;

  const next = all.slice();
  next[idx] = { ...all[idx], acknowledgedAt: new Date().toISOString() };
  writeAll(restaurantSlug, next);
  return true;
}

/**
 * Mark these cancellations as having had their sound emitted.
 *
 * Written as one batch after a single playback, so a burst of cancellations
 * that accumulated while the kitchen was closed produces ONE notification and
 * all of them are marked heard — never a queue of chimes, never a record left
 * unmarked to fire again on the next mount (§1).
 *
 * @param {string} restaurantSlug
 * @param {string[]} orderIds
 * @returns {boolean} whether anything changed
 */
export function markKitchenCancellationsNotified(restaurantSlug, orderIds) {
  if (!orderIds?.length) return false;
  const ids = new Set(orderIds);
  const all = readAll(restaurantSlug);
  let changed = false;

  const next = all.map((record) => {
    if (!ids.has(record.orderId) || record.soundNotifiedAt) return record;
    changed = true;
    return { ...record, soundNotifiedAt: new Date().toISOString() };
  });

  if (changed) writeAll(restaurantSlug, next);
  return changed;
}

/** Demo-only: clear this restaurant's Kitchen cancellation record. */
export function resetKitchenCancellations(restaurantSlug) {
  try {
    localStorage.removeItem(storageKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
