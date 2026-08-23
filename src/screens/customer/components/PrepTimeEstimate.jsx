import { Clock } from "lucide-react";
import { useLanguage } from "../../../i18n/useLanguage.js";

/* The estimate is only meaningful while the food is still coming. Once the
   order is Ready or Delivered the existing status message already tells the
   guest what they need to know, and a stale "About 20 minutes" next to
   "Your order is ready" would be actively confusing. Canceled likewise. */
const STATUSES_WITH_ESTIMATE = ["received", "preparing"];

/**
 * PrepTimeEstimate — Phase 26, customer side.
 *
 * Renders the frozen estimate captured on the order at checkout. Shared by
 * Order Confirmation, Order Tracking, and My Orders so the wording and the
 * "when do we show this?" rule live in exactly one place.
 *
 * Renders nothing at all when:
 *   • the order predates Phase 26 (estimatedPrepMinutes is null/undefined —
 *     every order already sitting in localStorage from Phase 24/25), or
 *   • the order has moved past preparing (ready/delivered/canceled).
 *
 * This is a pure display of order.estimatedPrepMinutes — it never recomputes
 * from current settings, which is what keeps historical orders stable.
 *
 * Props:
 *   order   — the order object
 *   variant — "block" (default, boxed row) | "inline" (compact, for lists)
 */
export default function PrepTimeEstimate({ order, variant = "block" }) {
  const { t } = useLanguage();

  const minutes = order?.estimatedPrepMinutes;
  if (!Number.isInteger(minutes)) return null;
  if (!STATUSES_WITH_ESTIMATE.includes(order.status)) return null;

  /* {n} is substituted rather than concatenated so Arabic can place the
     number where it reads naturally ("حوالي 20 دقيقة") instead of being
     forced into English word order. */
  const aboutText = t("prep.aboutXMinutes", "About {n} minutes").replace("{n}", minutes);

  if (variant === "inline") {
    return (
      <span className="prep-estimate prep-estimate--inline">
        <Clock size={12} strokeWidth={2.2} />
        <span>{aboutText}</span>
      </span>
    );
  }

  return (
    <div className="prep-estimate prep-estimate--block">
      <span className="prep-estimate__icon">
        <Clock size={15} strokeWidth={2} />
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
