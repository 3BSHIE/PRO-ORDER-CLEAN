import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, PackageSearch, Check, XCircle } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import CallStaffButton   from "./components/CallStaffButton.jsx";
import PrepTimeEstimate  from "./components/PrepTimeEstimate.jsx";
import { getCustomerSession } from "../../lib/customerSession.js";
import { getOrderById } from "../../lib/customerOrders.js";
import { useMenuData } from "../../lib/useMenuData.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";

/* Ordered progress steps for the visual timeline (canceled is handled separately) */
const TIMELINE_STEPS = [
  { status: "received",  label: "Received"  },
  { status: "preparing", label: "Preparing" },
  { status: "ready",     label: "Ready"      },
  { status: "delivered", label: "Delivered"  },
];

const STATUS_MESSAGE = {
  received:  "Your order has been sent to the restaurant.",
  preparing: "The kitchen is preparing your order.",
  ready:     "Your order is ready and will be served soon.",
  delivered: "Your order has been delivered. We hope you enjoyed it.",
  canceled:  "This order was canceled. Please contact the staff if you need help.",
};

const STATUS_BADGE_TONE = {
  received:  "received",
  preparing: "preparing",
  ready:     "ready",
  delivered: "gold",
  canceled:  "canceled",
};

/* Maps a payment method's stable id to its translation key — order.paymentMethod.label
   is captured verbatim in English at order-creation time, so we re-resolve a live
   translation from the id instead, with that frozen label as the fallback. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};

/* Maps each order status to its translation key for the longer tracking message
   (STATUS_MESSAGE above is the English fallback source). */
const TRACKING_MSG_KEY = {
  received:  "orders.trackingMsgReceived",
  preparing: "orders.trackingMsgPreparing",
  ready:     "orders.trackingMsgReady",
  delivered: "orders.trackingMsgDelivered",
  canceled:  "orders.trackingMsgCanceled",
};

/* Phase 19.5E — QA fix: translate each statusHistory entry's visible label
   by its `status` field at RENDER time only. The `label` stored on the
   entry itself (e.g. "Kitchen started preparing") is written verbatim in
   English at write-time by kitchen/admin actions and is NEVER modified —
   this map only decides what to *display* for a given status, falling back
   to the entry's own stored label if the status isn't recognized. No old
   orders in localStorage are rewritten by adding this map. */
const STATUS_HISTORY_LABEL_KEY = {
  received:  "kitchen.orderReceivedLabel",
  preparing: "kitchen.kitchenStartedPreparingLabel",
  ready:     "kitchen.orderMarkedReadyLabel",
  delivered: "admin.orderDeliveredLabel",
  canceled:  "admin.orderCanceledNote",
};

/* ═══════════════════════════════════════════════════════════════════════════
   CustomerOrderTrackingScreen — Phase 11

   Guards (same pattern as confirmation screen):
     • QR token must be valid → else InvalidView
     • Customer session must exist → else redirect to onboarding
     • Order must exist → else polished "Order not found" state

   Read-only: this screen never writes to customerOrders.js. It only re-reads
   the order — on mount, on window focus, and on a light interval — so status
   changes made later by Kitchen/Admin screens (writing to the same
   localStorage key) show up here without the customer doing anything.

   NOT built yet: My Orders page, customer status-update controls,
   admin dashboard, kitchen board, backend.
   ═══════════════════════════════════════════════════════════════════════ */

