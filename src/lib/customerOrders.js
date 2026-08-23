/**
 * customerOrders — mock order storage for the demo, backed by localStorage.
 *
 * Why localStorage (not sessionStorage like cart/session)?
 *   Cart and customer session are intentionally per-tab (sessionStorage) —
 *   each table's guest session shouldn't leak across tabs. Orders are
 *   different: a future Kitchen screen and Admin live-orders screen need to
 *   read the SAME orders a customer just placed, in the same browser, across
 *   different tabs/windows. localStorage is shared across tabs on the same
 *   origin, so it's the right (temporary, frontend-only) stand-in until a
 *   real backend exists.
 *
 * Order payload shape (the "kitchen ticket" / "admin order row" future
 * phases will consume directly):
 *   {
 *     orderId,                // "ORD-0001", "ORD-0002", ...
 *     restaurantId, restaurantSlug, restaurantName,
 *     tableId, tableNumber, qrToken,
 *     customerName,
 *     status,                 // "received" (only status this phase creates)
 *     statusHistory: [
 *       { status, at, label }
 *     ],
 *     items: [ ...cart items, unchanged shape — see customerCart.js ],
 *     subtotal, serviceChargePercent, serviceCharge, total,
 *     estimatedPrepMinutes,   // Phase 26 — frozen at creation time from
 *                             // prepTimeData.js (base + busy extra). Never
 *                             // recomputed: turning Busy Mode off later must
 *                             // not change what an existing guest was told.
 *                             // null on orders created before Phase 26.
 *     paymentMethod: { id, label, type, selectedAt },
 *     paymentStatus,          // "pending_at_table" for cash/card this phase;
 *                             // Admin/Cashier can mark "paid" (Phase 20) —
 *                             // completely independent of order.status
 *     paymentHistory: [       // optional, append-only, added when payment
 *       { paymentStatus, at } // status first changes — mirrors statusHistory's
 *     ],                      // shape but kept separate on purpose
 *     createdAt, updatedAt,
 *   }
 *
 * To swap storage later (real backend, order API):
 *   Replace only the functions below — callers only need get/save/create/update.
 */

const ORDERS_KEY = "pro_order_mock_orders";
const ORDER_SEQ_KEY = "pro_order_mock_order_seq";

/**
 * Retrieve all mock orders (never null).
 * @returns {Array<object>}
 */
export function getCustomerOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Find a single order by its readable id (e.g. "ORD-0001").
 * @param {string} orderId
 * @returns {object|null}
 */
export function getOrderById(orderId) {
  const orders = getCustomerOrders();
  return orders.find((o) => o.orderId === orderId) || null;
}

/**
 * Persist the full orders array.
 * @param {Array<object>} orders
 */
export function saveCustomerOrders(orders) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // localStorage unavailable — fail silently
  }
}

/**
 * Generate the next readable order id (ORD-0001, ORD-0002, ...), persisting
 * the counter in localStorage so it survives reloads and increments across
 * every order ever created in this browser — never reused, never reset by
 * clearing just the orders list.
 */
function nextOrderId() {
  let seq = 1;
  try {
    const raw = localStorage.getItem(ORDER_SEQ_KEY);
    seq = raw ? parseInt(raw, 10) + 1 : 1;
    localStorage.setItem(ORDER_SEQ_KEY, String(seq));
  } catch {
    // fall back to a timestamp-based sequence if localStorage is unavailable
    seq = Date.now() % 100000;
  }
  return `ORD-${String(seq).padStart(4, "0")}`;
}

/** Maps a payment method id to the paymentStatus stored on the order. */
function resolvePaymentStatus(paymentMethodId) {
  switch (paymentMethodId) {
    case "cash_at_table":
    case "card_at_table":
      return "pending_at_table";
    default:
      // online_payment is not selectable yet; anything unexpected falls back safely
      return "pending_at_table";
  }
}

/**
 * Create a new mock order from the current cart + session + restaurant +
 * totals + selected payment method, and persist it.
 *
 * @param {object} params
 * @param {object} params.restaurant   — { id, slug, name, serviceChargePercent }
 * @param {object} params.table        — { id, tableNumber }
 * @param {string} params.qrToken
 * @param {string} params.customerName
 * @param {Array<object>} params.cartItems — the cart array, unchanged shape
 * @param {number} params.subtotal
 * @param {number} params.serviceCharge
 * @param {number} params.total
 * @param {object} params.paymentMethod — { paymentMethodId, paymentMethodLabel, paymentMethodType, selectedAt }
 * @param {number} [params.estimatedPrepMinutes] — Phase 26; resolved by the
 *   caller from prepTimeData.js at the moment of checkout and frozen here.
 *   Omitted/invalid becomes null, which every customer screen treats as
 *   "no estimate to show" — that's also what pre-Phase-26 orders already in
 *   localStorage look like, so they keep rendering exactly as before.
 * @returns {object} the created order
 */
