import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, PackageSearch, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Button  from "../../components/ui/Button.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { getCustomerOrders, updateCustomerOrderStatus, updateCustomerOrderPaymentStatus } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";

const STATUS_LABEL = {
  received: "Received", preparing: "Preparing", ready: "Ready",
  delivered: "Delivered", canceled: "Canceled",
};
const STATUS_BADGE_TONE = {
  received: "received", preparing: "preparing", ready: "ready",
  delivered: "gold", canceled: "canceled",
};

/* Filter tabs — "All" plus one tab per real status, in board order. */
const FILTER_TABS = [
  { key: "all",       label: "All" },
  { key: "received",  label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready",     label: "Ready" },
  { key: "delivered", label: "Delivered" },
  { key: "canceled",  label: "Canceled" },
];
/* Translation keys for each filter tab's visible label, keyed by tab.key.
   Everything except "all" reuses the existing status.* keys since the
   English text is identical. */
const FILTER_TAB_KEY = {
  all: "common.all",
  received: "status.received",
  preparing: "status.preparing",
  ready: "status.ready",
  delivered: "status.delivered",
  canceled: "status.canceled",
};
/* Translation keys for the per-status empty-state message ("No X orders."). */
const EMPTY_STATUS_KEY = {
  received: "admin.noReceivedOrders",
  preparing: "admin.noPreparingOrders",
  ready: "admin.noReadyOrders",
  delivered: "admin.noDeliveredOrders",
  canceled: "admin.noCanceledOrders",
};
/* order.paymentMethod.label is captured verbatim in English at order-creation
   time, so this screen re-resolves a live translation from the stable id
   instead, with that frozen label as the fallback — same pattern as every
   other screen that displays it. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};

/* Valid admin/cashier-initiated transitions this phase allows:
   ready → delivered, and received/preparing/ready → canceled. Nothing else
   is reachable from these action buttons — delivered and canceled orders
   render no buttons at all, and there is no path from delivered to canceled
   or vice versa. */
const CANCELABLE_STATUSES = ["received", "preparing", "ready"];

/* ═══════════════════════════════════════════════════════════════════════════
   AdminLiveOrdersScreen — Phase 19 (regression fix: modal-based cancel confirm)

   Adds the only two admin/cashier-initiated status transitions this phase
   allows: marking a "ready" order "delivered", and canceling any active
   order (received/preparing/ready). Both admin and cashier roles can use
   both actions — no role split yet.

   Business-logic boundary preserved: kitchen owns received→preparing→ready
   (KitchenBoardScreen.jsx, untouched); admin/cashier owns ready→delivered
   and *→canceled. Customers remain fully read-only. Delivered/canceled
   orders show a calm/red note instead of any button — there is no path
   backward out of either terminal state from this screen.

   Cancel confirmation uses this app's own Modal component rather than
   window.confirm() — native confirm()/alert()/prompt() dialogs are commonly
   blocked or silently no-op inside sandboxed preview iframes (they need an
   "allow-modals" permission most embeds don't grant), which is what made
   Cancel Order appear to do nothing when clicked in that environment. The
   Modal-based flow works identically everywhere.

   Reuses the same updateCustomerOrderStatus() utility the kitchen board
   already uses (including its duplicate-status guard), so customer
   tracking/My Orders and the Overview dashboard — all of which already poll
   the same localStorage orders — pick up Delivered/Canceled automatically.

   NOT built yet: menu management, category management, tables/QR
   management, payment-paid workflow, backend, kitchen-initiated delivered.
   ═══════════════════════════════════════════════════════════════════════ */

export default function AdminLiveOrdersScreen({ restaurant, session, onSignOut, onNavigate, initialFilter }) {
  const [allOrders, setAllOrders] = useState(() => getCustomerOrders());
  /* Phase 53 — a Dashboard status card can open this screen already filtered.
     Only an initial value: the tabs stay fully in charge afterwards, and the
     screen remounts on every admin-page change, so this applies exactly once
     per visit. Anything unrecognised falls back to "all". */
  const [activeFilter, setActiveFilter] = useState(
    () => (FILTER_TABS.some((tab) => tab.key === initialFilter) ? initialFilter : "all")
  );
  const [expandedId, setExpandedId] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const { t } = useLanguage();
  /* The order awaiting cancel confirmation, or null. Using our own Modal
     instead of window.confirm() — browser-native confirm()/alert()/prompt()
     dialogs are frequently blocked or silently no-op inside sandboxed
     preview iframes (they require an "allow-modals" permission most embeds
     don't grant), which made Cancel Order appear completely inert. A modal
     built from this app's own components has no such restriction and works
     identically in the real deployed app and in any preview environment. */
  const [pendingCancelOrder, setPendingCancelOrder] = useState(null);
  /* Phase 49 — the order awaiting Mark-as-Paid confirmation, or null. Same
     shape and same reasoning as pendingCancelOrder above. */
  const [pendingPaidOrder, setPendingPaidOrder] = useState(null);

  const refresh = useCallback(() => {
    setAllOrders(getCustomerOrders());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, 4000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [refresh]);

  const restaurantOrders = useMemo(
    () => allOrders.filter((o) => o.restaurantSlug === restaurant.slug),
    [allOrders, restaurant.slug]
  );

  const filteredOrders = useMemo(
    () =>
      restaurantOrders
        .filter((o) => activeFilter === "all" || o.status === activeFilter)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), // newest first
    [restaurantOrders, activeFilter]
  );

  const activeFilterTab = FILTER_TABS.find((tab) => tab.key === activeFilter);
  const activeFilterLabel = t(FILTER_TAB_KEY[activeFilter], activeFilterTab?.label || "orders");

  /* Mark a "ready" order "delivered". Guards against double-clicks with the
     same updatingOrderId pattern the kitchen board uses; updateCustomerOrderStatus
     itself is also idempotent (a no-op if already in that status).

     NOTE: the "Order delivered"/"Order canceled" strings passed below are
     written verbatim into order.statusHistory (shown later on the customer's
     tracking screen) — they stay plain English data, same as
     order.paymentMethod.label, regardless of the admin UI's current
     language. Only the toast text visible here is translated. */
  function handleMarkDelivered(order) {
    if (order.status !== "ready" || updatingOrderId === order.orderId) return;
    setUpdatingOrderId(order.orderId);
    const updated = updateCustomerOrderStatus(order.orderId, "delivered", "Order delivered");
    if (updated) {
      setAllOrders((prev) => prev.map((o) => (o.orderId === order.orderId ? updated : o)));
      setToastMessage(t("admin.orderMarkedDeliveredToast", "Order marked as Delivered"));
      setToastVisible(true);
    }
    setUpdatingOrderId(null);
  }

  /* Marks a pending payment "paid" — completely independent of order.status,
     which is left untouched (a "ready" order stays "ready", just with
     paymentStatus now "paid"). Same guard pattern as the status actions:
     only valid for non-canceled orders whose payment is still pending, and
     updateCustomerOrderPaymentStatus itself is idempotent (a no-op if the
     order is already marked "paid"). */
  /* Phase 49 — Step 1: ask, do not act. Marking a bill paid is the one staff
     action with no way back in the UI: the action disappears once it lands,
     and the app has no un-mark and no refund. A mistap on the wrong table
     therefore records an unpaid bill as settled, permanently. The same
     business guards as before run here, so an ineligible order cannot even
     open the dialog. Nothing is written at this point. */
  function handleRequestMarkAsPaid(order) {
    if (order.paymentStatus !== "pending_at_table" || order.status === "canceled" || updatingOrderId === order.orderId) return;
    setPendingPaidOrder(order);
  }

  /* Step 2a: confirmed — perform the write. Clearing pendingPaidOrder FIRST
     is the duplicate guard: a second Confirm tap in the same burst finds it
     already null and returns before touching anything. This mirrors
     handleConfirmCancel, and sits on top of the existing updatingOrderId
     guard and the idempotent data-layer write. */
  function handleConfirmMarkAsPaid() {
    const order = pendingPaidOrder;
    setPendingPaidOrder(null);
    if (!order) return;

    /* Re-check rather than trust the snapshot the dialog was opened with —
       another tab could have cancelled or settled this order while the
       dialog sat open. */
    if (order.paymentStatus !== "pending_at_table" || order.status === "canceled") return;

    setUpdatingOrderId(order.orderId);
    const updated = updateCustomerOrderPaymentStatus(order.orderId, "paid");
    if (updated) {
      setAllOrders((prev) => prev.map((o) => (o.orderId === order.orderId ? updated : o)));
      setToastMessage(t("payment.paymentMarkedPaidToast", "Payment marked as paid"));
      setToastVisible(true);
    }
    setUpdatingOrderId(null);
  }

  /* Step 2b: dismissed by Cancel, X, overlay or Escape — nothing changes. */
  function handleDismissMarkAsPaid() {
    setPendingPaidOrder(null);
  }

  /* Step 1: open the confirmation modal for a cancelable order. The actual
     cancel only happens after the user confirms inside the modal
     (handleConfirmCancel below) — nothing changes yet at this point. */
  function handleRequestCancel(order) {
    if (!CANCELABLE_STATUSES.includes(order.status) || updatingOrderId === order.orderId) return;
    setPendingCancelOrder(order);
  }

  /* Step 2a: user confirmed in the modal — actually cancel the order. */
  function handleConfirmCancel() {
    const order = pendingCancelOrder;
    setPendingCancelOrder(null);
    if (!order) return;

    setUpdatingOrderId(order.orderId);
    const updated = updateCustomerOrderStatus(order.orderId, "canceled", "Order canceled");
    if (updated) {
      setAllOrders((prev) => prev.map((o) => (o.orderId === order.orderId ? updated : o)));
      setToastMessage(t("admin.orderCanceledNote", "Order canceled"));
      setToastVisible(true);
    }
    setUpdatingOrderId(null);
  }

  /* Step 2b: user dismissed the modal — nothing changes. */
  function handleDismissCancel() {
    setPendingCancelOrder(null);
  }

  /* Phase 50 - is the order awaiting cancel confirmation already paid?
     Read from the order snapshot, so the dialog always reflects the real
     payment state rather than anything assumed at click time. */
  const cancelTargetIsPaid = pendingCancelOrder?.paymentStatus === "paid";

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="liveOrders"
      onNavigate={onNavigate}
    >
      <header className="ad-header anim-rise" style={{ animationDelay: "40ms" }}>
        <h1 className="ad-header__title">{t("admin.liveOrders", "Live orders")}</h1>
        <p className="ad-header__subtitle">
          {restaurantOrders.length} order{restaurantOrders.length !== 1 ? "s" : ""} total for {restaurant.name}.
        </p>
      </header>

      <div className="ad-filters anim-rise" style={{ animationDelay: "80ms" }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`ad-filter ${activeFilter === tab.key ? "ad-filter--active" : ""}`}
            onClick={() => setActiveFilter(tab.key)}
          >
            {t(FILTER_TAB_KEY[tab.key], tab.label)}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyOrdersView filterKey={activeFilter} filterLabel={activeFilterLabel} isAll={activeFilter === "all"} />
      ) : (
        <div className="ad-live-orders anim-rise" style={{ animationDelay: "120ms" }}>
          {filteredOrders.map((order) => (
            <LiveOrderCard
              key={order.orderId}
              order={order}
              expanded={expandedId === order.orderId}
              onToggle={() =>
                setExpandedId((prev) => (prev === order.orderId ? null : order.orderId))
              }
              isUpdating={updatingOrderId === order.orderId}
              onMarkDelivered={() => handleMarkDelivered(order)}
              onCancelOrder={() => handleRequestCancel(order)}
              onMarkAsPaid={() => handleRequestMarkAsPaid(order)}
            />
          ))}
        </div>
      )}

      {/* Phase 50 - the cancel confirmation is now payment-aware.

          An unpaid order keeps exactly the dialog it always had: no money is
          involved, so a financial warning would only be noise.

          A PAID order is the case this phase exists for. The app has no
          refund operation at all, so cancelling one silently leaves a
          customer who has already settled a bill for an order that no longer
          exists, and staff were never told. The warning states plainly that
          no refund happens automatically, and the details are shown so the
          employee can see exactly which paid order they are cancelling.
          Nothing here claims a refund was made, matching the customer-side
          wording Phase 36 settled on. */}
      <Modal
        open={!!pendingCancelOrder}
        onClose={handleDismissCancel}
        title={t("admin.cancelThisOrder", "Cancel this order?")}
        footer={
          <>
            <Button variant="ghost" onClick={handleDismissCancel}>
              {t("common.keepOrder", "Keep order")}
            </Button>
            <Button variant="danger" onClick={handleConfirmCancel}>
              {cancelTargetIsPaid
                ? t("admin.cancelPaidOrderBtn", "Cancel Paid Order")
                : t("admin.cancelOrderModalBtn", "Cancel order")}
            </Button>
          </>
        }
      >
        <p className="ad-cancel-modal__msg">
          {t("admin.cancelNotifyMsg", "This will notify the customer that the order was canceled.")}
        </p>

        {pendingCancelOrder && !cancelTargetIsPaid && (
          <p className="ad-cancel-modal__order">{pendingCancelOrder.orderId}</p>
        )}

        {pendingCancelOrder && cancelTargetIsPaid && (
          <>
            <div className="ad-paid-warn" role="alert">
              <AlertTriangle size={15} strokeWidth={2.2} aria-hidden="true" />
              <div>
                <p className="ad-paid-warn__title">
                  {t("admin.paidCancelWarnTitle", "Payment already recorded")}
                </p>
                <p className="ad-paid-warn__msg">
                  {t(
                    "admin.paidCancelWarnMsg",
                    "This order is marked as paid. Canceling it will not refund the customer automatically - please handle any refund separately."
                  )}
                </p>
              </div>
            </div>

            {/* Same detail rows as the Phase 49 payment dialog, so the two
                money-related confirmations read identically. */}
            <div className="ad-paid-modal__details">
              <div className="ad-paid-modal__row">
                <span>{t("orders.orderBadge", "Order")}</span>
                <span className="ad-paid-modal__value ad-paid-modal__value--num">{pendingCancelOrder.orderId}</span>
              </div>
              <div className="ad-paid-modal__row">
                <span>{t("customer.yourTable", "Table")}</span>
                <span className="ad-paid-modal__value ad-paid-modal__value--num">#{pendingCancelOrder.tableNumber}</span>
              </div>
              {pendingCancelOrder.customerName && (
                <div className="ad-paid-modal__row">
                  <span>{t("common.forCustomer", "For")}</span>
                  <span className="ad-paid-modal__value">{pendingCancelOrder.customerName}</span>
                </div>
              )}
              <div className="ad-paid-modal__row">
                <span>{t("payment.paymentMethod", "Payment method")}</span>
                <span className="ad-paid-modal__value">
                  {t(METHOD_LABEL_KEY[pendingCancelOrder.paymentMethod.id], pendingCancelOrder.paymentMethod.label)}
                </span>
              </div>
              <div className="ad-paid-modal__row">
                <span>{t("payment.paymentStatus", "Payment status")}</span>
                <span className="ad-paid-modal__value ad-paid-modal__value--paid">
                  {t("payment.paid", "Paid")}
                </span>
              </div>
              <div className="ad-paid-modal__row ad-paid-modal__row--total">
                <span>{t("common.total", "Total")}</span>
                <span className="ad-paid-modal__value ad-paid-modal__value--num">{fmtPrice(pendingCancelOrder.total)}</span>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Phase 49 — Mark as Paid confirmation.

          Every field is read from the order snapshot, never hardcoded, and
          shows exactly what the collapsed card and expanded detail already
          show for the same order — so the dialog cannot disagree with the
          bill the staff member is looking at. The point is to make choosing
          the wrong table obvious BEFORE the irreversible write, which is why
          table and customer are here alongside the amount. */}
      <Modal
        open={!!pendingPaidOrder}
        onClose={handleDismissMarkAsPaid}
        title={t("payment.markPaidConfirmTitle", "Mark order as paid?")}
        footer={
          <>
            <Button variant="ghost" onClick={handleDismissMarkAsPaid}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleConfirmMarkAsPaid}>
              {t("payment.confirmPayment", "Confirm Payment")}
            </Button>
          </>
        }
      >
        <p className="ad-cancel-modal__msg">
          {t("payment.markPaidConfirmMsg", "Confirm that payment has been received for this order.")}
        </p>
        {pendingPaidOrder && (
          <div className="ad-paid-modal__details">
            <div className="ad-paid-modal__row">
              <span>{t("orders.orderBadge", "Order")}</span>
              <span className="ad-paid-modal__value ad-paid-modal__value--num">{pendingPaidOrder.orderId}</span>
            </div>
            <div className="ad-paid-modal__row">
              <span>{t("customer.yourTable", "Table")}</span>
              <span className="ad-paid-modal__value ad-paid-modal__value--num">#{pendingPaidOrder.tableNumber}</span>
            </div>
            {pendingPaidOrder.customerName && (
              <div className="ad-paid-modal__row">
                <span>{t("common.forCustomer", "For")}</span>
                <span className="ad-paid-modal__value">{pendingPaidOrder.customerName}</span>
              </div>
            )}
            <div className="ad-paid-modal__row">
              <span>{t("payment.paymentMethod", "Payment method")}</span>
              <span className="ad-paid-modal__value">
                {t(METHOD_LABEL_KEY[pendingPaidOrder.paymentMethod.id], pendingPaidOrder.paymentMethod.label)}
              </span>
            </div>
            <div className="ad-paid-modal__row ad-paid-modal__row--total">
              <span>{t("common.total", "Total")}</span>
              <span className="ad-paid-modal__value ad-paid-modal__value--num">{fmtPrice(pendingPaidOrder.total)}</span>
            </div>
          </div>
        )}
      </Modal>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </AdminLayout>
  );
}

