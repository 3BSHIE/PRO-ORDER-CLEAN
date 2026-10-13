/**
 * staffOrdering — Phase 112.0
 *
 * The context a staff member is ordering INTO, and the draft cart that
 * belongs to it.
 *
 * ── WHY DRAFTS ARE NOT THE CUSTOMER CART ────────────────────────────────
 * customerCart.js keeps ONE cart in sessionStorage, per tab, because a guest
 * has one table and one order at a time. A cashier has neither: they hold a
 * half-built order for Table 05 while taking another for Table 08, and both
 * must survive a refresh. So drafts get their own store, keyed by who is
 * building them and what they are for, and the guest's cart is left exactly
 * as it was.
 *
 * ── THE KEY ─────────────────────────────────────────────────────────────
 *   pro_order_staff_draft:<restaurantSlug>:<staffId>:<contextId>
 *
 * Three parts because all three are real boundaries: two restaurants on one
 * device must not share a draft, two staff accounts must not see each
 * other's half-built orders, and Table 05's burger must not appear at Table
 * 08. DIRECT_ORDER_CONTEXT is a context of its own rather than a pretend
 * table id — a direct order has no table, and writing one in would be a lie
 * the rest of the app would then have to believe.
 */

import { getCustomerOrders } from "./customerOrders.js";

const DRAFT_KEY_PREFIX = "pro_order_staff_draft";

/** The context id for an order with no table. Never a table identifier. */
export const DIRECT_ORDER_CONTEXT = "direct";

/** Is this context the no-table one? */
export function isDirectContext(contextId) {
  return contextId === DIRECT_ORDER_CONTEXT;
}

/**
 * The staff identity a draft belongs to.
 *
 * Username first because it is the account; role is the fallback for a
 * session that has none (the kitchen PIN login shape), and "unknown" keeps
 * the key well-formed rather than letting two sessions collide on "".
 */
export function staffDraftIdentity(session) {
  const raw = session?.username || session?.role || "unknown";
  return String(raw).trim().toLowerCase().replace(/[^a-z0-9._@-]+/g, "_");
}

function draftKey(restaurantSlug, session, contextId) {
  return `${DRAFT_KEY_PREFIX}:${restaurantSlug}:${staffDraftIdentity(session)}:${contextId}`;
}

/**
 * Two-digit minimum, exactly as the sidebar buttons print them.
 *
 * 1 → "01", 12 → "12", 100 → "100". This is a LABEL: the stored tableNumber
 * is never rewritten, so nothing downstream has to know this function
 * exists.
 */
export function formatTableNumber(tableNumber) {
  const n = Number(tableNumber);
  if (!Number.isFinite(n)) return String(tableNumber ?? "");
  return String(Math.trunc(Math.abs(n))).padStart(2, "0");
}

/* ── The draft store ──────────────────────────────────────────────────── */

/** The lines currently held for one context (never null). */
export function getStaffDraft(restaurantSlug, session, contextId) {
  try {
    const raw = localStorage.getItem(draftKey(restaurantSlug, session, contextId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Replace one context's lines. An empty draft removes its key entirely. */
export function saveStaffDraft(restaurantSlug, session, contextId, lines) {
  const key = draftKey(restaurantSlug, session, contextId);
  try {
    if (!lines || lines.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(lines));
  } catch {
    /* Storage unavailable: the draft lives in React state for this visit and
       simply does not survive a refresh. Nothing else degrades. */
  }
}

/** Clear exactly one context — never a sweep over the prefix. */
export function clearStaffDraft(restaurantSlug, session, contextId) {
  saveStaffDraft(restaurantSlug, session, contextId, []);
}

/**
 * A fresh cartItemId.
 *
 * Mirrors customerCart's generator: unique per add, which is what makes the
 * duplicate-submission signature in customerOrders safe and what lets two
 * identical dishes with different notes stay two lines.
 */
export function newCartItemId() {
  return `sci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Add a built line to a draft, returning the next line list. */
export function addDraftLine(lines, line) {
  return [...lines, { ...line, cartItemId: newCartItemId() }];
}

/** Replace one line in place (an edit from the details sheet). */
export function updateDraftLine(lines, cartItemId, nextLine) {
  return lines.map((line) =>
    line.cartItemId === cartItemId ? { ...nextLine, cartItemId } : line
  );
}

/** Change a line's quantity, recomputing its total from its own unit price. */
export function setDraftLineQuantity(lines, cartItemId, quantity) {
  const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
  return lines.map((line) =>
    line.cartItemId === cartItemId
      ? {
          ...line,
          quantity: qty,
          lineTotal: parseFloat(((Number(line.unitPrice) || 0) * qty).toFixed(3)),
        }
      : line
  );
}

/** Drop a line. */
export function removeDraftLine(lines, cartItemId) {
  return lines.filter((line) => line.cartItemId !== cartItemId);
}

/* ── Order classification ─────────────────────────────────────────────────
   Legacy orders carry neither field, and both helpers answer correctly for
   them: no source means the guest placed it, and every pre-112.0 order has a
   table. Nothing stored is ever rewritten. */

/** Was this order created by staff rather than by a guest at a QR table? */
export function isStaffOrder(order) {
  return order?.source?.channel === "staff";
}

/** An order with no table: a direct/counter/takeaway order. */
export function isDirectOrder(order) {
  return !order?.tableId;
}

/**
 * Every order currently sitting against one table.
 *
 * Used by the sidebar only as a convenience lookup; it reads the same order
 * store every other screen reads, so it can never disagree with Live Orders.
 */
export function ordersForTable(restaurantSlug, tableId) {
  return getCustomerOrders().filter(
    (order) => order.restaurantSlug === restaurantSlug && order.tableId === tableId
  );
}
