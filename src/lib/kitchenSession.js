/**
 * kitchenSession — saves the current kitchen staff login in sessionStorage.
 *
 * Mirrors src/lib/customerSession.js: per-tab, clears when the tab closes,
 * no server needed for this demo phase.
 *
 * To swap storage later (e.g. JWT cookies, server-side auth):
 *   Replace only the three functions below — nothing else needs to change.
 */

const KITCHEN_SESSION_KEY = "pro_order_kitchen_session";

/**
 * Save a new kitchen session.
 * @param {{ restaurantSlug, role, name }} session
 */
export function saveKitchenSession(session) {
  try {
    const full = { ...session, loggedInAt: new Date().toISOString() };
    sessionStorage.setItem(KITCHEN_SESSION_KEY, JSON.stringify(full));
  } catch {
    // sessionStorage unavailable — fail silently
  }
}

/**
 * Retrieve the current kitchen session, or null if none exists.
 * @returns {{ restaurantSlug, role, name, loggedInAt } | null}
 */
export function getKitchenSession() {
  try {
    const raw = sessionStorage.getItem(KITCHEN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the current kitchen session (sign out).
 */
export function clearKitchenSession() {
  try {
    sessionStorage.removeItem(KITCHEN_SESSION_KEY);
  } catch {
    // ignore
  }
}
