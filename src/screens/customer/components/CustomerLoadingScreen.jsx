import { useState } from "react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import BrandLoadingMark from "./BrandLoadingMark.jsx";
import { isSafeImageUrl } from "./RestaurantInfo.jsx";

/**
 * CustomerLoadingScreen — Phase 83. The Customer main/system loading state.
 *
 * ── HIERARCHY, AND WHY IT IS THIS WAY ROUND (§4) ─────────────────────────
 *   1. the restaurant's logo
 *   2. the restaurant's name
 *   3. the PRO·ORDER animated mark, smaller, below, with room around it
 *
 *   The guest scanned a QR code on a table in a specific restaurant. The first
 *   thing they should see is that restaurant — the page has to read "THIS IS
 *   THE RESTAURANT, and something is loading it", never "PRO·ORDER, and by the
 *   way you are at a restaurant". So there is no PRO·ORDER wordmark here at
 *   all: the animated mark alone carries the system's presence, which is
 *   exactly as much attribution as a loading state has earned (§4, §7).
 *
 * ── BACKGROUND (§8) ──────────────────────────────────────────────────────
 *   Nothing here paints its own colour. The screen renders inside
 *   CustomerTheme, so the restaurant's own surfaces and fonts are already in
 *   scope and a themed venue gets a themed loading environment rather than one
 *   hardcoded black screen for everybody. The dark premium default survives
 *   untouched because that is simply what the unthemed variables are.
 *
 * ── NO PROGRESS THEATRE (§38) ────────────────────────────────────────────
 *   No percentage, no bar, no fake steps, no invented server messages, and by
 *   default no "Loading…" caption either — the motion is the message (§9). The
 *   `message` prop exists for a genuinely long-running future state, and the
 *   caller has to have a real reason to pass it.
 *
 * @param {object}  restaurant — { name, logoUrl }, already resolved by caller
 * @param {boolean} settling   — loading has finished; ease the mark out (§11)
 * @param {string}  [message]  — optional restrained copy for a real long wait
 */
export default function CustomerLoadingScreen({ restaurant, settling = false, message }) {
  const { t } = useLanguage();
  const [logoFailed, setLogoFailed] = useState(false);

  const name = (restaurant?.name || "").trim();
  const logoUrl = (restaurant?.logoUrl || "").trim();
  /* §5 — the same guard Restaurant Info uses: only http(s) images, and an
     image that fails to load is dropped rather than leaving the browser's
     broken-image glyph on the venue's first impression. A restaurant with no
     usable logo falls back to its NAME, which is still its own identity —
     never to the PRO·ORDER logo, which would put the platform's mark where
     the venue's should be. */
  const showLogo = isSafeImageUrl(logoUrl) && !logoFailed;

  return (
    <div
      className={`cx-loading ${settling ? "cx-loading--settling" : ""}`}
      /* The visible content is a logo and an animated mark, neither of which
         says anything to a screen reader. role=status plus the visually hidden
         line below is what makes this state perceivable without motion (§32). */
      role="status"
      aria-live="polite"
    >
      <div className="cx-loading__identity">
        {showLogo && (
          <img
            className="cx-loading__logo"
            src={logoUrl}
            alt=""
            onError={() => setLogoFailed(true)}
          />
        )}
        {/* Decorative alt above: the name is right here as real text, so an
            alt would make a screen reader announce the restaurant twice. */}
        {name && <h1 className="cx-loading__name">{name}</h1>}
      </div>

      <div className="cx-loading__mark">
        <BrandLoadingMark settling={settling} />
        {/* Only rendered when a caller has a genuine reason (§9). */}
        {message && <p className="cx-loading__message">{message}</p>}
      </div>

      <span className="sr-only">
        {message || t("customer.loadingExperience", "Loading")}
      </span>
    </div>
  );
}