export function createCustomerOrder({
  restaurant,
  table,
  qrToken,
  customerName,
  cartItems,
  subtotal,
  serviceCharge,
  total,
  paymentMethod,
  estimatedPrepMinutes,
}) {
  const now = new Date().toISOString();
  const orderId = nextOrderId();

  const order = {
    orderId,
    restaurantId: restaurant.id,
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    tableId: table.id,
    tableNumber: table.tableNumber,
    qrToken,
    customerName,
    status: "received",
    statusHistory: [
      { status: "received", at: now, label: "Order received" },
    ],
    items: cartItems, // structured cart items, preserved exactly as-is
    subtotal,
    serviceChargePercent: restaurant.serviceChargePercent || 0,
    serviceCharge,
    total,
    /* Phase 26 snapshot — a plain number frozen at this instant. Nothing in
       this module ever writes it again, so no later Busy Mode change or
       config edit can alter what this guest was promised. */
    estimatedPrepMinutes: Number.isInteger(estimatedPrepMinutes) ? estimatedPrepMinutes : null,
    paymentMethod: {
      id: paymentMethod.paymentMethodId,
      label: paymentMethod.paymentMethodLabel,
      type: paymentMethod.paymentMethodType,
      selectedAt: paymentMethod.selectedAt,
    },
    paymentStatus: resolvePaymentStatus(paymentMethod.paymentMethodId),
    createdAt: now,
    updatedAt: now,
  };

  const orders = getCustomerOrders();
  saveCustomerOrders([...orders, order]);
  return order;
}

/**
 * Update an order's status, appending a new statusHistory entry.
 * (Not used by the customer flow yet — this phase only creates "received"
 * orders — but Kitchen/Admin phases will call this directly.)
 *
 * @param {string} orderId
 * @param {string} status — e.g. "preparing", "ready", "delivered"
 * @param {string} [label] — human-readable label for statusHistory; defaults to status
 * @returns {object|null} the updated order, or null if not found
 */
export function updateCustomerOrderStatus(orderId, status, label) {
  const orders = getCustomerOrders();
  const idx = orders.findIndex((o) => o.orderId === orderId);
  if (idx === -1) return null;

  const current = orders[idx];

  /* Guard against duplicate entries: if the order is already in this exact
     status, don't append another statusHistory entry (protects against
     double-clicks or re-fired updates racing each other). Still returns the
     current order unchanged so callers can treat this as a no-op success. */
  if (current.status === status) {
    return current;
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    status,
    statusHistory: [
      ...current.statusHistory,
      { status, at: now, label: label || status },
    ],
    updatedAt: now,
  };

  const nextOrders = orders.map((o, i) => (i === idx ? updated : o));
  saveCustomerOrders(nextOrders);
  return updated;
}

const VALID_PAYMENT_STATUSES = ["pending_at_table", "paid"];

/**
 * Update an order's payment status — completely independent of order.status
 * (received/preparing/ready/delivered/canceled). Marking a payment "paid"
 * never changes what stage the order is in, and vice versa.
 *
 * @param {string} orderId
 * @param {string} paymentStatus — must be "pending_at_table" or "paid"
 * @returns {object|null} the updated order, null if not found or paymentStatus invalid
 */
export function updateCustomerOrderPaymentStatus(orderId, paymentStatus) {
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) return null;

  const orders = getCustomerOrders();
  const idx = orders.findIndex((o) => o.orderId === orderId);
  if (idx === -1) return null;

  const current = orders[idx];

  /* Idempotent, same guard pattern as updateCustomerOrderStatus: if the
     order's payment is already in this exact state, do nothing (protects
     against double-clicks / re-fired updates racing each other). */
  if (current.paymentStatus === paymentStatus) {
    return current;
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    paymentStatus,
    updatedAt: now,
    /* Lightweight, append-only payment history — mirrors statusHistory's
       shape but stays a separate array so it never gets confused with
       order-stage history. Simple and safe: just records what changed and
       when, nothing more. */
    paymentHistory: [
      ...(current.paymentHistory || []),
      { paymentStatus, at: now },
    ],
  };

  const nextOrders = orders.map((o, i) => (i === idx ? updated : o));
  saveCustomerOrders(nextOrders);
  return updated;
}

/**
 * Demo-only helper: wipe all mock orders and reset the id counter.
 * Not wired into any customer-facing UI in this phase.
 */
export function clearCustomerOrders() {
  try {
    localStorage.removeItem(ORDERS_KEY);
    localStorage.removeItem(ORDER_SEQ_KEY);
  } catch {
    // ignore
  }
}
