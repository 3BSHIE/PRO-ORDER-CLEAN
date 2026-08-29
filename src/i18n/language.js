import { translations } from "./translations.js";

/**
 * language.js — Phase 19.5A (language foundation only)
 *
 * A deliberately tiny internal i18n system — no external library, no
 * provider/context tree. Components either call these functions directly,
 * or use the useLanguage() hook (src/i18n/useLanguage.js) to also get a
 * re-render when the language changes.
 */

const LANGUAGE_STORAGE_KEY = "pro-order-language";
const VALID_LANGUAGES = ["en", "ar"];
const DEFAULT_LANGUAGE = "en";

export const LANGUAGE_CHANGE_EVENT = "pro-order-language-change";

/**
 * getLanguage — reads the stored language preference.
 * @returns {"en"|"ar"} "en" if nothing is stored, or if the stored value
 *   isn't one of the two valid languages.
 */
export function getLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return VALID_LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * applyLanguage — sets document.documentElement.dir/lang for the given
 * language. Does NOT touch storage or dispatch any event; call setLanguage()
 * for the full "change the language" flow. Exposed separately so app
 * bootstrap (main.jsx/App.jsx) can apply the saved language on load without
 * re-triggering a change event.
 * @param {"en"|"ar"} language
 */
export function applyLanguage(language) {
  const isArabic = language === "ar";
  document.documentElement.dir = isArabic ? "rtl" : "ltr";
  document.documentElement.lang = isArabic ? "ar" : "en";
}

/**
 * setLanguage — the full language-change flow: validates, persists, applies
 * dir/lang, and dispatches a CustomEvent so any mounted screen/component can
 * react (see useLanguage.js, which subscribes to this event).
 * @param {"en"|"ar"} language
 */
export function setLanguage(language) {
  if (!VALID_LANGUAGES.includes(language)) return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // localStorage unavailable — still apply in-memory below
  }
  applyLanguage(language);
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language } })
  );
}

/**
 * toggleLanguage — switches en ↔ ar.
 */
export function toggleLanguage() {
  setLanguage(getLanguage() === "en" ? "ar" : "en");
}

/**
 * hasStoredLanguagePreference — true only if the visitor has EVER had a
 * valid language value written to storage (either by explicitly switching,
 * or by a previous call to applyRestaurantDefaultLanguageIfFirstVisit
 * below). Distinct from getLanguage(), which always returns a usable value
 * ("en" as a fallback) even when nothing is stored yet — this function is
 * how Phase 23's "default language, first-time visitors only" rule tells
 * a true first visit apart from a returning one.
 * @returns {boolean}
 */
export function hasStoredLanguagePreference() {
  try {
    return VALID_LANGUAGES.includes(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * applyRestaurantDefaultLanguageIfFirstVisit — Phase 23 Restaurant Settings:
 * a restaurant can configure a "Default Language" for first-time visitors.
 * Returning visitors (or anyone who already switched once) keep whatever
 * they already have — this function only ever acts on a true first visit
 * (no stored preference at all), and only ever runs once per browser.
 * @param {"en"|"ar"} restaurantDefaultLanguage
 */
export function applyRestaurantDefaultLanguageIfFirstVisit(restaurantDefaultLanguage) {
  if (hasStoredLanguagePreference()) return; // respect the visitor's own past choice
  if (!VALID_LANGUAGES.includes(restaurantDefaultLanguage)) return;
  setLanguage(restaurantDefaultLanguage);
}

/* Phase 64 — one warning per distinct bad key shape, so a mis-mapped value
   inside a list of 40 orders reports itself once instead of 40 times per
   render. Dev-only: a guest or a manager can do nothing with this, and it is
   a programming error, not an operating condition. */
const warnedInvalidKeys = new Set();

function warnInvalidTranslationKey(key) {
  try {
    if (!import.meta.env?.DEV) return;
    const shape = `${Object.prototype.toString.call(key)}:${String(key)}`;
    if (warnedInvalidKeys.has(shape)) return;
    warnedInvalidKeys.add(shape);
    console.warn(
      `[i18n] t() received a non-string key (${shape}). This usually means a ` +
      `lookup like t(SOME_MAP[value], fallback) missed. Rendering the fallback.`
    );
  } catch {
    /* Logging must never be the thing that breaks a render — String() on an
       exotic value can itself throw. */
  }
}

/**
 * t — look up a nested translation key against the CURRENT language.
 *
 * @param {string} key — dot-separated, e.g. "admin.adminAccess"
 * @param {string} [fallback] — returned if the key isn't found for the
 *   current language; if omitted, the key itself is returned so missing
 *   translations are obvious during development rather than blank.
 * @returns {string}
 *
 * Phase 64 — invalid keys no longer throw.
 *
 *   Roughly two dozen call sites look up a key through a map, e.g.
 *     t(METHOD_LABEL_KEY[order.paymentMethod.id], order.paymentMethod.label)
 *   Every one of them already supplies a human-readable fallback, which is
 *   exactly the right instinct. But when the map missed, the key arrived
 *   here as undefined and `key.split(".")` threw before the fallback could
 *   ever be used — and since a throw inside render unmounts the React tree,
 *   one unrecognised payment-method id blanked the entire Admin interface.
 *
 *   So a non-string key is now treated as "no translation available",
 *   which is what the caller already meant, and the fallback does its job.
 *
 * Deliberately unchanged: a valid string key that simply is not in the
 * dictionary still returns the fallback, and still returns the key itself
 * when no fallback was given. That behaviour makes missing translations
 * visible during development and is not a crash, so it stays exactly as it
 * was — this guard only covers keys that were never usable strings.
 */
export function t(key, fallback) {
  if (typeof key !== "string") {
    warnInvalidTranslationKey(key);
    /* Only a string fallback is safe to render. A number, object or array
       here would surface as "[object Object]" or leak an internal value into
       the UI, so anything else becomes an empty string: a missing label is
       recoverable, a wrong one is not. */
    return typeof fallback === "string" ? fallback : "";
  }

  const language = getLanguage();
  const table = translations[language] || translations[DEFAULT_LANGUAGE];

  const value = key
    .split(".")
    .reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), table);

  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  return key;
}
