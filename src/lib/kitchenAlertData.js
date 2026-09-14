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
 *   soundEnabled      — master on/off for kitchen alerts  (default true)
 *   soundType         — NEW ORDER sound                   (default "bell")
 *   canceledSoundType — CANCELED ORDER sound (Phase 96)   (default "beep")
 *   volume            — 0..1                              (default 0.8)
 *
 * Phase 96 §38/§39 — two alert PURPOSES now share this record, and the same
 * sound may not serve both at once: a cook must be able to tell "an order
 * arrived" from "stop cooking that" without looking up. The constraint is
 * enforced in one place, assertSoundPurposesDistinct(), and derived from the
 * settings actually stored rather than from any hardcoded pairing.
 *
 * Who reads/writes what:
 *   Admin   — the only role with a UI that writes here (Restaurant Settings)
 *   Kitchen — reads only; the board obeys these settings but cannot change them
 *   Cashier — no access at all (Settings is Admin-only and route-guarded)
 */

import { SOUND_TYPES, DEFAULT_SOUND_TYPE } from "./alertSound.js";

/* The cancellation alert's default. Any value other than DEFAULT_SOUND_TYPE
   satisfies §39 out of the box; "beep" is the sharpest of the three, which
   suits "stop" better than "a ticket arrived". */
export const DEFAULT_CANCELED_SOUND_TYPE = "beep";

/* The alert purposes that must each own a distinct sound. Adding a future
   purpose means adding it here and nowhere else. */
export const SOUND_PURPOSES = [
  { key: "soundType", labelKey: "kitchen.newOrderSound", fallback: "New Order Sound" },
  { key: "canceledSoundType", labelKey: "kitchen.canceledOrderSound", fallback: "Canceled Order Sound" },
];

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
    /* Deliberately NOT the default new-order sound: shipping a record that
       already violates the uniqueness rule would make the first Save fail on
       a conflict the Admin never created. */
    canceledSoundType: DEFAULT_CANCELED_SOUND_TYPE,
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
      canceledSoundType: coerceSoundType(stored.canceledSoundType, defaults.canceledSoundType),
      volume: coerceVolume(stored.volume, defaults.volume),
    };
  } catch {
    return defaults;
  }
}

/**
 * Phase 96 §39 — may this patch be applied, or would it give two alert
 * purposes the same sound?
 *
 * Judged against the settings as they WOULD BE after the patch, not against a
 * fixed table: changing New Order from bell to chime frees bell for the
 * cancellation alert in the same breath, and a rule reading current state
 * gets that right for free.
 *
 * Returns the conflict rather than throwing, so the caller can put the
 * message beside the field the Admin just touched.
 *
 * @param {object} current — settings before the change
 * @param {object} patch
 * @returns {{key:string, conflictsWith:string}|null} null when the patch is fine
 */
/** The DOM id of a sound selector, shared by the card that renders it and the
    Save handler that focuses it when it blocks a write. */
export function soundFieldId(purposeKey) {
  return `ka-sound-${purposeKey}`;
}

/**
 * Phase 96.1 §5 — does this settings object (typically an unsaved DRAFT)
 * already give two alert purposes the same sound?
 *
 * Judged on the object handed in rather than on storage, which is what lets a
 * conflict clear the moment the manager frees the sound in the other selector
 * — no intermediate save required.
 *
 * @param {object} settings — saved record or draft
 * @returns {{key:string, conflictsWith:string}|null}
 */
export function findDuplicateSoundPurpose(settings) {
  for (let i = 0; i < SOUND_PURPOSES.length; i += 1) {
    for (let j = i + 1; j < SOUND_PURPOSES.length; j += 1) {
      const a = SOUND_PURPOSES[i];
      const b = SOUND_PURPOSES[j];
      if (settings?.[a.key] && settings[a.key] === settings[b.key]) {
        return { key: b.key, conflictsWith: a.key };
      }
    }
  }
  return null;
}

export function findSoundPurposeConflict(current, patch) {
  const next = { ...current, ...patch };
  const changedKeys = SOUND_PURPOSES.map((p) => p.key).filter((k) => patch[k] !== undefined);

  for (const key of changedKeys) {
    const clash = SOUND_PURPOSES.find((p) => p.key !== key && next[p.key] === next[key]);
    /* Named from the OTHER purpose's side ("already used for New Orders"),
       which is the half the Admin cannot see from the control they are
       currently using. */
    if (clash) return { key, conflictsWith: clash.key };
  }
  return null;
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

  /* §39 — the constraint is enforced at the storage boundary, not only in the
     UI, so no future caller can write a record where two purposes share one
     sound. The card checks first and shows the inline message; this is the
     guarantee behind it. */
  const conflict = findSoundPurposeConflict(current, patch);
  if (conflict) return { ok: false, conflict, settings: current };

  const next = {
    ...current,
    ...patch,
    soundEnabled:
      patch.soundEnabled !== undefined ? !!patch.soundEnabled : current.soundEnabled,
    soundType:
      patch.soundType !== undefined
        ? coerceSoundType(patch.soundType, current.soundType)
        : current.soundType,
    canceledSoundType:
      patch.canceledSoundType !== undefined
        ? coerceSoundType(patch.canceledSoundType, current.canceledSoundType)
        : current.canceledSoundType,
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
  return { ok: true, settings: next };
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
