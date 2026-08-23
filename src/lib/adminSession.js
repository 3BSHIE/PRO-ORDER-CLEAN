/**
 * adminSession — saves the current admin/cashier staff login in sessionStorage.
 *
 * Mirrors src/lib/kitchenSession.js and src/lib/customerSession.js: per-tab,
 * clears when the tab closes, no server needed for this demo phase. One
 * session shape covers both "admin" and "cashier" roles — the `role` field
 * is what the protected route checks.
 *
 * To swap storage later (e.g. JWT cookies, server-side auth):
 *   Replace only the three functions below — nothing else needs to change.
 */

const ADMIN_SESSION_KEY = "pro_order_admin_session";

/**
 * Save a new admin/cashier session.
 * @param {{ restaurantSlug, role, name, username }} session
 */
export function saveAdminSession(session) {
  try {
    const full = { ...session, loggedInAt: new Date().toISOString() };
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(full));
  } catch {
    // sessionStorage unavailable — fail silently
  }
}

/**
 * Retrieve the current admin/cashier session, or null if none exists.
 * @returns {{ restaurantSlug, role, name, username, loggedInAt } | null}
 */
export function getAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the current admin/cashier session (sign out).
 */
export function clearAdminSession() {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // ignore
  }
}
