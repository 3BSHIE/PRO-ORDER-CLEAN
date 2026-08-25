import { Info } from "lucide-react";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * CanceledPaymentNotice — Phase 36.
 *
 * The single source of canceled-order payment wording, shared by Tracking,
 * My Orders and the Confirmation screen so a guest can never read one thing
 * on one surface and something different on another.
 *
 * Two states, and only two, because those are the only two the data can be in
 * (paymentStatus is always "paid" or "pending_at_table"):
 *
 *   pending_at_table → "No payment due". The order was cancelled before any
 *                      money changed hands, so the stored total is history,
 *                      not a bill.
 *   paid            → the money WAS recorded, and this app has no refund
 *                      flow. Saying "Refunded" would be a lie the system
 *                      cannot back up, so it states the fact and points the
 *                      guest at a human instead.
 *
 * Renders nothing for any non-canceled order, so callers can mount it
 * unconditionally and every other status keeps its existing payment display
 * untouched.
 *
 * Nothing here reads or writes order data — presentation only. The stored
 * total, payment method and paymentStatus are never modified, and staff keep
 * seeing the real values in Admin.
 *
 * Props:
 *   order   — the order object
 *   variant — "block" (tracking / confirmation) | "inline" (My Orders card)
 */
export default function CanceledPaymentNotice({ order, variant = "block" }) {
  const { t } = useLanguage();

  if (order?.status !== "canceled") return null;

  const wasPaid = order.paymentStatus === "paid";

  /* Compact single line for the dense My Orders card. */
  if (variant === "inline") {
    return (
      <span className={`cx-pay-inline ${wasPaid ? "cx-pay-inline--paid" : ""}`}>
        {wasPaid
          ? t("payment.paidBeforeCancellation", "Payment was recorded before cancellation.")
          : t("payment.noPaymentDue", "No payment due")}
      </span>
    );
  }

  return (
    <div className={`cx-pay-note ${wasPaid ? "cx-pay-note--paid" : ""}`} role="status">
      <span className="cx-pay-note__icon" aria-hidden="true">
        <Info size={15} strokeWidth={2.1} />
      </span>
      <span className="cx-pay-note__text">
        <span className="cx-pay-note__title">
          {wasPaid
            ? t("payment.paidBeforeCancellation", "Payment was recorded before cancellation.")
            : t("payment.noPaymentDue", "No payment due")}
        </span>
        {wasPaid && (
          <span className="cx-pay-note__sub">
            {t("payment.contactStaffAboutPayment", "Please contact staff regarding the payment.")}
          </span>
        )}
      </span>
    </div>
  );
}
