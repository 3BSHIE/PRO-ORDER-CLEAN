import { useLanguage } from "../../../i18n/useLanguage.js";
import BrandTimeMark from "./BrandTimeMark.jsx";

/* While the food is still coming, the estimate is the useful thing to say.
   Phase 74 §19 adds one more case to the BLOCK variant: at Ready the same
   slot turns into the "your order is ready" message rather than vanishing,
   so the informational pill has a life-cycle instead of disappearing at the
   moment the guest most wants confirmation. Delivered and canceled still
   render nothing — a prep estimate next to a delivered order is noise, and
   §55 D/E explicitly require no lingering preparation treatment there. */
const STATUSES_WITH_ESTIMATE = ["received", "preparing"];

/**
 * PrepTimeEstimate — Phase 26, customer side. Reworked visually in Phase 74.
 *
 * Renders the frozen estimate captured on the order at checkout. Shared by
 * Order Confirmation, Order Tracking, and My Orders so the wording and the
 * "when do we show this?" rule live in exactly one place.
 *
 * This is a pure display of order.estimatedPrepMinutes — it never recomputes
 * from current settings, which is what keeps historical orders stable, and
 * Phase 74 changes none of that arithmetic (§16, §50).
 *
 * PHASE 74 VISUAL CHANGE (§11)
 *   The block variant used a blue-tinted treatment that read as a second
 *   status pill and collided with the blue "Received" badge sitting inches
 *   above it. It is now warm gold/cream: informational, in the brand family,
 *   and clearly not a status.
 *
 * Props:
 *   order   — the order object
 *   variant — "block" (default, boxed row) | "inline" (compact, for lists)
 */
export default function PrepTimeEstimate({ order, variant = "block" }) {
  const { t } = useLanguage();

  const status = order?.status;
  const minutes = order?.estimatedPrepMinutes;
  const hasEstimate = Number.isInteger(minutes);

  /* §19 — Ready is a block-variant-only state. The My Orders list keeps its
     existing behaviour of showing nothing once an order leaves preparing, so
     a long list does not fill with green pills. */
  const isReadyState = variant === "block" && status === "ready";

  if (!isReadyState) {
    /* §55 F — a missing estimate is not invented. Orders placed before
       Phase 26 carry no estimate and simply render nothing, exactly as
       before. */
    if (!hasEstimate) return null;
    if (!STATUSES_WITH_ESTIMATE.includes(status)) return null;
  }

  if (isReadyState) {
    return (
      <div className="prep-estimate prep-estimate--block prep-estimate--ready">
        <span className="prep-estimate__icon">
          {/* §18 — the SAME two-circle mark, now showing its lower
              service/table half. The clock has stopped; the meaning moved
              from "being prepared" to "ready to serve". */}
          <BrandTimeMark phase="serve" />
        </span>
        <span className="prep-estimate__text">
          <span className="prep-estimate__value prep-estimate__value--ready">
            {t("orders.yourOrderIsReady", "Your order is ready")}
          </span>
        </span>
      </div>
    );
  }

  /* {n} is substituted rather than concatenated so Arabic can place the
     number where it reads naturally ("حوالي 20 دقيقة") instead of being
     forced into English word order. */
  const aboutText = t("prep.aboutXMinutes", "About {n} minutes").replace("{n}", minutes);

  if (variant === "inline") {
    /* The compact list form keeps the brand mark out of it — at 12px the
       clipped logo would be unreadable, and a My Orders row does not need
       brand ambience. */
    return (
      <span className="prep-estimate prep-estimate--inline">
        <span>{aboutText}</span>
      </span>
    );
  }

  return (
    <div className="prep-estimate prep-estimate--block">
      <span className="prep-estimate__icon">
        {/* §13/§14 — the upper clock half, with its slow ambient sweep while
            the order is genuinely in progress. */}
        <BrandTimeMark phase="clock" animated />
      </span>
      <span className="prep-estimate__text">
        <span className="prep-estimate__label">
          {t("prep.estimatedPrepTime", "Estimated preparation time")}
        </span>
        <span className="prep-estimate__value">{aboutText}</span>
      </span>
    </div>
  );
}
