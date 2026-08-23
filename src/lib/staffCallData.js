/**
 * staffCallData — localStorage-backed "Digital Waiter Bell" storage (Phase 25).
 *
 * A staff call is a guest at a table asking for human assistance. It is
 * deliberately NOT an order and shares nothing with the order lifecycle:
 * creating, resolving, or ignoring a call never touches order.status,
 * order.paymentStatus, or anything in src/lib/customerOrders.js.
 *
 * Restaurant isolation:
 *   Exactly the same pattern as menuData.js / tableData.js / settingsData.js
 *   — every function takes a `restaurantSlug` as its first argument and
 *   reads/writes a key scoped to that restaurant alone
 *   (`pro_order_staff_calls:<slug>`). A call raised in one restaurant can
 *   never appear in another's list.
 *
 * Why localStorage (not sessionStorage like cart/customer session)?
 *   Same reasoning as customerOrders.js: the customer raises the call in
 *   their tab, and Admin/Cashier must see it from a *different* tab in the
 *   same browser. localStorage is shared across tabs on one origin, so it's
 *   the right frontend-only stand-in until a real backend exists.
 *
 * Live updates:
 *   Every write dispatches a "pro-order-staff-call-change" CustomEvent
 *   carrying { restaurantSlug } (same architecture as
 *   "pro-order-menu-change" / "pro-order-table-change"). src/lib/useStaffCalls.js
 *   subscribes to it for instant same-tab updates and additionally polls, so
 *   a call raised in another tab is noticed without a manual refresh.
 *
 * No seed data:
 *   Unlike menu/tables, this list legitimately starts empty — a restaurant
 *   with no pending calls is the normal state, not an unseeded one.
 *
 * Call shape:
 *   {
 *     id,                  // "call_..." — unique, never shown to the guest
 *     restaurantSlug,
 *     tableId, tableNumber,
 *     customerName,
 *     status,              // "open" | "resolved"
 *     createdAt, updatedAt,
 *   }
 */

const STAFF_CALLS_KEY_PREFIX = "pro_order_staff_calls";

export const STAFF_CALL_CHANGE_EVENT = "pro-order-staff-call-change";

export const STAFF_CALL_STATUS = { OPEN: "open", RESOLVED: "resolved" };

function staffCallsKey(restaurantSlug) {
  return `${STAFF_CALLS_KEY_PREFIX}:${restaurantSlug}`;
}

function genId() {
  return `call_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(STAFF_CALL_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

/** This restaurant's staff calls, newest first (never null). */
export function getStaffCalls(restaurantSlug) {
  try {
    const raw = localStorage.getItem(staffCallsKey(restaurantSlug));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

/** Only the calls still waiting for staff, newest first. */
export function getOpenStaffCalls(restaurantSlug) {
  return getStaffCalls(restaurantSlug).filter((c) => c.status === STAFF_CALL_STATUS.OPEN);
}

/**
 * The single open call for one table, if any — this is what enforces
 * "one active call per table" for both the customer button's state and
 * createStaffCall's duplicate guard.
 * @returns {object|null}
 */
export function getOpenCallForTable(restaurantSlug, tableId) {
  return (
    getStaffCalls(restaurantSlug).find(
      (c) => c.status === STAFF_CALL_STATUS.OPEN && c.tableId === tableId
    ) || null
  );
}

function saveStaffCalls(restaurantSlug, calls) {
  try {
    localStorage.setItem(staffCallsKey(restaurantSlug), JSON.stringify(calls));
  } catch {
    // localStorage unavailable — fail silently, matches customerOrders.js's pattern
  }
  notifyChange(restaurantSlug);
}

/**
 * Raise a staff call for one table.
 *
 * Duplicate prevention is enforced HERE, in the storage layer — not merely
 * by disabling a button — so a second call for a table that already has one
 * open is impossible regardless of how it was triggered (double-click, two
 * tabs open on the same table, stale UI state).
 *
 * @param {string} restaurantSlug
 * @param {object} data — { tableId, tableNumber, customerName }
 * @returns {{ok:true, call:object} | {ok:false, reason:"already_open", call:object}}
 */
export function createStaffCall(restaurantSlug, { tableId, tableNumber, customerName }) {
  const existing = getOpenCallForTable(restaurantSlug, tableId);
  if (existing) {
    return { ok: false, reason: "already_open", call: existing };
  }

  const now = new Date().toISOString();
  const call = {
    id: genId(),
    restaurantSlug,
    tableId,
    tableNumber,
    customerName: (customerName || "").trim(),
    status: STAFF_CALL_STATUS.OPEN,
    createdAt: now,
    updatedAt: now,
  };

  saveStaffCalls(restaurantSlug, [...getStaffCalls(restaurantSlug), call]);
  return { ok: true, call };
}

/**
 * Mark a call handled. Admin/Cashier only — the customer UI never calls this.
 * Idempotent, same guard pattern as updateCustomerOrderStatus: resolving an
 * already-resolved call is a safe no-op rather than an error, so a
 * double-click can't corrupt anything.
 *
 * @param {string} restaurantSlug
 * @param {string} callId
 * @returns {{ok:true, call:object} | {ok:false, reason:"not_found"}}
 */
export function resolveStaffCall(restaurantSlug, callId) {
  const calls = getStaffCalls(restaurantSlug);
  const idx = calls.findIndex((c) => c.id === callId);
  if (idx === -1) return { ok: false, reason: "not_found" };

  if (calls[idx].status === STAFF_CALL_STATUS.RESOLVED) {
    return { ok: true, call: calls[idx] };
  }

  const updated = {
    ...calls[idx],
    status: STAFF_CALL_STATUS.RESOLVED,
    updatedAt: new Date().toISOString(),
  };
  saveStaffCalls(restaurantSlug, calls.map((c, i) => (i === idx ? updated : c)));
  return { ok: true, call: updated };
}

/**
 * Demo-only helper: wipe one restaurant's staff calls. Not wired into any
 * customer-facing UI. Only clears the given restaurant's key.
 * @param {string} restaurantSlug
 */
export function clearStaffCalls(restaurantSlug) {
  try {
    localStorage.removeItem(staffCallsKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
