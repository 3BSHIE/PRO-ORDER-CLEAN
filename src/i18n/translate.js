import { translations } from "./translations.js";

/**
 * translate — Phase 111.1
 *
 * t() for a language that is NOT the one the interface is in.
 *
 * Almost everything in PRO-ORDER reads useLanguage(), because almost
 * everything should follow the operator's choice. Two things must not: the
 * printed table stand carries both faces at once, and the Revenue Report is
 * bilingual by requirement regardless of which language the Admin is using.
 *
 * Resolution mirrors t()'s own order — the requested language, then English,
 * then the caller's fallback — so a key that is somehow missing in Arabic
 * prints readable English rather than a raw key.
 *
 * @param {"en"|"ar"} language
 * @param {string} key — "namespace.name"
 * @param {string} [fallback]
 * @returns {string}
 */
export function translate(language, key, fallback = "") {
  const [ns, name] = String(key).split(".");
  const value = translations[language]?.[ns]?.[name];
  if (typeof value === "string") return value;
  const en = translations.en?.[ns]?.[name];
  return typeof en === "string" ? en : fallback;
}
