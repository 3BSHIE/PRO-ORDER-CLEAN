import { useEffect } from "react";
import { ArrowLeft, PackageSearch } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import PrepTimeEstimate   from "./components/PrepTimeEstimate.jsx";
import CanceledPaymentNotice from "./components/CanceledPaymentNotice.jsx";
import { getCustomerSession } from "../../lib/customerSession.js";
import { getOrderById } from "../../lib/customerOrders.js";
import { orderBelongsToSession } from "../../lib/customerIdentity.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { formatItemCount } from "../../i18n/counts.js";
import { fmtPrice } from "../../lib/format.js";

/* ═══════════════════════════════════════════════════════════════════════════
   CustomerOrderConfirmationScreen — Phase 11

   Guards:
     • QR token must be valid → else InvalidView
     • Customer session must exist → else redirect to onboarding
     • Order must exist (looked up in localStorage via customerOrders.js)
       → else a polished "Order not found" state
     • Phase 39 — order must BELONG to this session → else that same
       "Order not found" state, deliberately indistinguishable

   What's new in Phase 11:
     • "View tracking in next phase" is now "View order tracking" and
       navigates to /r/:slug/table/:token/orders/:orderId/tracking for real
       — no more placeholder toast for this button.

   NOT built yet: My Orders page, admin dashboard, kitchen board, backend.
   ═══════════════════════════════════════════════════════════════════════ */

