import { useState } from "react";
import { isSafeImageSrc } from "../../lib/safeImage.js";
import { useRestaurantLogoSrc } from "../../lib/restaurantLogoAssets.js";

/**
 * RestaurantLogo — Phase 112.2
 *
 * One place that decides how a restaurant's own logo is painted, wherever it
 * appears: the admin sidebar, the kitchen, the customer's header, the QR
 * stand.
 *
 * ── WHY ONE COMPONENT ────────────────────────────────────────────────────
 * Before this phase each surface wrote its own <img> and its own CSS, and
 * they disagreed: some cropped with object-fit:cover, some had no sizing at
 * all (which is how the admin sidebar ended up with an enormous logo). A logo
 * is not a photograph — cropping one removes part of a mark the restaurant
 * paid for — so every instance now contains rather than covers, keeps its
 * aspect ratio, and sits inside a bounded box the layout can rely on.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 * It does not pick a size. A sidebar logo and a welcome-screen logo are
 * different sizes on purpose; the size comes from the caller's class. This
 * owns the fitting, the fallback and the failure handling, which are what
 * must be identical everywhere.
 *
 * ── SOURCE ───────────────────────────────────────────────────────────────
 * `src` is whatever settings.logoUrl holds: an http(s) URL typed by the
 * restaurant, or an "asset:<id>" reference to an image uploaded from the
 * owner's device. The hook resolves the second kind; the first is passed
 * through untouched, so nothing changes for a restaurant that already had a
 * URL.
 *
 * A source that fails to load is remembered BY VALUE, not as a boolean, so
 * switching to a working logo tries again instead of latching on the old
 * failure.
 */
export default function RestaurantLogo({ src, className = "", alt = "" }) {
  const resolved = useRestaurantLogoSrc(src);
  const [failedSrc, setFailedSrc] = useState(null);

  if (!isSafeImageSrc(resolved) || failedSrc === resolved) return null;

  return (
    <img
      className={`rest-logo ${className}`.trim()}
      src={resolved}
      alt={alt}
      /* Decorative by default: the restaurant's name is always rendered
         beside it, and an alt would make a screen reader say it twice. */
      aria-hidden={alt ? undefined : "true"}
      onError={() => setFailedSrc(resolved)}
    />
  );
}
