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

/** The two languages the product ships. Phase 81 adds no third. */
export const SUPPORTED_LANGUAGES = VALID_LANGUAGES;

/**
 * Phase 81 — which languages a restaurant actually offers its guests.
 *
 * settingsData stores this as a map ({ en: true, ar: true }), which is what
 * the Admin checkboxes write; this turns it into an ordered list of the
 * languages that are both supported and enabled.
 *
 * NEVER returns an empty list. Admin save already refuses to disable the last
 * language, but a hand-edited or partially-written record must not be able to
 * produce a customer UI with no usable locale — so an empty result falls back
 * to English rather than leaving the guest with nothing (§4).
 *
 * @param {object} languagesEnabled — settings.languagesEnabled
 * @returns {Array<"en"|"ar">} at least one entry
 */
export function resolveEnabledLanguages(languagesEnabled) {
  const map = languagesEnabled && typeof languagesEnabled === "object" ? languagesEnabled : {};
  const enabled = VALID_LANGUAGES.filter((code) => map[code] !== false && map[code] !== undefined);
  /* `undefined` counts as disabled above so a record listing only { en: true }
     does not silently enable Arabic; but a record with NOTHING usable falls
     back rather than leaving the guest with no language at all. */
  return enabled.length > 0 ? enabled : [DEFAULT_LANGUAGE];
}

/**
 * Which language the customer should actually be in, given what the
 * restaurant offers (§6).
 *
 * Deliberately in this order:
 *   1. the language already in use, if the restaurant still offers it
 *   2. otherwise the first one it does offer
 *
 * The browser locale is NOT consulted. A guest halfway through ordering must
 * not have their language changed by something they never chose; the only
 * reason to move them is that the restaurant withdrew the one they were in.
 *
 * @param {"en"|"ar"} current
 * @param {Array<string>} enabled
 * @returns {"en"|"ar"}
 */
export function resolveActiveLanguage(current, enabled) {
  const list = Array.isArray(enabled) && enabled.length > 0 ? enabled : [DEFAULT_LANGUAGE];
  return list.includes(current) ? current : list[0];
}

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
 * or by initCustomerLanguage() resolving a first visit below). Distinct from
 * getLanguage(), which always returns a usable value
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
 * Phase 82.1 — THE rule for which language a customer surface should be in.
 *
 * One function, so Admin Settings, the customer entry and CustomerTheme can
 * no longer disagree (§10). It answers the whole question in one pass rather
 * than letting a first-visit default be applied and then corrected:
 *
 *   1. A guest who already chose a language keeps it — as long as the
 *      restaurant still offers it. Their choice is theirs; the restaurant
 *      default is for the FIRST visit, not a standing instruction (§16).
 *   2. A guest whose stored language has since been disabled moves to the
 *      first language the restaurant does offer.
 *   3. A first-time guest gets the restaurant's configured default — but only
 *      if that default is itself enabled. Otherwise the first enabled one.
 *
 * Rule 3 is what Phase 82 found broken: the old first-visit helper never
 * consulted languagesEnabled, so a restaurant defaulting to Arabic with
 * Arabic switched off started its guests in Arabic and only snapped to
 * English a screen later.
 *
 * The browser locale is never consulted, and resolveEnabledLanguages never
 * returns an empty list, so this always yields a usable language.
 *
 * @param {object} settings — restaurant settings (languagesEnabled, defaultLanguage)
 * @returns {"en"|"ar"}
 */
export function resolveCustomerLanguage(settings) {
  const enabled = resolveEnabledLanguages(settings?.languagesEnabled);

  if (hasStoredLanguagePreference()) {
    return resolveActiveLanguage(getLanguage(), enabled);
  }

  const preferred = VALID_LANGUAGES.includes(settings?.defaultLanguage)
    ? settings.defaultLanguage
    : enabled[0];
  return resolveActiveLanguage(preferred, enabled);
}

/**
 * Phase 82.1 — the same coercion, applied to a SETTINGS record rather than to
 * a visitor. Used by the storage layer so a stored defaultLanguage can never
 * name a language the restaurant has disabled (§5/§6).
 *
 * Deliberately does not touch languagesEnabled: turning a language back on to
 * satisfy the default would be the silent auto-enable §8 forbids.
 *
 * @param {"en"|"ar"} defaultLanguage
 * @param {object} languagesEnabled
 * @returns {"en"|"ar"}
 */
export function coerceDefaultLanguage(defaultLanguage, languagesEnabled) {
  const enabled = resolveEnabledLanguages(languagesEnabled);
  const current = VALID_LANGUAGES.includes(defaultLanguage) ? defaultLanguage : enabled[0];
  return resolveActiveLanguage(current, enabled);
}

/**
 * Phase 82.1 — settle the customer's language BEFORE the first paint.
 *
 * ── WHY THIS IS NOT AN EFFECT ────────────────────────────────────────────
 *   The old first-visit helper ran inside a useEffect in CustomerAccessScreen,
 *   which is after the first paint by definition. A restaurant defaulting to
 *   Arabic therefore rendered its entry screen in English and then visibly
 *   snapped to Arabic — the flash §9 asks us to remove.
 *
 *   Moving it to a layout effect does not fix it either: useLanguage()
 *   subscribes to the change event in a PASSIVE effect, so at layout-effect
 *   time no component is listening yet and the dispatch would reach nobody.
 *
 *   What actually works is the hook's own initializer. useLanguage() seeds its
 *   state with useState(() => getLanguage()), which reads storage during
 *   render. So if the correct language is in storage before the children
 *   render, every child is simply born in the right language — no dispatch, no
 *   correction, no second frame. CustomerTheme wraps every customer route and
 *   React renders a parent before its children, so calling this once from
 *   CustomerTheme's own state initializer lands exactly in that window.
 *
 * ── WHY IT DELIBERATELY DOES NOT DISPATCH ────────────────────────────────
 *   It runs before anything has subscribed, so there is no one to notify —
 *   and dispatching during a render phase is how you get React's "cannot
 *   update a component while rendering a different component" warning once
 *   subscribers DO exist. Live enforcement after mount is a separate job with
 *   a separate mechanism: CustomerTheme's effect, which uses the full
 *   setLanguage() flow precisely because by then components are listening.
 *
 * Storage is still written, keeping Phase 23's rule intact: a resolved first
 * visit makes the visitor a returning one, so the restaurant default applies
 * once and never overrides a choice they later make themselves.
 *
 * @param {object} settings — restaurant settings
 * @returns {"en"|"ar"} the language now in force
 */
export function initCustomerLanguage(settings) {
  const next = resolveCustomerLanguage(settings);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // localStorage unavailable — applyLanguage below still puts the document
    // in the right direction for this pageview.
  }
  applyLanguage(next);
  return next;
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
