/**
 * localizedContent — one place that knows how MERCHANT-AUTHORED text is stored
 * and how it becomes a string on screen.
 *
 * Phase 97.7.
 *
 * ── WHAT THIS IS FOR, AND WHAT IT IS NOT ──────────────────────────────────
 * System copy (buttons, status lines, errors) is the i18n layer's job and has
 * translation KEYS. This module is for the text a restaurant writes itself —
 * product names, descriptions, category names, customization labels — which
 * has no key and cannot be translated by the product. It only ever RESOLVES
 * what a merchant typed; nothing here translates anything, and there is
 * deliberately no provider, no guess and no generated text.
 *
 * ── THE TWO SHAPES, AND WHY BOTH ARE PERMANENT ────────────────────────────
 * A localized value is either:
 *
 *   "Classic Burger"                    legacy, and still completely valid
 *   { en: "Classic Burger", ar: "برغر كلاسيك" }
 *
 * Legacy is not a migration state to be cleaned up on startup. Every
 * restaurant's stored menu predates this phase, demo data is seeded as plain
 * strings, and a guest opening the menu must not trigger a rewrite of the
 * merchant's data. So the READ path accepts both forever, and the object shape
 * appears only when an Admin actually saves that field (see §21: no mutation
 * on render).
 *
 * ── RESOLUTION ORDER ──────────────────────────────────────────────────────
 *   1. the requested language, if it holds non-blank text
 *   2. the fallback language, if it holds non-blank text
 *   3. ANY other populated language
 *   4. "" — and the caller keeps whatever empty-state it already had
 *
 * Step 3 is what makes a one-language restaurant work. A venue that writes
 * only Arabic is not required to fill English before its menu is usable, and
 * an English-speaking guest sees the Arabic name rather than a blank card.
 * Inventing a translation, or printing a placeholder, would both be worse than
 * showing the words the merchant actually wrote.
 *
 * ── WHY EVERY READ GOES THROUGH HERE ──────────────────────────────────────
 * The failure this prevents is `[object Object]`. A localized value reaching
 * JSX unresolved renders as that, silently, in whichever screen was missed —
 * so the rule is that no component indexes into one of these values itself.
 */

/** The content languages the product supports, in fallback preference order. */
export const CONTENT_LANGUAGES = ["en", "ar"];

/** The language a legacy string is assumed to be in when it is first saved. */
export const BASE_CONTENT_LANGUAGE = "en";

function isBlank(text) {
  return typeof text !== "string" || text.trim() === "";
}

/**
 * Is this value already in the bilingual object shape?
 * Arrays and null are objects to `typeof`, hence the explicit guards.
 */
function isLocalizedObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * The string to put on screen.
 *
 * Total: every input shape returns a string, including null, undefined, a
 * number, or an object with no usable text. A caller can render the result
 * directly without a guard.
 *
 * @param {string|object|null|undefined} value
 * @param {string} language            the language to prefer (the CUSTOMER's)
 * @param {string} [fallbackLanguage]  tried second; defaults to English
 * @returns {string}
 */
export function getLocalizedText(value, language, fallbackLanguage = BASE_CONTENT_LANGUAGE) {
  /* Legacy: the whole value is the text, in whatever language it was written. */
  if (typeof value === "string") return value;

  if (!isLocalizedObject(value)) return "";

  if (!isBlank(value[language])) return value[language];
  if (!isBlank(value[fallbackLanguage])) return value[fallbackLanguage];

  /* Any other populated language — the one-language restaurant case. */
  for (const code of CONTENT_LANGUAGES) {
    if (!isBlank(value[code])) return value[code];
  }
  return "";
}

/**
 * Write one language without disturbing the other.
 *
 * Takes the CURRENT value so editing the Arabic of a legacy string keeps the
 * original text as the English rather than discarding it — the merchant never
 * loses what they had by filling in the second language.
 *
 * @param {string|object|null|undefined} value
 * @param {string} language
 * @param {string} text
 * @returns {{[lang:string]: string}}
 */
export function setLocalizedText(value, language, text) {
  const next = normalizeLocalizedText(value);
  next[language] = typeof text === "string" ? text : "";
  return next;
}

/**
 * The bilingual object form of a value, for WRITING.
 *
 * A legacy string lands in the base language, because that is the only honest
 * assumption available — nothing here inspects the script to guess, since a
 * transliterated name would be misfiled and a merchant can move it in one
 * edit anyway.
 *
 * Called on SAVE, never on render (§21).
 *
 * @param {string|object|null|undefined} value
 * @param {string} [baseLanguage]
 * @returns {{[lang:string]: string}}
 */
export function normalizeLocalizedText(value, baseLanguage = BASE_CONTENT_LANGUAGE) {
  const out = {};
  for (const code of CONTENT_LANGUAGES) out[code] = "";

  if (typeof value === "string") {
    out[baseLanguage] = value;
    return out;
  }
  if (isLocalizedObject(value)) {
    for (const code of CONTENT_LANGUAGES) {
      if (typeof value[code] === "string") out[code] = value[code];
    }
  }
  return out;
}

/**
 * Trim every language in place, for save-time normalization.
 * @param {string|object|null|undefined} value
 * @returns {{[lang:string]: string}}
 */
export function trimLocalizedText(value) {
  const next = normalizeLocalizedText(value);
  for (const code of CONTENT_LANGUAGES) next[code] = next[code].trim();
  return next;
}

/**
 * Does the merchant have SOMETHING here, in any language?
 *
 * This is the validation rule for a required merchant name (§36): at least one
 * language must carry real text, and neither language is individually
 * required. A venue is never forced to translate in order to save.
 *
 * @param {string|object|null|undefined} value
 * @returns {boolean}
 */
export function hasLocalizedText(value) {
  if (typeof value === "string") return !isBlank(value);
  if (!isLocalizedObject(value)) return false;
  return CONTENT_LANGUAGES.some((code) => !isBlank(value[code]));
}

/**
 * Every distinct string a value holds — used by menu search (§29).
 *
 * Searching all variants is what keeps a guest from losing discoverability
 * because the interface happens to be in the other language: typing "chicken"
 * finds برغر دجاج, and typing "دجاج" finds it too. Cheap for a local dataset,
 * and it needs no index.
 *
 * @param {string|object|null|undefined} value
 * @returns {string[]} non-blank strings, possibly empty
 */
export function localizedVariants(value) {
  if (typeof value === "string") return isBlank(value) ? [] : [value];
  if (!isLocalizedObject(value)) return [];
  const seen = [];
  for (const code of CONTENT_LANGUAGES) {
    const text = value[code];
    if (!isBlank(text) && !seen.includes(text)) seen.push(text);
  }
  return seen;
}

/**
 * Resolve a list of merchant-authored strings — the shape used by removable
 * ingredients, which is an array whose ENTRIES are localized values.
 *
 * Blank entries are dropped rather than rendered as empty list items.
 *
 * @param {Array<string|object>|null|undefined} list
 * @param {string} language
 * @returns {string[]}
 */
export function getLocalizedList(list, language) {
  if (!Array.isArray(list)) return [];
  return list.map((entry) => getLocalizedText(entry, language)).filter((text) => !isBlank(text));
}
