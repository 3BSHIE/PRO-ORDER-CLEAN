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
export default function LanguageSwitcher({ className = "" }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className={`lang-switcher ${className}`} role="group" aria-label="Language">
      <button
        type="button"
        className={`lang-switcher__option ${language === "en" ? "lang-switcher__option--active" : ""}`}
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
      >
        {t("common.english", "English")}
      </button>
      <button
        type="button"
        className={`lang-switcher__option ${language === "ar" ? "lang-switcher__option--active" : ""}`}
        onClick={() => setLanguage("ar")}
        aria-pressed={language === "ar"}
      >
        {t("common.arabic", "العربية")}
      </button>
    </div>
  );
}
