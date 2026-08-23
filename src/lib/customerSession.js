/**
 * customerSession — saves the current guest's table session in sessionStorage.
 *
 * Why sessionStorage?
 *   - Clears automatically when the browser tab closes.
 *   - Isolated per tab, so two tables open in different tabs don't share state.
 *   - No server needed for this phase.
 *
 * To swap storage later (e.g. JWT cookies, server-side):
 *   Replace only the three functions below — nothing else needs to change.
 */

const SESSION_KEY = "pro_order_customer_session";

/**
 * Save a new customer session.
 * @param {{ restaurantId, restaurantSlug, tableId, tableNumber, qrToken, customerName }} session
 */
export function saveCustomerSession(session) {
  try {
    const full = { ...session, startedAt: new Date().toISOString() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(full));
  } catch {
    // sessionStorage unavailable (private browsing, storage full, etc.) — fail silently
  }
}

/**
 * Retrieve the current session, or null if none exists.
 * @returns {{ restaurantId, restaurantSlug, tableId, tableNumber, qrToken, customerName, startedAt } | null}
 */
export function getCustomerSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the current session (e.g. on logout / tab reset).
 */
export function clearCustomerSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
