import { useState } from "react";
import { isSafeImageUrl } from "../../../lib/safeImage.js";

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
  /* ── Phase 84.1 — no broken-image icons ────────────────────────────────
     This used to render the <img> whenever logoUrl was any non-empty string,
     with no validation and no error handling. A restaurant whose logo URL was
     mistyped, unreachable, or simply not an image got the browser's broken-
     image glyph next to its own name — on the Menu header, the Cart, Tracking,
     My Orders, Confirmation and inside the Restaurant Info sheet.

     The Welcome screen and the Loading screen already did this correctly
     (Unit 1): validate the URL, listen for onError, and fall back. This brings
     the shared component in line with them, using the SAME helper rather than
     a second validation system (§3).

     The fallback needs no new markup. A restaurant with no logo has always
     rendered name-only here — that is what the component was designed for —
     so a logo that fails produces exactly the DOM an absent logo produces.
     Nothing about layout, spacing, typography or size changes (§4/§15).

     Why the failure is tracked as a URL rather than a boolean: a boolean
     would latch. Once a broken logo failed, switching the restaurant to a
     working one would keep showing the fallback until the component
     unmounted. Storing WHICH url failed makes the state self-clearing — a new
     logoUrl no longer matches, so the image is attempted again (test case E). */
  const [failedUrl, setFailedUrl] = useState(null);

  if (!name) return null;

  const showLogo = isSafeImageUrl(logoUrl) && failedUrl !== logoUrl;

  return (
    <div className={`rest-identity rest-identity--${variant}`}>
      {showLogo && (
        /* Decorative: the name sits right beside it, so an alt would make a
           screen reader announce the restaurant twice. Unchanged (§10) — and
           it stays correct in the fallback, where the name simply becomes the
           only thing there is to read. */
        <img
          className="rest-identity__logo"
          src={logoUrl}
          alt=""
          onError={() => setFailedUrl(logoUrl)}
        />
      )}
      <span className="rest-identity__name">{name}</span>
    </div>
  );
}
