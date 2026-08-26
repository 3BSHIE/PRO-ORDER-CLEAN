import Logo from "../../../components/brand/Logo.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * CustomerFooter — Phase 45.
 *
 * PRO·ORDER's entire presence in the customer experience, in one place.
 *
 * Before this phase the platform mark sat in every customer topbar at 40px
 * and opened the Welcome screen at 100px, while the restaurant got an 11px
 * uppercase eyebrow — the guest was shown the software more prominently than
 * the restaurant they were sitting in. That is inverted here: the topbars now
 * carry the restaurant, and PRO·ORDER appears once per screen, at the end of
 * the content, as provider attribution.
 *
 * Deliberately quiet:
 *   • a 16px icon and muted body text, not the brand accent — attribution
 *     should read as a credit line, not as something to click. It stays out
 *     of the restaurant's theme colours for exactly that reason, while the
 *     restaurant's own identity takes them fully.
 *   • no links. The product has no public URL to point at yet, and inventing
 *     one would be worse than omitting it.
 *   • not sticky, and rendered inside the normal content flow, so it can
 *     never sit over the cart bar, the cart FAB or a safe-area inset.
 *
 * This is attribution, not white-label: PRO·ORDER stays visible on every
 * customer screen, just no longer louder than the restaurant.
 */
export default function CustomerFooter() {
  const { t } = useLanguage();

  return (
    <footer className="cust-footer">
      <div className="cust-footer__mark">
        <Logo variant="icon" size="nav" className="cust-footer__logo" />
        <span className="cust-footer__powered">
          {t("common.poweredBy", "Powered by")} <strong>PRO·ORDER</strong>
        </span>
      </div>
      <p className="cust-footer__tagline">
        {t("common.platformTagline", "Digital ordering technology for restaurants")}
      </p>
    </footer>
  );
}
