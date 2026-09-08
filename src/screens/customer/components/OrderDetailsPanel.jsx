import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import CanceledPaymentNotice from "./CanceledPaymentNotice.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { formatItemCount } from "../../../i18n/counts.js";
import { fmtPrice } from "../../../lib/format.js";

/* Maps a payment method's stable id to its translation key. The frozen
   English label captured on the order at checkout is the fallback, so a
   historical order always resolves to something readable. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};

/**
 * OrderDetailsPanel — Phase 88 (§15).
 *
 * The order's contents, demoted from a large always-open card to a
 * collapsible section.
 *
 * ══ WHY COLLAPSED BY DEFAULT ═════════════════════════════════════════════
 *   On Tracking the guest's question is "where is my food", not "what did I
 *   order" — they chose it four minutes ago. The old card answered the second
 *   question at full size, pushing the status route and the timer up and off
 *   a phone screen. Collapsed, the panel still answers it in one line and
 *   opens on request.
 *
 *   The collapsed line is deliberately the two facts worth confirming at a
 *   glance — how many items, and the total — because those are what a guest
 *   checks against what actually arrives.
 *
 * ══ WHAT IS DELIBERATELY NOT IN HERE (§15) ═══════════════════════════════
 *   Restaurant name, table number, order number and customer name. All four
 *   are already in the context block at the top of Tracking, and repeating
 *   them inside the details was the single largest source of duplication on
 *   the old screen.
 *
 * ══ HOW IT OPENS ═════════════════════════════════════════════════════════
 *   grid-template-rows 0fr -> 1fr. It animates to the content's real height
 *   without anyone measuring anything, which is what keeps a long note or a
 *   heavily customised line from being clipped by a hardcoded max-height. The
 *   region is unmounted when closed, so its content is out of the tab order
 *   and out of the accessibility tree rather than merely invisible.
 */
export default function OrderDetailsPanel({ order, renderLineItem, children }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const isCanceled = order.status === "canceled";
  const itemCount = order.items.reduce((sum, line) => sum + (line.quantity || 0), 0);
  const paymentMethodLabel = t(
    METHOD_LABEL_KEY[order.paymentMethod?.id],
    order.paymentMethod?.label || ""
  );

  return (
    <section className={`odetails ${open ? "odetails--open" : ""}`}>
      <h2 className="sr-only">{t("orders.orderDetails", "Order details")}</h2>

      <button
        type="button"
        className="odetails__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="odetails__toggle-text">
          <span className="odetails__toggle-title">
            {t("orders.orderDetails", "Order details")}
          </span>
          {/* The one-line answer, so the panel is useful without opening it.
              A middle dot rather than a comma: the two values are peers, not
              a list. */}
          <span className="odetails__toggle-summary">
            {formatItemCount(t, itemCount)}
            <span className="odetails__dot" aria-hidden="true"> · </span>
            <span className="odetails__amount">{fmtPrice(order.total)}</span>
          </span>
        </span>
        <span className="odetails__chevron" aria-hidden="true">
          <ChevronDown size={17} strokeWidth={2.2} />
        </span>
      </button>

      <div className="odetails__wrap" id={panelId} hidden={!open}>
        <div className="odetails__inner">
          <div className="odetails__items">
            {order.items.map((line) => renderLineItem(line))}
          </div>

          <div className="odetails__summary">
            <div className="odetails__row">
              <span>{t("common.subtotal", "Subtotal")}</span>
              <span>{fmtPrice(order.subtotal)}</span>
            </div>
            <div className="odetails__row">
              <span>
                {t("common.serviceCharge", "Service charge")} ({order.serviceChargePercent}%)
              </span>
              <span>{fmtPrice(order.serviceCharge)}</span>
            </div>

            <div className="odetails__divider" />

            {/* A canceled order's total is history, not a bill, so it is
                relabelled and struck through rather than presented as an
                amount owed. The stored value is untouched (Phase 36). */}
            <div
              className={`odetails__row odetails__row--total ${
                isCanceled ? "odetails__row--void" : ""
              }`}
            >
              <span>
                {isCanceled
                  ? t("payment.canceledOrderTotal", "Canceled order total")
                  : t("common.total", "Total")}
              </span>
              <span>{fmtPrice(order.total)}</span>
            </div>

            <div className="odetails__divider" />

            {/* Payment method stays visible for a normal order, and for a
                canceled-but-paid one where it is useful context when the
                guest speaks to staff. For a canceled unpaid order it adds
                nothing and only invites "do I still owe this?", so it gives
                way to the notice below (Phase 36, preserved). */}
            {(!isCanceled || order.paymentStatus === "paid") && (
              <div className="odetails__row">
                <span>{t("payment.paymentMethod", "Payment method")}</span>
                <span>{paymentMethodLabel}</span>
              </div>
            )}

            {isCanceled ? (
              <CanceledPaymentNotice order={order} />
            ) : (
              <div className="odetails__row">
                <span>{t("payment.paymentStatus", "Payment status")}</span>
                <span className="odetails__payment-status">
                  {order.paymentStatus === "paid"
                    ? t("payment.paid", "Paid")
                    : t("payment.pendingAtTable", "Pending at table")}
                </span>
              </div>
            )}
          </div>

          {/* Phase 88 — the status-history list lives here now.
              It used to be its own always-open card between Call Staff and
              the details, which put a timestamped log ahead of the food in
              the reading order. The Status Route above states the journey
              visually; this is the same journey with exact times, which is a
              detail by definition. Nothing was dropped. */}
          {children}
        </div>
      </div>
    </section>
  );
}
