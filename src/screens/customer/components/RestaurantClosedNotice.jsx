import { Store, Clock } from "lucide-react";
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
 * PHASE 90 — TWO REASONS, TWO SENTENCES (§8, §9)
 *   Until now this said "we're not accepting orders right now" whatever the
 *   cause. Those are two different facts to a guest sitting at a table:
 *
 *     the venue is SHUT           they should come back another time
 *     the venue is open but has
 *     paused online ordering      they can still ask a waiter
 *
 *   Saying "we're closed" to someone looking at a lit dining room is simply
 *   wrong, and §9 forbids it explicitly. The distinction was already in the
 *   data — getAcceptingOrdersState returns forced_closed for the manual pause
 *   and the schedule's own reason (outside_hours / closed_day) for a real
 *   closure — so this only had to stop discarding it.
 *
 *   A NEXT-OPENING TIME IS DELIBERATELY NOT SHOWN. §8 allows one "only if the
 *   frontend can reliably determine it", and this one cannot: the working-
 *   hours state exposes TODAY's openTime, not a forward scan across days. For
 *   a closure after today's close, or on a closed day, that value is a time
 *   already in the past — so printing it would state something false. §35
 *   rules that out, and §8's own escape clause covers omitting it.
 *
 * ACTIONS (§32)
 *   None of its own. The two useful actions — My Orders and Call Staff —
 *   already live in the sticky topbar directly above this notice on every
 *   customer screen, and duplicating them here would put the same two buttons
 *   twice in one viewport. The helper line points at them instead.
 */
/* Which closures are a genuine PHYSICAL closure, per the schedule. Anything
   else that blocks ordering (today: the manual forced_closed override) is a
   paused-ordering situation, not a shut restaurant. Listing the physical
   reasons explicitly — rather than treating everything-but-forced_closed as
   physical — means a reason added later defaults to the SAFER copy: claiming
   ordering is paused when a venue is shut is a much smaller error than
   claiming a venue is shut when it is open. */
const PHYSICALLY_CLOSED_REASONS = ["outside_hours", "closed_day"];

/**
 * @param {string} [reason] — getAcceptingOrdersState().reason. Absent falls
 *   back to the paused-ordering wording, for the reason above.
 */
export default function RestaurantClosedNotice({ reason }) {
  const { t } = useLanguage();
  const physicallyClosed = PHYSICALLY_CLOSED_REASONS.includes(reason);

  return (
    <div className="closed-notice anim-rise" role="status">
      <span className="closed-notice__icon" aria-hidden="true">
        {physicallyClosed ? <Clock size={26} strokeWidth={1.8} /> : <Store size={26} strokeWidth={1.8} />}
      </span>
      <h2 className="closed-notice__title">
        {physicallyClosed
          ? t("accepting.customerClosedNowTitle", "We're closed right now")
          : t("accepting.orderingUnavailableTitle", "Online ordering is temporarily unavailable")}
      </h2>
      <p className="closed-notice__sub">
        {physicallyClosed
          ? t(
              "accepting.customerClosedNowSub",
              "You can still view your existing orders. Please check again during opening hours."
            )
          : t(
              "accepting.orderingUnavailableSub",
              "New orders can't be placed at the moment. You can still view your existing orders, or ask a staff member for help."
            )}
      </p>
    </div>
  );
}
