import {
  CONTENT_LANGUAGES,
  setLocalizedText,
  BASE_CONTENT_LANGUAGE,
} from "../../lib/localizedContent.js";
import { useLanguage } from "../../i18n/useLanguage.js";

/* The language chip's own label, written in that language. Deliberately not
   translated: "English" must read as English to an Arabic-speaking manager and
   "العربية" as Arabic to an English-speaking one, because the chip's whole job
   is to say WHICH language this box holds (§38). A chip that changed with the
   interface would leave a manager guessing which box is which. */
const LANGUAGE_CHIP = { en: "EN", ar: "ع" };
const LANGUAGE_NAME = { en: "English", ar: "العربية" };
const LANGUAGE_DIR  = { en: "ltr", ar: "rtl" };

/**
 * LocalizedField — one merchant-authored value, edited in every content
 * language at once.
 *
 * Phase 97.7 §15/§17/§38.
 *
 * ── WHY PAIRED FIELDS RATHER THAN TABS ────────────────────────────────────
 * A tabbed editor hides half the content behind a control the manager has to
 * discover, and this form already has real tabs' worth of structure —
 * customization groups, options, add-ons. Stacking the two languages keeps
 * the second one visible without adding a mode: the manager can see at a
 * glance which products are translated and which are not, which is the
 * question they actually have. The cost is one extra row per field, paid for
 * by a compact chip instead of a second full label.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 * It never writes to storage and never normalizes on its own. It hands the
 * caller a new localized object and the caller's existing draft/dirty/save
 * lifecycle carries it, unchanged — so viewing a legacy product still cannot
 * rewrite it (§21).
 *
 * Props:
 *   label       the field's name, already translated by the caller
 *   value       string (legacy) | { en, ar } | null
 *   onChange    (nextLocalizedValue) => void
 *   error       message shown under the pair, or null
 *   required    marks the LABEL only; validity is "at least one language"
 *   multiline   render textareas instead of inputs
 *   rows        textarea rows
 *   placeholder optional, per-language placeholder text
 *   compact     smaller type, for nested rows (options, add-ons, ingredients)
 */
export default function LocalizedField({
  label,
  value,
  onChange,
  error = null,
  required = false,
  multiline = false,
  rows = 3,
  placeholder = "",
  compact = false,
  id,
}) {
  const { t } = useLanguage();

  function handle(language, text) {
    onChange(setLocalizedText(value, language, text));
  }

  return (
    <div className={`lfield ${compact ? "lfield--compact" : ""} ${error ? "lfield--error" : ""}`}>
      {label && (
        <span className="field__label lfield__label">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </span>
      )}

      {CONTENT_LANGUAGES.map((code) => {
        const inputId = id ? `${id}-${code}` : undefined;
        /* The accessible name carries the language in words; the visible chip
           is short so the row stays one line on a phone. */
        const aria = `${label || ""} — ${LANGUAGE_NAME[code]}`.trim();
        return (
          <div className="lfield__row" key={code}>
            <label className="lfield__chip" htmlFor={inputId} title={LANGUAGE_NAME[code]}>
              {LANGUAGE_CHIP[code]}
            </label>
            {multiline ? (
              <textarea
                id={inputId}
                className={`input lfield__input ${error ? "input--error" : ""}`}
                dir={LANGUAGE_DIR[code]}
                rows={rows}
                value={getOwn(value, code)}
                placeholder={placeholder}
                aria-label={aria}
                onChange={(e) => handle(code, e.target.value)}
              />
            ) : (
              <input
                id={inputId}
                className={`input lfield__input ${error ? "input--error" : ""}`}
                dir={LANGUAGE_DIR[code]}
                value={getOwn(value, code)}
                placeholder={placeholder}
                aria-label={aria}
                onChange={(e) => handle(code, e.target.value)}
              />
            )}
          </div>
        );
      })}

      {error && <span className="field__hint field__hint--error">{error}</span>}
      {!error && required && (
        <span className="field__hint lfield__hint">
          {t("admin.oneLanguageIsEnough", "One language is enough — the other is optional.")}
        </span>
      )}
    </div>
  );
}

/**
 * The raw stored text for ONE language — NOT the resolved display value.
 *
 * An editor must show exactly what is in that box, or the English field would
 * appear to contain the Arabic text (via fallback) and typing would overwrite
 * a translation the manager never meant to touch. The one exception is a
 * legacy string, which getLocalizedText correctly reports for the base
 * language and as empty for the other.
 */
function getOwn(value, code) {
  /* A legacy string belongs to the base language — the same assumption
     normalizeLocalizedText makes on save, so what the manager sees here is
     what will be stored. */
  if (typeof value === "string") return code === BASE_CONTENT_LANGUAGE ? value : "";
  if (!value || typeof value !== "object") return "";
  return typeof value[code] === "string" ? value[code] : "";
}
