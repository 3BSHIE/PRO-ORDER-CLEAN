import { useSettingsData } from "../../lib/useSettingsData.js";
import { buildCustomerThemeVars } from "../../lib/theme.js";
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
