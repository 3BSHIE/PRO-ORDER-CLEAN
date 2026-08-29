/**
 * staffCallAlertData — localStorage-backed Staff Call alert-sound settings
 * (Phase 59). Restaurant-scoped, and a deliberate twin of kitchenAlertData.js
 * rather than an extension of it.
 *
 * Why a SEPARATE key from the kitchen's:
 *   These are two different jobs listening for two different events in two
 *   different rooms. A kitchen wants a cue that cuts through extractor noise;
 *   a cashier standing in a quiet dining room may want something softer, or
 *   nothing at all. Sharing one record would mean turning the kitchen down
 *   also turned the waiter bell down, which is not a setting anyone asked
 *   for. So: same shape, same conventions, same volume scale — separate
 *   storage, separate change event, zero interaction.
 *
 * Stored per restaurant (`pro_order_staff_call_alerts:<slug>`):
 *   soundEnabled — master on/off for new staff calls   (default true)
 *   soundType    — "bell" | "chime" | "beep"           (default "bell")
 *   volume       — 0..1                                (default 0.7)
 *
 * Why Bell at 0.7 by default:
 *   Bell is the phrase a dining room already understands — it is literally
 *   the sound of a service bell on a counter. 0.7 sits below the kitchen's
 *   0.8 because the front of house is the quieter room, and because a guest
 *   at a nearby table can hear this one.
 *
 * Who reads/writes what:
 *   Admin   — the only role with a UI that writes here (Restaurant Settings)
 *   Cashier — reads only; hears the alert, cannot change it (Settings is
 *             Admin-only and route-guarded)
 *   Kitchen — never reads this at all; it keeps its own record
 */

import { SOUND_TYPES, DEFAULT_SOUND_TYPE } from "./alertSound.js";

const STAFF_CALL_ALERTS_KEY_PREFIX = "pro_order_staff_call_alerts";

export const STAFF_CALL_ALERT_CHANGE_EVENT = "pro-order-staff-call-alert-change";

function alertsKey(restaurantSlug) {
  return `${STAFF_CALL_ALERTS_KEY_PREFIX}:${restaurantSlug}`;
}

function defaultAlertSettings(restaurantSlug) {
  return {
    restaurantSlug,
    soundEnabled: true,
    soundType: DEFAULT_SOUND_TYPE,
    volume: 0.7,
    updatedAt: null,
  };
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(
      new CustomEvent(STAFF_CALL_ALERT_CHANGE_EVENT, { detail: { restaurantSlug } })
    );
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

function seedIfEmpty(restaurantSlug) {
  try {
    if (localStorage.getItem(alertsKey(restaurantSlug)) === null) {
      localStorage.setItem(
        alertsKey(restaurantSlug),
        JSON.stringify(defaultAlertSettings(restaurantSlug))
      );
    }
  } catch {
    // localStorage unavailable — reads fall back to defaults directly
  }
}

function coerceVolume(value, fallback) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function coerceSoundType(value, fallback) {
  return SOUND_TYPES.includes(value) ? value : fallback;
}

/**
 * This restaurant's staff-call alert settings, merged over defaults and
 * defensively coerced, so a hand-edited or partially-written record can
 * never hand the audio layer an unknown sound type or an out-of-range
 * volume.
 * @param {string} restaurantSlug
 */
export function getStaffCallAlertSettings(restaurantSlug) {
  seedIfEmpty(restaurantSlug);
  const defaults = defaultAlertSettings(restaurantSlug);
  try {
    const raw = localStorage.getItem(alertsKey(restaurantSlug));
    if (!raw) return defaults;
    const stored = JSON.parse(raw);
    return {
      ...defaults,
      ...stored,
      soundEnabled: stored.soundEnabled !== false,
      soundType: coerceSoundType(stored.soundType, defaults.soundType),
      volume: coerceVolume(stored.volume, defaults.volume),
    };
  } catch {
    return defaults;
  }
}

/**
 * Apply a change. Admin-only by UI placement (Restaurant Settings). Writes
 * are surgical field patches rather than whole-object saves.
 *
 * @param {string} restaurantSlug
 * @param {{soundEnabled?: boolean, soundType?: string, volume?: number}} patch
 * @returns {object} the updated settings
 */
export function updateStaffCallAlertSettings(restaurantSlug, patch) {
  const current = getStaffCallAlertSettings(restaurantSlug);
  const next = {
    ...current,
    ...patch,
    soundEnabled:
      patch.soundEnabled !== undefined ? !!patch.soundEnabled : current.soundEnabled,
    soundType:
      patch.soundType !== undefined
        ? coerceSoundType(patch.soundType, current.soundType)
        : current.soundType,
    volume:
      patch.volume !== undefined ? coerceVolume(patch.volume, current.volume) : current.volume,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(alertsKey(restaurantSlug), JSON.stringify(next));
  } catch {
    // localStorage unavailable — fail silently, matches every other data module
  }
  notifyChange(restaurantSlug);
  return next;
}

/**
 * Demo-only helper: wipe one restaurant's staff-call alert settings back to
 * defaults.
 * @param {string} restaurantSlug
 */
export function resetStaffCallAlertSettings(restaurantSlug) {
  try {
    localStorage.removeItem(alertsKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
