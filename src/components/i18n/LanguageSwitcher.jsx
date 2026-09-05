import { Fragment } from "react";
import { useLanguage } from "../../i18n/useLanguage.js";

/**
 * LanguageSwitcher — a compact segmented control for English / Arabic.
 *
 * Phase 19.5A places this only on: the customer welcome/access screen, the
 * kitchen login screen, the admin login screen, and the AdminLayout topbar.
 * Every other screen keeps working in whichever language is already active
 * (set via document.dir/lang + localStorage) — they just don't yet have a
 * switcher control of their own. That's intentional for this phase.
 */
const LABELS = {
  en: { key: "common.english", fallback: "English" },
  ar: { key: "common.arabic", fallback: "العربية" },
};

/* Phase 83 — the compact variant's labels.
   Deliberately NOT translated. "EN" and "AR" are the language's own code in
   both directions, which is the point of a two-letter switch: an Arabic
   speaker looking for English scans for "EN", not for "الإنجليزية". Localising
   these would mean each language names the OTHER in a script that reader may
   not be looking for. */
const SHORT_LABELS = { en: "EN", ar: "AR" };

/**
 * Phase 81 — `enabled` restricts which languages this control offers.
 *
 * Omitted (Admin, Kitchen, their login screens) it keeps the full pair: a
 * restaurant deciding what its GUESTS see must not narrow the language its
 * own staff work in.
 *
 * With fewer than two entries the component renders NOTHING rather than a
 * one-sided or disabled control (§5). A switcher with a single option is not
 * a choice, and leaving a disabled second button would also leave a
 * focusable control that does nothing (§55).
 */
/**
 * Phase 83 — `variant="compact"` renders the Customer entry treatment: two
 * short codes either side of a hairline divider (EN | AR) rather than a filled
 * segmented control. The landing screen is a restaurant's first impression and
 * a solid gold pill sitting beside the venue's logo competes with the one CTA
 * the page actually has (§16).
 *
 * The default variant is untouched, so Admin, Kitchen and both login screens
 * keep exactly the control they had (§28).
 *
 * In both variants the active language is marked by weight and opacity as well
 * as colour, and carries aria-pressed, so "which language am I in" never
 * depends on seeing a hue (§32).
 */
export default function LanguageSwitcher({ className = "", enabled, variant = "default" }) {
  const { language, setLanguage, t } = useLanguage();

  const options = Array.isArray(enabled)
    ? Object.keys(LABELS).filter((code) => enabled.includes(code))
    : Object.keys(LABELS);

  if (options.length < 2) return null;

  const isCompact = variant === "compact";

  return (
    <div
      className={`lang-switcher lang-switcher--${variant} ${className}`}
      role="group"
      aria-label="Language"
    >
      {options.map((code, i) => (
        <Fragment key={code}>
          {/* A drawn divider rather than a border, so it sits BETWEEN the two
              controls instead of inside either one's hit area. */}
          {isCompact && i > 0 && <span className="lang-switcher__sep" aria-hidden="true" />}
          <button
            type="button"
            className={`lang-switcher__option ${language === code ? "lang-switcher__option--active" : ""}`}
            onClick={() => setLanguage(code)}
            aria-pressed={language === code}
            /* The short code is not a word, so the accessible name has to
               carry the full language regardless of what is painted. */
            aria-label={isCompact ? t(LABELS[code].key, LABELS[code].fallback) : undefined}
          >
            {isCompact ? SHORT_LABELS[code] : t(LABELS[code].key, LABELS[code].fallback)}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
