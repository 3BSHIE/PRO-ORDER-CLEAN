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

import { defaultWorkingHours, normalizeWorkingHours } from "./acceptingOrders.js";
import { coerceDefaultLanguage } from "../i18n/language.js";
import { normalizeCurrency } from "./format.js";

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
    /* Phase 31 — customer-facing typography. Keys into the curated sets in
       src/lib/theme.js, not raw font-family strings, so a restaurant can only
       ever select a face that has been checked against this design (and that
       carries Arabic-capable fallbacks). */
    headingFont: "playfair",
    bodyFont: "dmSans",
    serviceChargePercent: null, // null = fall back to RESTAURANT.serviceChargePercent
    /* Phase 82.1 — v1 prices in JOD only; normalizeCurrency() below is the
       boundary that keeps this true no matter what is in storage. */
    currency: normalizeCurrency(),
    timeZone: "Asia/Amman",
    defaultLanguage: "en",
    languagesEnabled: { en: true, ar: true },
    paymentMethodsEnabled: { cash_at_table: true, card_at_table: true, online_payment: true },
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    /* Phase 79 — these hours became functional this phase: Accepting Orders'
       Auto mode now reads them, and Auto is the default mode. The previous
       10:00–23:00 default was inherited from Phase 23, when the fields were
       inert and their value could not shut anything.

       It cannot stay. A restaurant that signs up and has not yet opened
       Settings would be silently dark for eleven hours a day — including,
       when this phase was written, at the moment a developer opened the demo
       (08:27 in Amman against a 10:00 opening). A seeded default must not be
       the reason a venue cannot take orders.

       openTime === closeTime is the module's "open around the clock" case
       (see getWorkingHoursState), so this is an honest configuration a real
       24-hour venue could hold rather than a special "unset" sentinel — and
       it keeps the safe direction consistent with the fail-open principle
       that governs the rest of the schedule logic. A restaurant with genuine
       hours simply enters them.

       Phase 79.1 — now seven independent rows rather than one shared window,
       all carrying that same 00:00–00:00 meaning. defaultWorkingHours() owns
       the shape so this file has no second definition of it to fall behind. */
    workingHours: defaultWorkingHours(),
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
    const languagesEnabled = { ...defaults.languagesEnabled, ...(stored.languagesEnabled || {}) };
    return {
      ...defaults,
      ...stored,
      languagesEnabled,
      paymentMethodsEnabled: { ...defaults.paymentMethodsEnabled, ...(stored.paymentMethodsEnabled || {}) },
      /* Phase 82.1 — both of these are resolved at the READ boundary, the same
         idiom workingHours already uses below: whatever is in storage, what
         the app sees is always something the app can honour.

         currency: v1 supports JOD alone, so a legacy "USD" left over from the
         old free-text field resolves to JOD here. It is not preserved as a
         second, contradictory truth waiting to be read by a screen that would
         then disagree with fmtPrice.

         defaultLanguage: can never name a language this restaurant has
         disabled. Phase 82 found a stored default of "ar" with Arabic switched
         off, which sent first-time guests into a language the restaurant does
         not offer. Coercing on read means every consumer — Admin, the customer
         entry, CustomerTheme — is handed the same already-valid value rather
         than each having to remember to re-check it. */
      currency: normalizeCurrency(),
      defaultLanguage: coerceDefaultLanguage(stored.defaultLanguage ?? defaults.defaultLanguage, languagesEnabled),
      /* Phase 79.1 — normalized, NOT shallow-merged.

         The old `{...defaults.workingHours, ...stored.workingHours}` would
         now produce a hybrid record: seven fresh day rows from the defaults
         with a stored `openTime` / `closeTime` / `closedDays` sitting beside
         them, both looking authoritative and free to disagree forever. That
         is exactly the divergence this phase has to prevent.

         normalizeWorkingHours() is therefore the single read layer: it
         migrates a legacy record, passes an already-migrated one through
         unchanged, and returns ONLY the seven day rows. The legacy keys are
         dropped here, so nothing downstream can read them even if they are
         still sitting in localStorage from before the upgrade — and the next
         Settings save writes the normalized shape, removing them for good. */
      workingHours: normalizeWorkingHours(stored.workingHours),
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
  const languagesEnabled = { ...current.languagesEnabled, ...(patch.languagesEnabled || {}) };
  const updated = {
    ...current,
    ...patch,
    languagesEnabled,
    paymentMethodsEnabled: { ...current.paymentMethodsEnabled, ...(patch.paymentMethodsEnabled || {}) },
    /* Phase 82.1 — resolved on the way out as well as on the way in.

       The read boundary alone would be enough for correctness, but writing
       the resolved values means storage itself converges instead of holding a
       stale "USD" / disabled-language default indefinitely — and, more
       importantly, it means updateSettings RETURNS the coerced record. Admin
       Settings adopts that return value as its new draft, so the screen's
       dirty check compares like with like and a save that coerced the default
       language does not leave the form looking unsaved (§14).

       Note this coerces against the MERGED languagesEnabled above, so a patch
       that disables Arabic in the same save that leaves defaultLanguage on
       "ar" is judged against the new state, not the old one. */
    currency: normalizeCurrency(),
    defaultLanguage: coerceDefaultLanguage(
      patch.defaultLanguage ?? current.defaultLanguage,
      languagesEnabled
    ),
    /* Normalized on the way out too, so a patch carrying a partial or
       legacy-shaped workingHours can never reintroduce the old keys into
       storage. `current` is already normalized (it came from getSettings), so
       a patch that touches only one weekday merges cleanly over the other
       six. */
    workingHours: normalizeWorkingHours({
      ...current.workingHours,
      ...(patch.workingHours || {}),
    }),
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
