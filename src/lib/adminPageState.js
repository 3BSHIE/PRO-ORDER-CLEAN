import { ADMIN_NAV_ITEMS, ADMIN_ONLY_NAV_KEYS } from "../screens/admin/AdminLayout.jsx";

/**
 * adminPageState — Phase 62. Remembers which Admin sub-page was open so a
 * browser refresh returns to it instead of dropping the user on Overview.
 *
 * Scope, deliberately narrow: the top-level page key and nothing else. No
 * modal, no Product draft, no Live Orders filter, no expanded order. Those
 * are transient UI, and restoring them would be restoring a moment rather
 * than a location — a reopened editor holding a draft the user never saved
 * is worse than no restoration at all.
 *
 * sessionStorage, not localStorage:
 *   This is navigation state for the current sitting, not a restaurant
 *   setting. sessionStorage survives a refresh (the whole requirement) but
 *   dies with the tab, so a closed-and-reopened browser starts clean without
 *   any explicit expiry logic. It also matches where the admin session
 *   itself already lives, so the page and the session that owns it disappear
 *   together.
 *
 * Key: `pro_order_admin_page:<restaurantSlug>:<role>`
 *   Scoped by restaurant so one venue's last page cannot surface in another,
 *   and by role so an Admin's Settings and a Cashier's Live Orders coexist
 *   in the same browser without leaking into each other.
 *
 * Both lists are imported from AdminLayout rather than restated here.
 * ADMIN_ONLY_NAV_KEYS is already the single source of truth that App.jsx's
 * route guard and the nav filter both read; a second copy in this file is
 * exactly how a future Admin-only page ends up restorable by a Cashier.
 */

const KEY_PREFIX = "pro_order_admin_page";

/** Where every Admin lands with nothing remembered, and the safe fallback. */
export const DEFAULT_ADMIN_PAGE = "overview";

/** Every page key the nav can actually reach. */
const VALID_PAGES = ADMIN_NAV_ITEMS.map((item) => item.key);

function storageKey(restaurantSlug, role) {
  return `${KEY_PREFIX}:${restaurantSlug}:${role}`;
}

/**
 * Is this page one the given role may actually open?
 *
 * The same two questions the app already asks elsewhere: does the page
 * exist, and is it Admin-only. Applied on read AND on write, so a tampered
 * or stale value is refused at the point of use even if it somehow reached
 * storage.
 */
function isRestorablePage(page, role) {
  if (typeof page !== "string" || !VALID_PAGES.includes(page)) return false;
  if (ADMIN_ONLY_NAV_KEYS.includes(page) && role !== "admin") return false;
  return true;
}

/**
 * The remembered page for this restaurant + role, or the default.
 *
 * Never throws and never returns something unusable: an unknown key, a page
 * removed in a later version, a hand-edited value, a Cashier's stolen
 * "settings", a missing role or an unavailable sessionStorage all resolve to
 * Overview rather than a blank screen.
 *
 * @param {string} restaurantSlug
 * @param {string|undefined} role — "admin" | "cashier"
 * @returns {string} a page key that is safe to render right now
 */
export function readAdminPage(restaurantSlug, role) {
  if (!restaurantSlug || !role) return DEFAULT_ADMIN_PAGE;
  try {
    const stored = sessionStorage.getItem(storageKey(restaurantSlug, role));
    return isRestorablePage(stored, role) ? stored : DEFAULT_ADMIN_PAGE;
  } catch {
    return DEFAULT_ADMIN_PAGE;
  }
}

/**
 * Remember the page. Call this only once a navigation has actually
 * happened — never for a destination that is still waiting on the Phase 60
 * unsaved-changes guard, or a refusal would be recorded as a visit.
 *
 * @param {string} restaurantSlug
 * @param {string|undefined} role
 * @param {string} page
 */
export function writeAdminPage(restaurantSlug, role, page) {
  if (!restaurantSlug || !role || !isRestorablePage(page, role)) return;
  try {
    sessionStorage.setItem(storageKey(restaurantSlug, role), page);
  } catch {
    // sessionStorage unavailable — restoration simply doesn't happen
  }
}

/**
 * Forget the page. Used on a completed sign-out so the next login starts at
 * Overview rather than resuming a previous operator's screen.
 *
 * @param {string} restaurantSlug
 * @param {string|undefined} role
 */
export function clearAdminPage(restaurantSlug, role) {
  if (!restaurantSlug || !role) return;
  try {
    sessionStorage.removeItem(storageKey(restaurantSlug, role));
  } catch {
    // ignore
  }
}
