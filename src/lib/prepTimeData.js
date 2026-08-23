/**
 * prepTimeData — localStorage-backed preparation-time settings and Busy Mode
 * (Phase 26). Restaurant-scoped, same pattern as menuData.js / tableData.js /
 * settingsData.js / staffCallData.js.
 *
 * Why a separate module instead of extending settingsData.js:
 *   Busy Mode is *operational* state, not configuration — it flips on and off
 *   many times during a shift, and Cashier (who cannot open Restaurant
 *   Settings at all) must be able to flip it. settingsData.js is written by
 *   AdminSettingsScreen, which keeps the ENTIRE settings object as a local
 *   draft and saves the whole draft at once. If Busy Mode lived in there, an
 *   Admin sitting on the Settings screen with a stale draft would silently
 *   revert a Cashier's Busy Mode toggle the next time they pressed Save.
 *   A separate key with a surgical setBusyMode() write makes that class of
 *   bug impossible, and keeps the Admin-only config cleanly separable from
 *   the both-roles toggle.
 *
 * Stored per restaurant (`pro_order_prep_time:<slug>`):
 *   basePrepMinutes   — normal estimate for a new order          (default 20)
 *   busyModeEnabled   — is the kitchen currently slammed?        (default false)
 *   busyExtraMinutes  — added on top while Busy Mode is on       (default 10)
 *
 * The estimate itself is deliberately deterministic — no prediction, no
 * history, no volume sensing. See getEstimatedPrepMinutes().
 *
 * Snapshot rule (the important one):
 *   getEstimatedPrepMinutes() is read ONCE, at order-creation time, and the
 *   resulting number is frozen onto the order (see src/lib/customerOrders.js).
 *   Changing basePrepMinutes / busyExtraMinutes / busyModeEnabled afterwards
 *   never rewrites an existing order's estimate — identical principle to menu
 *   edits never rewriting historical order line items.
 */

const PREP_TIME_KEY_PREFIX = "pro_order_prep_time";

export const PREP_TIME_CHANGE_EVENT = "pro-order-prep-time-change";

/* Guard rails for the two admin-editable numbers. Whole minutes only; the
   upper bound just stops a typo like "200000" from rendering nonsense to a
   guest — it is not a business rule. */
export const MIN_PREP_MINUTES = 0;
export const MAX_PREP_MINUTES = 240;

function prepTimeKey(restaurantSlug) {
  return `${PREP_TIME_KEY_PREFIX}:${restaurantSlug}`;
}

/* Defaults match the Phase 26 spec exactly. A restaurant that never opens
   this control behaves as a calm 20-minute kitchen with Busy Mode off. */
function defaultPrepTime(restaurantSlug) {
  return {
    restaurantSlug,
    basePrepMinutes: 20,
    busyModeEnabled: false,
    busyExtraMinutes: 10,
    updatedAt: null,
  };
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(PREP_TIME_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

function seedIfEmpty(restaurantSlug) {
  try {
    if (localStorage.getItem(prepTimeKey(restaurantSlug)) === null) {
      localStorage.setItem(prepTimeKey(restaurantSlug), JSON.stringify(defaultPrepTime(restaurantSlug)));
    }
  } catch {
    // localStorage unavailable — getPrepTimeSettings falls back to defaults directly
  }
}

/** True for a whole number of minutes inside the allowed range. */
export function isValidMinutes(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_PREP_MINUTES && n <= MAX_PREP_MINUTES;
}

/* Defensive coercion used on read, so a hand-edited or partially-written
   record can never make a customer screen render "About NaN minutes". */
function coerceMinutes(value, fallback) {
  return isValidMinutes(value) ? Number(value) : fallback;
}

/**
 * This restaurant's prep-time settings, merged over the defaults so a record
 * saved by an older shape never crashes a screen expecting a newer field.
 * @param {string} restaurantSlug
 */
export function getPrepTimeSettings(restaurantSlug) {
  seedIfEmpty(restaurantSlug);
  const defaults = defaultPrepTime(restaurantSlug);
  try {
    const raw = localStorage.getItem(prepTimeKey(restaurantSlug));
    if (!raw) return defaults;
    const stored = JSON.parse(raw);
    return {
      ...defaults,
      ...stored,
      basePrepMinutes: coerceMinutes(stored.basePrepMinutes, defaults.basePrepMinutes),
      busyExtraMinutes: coerceMinutes(stored.busyExtraMinutes, defaults.busyExtraMinutes),
      busyModeEnabled: !!stored.busyModeEnabled,
    };
  } catch {
    return defaults;
  }
}

function save(restaurantSlug, next) {
  try {
    localStorage.setItem(prepTimeKey(restaurantSlug), JSON.stringify(next));
  } catch {
    // localStorage unavailable — fail silently, matches every other data module
  }
  notifyChange(restaurantSlug);
  return next;
}

/**
 * The Phase 26 estimate, in whole minutes:
 *
 *   basePrepMinutes + (busyModeEnabled ? busyExtraMinutes : 0)
 *
 * Deterministic by design — no prediction, no order-volume input, no timers.
 * Call this at order-creation time only; the result is then frozen onto the
 * order and must never be recomputed for an existing one.
 *
 * @param {string} restaurantSlug
 * @returns {number}
 */
export function getEstimatedPrepMinutes(restaurantSlug) {
  const { basePrepMinutes, busyModeEnabled, busyExtraMinutes } = getPrepTimeSettings(restaurantSlug);
  return basePrepMinutes + (busyModeEnabled ? busyExtraMinutes : 0);
}

/**
 * Flip Busy Mode. Available to BOTH Admin and Cashier — this is the one
 * write on this module that Cashier is allowed to make, which is why it is a
 * surgical single-field update rather than a whole-object save.
 *
 * @param {string} restaurantSlug
 * @param {boolean} enabled
 * @returns {object} the updated settings
 */
export function setBusyMode(restaurantSlug, enabled) {
  const current = getPrepTimeSettings(restaurantSlug);
  return save(restaurantSlug, {
    ...current,
    busyModeEnabled: !!enabled,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Change the two numeric values. Admin only — the calling UI enforces the
 * role, exactly like every other Admin-only action in the app; this function
 * additionally refuses values that aren't whole minutes in range so bad input
 * can never reach a customer screen.
 *
 * @param {string} restaurantSlug
 * @param {{basePrepMinutes?: number, busyExtraMinutes?: number}} patch
 * @returns {{ok:true, settings:object} | {ok:false, reason:"invalid_minutes"}}
 */
export function updatePrepTimeConfig(restaurantSlug, { basePrepMinutes, busyExtraMinutes }) {
  if (basePrepMinutes !== undefined && !isValidMinutes(basePrepMinutes)) {
    return { ok: false, reason: "invalid_minutes" };
  }
  if (busyExtraMinutes !== undefined && !isValidMinutes(busyExtraMinutes)) {
    return { ok: false, reason: "invalid_minutes" };
  }

  const current = getPrepTimeSettings(restaurantSlug);
  const settings = save(restaurantSlug, {
    ...current,
    basePrepMinutes:
      basePrepMinutes !== undefined ? Number(basePrepMinutes) : current.basePrepMinutes,
    busyExtraMinutes:
      busyExtraMinutes !== undefined ? Number(busyExtraMinutes) : current.busyExtraMinutes,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, settings };
}

/**
 * Demo-only helper: wipe one restaurant's prep-time settings back to
 * defaults. Not wired into any customer-facing UI.
 * @param {string} restaurantSlug
 */
export function resetPrepTimeSettings(restaurantSlug) {
  try {
    localStorage.removeItem(prepTimeKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