export default function CustomerOrderTrackingScreen({
  restaurantSlug,
  qrToken,
  orderId,
  onHome,
  onBackToMenu,
  onBackToAccess,
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

  return (
    <TrackingShell
      orderId={orderId}
      onBackToMenu={onBackToMenu}
      restaurantSlug={restaurantSlug}
      table={result.table}
      session={session}
    />
  );
}

/* ── Tracking shell — owns the live-refreshing order read ──────────────── */
function TrackingShell({ orderId, onBackToMenu, restaurantSlug, table, session }) {
  const [order, setOrder] = useState(() => getOrderById(orderId));
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const { t } = useLanguage();

  /* Phase 25 — the Call Staff control is rendered inside TrackingView but
     the Toast lives here, matching how every other screen in the app keeps
     its toast at the screen level rather than inside a child. */
  function handleNotify(message) {
    setToastMessage(message);
    setToastVisible(true);
  }

  const refresh = useCallback(() => {
    setOrder(getOrderById(orderId));
  }, [orderId]);

  useEffect(() => {
    refresh(); // re-read whenever orderId changes

    /* Refresh when the tab regains focus — catches updates a Kitchen/Admin
       screen made in another tab while this one was in the background. */
    window.addEventListener("focus", refresh);

    /* Lightweight polling fallback — no websocket/backend yet, so a short
       interval is the simplest way to notice status changes written by
       another tab without the customer needing to do anything. */
    const interval = setInterval(refresh, 4000);

    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [refresh]);

  return (
    <>
      <Topbar
        left={
          <button type="button" className="cart-back-btn" onClick={onBackToMenu}>
            <ArrowLeft size={16} strokeWidth={2.2} /> {t("customer.menu", "Menu")}
          </button>
        }
        right={<Logo variant="icon" size="nav" />}
      />
      <main className="container">
        {order ? (
          <TrackingView
            order={order}
            restaurantSlug={restaurantSlug}
            table={table}
            session={session}
            onNotify={handleNotify}
          />
        ) : (
          <OrderNotFoundView onBackToMenu={onBackToMenu} />
        )}
      </main>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </>
  );
}

/* ── Main tracking view ──────────────────────────────────────────────────── */
function TrackingView({ order, restaurantSlug, table, session, onNotify }) {
  const { t } = useLanguage();
  const isCanceled = order.status === "canceled";
  const paymentMethodLabel = t(
    METHOD_LABEL_KEY[order.paymentMethod.id],
    order.paymentMethod.label
  );
  const statusLabel =
    t(`status.${order.status}`, null) ||
    TIMELINE_STEPS.find((s) => s.status === order.status)?.label ||
    (isCanceled ? "Canceled" : order.status);
  const statusMsg = TRACKING_MSG_KEY[order.status]
    ? t(TRACKING_MSG_KEY[order.status], STATUS_MESSAGE[order.status])
    : t("orders.trackingFallbackMsg", "We're tracking your order.");

  return (
    <div className="track anim-rise">
      <p className="track__rest">{order.restaurantName}</p>
      <p className="track__table">{t("customer.yourTable", "Table")} #{order.tableNumber}</p>

      <div className="track__order-row">
        <span className="track__order-id">{order.orderId}</span>
        <Badge tone={STATUS_BADGE_TONE[order.status] || "neutral"} dot>
          {statusLabel}
        </Badge>
      </div>
      <p className="track__customer">{t("common.forCustomer", "For")} {order.customerName}</p>

      <p className="track__msg">{statusMsg}</p>

      {/* Phase 26 — shown only while the order is still Received/Preparing.
          Once it's Ready or Delivered the status message above already says
          what matters, so the estimate steps aside rather than contradicting
          it. Component handles that rule internally. */}
      <PrepTimeEstimate order={order} />

      {isCanceled ? (
        <div className="track__canceled">
          <XCircle size={22} strokeWidth={1.8} />
          <span>{t("orders.canceledBanner", "This order was canceled.")}</span>
        </div>
      ) : (
        <StatusTimeline currentStatus={order.status} />
      )}

      {/* Phase 25 — Digital Waiter Bell. A canceled order is exactly when a
          guest is most likely to need a person, so that case gets the
          prominent centered action the phase spec calls for; every other
          status keeps the same quiet inline pill used on the Menu screen. */}
      <div className={`track__call-staff ${isCanceled ? "track__call-staff--prominent" : ""}`}>
        <CallStaffButton
          restaurantSlug={restaurantSlug}
          tableId={table.id}
          tableNumber={table.tableNumber}
          customerName={session.customerName}
          variant={isCanceled ? "prominent" : "subtle"}
          onNotify={onNotify}
        />
      </div>

      {/* ── Order updates (status history) ─────────────────────────────── */}
      {order.statusHistory?.length > 0 && (
        <Card className="track__updates">
          <h3 className="track__updates-title">{t("orders.orderUpdates", "Order updates")}</h3>
          <ul className="track__updates-list">
            {order.statusHistory.map((entry, i) => (
              <li key={i} className="track__updates-item">
                <span className="track__updates-dot" />
                <span className="track__updates-label">
                  {STATUS_HISTORY_LABEL_KEY[entry.status]
                    ? t(STATUS_HISTORY_LABEL_KEY[entry.status], entry.label || entry.status)
                    : entry.label || entry.status}
                </span>
                <span className="track__updates-time">{formatTimestamp(entry.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Order details ───────────────────────────────────────────────── */}
      <Card className="track__details">
        <h3 className="track__details-title">{t("orders.orderDetails", "Order details")}</h3>
        <div className="track__items">
          {order.items.map((line) => (
            <TrackingLineItem key={line.cartItemId} line={line} restaurantSlug={order.restaurantSlug} />
          ))}
        </div>

        <div className="track__summary">
          <div className="track__summary-row">
            <span>{t("common.subtotal", "Subtotal")}</span>
            <span>{fmtPrice(order.subtotal)}</span>
          </div>
          <div className="track__summary-row">
            <span>{t("common.serviceCharge", "Service charge")} ({order.serviceChargePercent}%)</span>
            <span>{fmtPrice(order.serviceCharge)}</span>
          </div>
          <div className="track__summary-divider" />
          <div className="track__summary-row track__summary-row--total">
            <span>{t("common.total", "Total")}</span>
            <span>{fmtPrice(order.total)}</span>
          </div>
          <div className="track__summary-divider" />
          <div className="track__summary-row">
            <span>{t("payment.paymentMethod", "Payment method")}</span>
            <span>{paymentMethodLabel}</span>
          </div>
          <div className="track__summary-row">
            <span>{t("payment.paymentStatus", "Payment status")}</span>
            <span className="track__payment-status">
              {order.paymentStatus === "paid"
                ? t("payment.paid", "Paid")
                : t("payment.pendingAtTable", "Pending at table")}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ── Visual status timeline ──────────────────────────────────────────────── */
function StatusTimeline({ currentStatus }) {
  const { t } = useLanguage();
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.status === currentStatus);

  return (
    <div className="track-timeline">
      {TIMELINE_STEPS.map((step, i) => {
        const isDone    = currentIndex >= 0 && i < currentIndex;
        const isCurrent = i === currentIndex;
        const isFuture  = currentIndex >= 0 && i > currentIndex;

        return (
          <div
            key={step.status}
            className={`track-timeline__step ${isDone ? "track-timeline__step--done" : ""} ${
              isCurrent ? "track-timeline__step--current" : ""
            } ${isFuture ? "track-timeline__step--future" : ""}`}
          >
            <span className="track-timeline__dot">
              {isDone ? <Check size={13} strokeWidth={3} /> : <span className="track-timeline__dot-inner" />}
            </span>
            <span className="track-timeline__label">{t(`status.${step.status}`, step.label)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── One order item summary (read-only, same summary style as cart/confirmation) ── */
function TrackingLineItem({ line, restaurantSlug }) {
  const { categories } = useMenuData(restaurantSlug);
  const category = categories.find((c) => c.id === line.categoryId);
  const emoji = category?.emoji || "🍽️";
  const { t } = useLanguage();

  const hasRemovals = line.selectedRemovals?.length > 0;
  const hasChoices  = line.selectedChoices?.length > 0;
  const hasAddOns   = line.selectedPaidAddOns?.length > 0;
  const hasNotes    = !!line.notes?.trim();

  const choicesByGroup = {};
  if (hasChoices) {
    for (const c of line.selectedChoices) {
      if (!choicesByGroup[c.groupName]) choicesByGroup[c.groupName] = [];
      choicesByGroup[c.groupName].push(c.optionName);
    }
  }

  return (
    <div className="track-item">
      <div className="track-item__head">
        <span className="track-item__qty">{line.quantity}×</span>
        <span className="track-item__name">{line.name}</span>
        <span className="track-item__total">{fmtPrice(line.lineTotal)}</span>
      </div>
      {(hasRemovals || hasChoices || hasAddOns || hasNotes) && (
        <div className="track-item__custom">
          {hasRemovals && (
            <p className="track-item__custom-row">
              <span className="track-item__custom-label">{t("customer.noPrefix", "No")}:</span>{" "}
              {line.selectedRemovals.join(", ")}
            </p>
          )}
          {Object.entries(choicesByGroup).map(([groupName, options]) => (
            <p className="track-item__custom-row" key={groupName}>
              <span className="track-item__custom-label">{groupName}:</span>{" "}
              {options.join(", ")}
            </p>
          ))}
          {hasAddOns && (
            <p className="track-item__custom-row">
              <span className="track-item__custom-label">{t("common.extrasLabel", "Extras")}:</span>{" "}
              {line.selectedPaidAddOns.map((a) => a.name).join(", ")}
            </p>
          )}
          {hasNotes && (
            <p className="track-item__custom-row track-item__custom-row--note">
              <span className="track-item__custom-label">{t("common.noteLabel", "Note")}:</span> {line.notes}
            </p>
          )}
        </div>
      )}
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

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
