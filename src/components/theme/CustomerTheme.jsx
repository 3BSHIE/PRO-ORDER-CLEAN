import { useEffect } from "react";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { buildCustomerThemeVars } from "../../lib/theme.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { resolveEnabledLanguages, resolveActiveLanguage, setLanguage } from "../../i18n/language.js";
import ErrorBoundary from "../system/ErrorBoundary.jsx";

/**
 * CustomerTheme — Phase 31. Applies one restaurant's saved theme to the
 * customer experience, and ONLY to the customer experience.
 *
 * Scoping is structural, not conditional: this wrapper is mounted around the
 * customer routes in App.jsx and nowhere else. Admin and Kitchen routes are
 * never wrapped, so there is no code path by which a restaurant's colours or
 * fonts could reach the operational UI — those screens keep the consistent
 * PRO·ORDER design because they simply live outside this element. That is
 * safer than applying variables to <html> and trying to clean them up on
 * navigation, which leaks the moment a cleanup is missed.
 *
 * `display: contents` means this element generates no box at all — the
 * children lay out exactly as if it were not here, so the sticky Topbar and
 * every existing customer layout are untouched. CSS custom properties still
 * inherit through it, because inheritance follows the DOM tree regardless of
 * display.
 *
 * Reading through useSettingsData means a saved theme change reaches an
 * already-open customer screen through the same live mechanism as every other
 * setting — no reload, and no new refresh machinery.
 *
 * PRO·ORDER branding is untouched by anything here: the Logo component paints
 * its own asset and is never driven by these variables.
 */
export default function CustomerTheme({ restaurantSlug, children }) {
  const { settings } = useSettingsData(restaurantSlug);
  const themeVars = buildCustomerThemeVars(settings);

  /* ── Phase 81 — enforce the restaurant's enabled languages ─────────────
     This wrapper already sits around every customer route and nothing else,
     which makes it the one place that can guarantee no customer screen ever
     renders in a language the restaurant has switched off. Putting the check
     in each screen would mean six chances to forget it, and putting it in the
     language module would apply it to Admin and Kitchen too — which must keep
     both languages regardless of what a restaurant offers its guests.

     It only ever moves the guest when their current language has actually
     been withdrawn (see resolveActiveLanguage), so switching between two
     enabled languages is untouched. Because the settings hook re-reads on the
     change event, an Admin saving "English only" reaches an open Arabic
     customer screen and flips it without a reload (§38). */
  const { language } = useLanguage();
  useEffect(() => {
    const enabled = resolveEnabledLanguages(settings.languagesEnabled);
    const next = resolveActiveLanguage(language, enabled);
    /* The normal setLanguage flow — persist, apply dir/lang, dispatch — so
       every mounted screen re-renders exactly as it would on a manual
       switch (§55). */
    if (next !== language) setLanguage(next);
  }, [language, settings.languagesEnabled]);

  return (
    <div className="customer-theme" style={themeVars}>
      {/* Phase 65 — inside the theme wrapper rather than outside it, so a
          guest meeting a failure still sees the restaurant own colours and
          fonts rather than being dropped onto an unbranded page. One
          placement covers all six customer routes. */}
      <ErrorBoundary label={`customer:${restaurantSlug}`} resetKey={restaurantSlug}>
        {children}
      </ErrorBoundary>
    </div>
  );
}