export default function CustomerOrderConfirmationScreen({
  restaurantSlug,
  qrToken,
  orderId,
  onHome,
  onBackToMenu,
  onBackToAccess,
  onViewTracking,
}) {
  const result  = resolveTableAccess(restaurantSlug, qrToken);
  const session = getCustomerSession();
  const { t } = useLanguage();

  const hasValidSession =
    result.ok &&
    session &&
    session.qrToken        === qrToken &&
    session.restaurantSlug === restaurantSlug &&
    !!session.customerName;

  useEffect(() => {
    if (result.ok && !hasValidSession) onBackToAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Gate 1: invalid QR */
  if (!result.ok) {
    return (
      <>
        <Topbar
          left={<Logo variant="icon" size="nav" />}
          right={<Badge tone="canceled">{t("common.qrAccess", "QR access")}</Badge>}
        />
        <main className="container">
          <InvalidAccessView reason={result.reason} onHome={onHome} />
        </main>
      </>
    );
  }

  /* Gate 2: redirect in progress */
  if (!hasValidSession) return null;

  const order = getOrderById(orderId);

  /* ── Phase 39 — order ownership guard ──────────────────────────────────
     Same gap and same fix as the tracking screen: existing until this phase,
     any valid session could read any order's confirmation by editing the id
     in the URL. Ownership is decided by the shared Phase 38 helper, so this
     screen, tracking, My Orders and the feedback form cannot disagree.

     The guest who just checked out is unaffected — their order was built
     from this very session, so restaurant, token, table and identity all
     match by construction.

     A missing order and an order belonging to someone else both become
     `null` and render the identical "Order not found" state; telling them
     apart would confirm which ids exist. */
  const visibleOrder = orderBelongsToSession(order, session) ? order : null;

  return (
    <>
      <Topbar
        left={<Logo variant="icon" size="nav" />}
        right={<Badge tone="gold">{t("orders.orderBadge", "Order")}</Badge>}
      />
      <main className="container">
        {visibleOrder ? (
          <ConfirmationView order={visibleOrder} onBackToMenu={onBackToMenu} onViewTracking={onViewTracking} />
        ) : (
          <OrderNotFoundView onBackToMenu={onBackToMenu} />
        )}
      </main>
    </>
  );
}

/* Maps a payment method's stable id to its translation key — same pattern as
   PaymentMethodModal.jsx. order.paymentMethod.label is captured verbatim in
   English at order-creation time, so we re-resolve a live translation from
   the id instead, with that frozen label as the fallback. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};

/* ── Confirmed order view ────────────────────────────────────────────────── */
function ConfirmationView({ order, onBackToMenu, onViewTracking }) {
  const { t } = useLanguage();
  /* Phase 36 — this route stays reachable after an order is canceled (browser
     back, or a bookmarked link), and it used to keep asserting "Order
     received … Pending at table" for an order that no longer exists as a
     live one. Showing "No payment due" while the header still claimed the
     order had been received would have been contradictory, so the canceled
     case now states the cancellation as well. Every other status renders
     exactly as before. */
  const isCanceled = order.status === "canceled";
  const itemCount = order.items.reduce((sum, line) => sum + (line.quantity || 0), 0);
  const paymentLabel =
    order.paymentStatus === "paid"
      ? t("payment.paid", "Paid")
      : t("payment.pendingAtTable", "Pending at table");
  const paymentMethodLabel = t(
    METHOD_LABEL_KEY[order.paymentMethod.id],
    order.paymentMethod.label
  );

  return (
    <div className="confirm anim-rise">
      <span className={`confirm__icon ${isCanceled ? "confirm__icon--canceled" : ""}`}>
        {isCanceled ? "✕" : "✓"}
      </span>

      <p className="confirm__rest">{order.restaurantName}</p>
      <p className="confirm__table">{t("customer.yourTable", "Table")} #{order.tableNumber}</p>

      <h1 className="confirm__title">
        {isCanceled
          ? t("orders.canceledBanner", "This order was canceled.")
          : t("orders.orderReceived", "Order received")}
      </h1>
      <p className="confirm__msg">
        {isCanceled
          ? t("orders.trackingMsgCanceled", "This order was canceled. Please contact the staff if you need help.")
          : t("orders.orderReceivedMsg", "Your order has been sent to the restaurant.")}
      </p>

      <div className="confirm__meta-row">
        <Badge tone={isCanceled ? "canceled" : "received"} dot>
          {isCanceled ? t("status.canceled", "Canceled") : t("status.received", "Received")}
        </Badge>
        <span className="confirm__order-id">{order.orderId}</span>
      </div>
      <p className="confirm__customer">{t("common.forCustomer", "For")} {order.customerName}</p>

      {/* Phase 26 — the estimate the guest was given at checkout, frozen on
          the order. Renders nothing for pre-Phase-26 orders. */}
      <PrepTimeEstimate order={order} />

      <Card className="confirm__summary">
        <h3 className="confirm__summary-title">{t("orders.orderSummary", "Order summary")}</h3>
        <div className="confirm__summary-row">
          <span>{t("orders.items", "Items")}</span>
          <span>{formatItemCount(t, itemCount)}</span>
        </div>
        <div className="confirm__summary-row">
          <span>{t("common.subtotal", "Subtotal")}</span>
          <span>{fmtPrice(order.subtotal)}</span>
        </div>
        <div className="confirm__summary-row">
          <span>{t("common.serviceCharge", "Service charge")} ({order.serviceChargePercent}%)</span>
          <span>{fmtPrice(order.serviceCharge)}</span>
        </div>
        <div className="confirm__summary-divider" />
        <div className={`confirm__summary-row confirm__summary-row--total ${isCanceled ? "track__summary-row--void" : ""}`}>
          <span>
            {isCanceled
              ? t("payment.canceledOrderTotal", "Canceled order total")
              : t("common.total", "Total")}
          </span>
          <span>{fmtPrice(order.total)}</span>
        </div>
        <div className="confirm__summary-divider" />
        {(!isCanceled || order.paymentStatus === "paid") && (
          <div className="confirm__summary-row">
            <span>{t("payment.paymentMethod", "Payment method")}</span>
            <span>{paymentMethodLabel}</span>
          </div>
        )}
        {isCanceled ? (
          <CanceledPaymentNotice order={order} />
        ) : (
          <div className="confirm__summary-row">
            <span>{t("payment.paymentStatus", "Payment status")}</span>
            <span className="confirm__payment-status">{paymentLabel}</span>
          </div>
        )}
      </Card>

      <div className="confirm__actions">
        <Button size="lg" full onClick={onViewTracking}>
          {t("orders.viewOrderTracking", "View order tracking")}
        </Button>
        <Button variant="outline" size="md" full icon={ArrowLeft} onClick={onBackToMenu}>
          {t("common.backToMenu", "Back to menu")}
        </Button>
      </div>
    </div>
  );
}

/* ── Order not found ─────────────────────────────────────────────────────── */
function OrderNotFoundView({ onBackToMenu }) {
  const { t } = useLanguage();
  return (
    <div className="confirm-missing anim-rise">
      <span className="confirm-missing__icon">
        <PackageSearch size={30} strokeWidth={1.7} />
      </span>
      <h2 className="confirm-missing__title">{t("orders.orderNotFound", "Order not found")}</h2>
      <p className="confirm-missing__sub">
        {t("orders.orderNotFoundMsg", "We couldn't find this order. It may have been cleared, or the link may be incorrect.")}
      </p>
      <Button size="lg" icon={ArrowLeft} onClick={onBackToMenu}>
        {t("common.backToMenu", "Back to menu")}
      </Button>
    </div>
  );
}

/* ── Invalid QR view ─────────────────────────────────────────────────────── */