/* ── One live order card (collapsed summary + expandable details) ───────── */
function LiveOrderCard({ order, expanded, onToggle, isUpdating, onMarkDelivered, onCancelOrder, onMarkAsPaid }) {
  const { t } = useLanguage();
  const isPaid = order.paymentStatus === "paid";
  const paymentLabel = isPaid
    ? t("payment.paid", "Paid")
    : t("payment.pendingAtTable", "Pending at table");
  const paymentMethodLabel = t(
    METHOD_LABEL_KEY[order.paymentMethod.id],
    order.paymentMethod.label
  );
  const itemCount = order.items.reduce((sum, line) => sum + (line.quantity || 0), 0);

  const canDeliver = order.status === "ready";
  const canCancel  = CANCELABLE_STATUSES.includes(order.status);
  const isDelivered = order.status === "delivered";
  const isCanceled  = order.status === "canceled";
  /* Payment is a separate axis from order.status (Phase 20) — available any
     time payment is still pending on a non-canceled order, independent of
     whether the order itself can still be delivered/canceled. A "delivered"
     order with pending payment still shows this action. */
  const canMarkAsPaid = order.paymentStatus === "pending_at_table" && !isCanceled;

  return (
    <Card className="ad-live-card">
      <button
        type="button"
        className="ad-live-card__summary"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="ad-live-card__summary-left">
          <p className="ad-live-card__id">{order.orderId}</p>
          <p className="ad-live-card__meta">
            {t("customer.yourTable", "Table")} #{order.tableNumber} &middot; {order.customerName}
          </p>
        </div>

        <div className="ad-live-card__summary-mid">
          <div className="ad-live-card__badges">
            <Badge tone={STATUS_BADGE_TONE[order.status] || "neutral"} dot>
              {t(`status.${order.status}`, STATUS_LABEL[order.status] || order.status)}
            </Badge>

            {/* Phase 52 — payment state on the collapsed card.

                Until now a cashier scanning the list could not tell which
                bills were still owed without opening every card in turn;
                three delivered orders looked identical whether or not anyone
                had paid. Payment is a separate axis from order.status, so it
                gets its own indicator rather than being inferred - a
                delivered order is NOT assumed paid.

                Deliberately a lighter pill than the status Badge beside it:
                the lifecycle status stays the primary signal and this reads
                as the secondary one. The state is always spelled out in
                words, so it never depends on colour alone. */}
            <span
              className={`ad-pay-pill ${isPaid ? "ad-pay-pill--paid" : "ad-pay-pill--pending"}`}
            >
              {isPaid
                ? t("payment.paid", "Paid")
                : t("payment.pendingShort", "Pending")}
            </span>
          </div>
          <span className="ad-live-card__time">{formatTimestamp(order.createdAt)}</span>
        </div>

        <div className="ad-live-card__summary-right">
          <span className="ad-live-card__items">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
          <span className="ad-live-card__total">{fmtPrice(order.total)}</span>
          <ChevronDown
            size={16}
            strokeWidth={2.2}
            className={`ad-live-card__chevron ${expanded ? "ad-live-card__chevron--open" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="ad-live-card__details">
          {/* Payment — always clearly visible per spec */}
          <div className="ad-live-card__payment-row">
            <span>{t("payment.paymentMethod", "Payment method")}</span>
            <span className="ad-live-card__payment-value">{paymentMethodLabel}</span>
          </div>
          <div className="ad-live-card__payment-row">
            <span>{t("payment.paymentStatus", "Payment status")}</span>
            {isPaid ? (
              <Badge tone="gold" dot>{t("payment.paid", "Paid")}</Badge>
            ) : (
              <span className="ad-live-card__payment-value">{paymentLabel}</span>
            )}
          </div>

          <div className="ad-live-card__divider" />

          {/* Items with full customization */}
          <div className="ad-live-card__items-list">
            {order.items.map((line) => (
              <LiveOrderLineItem key={line.cartItemId} line={line} />
            ))}
          </div>

          <div className="ad-live-card__divider" />

          {/* Totals */}
          <div className="ad-live-card__totals">
            <div className="ad-live-card__totals-row">
              <span>{t("common.subtotal", "Subtotal")}</span>
              <span>{fmtPrice(order.subtotal)}</span>
            </div>
            <div className="ad-live-card__totals-row">
              <span>{t("common.serviceCharge", "Service charge")} ({order.serviceChargePercent}%)</span>
              <span>{fmtPrice(order.serviceCharge)}</span>
            </div>
            <div className="ad-live-card__totals-row ad-live-card__totals-row--total">
              <span>{t("common.total", "Total")}</span>
              <span>{fmtPrice(order.total)}</span>
            </div>
          </div>

          {/* ── Actions — the only part that changed this phase ──────────── */}
          {(canDeliver || canCancel) && (
            <>
              <div className="ad-live-card__divider" />
              <div className="ad-live-card__actions">
                {canDeliver && (
                  <Button
                    type="button"
                    size="md"
                    full
                    disabled={isUpdating}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMarkDelivered();
                    }}
                  >
                    {t("admin.markAsDelivered", "Mark as Delivered")}
                  </Button>
                )}
                {canCancel && (
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    full
                    disabled={isUpdating}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCancelOrder();
                    }}
                  >
                    {t("admin.cancelOrder", "Cancel Order")}
                  </Button>
                )}
              </div>
            </>
          )}

          {/* ── Payment action — independent of order.status (Phase 20) ────── */}
          {canMarkAsPaid && (
            <>
              <div className="ad-live-card__divider" />
              <div className="ad-live-card__actions">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  full
                  disabled={isUpdating}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkAsPaid();
                  }}
                >
                  {t("payment.markAsPaid", "Mark as Paid")}
                </Button>
              </div>
            </>
          )}

          {isDelivered && (
            <div className="ad-live-card__completed-note">
              <CheckCircle2 size={14} strokeWidth={2} />
              <span>{t("admin.orderCompleted", "Order completed")}</span>
            </div>
          )}

          {isCanceled && (
            <div className="ad-live-card__canceled-note">
              <XCircle size={14} strokeWidth={2} />
              <span>{t("admin.orderCanceledNote", "Order canceled")}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── One item line within an expanded order ──────────────────────────────── */
function LiveOrderLineItem({ line }) {
  const hasRemovals = line.selectedRemovals?.length > 0;
  const hasChoices  = line.selectedChoices?.length > 0;
  const hasAddOns   = line.selectedPaidAddOns?.length > 0;
  const hasNotes    = !!line.notes?.trim();
  const { t } = useLanguage();

  const choicesByGroup = {};
  if (hasChoices) {
    for (const c of line.selectedChoices) {
      if (!choicesByGroup[c.groupName]) choicesByGroup[c.groupName] = [];
      choicesByGroup[c.groupName].push(c.optionName);
    }
  }

  return (
    <div className="ad-live-item">
      <div className="ad-live-item__head">
        <span className="ad-live-item__qty">{line.quantity}×</span>
        <span className="ad-live-item__name">{line.name}</span>
        <span className="ad-live-item__unit">{fmtPrice(line.unitPrice)} {t("common.each", "each")}</span>
        <span className="ad-live-item__total">{fmtPrice(line.lineTotal)}</span>
      </div>
      {(hasRemovals || hasChoices || hasAddOns || hasNotes) && (
        <div className="ad-live-item__custom">
          {hasRemovals && (
            <p className="ad-live-item__custom-row">
              <span className="ad-live-item__custom-label">{t("customer.noPrefix", "No")}:</span>{" "}
              {line.selectedRemovals.join(", ")}
            </p>
          )}
          {Object.entries(choicesByGroup).map(([groupName, options]) => (
            <p className="ad-live-item__custom-row" key={groupName}>
              <span className="ad-live-item__custom-label">{groupName}:</span>{" "}
              {options.join(", ")}
            </p>
          ))}
          {hasAddOns && (
            <p className="ad-live-item__custom-row">
              <span className="ad-live-item__custom-label">{t("common.extrasLabel", "Extras")}:</span>{" "}
              {line.selectedPaidAddOns.map((a) => a.name).join(", ")}
            </p>
          )}
          {hasNotes && (
            <p className="ad-live-item__custom-row ad-live-item__custom-row--note">
              <span className="ad-live-item__custom-label">{t("common.noteLabel", "Note")}:</span> {line.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Empty state (message adapts to the active filter) ───────────────────── */
function EmptyOrdersView({ filterKey, filterLabel, isAll }) {
  const { t } = useLanguage();
  const emptyTitle = isAll
    ? t("admin.noOrdersFound", "No orders found.")
    : t(EMPTY_STATUS_KEY[filterKey], `No ${filterLabel.toLowerCase()} orders.`);

  return (
    <div className="ad-empty anim-rise">
      <span className="ad-empty__icon">
        <PackageSearch size={28} strokeWidth={1.7} />
      </span>
      <h3 className="ad-empty__title">{emptyTitle}</h3>
      <p className="ad-empty__sub">
        {isAll
          ? t("admin.ordersWillAppear", "Customer orders will appear here once placed.")
          : t("admin.tryDifferentFilter", "Try a different filter to see other orders.")}
      </p>
    </div>
  );
}

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
