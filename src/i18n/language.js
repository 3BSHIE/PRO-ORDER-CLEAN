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

/**
 * t — look up a nested translation key against the CURRENT language.
 * @param {string} key — dot-separated, e.g. "admin.adminAccess"
 * @param {string} [fallback] — returned if the key isn't found for the
 *   current language; if omitted, the key itself is returned so missing
 *   translations are obvious during development rather than blank.
 * @returns {string}
 */
export function t(key, fallback) {
  const language = getLanguage();
  const table = translations[language] || translations[DEFAULT_LANGUAGE];

  const value = key
    .split(".")
    .reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), table);

  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  return key;
}
