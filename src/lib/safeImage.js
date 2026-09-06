/**
 * safeImage — Phase 84.1.
 *
 * One rule for "is this URL safe to put in a src attribute", shared by every
 * customer surface that renders restaurant-supplied imagery.
 *
 * ── WHY IT MOVED HERE ────────────────────────────────────────────────────
 *   Phase 81 wrote this inside RestaurantInfo.jsx, and Unit 1 imported it
 *   from there. That was fine while only the Welcome screen and the Info
 *   sheet used it, but Phase 84.1 needs it in RestaurantIdentity — which
 *   RestaurantInfo itself imports. Importing back the other way would have
 *   created a genuine module cycle.
 *
 *   So the function moved to lib and nothing else changed: RestaurantInfo
 *   re-exports it, which means the Unit 1 files that import
 *   `{ isSafeImageUrl } from "./RestaurantInfo.jsx"` keep working untouched.
 *   One implementation, no second validation system (§3).
 */

/**
 * Only http(s) images are honoured — never javascript:, data: or blob:.
 *
 * Deliberately shallow: this decides whether a URL is SAFE to attempt, not
 * whether it will load. A syntactically fine URL that 404s is caught by the
 * caller's onError, which is the other half of the same guarantee.
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isSafeImageUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return false;
  try {
    const url = new URL(raw.trim(), window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
