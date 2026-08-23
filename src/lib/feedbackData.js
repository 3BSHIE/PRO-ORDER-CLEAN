/**
 * feedbackData — localStorage-backed post-delivery feedback (Phase 29).
 * Restaurant-scoped, same pattern as every other data module.
 *
 * Storage: `pro_order_feedback:<restaurantSlug>`
 *
 * Record shape:
 *   {
 *     id, restaurantSlug,
 *     orderId,                      // the order this rates — the uniqueness key
 *     tableId, tableNumber,         // snapshotted from the order at submit time
 *     customerName,                 // snapshotted, so later edits never rewrite it
 *     foodRating, serviceRating,    // integers 1..5
 *     comment,                      // trimmed, max 500 chars, may be ""
 *     createdAt, updatedAt,
 *   }
 *
 * One feedback per order, enforced HERE rather than by hiding a button:
 *   1. createFeedback() re-reads storage at write time and refuses if a
 *      record already exists — it never trusts a value the caller read
 *      earlier, which is what closes the two-tabs-both-saw-nothing window.
 *   2. Reads additionally de-duplicate by orderId (keeping the earliest
 *      submission), so even a store corrupted by an external write can never
 *      surface two ratings for one order.
 *
 * Historical order safety:
 *   Submitting feedback NEVER touches the order. Feedback references
 *   orderId and keeps its own snapshot of table/customer, exactly like an
 *   order keeps its own snapshot of menu item names and prices. Deleting a
 *   menu item or category later cannot affect a feedback record, because
 *   feedback stores nothing about the menu at all.
 */

export const FEEDBACK_CHANGE_EVENT = "pro-order-feedback-change";

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_COMMENT_LENGTH = 500;

const FEEDBACK_KEY_PREFIX = "pro_order_feedback";

function feedbackKey(restaurantSlug) {
  return `${FEEDBACK_KEY_PREFIX}:${restaurantSlug}`;
}

function genId() {
  return `fb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(FEEDBACK_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

/** True for a whole number inside the 1..5 rating range. */
export function isValidRating(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_RATING && n <= MAX_RATING;
}

/* Collapses any accidental duplicates for one order down to the earliest
   submission. Applied on read so the rest of the app can treat
   "one feedback per order" as a guarantee rather than a hope. */
function dedupeByOrder(list) {
  const byOrder = new Map();
  for (const entry of list) {
    if (!entry || !entry.orderId) continue;
    const existing = byOrder.get(entry.orderId);
    if (!existing || new Date(entry.createdAt) < new Date(existing.createdAt)) {
      byOrder.set(entry.orderId, entry);
    }
  }
  return [...byOrder.values()];
}

/** This restaurant's feedback, newest first (never null). */
export function getFeedback(restaurantSlug) {
  try {
    const raw = localStorage.getItem(feedbackKey(restaurantSlug));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return dedupeByOrder(list).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * The single feedback record for one order, or null.
 * @returns {object|null}
 */
export function getFeedbackForOrder(restaurantSlug, orderId) {
  if (!orderId) return null;
  return getFeedback(restaurantSlug).find((f) => f.orderId === orderId) || null;
}

function saveFeedback(restaurantSlug, list) {
  try {
    localStorage.setItem(feedbackKey(restaurantSlug), JSON.stringify(dedupeByOrder(list)));
  } catch {
    // localStorage unavailable — fail silently, matches every other data module
  }
  notifyChange(restaurantSlug);
}

/**
 * Submit feedback for a delivered order.
 *
 * Eligibility (order must be delivered, and must belong to the submitting
 * session) is the CALLER's responsibility — see OrderFeedback.jsx. What this
 * function guarantees is the parts that must never depend on UI state:
 * valid ratings, a bounded comment, and exactly one record per order.
 *
 * @param {string} restaurantSlug
 * @param {object} data — { orderId, tableId, tableNumber, customerName,
 *                          foodRating, serviceRating, comment }
 * @returns {{ok:true, feedback:object}
 *          |{ok:false, reason:"already_exists", feedback:object}
 *          |{ok:false, reason:"invalid_rating"|"invalid_order"}}
 */
export function createFeedback(
  restaurantSlug,
  { orderId, tableId, tableNumber, customerName, foodRating, serviceRating, comment }
) {
  if (!orderId) return { ok: false, reason: "invalid_order" };
  if (!isValidRating(foodRating) || !isValidRating(serviceRating)) {
    return { ok: false, reason: "invalid_rating" };
  }

  /* Re-read at write time. A second tab may have submitted between this
     tab's render and this click, and the value the caller is holding would
     not show it. */
  const existing = getFeedbackForOrder(restaurantSlug, orderId);
  if (existing) return { ok: false, reason: "already_exists", feedback: existing };

  const now = new Date().toISOString();
  const feedback = {
    id: genId(),
    restaurantSlug,
    orderId,
    tableId: tableId ?? null,
    tableNumber: tableNumber ?? null,
    customerName: (customerName || "").trim(),
    foodRating: Number(foodRating),
    serviceRating: Number(serviceRating),
    comment: (comment || "").trim().slice(0, MAX_COMMENT_LENGTH),
    createdAt: now,
    updatedAt: now,
  };

  saveFeedback(restaurantSlug, [...getFeedback(restaurantSlug), feedback]);
  return { ok: true, feedback };
}

/**
 * Lightweight summary for the Admin screen — a count and two averages.
 * Deliberately not analytics: no trends, no buckets, no time series.
 *
 * @param {Array<object>} list
 * @returns {{count:number, averageFood:number|null, averageService:number|null}}
 */
export function summarizeFeedback(list) {
  const entries = Array.isArray(list) ? list : [];
  if (entries.length === 0) return { count: 0, averageFood: null, averageService: null };

  const total = entries.reduce(
    (acc, f) => ({
      food: acc.food + (Number(f.foodRating) || 0),
      service: acc.service + (Number(f.serviceRating) || 0),
    }),
    { food: 0, service: 0 }
  );

  const round1 = (n) => Math.round((n / entries.length) * 10) / 10;
  return {
    count: entries.length,
    averageFood: round1(total.food),
    averageService: round1(total.service),
  };
}

/**
 * Demo-only helper: wipe one restaurant's feedback. Not wired into any
 * customer-facing UI.
 * @param {string} restaurantSlug
 */
export function clearFeedback(restaurantSlug) {
  try {
    localStorage.removeItem(feedbackKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
