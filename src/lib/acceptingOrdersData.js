/**
 * acceptingOrdersData — localStorage-backed "is this restaurant taking new
 * orders?" mode (Phase 79). Restaurant-scoped, same pattern as menuData.js /
 * tableData.js / settingsData.js / prepTimeData.js / staffCallData.js.
 *
 * WHY A SEPARATE MODULE INSTEAD OF A FIELD IN settingsData.js
 *   Exactly the reason prepTimeData.js exists, and it is worth restating
 *   because the hazard is identical. AdminSettingsScreen keeps the ENTIRE
 *   settings object as one local draft and saves the whole draft at once. A
 *   manager who opens Settings, walks to Overview and flips Accepting Orders
 *   to Closed, then returns to the Settings tab and presses Save would have
 *   their close silently reverted by a draft captured minutes earlier.
 *
 *   This is an OPERATIONAL switch — it flips during a shift, from the
 *   Dashboard, in seconds — while Working Hours is CONFIGURATION, edited
 *   rarely and deliberately. A separate key with a surgical
 *   setAcceptingOrdersMode() write makes that class of bug impossible, and
 *   keeps the two concepts as separable in storage as they are in meaning.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT
 *   Only the MODE lives here. The schedule it consults in auto mode
 *   (workingHours + timeZone) stays in settingsData.js where it is already
 *   edited, and the rule that combines them is a pure function in
 *   src/lib/acceptingOrders.js. Three files, three jobs: one stores the
 *   override, one stores the schedule, one decides.
 *
 * Stored per restaurant (`pro_order_accepting_orders:<slug>`):
 *   mode — "auto" | "open" | "closed"   (default "auto")
 *
 * Migration:
 *   A restaurant with no stored record reads as "auto", so every existing
 *   restaurant begins following the Working Hours it already has configured.
 *   Nothing is written until someone actually changes the mode.
 */

import { DEFAULT_ACCEPTING_ORDERS_MODE, normalizeAcceptingOrdersMode } from "./acceptingOrders.js";

const ACCEPTING_ORDERS_KEY_PREFIX = "pro_order_accepting_orders";

export const ACCEPTING_ORDERS_CHANGE_EVENT = "pro-order-accepting-orders-change";

function acceptingOrdersKey(restaurantSlug) {
  return `${ACCEPTING_ORDERS_KEY_PREFIX}:${restaurantSlug}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(
      new CustomEvent(ACCEPTING_ORDERS_CHANGE_EVENT, { detail: { restaurantSlug } })
    );
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

/**
 * This restaurant's accepting-orders mode.
 *
 * Deliberately does NOT seed storage on read, unlike getSettings /
 * getPrepTimeSettings. There is nothing to seed: the absence of a record and
 * the value "auto" mean the same thing, and writing a file just to say
 * "unchanged" would make the default harder to change later, not easier.
 *
 * A hand-edited or corrupted value falls back to the default rather than
 * reaching the decision helper as garbage.
 *
 * @param {string} restaurantSlug
 * @returns {"auto"|"open"|"closed"}
 */
export function getAcceptingOrdersMode(restaurantSlug) {
  try {
    const raw = localStorage.getItem(acceptingOrdersKey(restaurantSlug));
    if (!raw) return DEFAULT_ACCEPTING_ORDERS_MODE;
    const stored = JSON.parse(raw);
    return normalizeAcceptingOrdersMode(stored?.mode);
  } catch {
    return DEFAULT_ACCEPTING_ORDERS_MODE;
  }
}

/**
 * Set the mode. A surgical single-field write, for the reason explained at
 * the top of this file — it can never disturb Working Hours, Busy Mode, or
 * anything else a manager might have open in another tab.
 *
 * An unrecognised mode is normalised rather than rejected, so a caller can
 * never persist a value the decision helper would not understand.
 *
 * @param {string} restaurantSlug
 * @param {"auto"|"open"|"closed"} mode
 * @returns {"auto"|"open"|"closed"} the mode actually stored
 */
export function setAcceptingOrdersMode(restaurantSlug, mode) {
  const next = normalizeAcceptingOrdersMode(mode);
  try {
    localStorage.setItem(
      acceptingOrdersKey(restaurantSlug),
      JSON.stringify({ restaurantSlug, mode: next, updatedAt: new Date().toISOString() })
    );
  } catch {
    // localStorage unavailable — fail silently, matches every other data module
  }
  notifyChange(restaurantSlug);
  return next;
}

/**
 * Demo-only helper: drop one restaurant's stored mode, returning it to the
 * "auto" default. Not wired into any customer-facing UI.
 * @param {string} restaurantSlug
 */
export function resetAcceptingOrdersMode(restaurantSlug) {
  try {
    localStorage.removeItem(acceptingOrdersKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
