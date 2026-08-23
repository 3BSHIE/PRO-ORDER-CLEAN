/**
 * settingsData — localStorage-backed restaurant settings storage (Phase 23).
 *
 * Restaurant isolation: exactly the same pattern as menuData.js/tableData.js
 * — every function takes a `restaurantSlug` as its first argument and
 * reads/writes a key scoped to that restaurant alone
 * (`pro_order_settings:<slug>`). Editing Lumière's settings can never touch
 * another restaurant's settings.
 *
 * Brand identity rule: settings only ever customize the RESTAURANT's own
 * name/logo/colors — they never control or replace the PRO·ORDER platform
 * logo, which every screen renders independently via
 * src/components/brand/Logo.jsx. A restaurant's custom `name`/`logoUrl`
 * always appears *alongside* PRO·ORDER, never instead of it. See each
 * consuming screen for how the two are combined.
 *
 * Payment "enabled" here means *visibility* only (Phase 23 requirement):
 * whether a method appears at all in the customer's payment picker. It's
 * layered on top of — not a replacement for — paymentMethods.js's own
 * `enabled` field, which is the functional-readiness flag (Online Payment
 * stays functionally disabled/"coming soon" regardless of this toggle).
 */

const SETTINGS_KEY_PREFIX = "pro_order_settings";

export const SETTINGS_CHANGE_EVENT = "pro-order-settings-change";

function settingsKey(restaurantSlug) {
  return `${SETTINGS_KEY_PREFIX}:${restaurantSlug}`;
}

/* Sensible defaults — match the app's existing look/behavior exactly, so a
   restaurant that never opens Settings sees no change at all. */
function defaultSettings(restaurantSlug) {
  return {
    restaurantSlug,
    name: "",              // "" = fall back to the static RESTAURANT.name
    logoUrl: "",
    coverImageUrl: "",
    description: "",
    primaryColor: "#d4a94e",   // matches the app's existing gold
    accentColor: "#0d0d0d",    // matches the app's existing charcoal
    serviceChargePercent: null, // null = fall back to RESTAURANT.serviceChargePercent
    currency: "JOD",
    timeZone: "Asia/Amman",
    defaultLanguage: "en",
    languagesEnabled: { en: true, ar: true },
    paymentMethodsEnabled: { cash_at_table: true, card_at_table: true, online_payment: true },
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    workingHours: { openTime: "10:00", closeTime: "23:00", closedDays: [] },
    updatedAt: null,
  };
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

function seedIfEmpty(restaurantSlug) {
  try {
    if (localStorage.getItem(settingsKey(restaurantSlug)) === null) {
      localStorage.setItem(settingsKey(restaurantSlug), JSON.stringify(defaultSettings(restaurantSlug)));
    }
  } catch {
    // localStorage unavailable — getSettings falls back to defaults directly
  }
}

/** This restaurant's settings, merged over the defaults (so a partially-
    saved object from an older shape never crashes a screen expecting a
    newer field — same defensive merge every settings screen should do). */
export function getSettings(restaurantSlug) {
  seedIfEmpty(restaurantSlug);
  const defaults = defaultSettings(restaurantSlug);
  try {
    const raw = localStorage.getItem(settingsKey(restaurantSlug));
    if (!raw) return defaults;
    const stored = JSON.parse(raw);
    return {
      ...defaults,
      ...stored,
      languagesEnabled: { ...defaults.languagesEnabled, ...(stored.languagesEnabled || {}) },
      paymentMethodsEnabled: { ...defaults.paymentMethodsEnabled, ...(stored.paymentMethodsEnabled || {}) },
      workingHours: { ...defaults.workingHours, ...(stored.workingHours || {}) },
    };
  } catch {
    return defaults;
  }
}

/**
 * @param {string} restaurantSlug
 * @param {object} patch — any subset of the settings shape (see defaultSettings)
 * @returns {object} the updated, fully-merged settings
 */
export function updateSettings(restaurantSlug, patch) {
  const current = getSettings(restaurantSlug);
  const updated = {
    ...current,
    ...patch,
    languagesEnabled: { ...current.languagesEnabled, ...(patch.languagesEnabled || {}) },
    paymentMethodsEnabled: { ...current.paymentMethodsEnabled, ...(patch.paymentMethodsEnabled || {}) },
    workingHours: { ...current.workingHours, ...(patch.workingHours || {}) },
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(settingsKey(restaurantSlug), JSON.stringify(updated));
  } catch {
    // localStorage unavailable — fail silently, matches menuData.js's pattern
  }
  notifyChange(restaurantSlug);
  return updated;
}

/**
 * Demo-only helper: wipe one restaurant's settings back to defaults. Not
 * wired into any customer-facing UI. Only clears the given restaurant's key.
 * @param {string} restaurantSlug
 */
export function resetSettings(restaurantSlug) {
  try {
    localStorage.removeItem(settingsKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
