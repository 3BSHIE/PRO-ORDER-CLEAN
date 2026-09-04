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
export default function LanguageSwitcher({ className = "", enabled }) {
  const { language, setLanguage, t } = useLanguage();

  const options = Array.isArray(enabled)
    ? Object.keys(LABELS).filter((code) => enabled.includes(code))
    : Object.keys(LABELS);

  if (options.length < 2) return null;

  return (
    <div className={`lang-switcher ${className}`} role="group" aria-label="Language">
      {options.map((code) => (
        <button
          key={code}
          type="button"
          className={`lang-switcher__option ${language === code ? "lang-switcher__option--active" : ""}`}
          onClick={() => setLanguage(code)}
          aria-pressed={language === code}
        >
          {t(LABELS[code].key, LABELS[code].fallback)}
        </button>
      ))}
    </div>
  );
}
