import { Store } from "lucide-react";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * RestaurantClosedNotice — Phase 79. Shown in the customer's primary ordering
 * area when the restaurant is not accepting new orders.
 *
 * WHY THIS IS NOT InvalidAccessView (§34)
 *   The product keeps four questions in a deliberate order — is the QR/table
 *   valid, is the session valid, is the restaurant accepting orders, is there
 *   anything to order — and this answers the third. InvalidAccessView answers
 *   the first, and it replaces the entire page because when access fails
 *   there is genuinely nothing else to show. Here access has already
 *   SUCCEEDED: the guest is at a real table in a real restaurant, their
 *   session is intact, and their existing orders are still theirs. Folding
 *   this into the access view would have to un-say all of that.
 *
 *   So this occupies the ordering area only. The topbar keeps Call Staff and
 *   My Orders, the header keeps the restaurant's name and logo, the theme
 *   stays the restaurant's, the language control stays where it was, and a
 *   preserved cart keeps its floating button. The guest is told one thing —
 *   new ordering is paused — and nothing else is taken away from them.
 *
 * COPY AND SEVERITY (§35, §36)
 *   Shared recovery geometry (mark → title → helper), amber rather than red,
 *   and service language rather than system language: "we're not accepting
 *   orders right now", never "ordering disabled" or "access denied". Nothing
 *   here implies the QR failed or the table is wrong, because neither is
 *   true. Amber matches the inactive-table and invalid-QR marks — all three
 *   are ordinary situations — while red stays reserved for the error
 *   boundary.
 *
 * MOTION (§37)
 *   Only the existing `anim-rise` entrance the rest of the customer surface
 *   uses. No pulse, no countdown, no animated clock.
 *
 * ACTIONS (§32)
 *   None of its own. The two useful actions — My Orders and Call Staff —
 *   already live in the sticky topbar directly above this notice on every
 *   customer screen, and duplicating them here would put the same two buttons
 *   twice in one viewport. The helper line points at them instead.
 */
export default function RestaurantClosedNotice() {
  const { t } = useLanguage();

  return (
    <div className="closed-notice anim-rise" role="status">
      <span className="closed-notice__icon">
        <Store size={26} strokeWidth={1.8} />
      </span>
      <h2 className="closed-notice__title">
        {t("accepting.customerClosedTitle", "We're not accepting orders right now")}
      </h2>
      <p className="closed-notice__sub">
        {t(
          "accepting.customerClosedSub",
          "You can still view your existing orders. Please check again later or ask a staff member for help."
        )}
      </p>
    </div>
  );
}
