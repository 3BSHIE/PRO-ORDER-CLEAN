/**
 * RestaurantIdentity — Phase 45.
 *
 * The restaurant's own mark, used everywhere the guest needs to know whose
 * ordering experience they are in. One component with two densities so the
 * hierarchy stays consistent instead of each screen inventing its own:
 *
 *   variant="hero"     the brand moment — Welcome and the Menu header.
 *                      Logo at 44px beside the name in the restaurant's own
 *                      heading font, and the name is the largest text on the
 *                      screen.
 *   variant="compact"  deeper screens (Cart, Tracking, My Orders,
 *                      Confirmation), where the restaurant must stay
 *                      identifiable without a second full header competing
 *                      with the page's own title.
 *
 * The logo is optional by design: a restaurant that has never uploaded one
 * still gets a strong name-only treatment, which is why nothing here reserves
 * space for a missing image.
 *
 * Both the name and the surrounding type inherit the Phase 31 customer theme,
 * so a restaurant's chosen heading font and accent flow through untouched.
 *
 * Props:
 *   name     — the restaurant's display name (already resolved by the caller,
 *              Settings override included). Never translated.
 *   logoUrl  — optional; omitted or empty renders name-only.
 *   variant  — "hero" | "compact"
 */
export default function RestaurantIdentity({ name, logoUrl, variant = "hero" }) {
  if (!name) return null;

  return (
    <div className={`rest-identity rest-identity--${variant}`}>
      {logoUrl && (
        /* Decorative: the name sits right beside it, so an alt would make a
           screen reader announce the restaurant twice. */
        <img className="rest-identity__logo" src={logoUrl} alt="" />
      )}
      <span className="rest-identity__name">{name}</span>
    </div>
  );
}
