import { useEffect, useState } from "react";
import { ArrowLeft, PackageSearch, Check } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import CanceledPaymentNotice from "./components/CanceledPaymentNotice.jsx";
import { prefersReducedMotion } from "../../lib/motion.js";
import { getCustomerSession } from "../../lib/customerSession.js";
import { getOrderById } from "../../lib/customerOrders.js";
import { orderBelongsToSession } from "../../lib/customerIdentity.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import RestaurantIdentity from "./components/RestaurantIdentity.jsx";
import { resolveRestaurantDisplayName } from "../../lib/restaurantName.js";
import CustomerFooter     from "./components/CustomerFooter.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
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
  const { settings } = useSettingsData(restaurantSlug);

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
          <InvalidAccessView
            reason={result.reason}
            onHome={onHome}
            /* Phase 90 §3 — resolveTableAccess carries the restaurant on the
               token and inactive failures, so the recovery screen can name the
               venue instead of being anonymous. Five screens were dropping it
               on the floor. */
            restaurantName={result.restaurant?.name}
            restaurantSlug={restaurantSlug}
          />
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
      {/* Phase 45 — restaurant identity in place of the PRO·ORDER mark. The
          confirmation body keeps its own restaurant line: unlike the other
          deeper screens that is the order's FROZEN restaurantName, which is
          order history rather than live branding, so the two are not
          duplicates of each other. */}
      <Topbar
        left={
          <RestaurantIdentity
            name={resolveRestaurantDisplayName(settings, order, restaurantSlug)}
            logoUrl={settings.logoUrl}
            variant="compact"
          />
        }
        right={<Badge tone="gold">{t("orders.orderBadge", "Order")}</Badge>}
      />
      <main className="container">
        {visibleOrder ? (
          <ConfirmationView order={visibleOrder} onBackToMenu={onBackToMenu} onViewTracking={onViewTracking} />
        ) : (
          <OrderNotFoundView onBackToMenu={onBackToMenu} />
        )}

        <CustomerFooter />
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

/* ── Confirmed order view ──────────────────────────────────────────────────
   Phase 88 §1 — refined hierarchy.

   WHAT CAME OUT, AND WHY
     The screen used to end in a full Order Summary card: item count, subtotal,
     service charge, total, payment method, payment status. That is the Cart's
     job, and the guest had already read and accepted every line of it two
     screens earlier. §1 asks for a compact summary "only", so what survives is
     the four facts that are genuinely NEW at this moment or that a guest
     glances back at while sitting at the table: which table, how they are
     paying, what it came to, and how long it should be.

     The status badge and the "For <name>" line also came out. Both are
     restated on Tracking, which is one tap away, and neither is something the
     guest needs to be told a second before they are told it again.

   WHAT MOVED UP
     The order number. §1 makes it the strongest functional element after the
     success message, and it was previously a small grey token sharing a row
     with a status pill. It is now its own labelled block directly under the
     title — it is the thing a guest reads out to a waiter.
   ── */
function ConfirmationView({ order, onBackToMenu, onViewTracking }) {
  const { t } = useLanguage();

  /* Phase 36 — this route stays reachable after an order is canceled (browser
     back, or a bookmarked link), and it used to keep asserting "Order
     received" for an order that no longer exists as a live one. Every other
     status renders exactly as before. */
  const isCanceled = order.status === "canceled";

  /* §2 — Confirmation settles out before Tracking arrives, rather than being
     replaced between two frames. Deliberately short: this is a hand-off
     between two screens the guest asked for, not a transition to admire, and
     anything longer would read as the app being slow. Under reduced motion
     the navigation happens immediately with no fade at all. */
  const [leaving, setLeaving] = useState(false);
  function handleTrackOrder() {
    if (prefersReducedMotion()) { onViewTracking(); return; }
    setLeaving(true);
    setTimeout(onViewTracking, 160);
  }

  const paymentMethodLabel = t(
    METHOD_LABEL_KEY[order.paymentMethod.id],
    order.paymentMethod.label
  );

  /* §1 — "Estimated Time if available". Orders placed before Phase 26 carry
     no estimate and simply omit the row; nothing is invented. A canceled
     order has no estimate worth showing either. */
  const minutes = order.estimatedPrepMinutes;
  const showEstimate = !isCanceled && Number.isInteger(minutes) && minutes > 0;

  return (
    <div className={`confirm ${leaving ? "confirm--leaving" : ""}`}>
      {/* §1 — calm and premium: a thin ring that draws itself once and a
          check that fades in behind it. No confetti, no bounce, no loop, and
          explicitly not the animated PRO·ORDER mark, which stays reserved for
          the Main Timer and system loading (§1, §18). */}
      <span
        className={`confirm__mark ${isCanceled ? "confirm__mark--canceled" : ""}`}
        aria-hidden="true"
      >
        {isCanceled ? <span className="confirm__mark-x">✕</span> : <Check size={26} strokeWidth={2.4} />}
      </span>

      <h1 className="confirm__title">
        {isCanceled
          ? t("orders.canceledBanner", "This order was canceled.")
          : t("orders.orderPlacedSuccessfully", "Order placed successfully")}
      </h1>

      {isCanceled && (
        <p className="confirm__msg">
          {t("orders.trackingMsgCanceled", "This order was canceled. Please contact the staff if you need help.")}
        </p>
      )}

      {/* §1 — the strongest functional element after the success message. */}
      <div className="confirm__order">
        <span className="confirm__order-label">{t("orders.orderNumber", "Order number")}</span>
        <span className="confirm__order-id">{order.orderId}</span>
      </div>

      {/* §1 — compact summary only. Not the Cart's breakdown again. */}
      <dl className="confirm__facts">
        <div className="confirm__fact">
          <dt>{t("customer.yourTable", "Table")}</dt>
          <dd className="confirm__fact-num">#{order.tableNumber}</dd>
        </div>
        <div className="confirm__fact">
          <dt>{t("payment.paymentMethod", "Payment method")}</dt>
          <dd>{paymentMethodLabel}</dd>
        </div>
        <div className="confirm__fact">
          <dt>
            {isCanceled
              ? t("payment.canceledOrderTotal", "Canceled order total")
              : t("common.total", "Total")}
          </dt>
          <dd className={`confirm__fact-total ${isCanceled ? "confirm__fact-total--void" : ""}`}>
            {fmtPrice(order.total)}
          </dd>
        </div>
        {showEstimate && (
          <div className="confirm__fact">
            <dt>{t("prep.estimatedPrepTime", "Estimated preparation time")}</dt>
            <dd>{t("prep.aboutXMinutes", "About {n} minutes").replace("{n}", minutes)}</dd>
          </div>
        )}
      </dl>

      {/* Phase 36 — preserved: for a canceled order the payment situation is
          the thing the guest most needs stated plainly. */}
      {isCanceled && (
        <div className="confirm__canceled-payment">
          <CanceledPaymentNotice order={order} />
        </div>
      )}

      <div className="confirm__actions">
        <Button size="lg" full onClick={handleTrackOrder}>
          {t("orders.trackOrder", "Track order")}
        </Button>
        {/* Navigates only — it writes nothing, so the customer session and
            the stored order are untouched by leaving this screen (§1). */}
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
