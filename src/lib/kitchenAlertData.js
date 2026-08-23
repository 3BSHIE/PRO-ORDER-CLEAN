/**
 * kitchenAlertData — localStorage-backed kitchen alert-sound settings
 * (Phase 27). Restaurant-scoped, same pattern as every other data module.
 *
 * Kept independent of settingsData.js for the same reason prepTimeData.js is
 * (Phase 26): AdminSettingsScreen edits the whole general-settings object as
 * one draft and saves it in one go. Alert settings are applied immediately
 * as the Admin changes them — so that they can be heard via Test Sound
 * before committing to them — and mixing an apply-on-change group into a
 * draft-then-save object is how stale-draft overwrites happen. Separate key,
 * separate write path, no interaction between the two.
 *
 * Stored per restaurant (`pro_order_kitchen_alerts:<slug>`):
 *   soundEnabled — master on/off for new-order alerts   (default true)
 *   soundType    — "bell" | "chime" | "beep"            (default "bell")
 *   volume       — 0..1                                 (default 0.8)
 *
 * Who reads/writes what:
 *   Admin   — the only role with a UI that writes here (Restaurant Settings)
 *   Kitchen — reads only; the board obeys these settings but cannot change them
 *   Cashier — no access at all (Settings is Admin-only and route-guarded)
 */

import { SOUND_TYPES, DEFAULT_SOUND_TYPE } from "./kitchenAlertSound.js";

const KITCHEN_ALERTS_KEY_PREFIX = "pro_order_kitchen_alerts";

export const KITCHEN_ALERT_CHANGE_EVENT = "pro-order-kitchen-alert-change";

function alertsKey(restaurantSlug) {
  return `${KITCHEN_ALERTS_KEY_PREFIX}:${restaurantSlug}`;
}

function defaultAlertSettings(restaurantSlug) {
  return {
    restaurantSlug,
    soundEnabled: true,
    soundType: DEFAULT_SOUND_TYPE,
    volume: 0.8,
    updatedAt: null,
  };
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(
      new CustomEvent(KITCHEN_ALERT_CHANGE_EVENT, { detail: { restaurantSlug } })
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
 * This restaurant's alert settings, merged over defaults and defensively
 * coerced, so a hand-edited or partially-written record can never hand the
 * audio layer an unknown sound type or an out-of-range volume.
 * @param {string} restaurantSlug
 */
export function getKitchenAlertSettings(restaurantSlug) {
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
 * are surgical field patches rather than whole-object saves, matching
 * prepTimeData.js.
 *
 * @param {string} restaurantSlug
 * @param {{soundEnabled?: boolean, soundType?: string, volume?: number}} patch
 * @returns {object} the updated settings
 */
export function updateKitchenAlertSettings(restaurantSlug, patch) {
  const current = getKitchenAlertSettings(restaurantSlug);
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
 * Demo-only helper: wipe one restaurant's alert settings back to defaults.
 * @param {string} restaurantSlug
 */
export function resetKitchenAlertSettings(restaurantSlug) {
  try {
    localStorage.removeItem(alertsKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
