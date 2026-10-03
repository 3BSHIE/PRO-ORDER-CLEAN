import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ChevronDown, PackageSearch, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Button  from "../../components/ui/Button.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { getCustomerOrders, updateCustomerOrderStatus, updateCustomerOrderPaymentStatus } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
/* Phase 97.8 §8 — both definitions moved to the shared lib so Overview and
   this screen can never disagree about whether a ticket is late. */
import { elapsedMinutes, isOrderDelayed as isDelayed } from "../../lib/operationalAttention.js";
import { fmtPrice } from "../../lib/format.js";
import { isSameDay, ACTIVE_STATUSES } from "../../lib/dashboardStats.js";
/* Phase 101.0 — the item count was hardcoded English ("1 item" / "3 items")
   and stayed English on an Arabic row. formatItemCount is the project's
   existing pluraliser, already used by the Customer menu, so this reuses a
   helper and two existing keys rather than adding anything (§32). */
import { formatItemCount } from "../../i18n/counts.js";

const STATUS_LABEL = {
  received: "Received", preparing: "Preparing", ready: "Ready",
  delivered: "Delivered", canceled: "Canceled",
};
const STATUS_BADGE_TONE = {
  received: "received", preparing: "preparing", ready: "ready",
  delivered: "gold", canceled: "canceled",
};

/* Filter tabs — "All", the three operational views the Overview KPI cards
   open (Phase 95.1), then one tab per real status in board order.

   Each tab is one MUTUALLY EXCLUSIVE view of the order list, not a set of
   combinable facets: picking "Today" then "Ready" replaces the view rather
   than intersecting, which is what the tab metaphor already promised. That
   keeps the smallest mechanism §5 asks for — a predicate per key — instead of
   a second filtering system layered on top of this one. */
const FILTER_TABS = [
  { key: "all",       label: "All" },
  { key: "today",     label: "Today" },
  { key: "active",    label: "Active" },
  { key: "unpaid",    label: "Unpaid" },
  { key: "received",  label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready",     label: "Ready" },
  { key: "delivered", label: "Delivered" },
  { key: "canceled",  label: "Canceled" },
];

/* §4 — the only tabs that carry a count. Kept beside FILTER_TABS so adding a
   tab and deciding whether it earns a count are one edit, not two. */
const FILTER_COUNT_TABS = ["active", "unpaid"];

/* The one place a filter key becomes a question about an order. "all" is
   absent on purpose — it is the no-op default in the selector below. */
const FILTER_PREDICATE = {
  today:  (o) => isSameDay(o.createdAt),
  active: (o) => ACTIVE_STATUSES.includes(o.status),
  /* Money still owed. Canceled orders are excluded for the same reason
     summarizeRevenue excludes them: nobody is going to collect on them, so
     listing them under "Unpaid" would put dead orders in a work queue. */
  unpaid: (o) => o.paymentStatus !== "paid" && o.status !== "canceled",
  received:  (o) => o.status === "received",
  preparing: (o) => o.status === "preparing",
  ready:     (o) => o.status === "ready",
  delivered: (o) => o.status === "delivered",
  canceled:  (o) => o.status === "canceled",
};
/* Translation keys for each filter tab's visible label, keyed by tab.key.
   Everything except "all" reuses the existing status.* keys since the
   English text is identical. */
const FILTER_TAB_KEY = {
  all: "common.all",
  today: "admin.filterToday",
  active: "admin.filterActive",
  unpaid: "admin.filterUnpaid",
  received: "status.received",
  preparing: "status.preparing",
  ready: "status.ready",
  delivered: "status.delivered",
  canceled: "status.canceled",
};
/* Translation keys for the per-status empty-state message ("No X orders."). */
const EMPTY_STATUS_KEY = {
  today: "admin.noOrdersToday",
  active: "admin.noActiveOrders",
  unpaid: "admin.noUnpaidOrders",
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

/* Phase 101.0 §30 — LEGACY SAFETY.

   A legacy or corrupted order can carry no `paymentMethod` object at all.
   Reading `.id` straight off it threw a TypeError that the error boundary
   caught at screen level, so one bad record blanked the entire page.

   Resolution order, which leaves every VALID order behaving exactly as
   before: the live translation for a known id, then the label frozen on the
   order at creation time, then the raw id, then a neutral dash. An id that
   is present but unknown to the catalogue now also resolves without passing
   an undefined key to t(), which used to log a warning on every paint.

   This is a read-path guard only. Nothing about the payment workflow, the
   stored shape or how new orders are created changes. */
function resolveMethodLabel(t, paymentMethod) {
  const id = paymentMethod?.id;
  const frozen = paymentMethod?.label;
  if (id && METHOD_LABEL_KEY[id]) return t(METHOD_LABEL_KEY[id], frozen || id);
  return frozen || id || "—";
}

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

  /* Phase 75 §19/§20 — a one-shot entrance for an order this screen has
     genuinely never shown before.

     The first render only SEEDS the known-id set, so opening Live Orders on
     an existing backlog animates nothing, and neither does a refresh, a poll
     returning the same list, or switching filter tabs (a tab change re-runs
     this effect against the same allOrders, so no id is new). Only an order
     that actually arrives while the screen is mounted is marked.

     Deliberately keyed on the unfiltered restaurant order list rather than
     the filtered view: filtering is not arrival. And nothing animates on
     REORDER — §20 — because the class is only ever added to brand-new ids,
     never to a card that merely moved position. */
  const seenOrderIdsRef = useRef(null);
  const [newOrderIds, setNewOrderIds] = useState(() => new Set());

  useEffect(() => {
    const ids = restaurantOrders.map((o) => o.orderId);

    if (seenOrderIdsRef.current === null) {
      seenOrderIdsRef.current = new Set(ids);
      return;
    }

    const fresh = ids.filter((id) => !seenOrderIdsRef.current.has(id));
    ids.forEach((id) => seenOrderIdsRef.current.add(id));
    if (fresh.length === 0) return;

    setNewOrderIds(new Set(fresh));
    /* Cleared so the class cannot persist into a later render and replay. */
    const timer = setTimeout(() => setNewOrderIds(new Set()), 400);
    return () => clearTimeout(timer);
  }, [restaurantOrders]);


  /* §4 — the only two tabs that get a count. Active is "how much work is on
     the floor" and Unpaid is "how much money is still out"; the status tabs
     are already answered by the rows underneath them, and All/Today would
     just restate the list length. Derived from FILTER_PREDICATE, so these
     are the same questions the tabs ask. */
  const filterCounts = useMemo(
    () => ({
      active: restaurantOrders.filter(FILTER_PREDICATE.active).length,
      unpaid: restaurantOrders.filter(FILTER_PREDICATE.unpaid).length,
    }),
    [restaurantOrders]
  );

  /* §6 — on a narrow screen the row scrolls, and a tab selected from the
     Overview KPI cards can land off-screen with nothing to say the view
     changed. Bring it into view on the inline axis only: `block: "nearest"`
     stops this from scrolling the PAGE as well, which would yank the order
     list out from under the operator. */
  const filtersRef = useRef(null);
  useEffect(() => {
    const row = filtersRef.current;
    if (!row) return;
    const tab = row.querySelector(`[data-filter="${activeFilter}"]`);
    if (!tab || typeof tab.scrollIntoView !== "function") return;
    try {
      tab.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    } catch {
      tab.scrollIntoView();
    }
  }, [activeFilter]);

  const filteredOrders = useMemo(
    () =>
      restaurantOrders
        .filter((o) => {
          const predicate = FILTER_PREDICATE[activeFilter];
          return predicate ? predicate(o) : true; // "all" and any unknown key
        })
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

      {/* ── Phase 101.0 §3 — MINIMAL STATUS TABS ──────────────────────────
          The pill row becomes a tab row: no capsule per filter, quiet text
          when inactive, Primary text plus an underline when active. The
          underline belongs to the active tab itself — there is no gliding
          indicator travelling across the row (§3).

          role="tablist" is deliberate: these were always mutually exclusive
          views of one list, which is what a tab is, and saying so gives a
          screen reader the selected state the underline gives everyone else.
          Filter keys, predicates and behaviour are untouched. */}
      <div
        className="ad-filters anim-rise"
        style={{ animationDelay: "80ms" }}
        role="tablist"
        aria-label={t("admin.liveOrders", "Live Orders")}
        ref={filtersRef}
      >
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key;
          const count = FILTER_COUNT_TABS.includes(tab.key)
            ? filterCounts[tab.key]
            : null;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-filter={tab.key}
              className={`ad-filter ${isActive ? "ad-filter--active" : ""}`}
              onClick={() => setActiveFilter(tab.key)}
            >
              {t(FILTER_TAB_KEY[tab.key], tab.label)}
              {/* §4 — a count only where it answers an operational question,
                  and only when there is something to answer. Counting every
                  tab, or printing a row of zeros, is the noise §4 warns
                  against. Both figures come from the SAME predicates the
                  filters themselves use, so a tab and its count can never
                  disagree. */}
              {count > 0 && <span className="ad-filter__count">{count}</span>}
            </button>
          );
        })}
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyOrdersView filterKey={activeFilter} filterLabel={activeFilterLabel} isAll={activeFilter === "all"} />
      ) : (
        <div className="ad-live-orders anim-rise" style={{ animationDelay: "120ms" }}>
          {filteredOrders.map((order) => (
            <LiveOrderCard
              key={order.orderId}
              order={order}
              isNew={newOrderIds.has(order.orderId)}
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
                  {resolveMethodLabel(t, pendingCancelOrder.paymentMethod)}
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
                {resolveMethodLabel(t, pendingPaidOrder.paymentMethod)}
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
function LiveOrderCard({ order, expanded, onToggle, isUpdating, onMarkDelivered, onCancelOrder, onMarkAsPaid, isNew }) {
  const { t } = useLanguage();
  const isPaid = order.paymentStatus === "paid";
  const paymentLabel = isPaid
    ? t("payment.paid", "Paid")
    : t("payment.pendingAtTable", "Pending at table");
  const paymentMethodLabel = resolveMethodLabel(t, order.paymentMethod);
  const itemCount = order.items.reduce((sum, line) => sum + (line.quantity || 0), 0);
  /* Trimmed once here so an order whose name is "" or "   " takes the
     no-name path rather than rendering a separator against blank space. */
  const customerName = order.customerName?.trim();

  const canDeliver = order.status === "ready";
  const canCancel  = CANCELABLE_STATUSES.includes(order.status);
  const isDelivered = order.status === "delivered";
  const isCanceled  = order.status === "canceled";
  /* Payment is a separate axis from order.status (Phase 20) — available any
     time payment is still pending on a non-canceled order, independent of
     whether the order itself can still be delivered/canceled. A "delivered"
     order with pending payment still shows this action. */
  const canMarkAsPaid = order.paymentStatus === "pending_at_table" && !isCanceled;

  /* §10/§11 — recomputed on every render, which the screen's existing 4s
     refresh already drives. */
  const mins = elapsedMinutes(order.createdAt);
  const elapsedLabel = formatElapsed(t, mins);
  const delayed = isDelayed(order, mins);

  return (
    <Card
      className={`ad-live-card ${isNew ? "ad-live-card--new" : ""} ${
        delayed ? "ad-live-card--delayed" : ""
      }`}
    >
      <button
        type="button"
        className="ad-live-card__summary"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {/* §8 — the hierarchy inverts. An operator works the floor by TABLE,
            not by internal order number, so the table is now the strongest
            thing on the row and ORD-0003 drops to a quiet reference beside
            the guest name.

            The separator is rendered conditionally rather than interpolated,
            so an order with no customer name shows the id alone instead of a
            dangling "ORD-0003 ·". The human reference is never removed and no
            internal id is exposed. */}
        <div className="ad-live-card__summary-left">
          <p className="ad-live-card__table">
            <span className="ad-live-card__table-word">
              {t("customer.yourTable", "Table")}
            </span>
            <span className="ad-live-card__table-num">{order.tableNumber}</span>
          </p>
          <p className="ad-live-card__ref">
            <span className="ad-live-card__ref-id">{order.orderId}</span>
            {customerName && (
              <>
                <span className="ad-live-card__ref-sep" aria-hidden="true"> · </span>
                <span className="ad-live-card__ref-name">{customerName}</span>
              </>
            )}
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
          {/* §10 — elapsed leads, because that is the operational question.
              §11 — when the estimate has been passed the figure takes the
              amber treatment and gains an explicit "Delayed" word, so the
              state never rests on colour alone (§28). */}
          {/* §9/§11 — elapsed leads and the absolute stamp sits beside it
              rather than beneath: both answer "when", and stacking them made
              the metadata cluster three rows deep for no gain. Every field
              the row carried before is still here. */}
          <span className="ad-live-card__when">
          <span className={`ad-live-card__elapsed ${delayed ? "ad-live-card__elapsed--delayed" : ""}`}>
            {elapsedLabel && (
              <span className="ad-live-card__elapsed-value">{elapsedLabel}</span>
            )}
            {delayed && (
              <span className="ad-live-card__delayed-tag">
                {t("kitchen.delayed", "Delayed")}
              </span>
            )}
          </span>
          <span className="ad-live-card__time">{formatTimestamp(order.createdAt)}</span>
          </span>
        </div>

        <div className="ad-live-card__summary-right">
          <span className="ad-live-card__items">{formatItemCount(t, itemCount)}</span>
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
          {/* Phase 75 §15 — the expanded card was one flat run of rows at
              equal weight: payment, then items, then totals, separated only
              by hairlines. It now reads as three labelled blocks in the
              approved order — what was ordered, how it is being paid, what it
              comes to — followed by a visually separated action row. Same
              content and same data; only the grouping and order changed. */}

          {/* 1 — Order items */}
          <div className="ad-live-block">
            <h4 className="ad-live-block__title">{t("admin.orderItems", "Order items")}</h4>
            <div className="ad-live-card__items-list">
              {order.items.map((line) => (
                <LiveOrderLineItem key={line.cartItemId} line={line} />
              ))}
            </div>
          </div>

          {/* 2 + 3 — Payment and Summary (§18).
              Same blocks, same data, same order; they simply sit side by side
              once there is genuinely room, and stack again when there is not.
              The wrapper adds no surface of its own. */}
          <div className="ad-live-split">
          {/* 2 — Payment */}
          <div className="ad-live-block">
            <h4 className="ad-live-block__title">{t("payment.paymentTitle", "Payment")}</h4>
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
          </div>

          {/* 3 — Summary */}
          <div className="ad-live-block">
            <h4 className="ad-live-block__title">{t("admin.summary", "Summary")}</h4>
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
          </div>
          </div>

          {/* ── 4 — Action row (Phase 75 §12/§17) ────────────────────────
              The hierarchy here was inverted before this phase: Cancel Order
              was a FILLED red button while Mark as Paid was a quiet outline
              below its own divider, so the most destructive action was the
              loudest thing on the card and the one a cashier actually needs
              was the faintest.

              Now there is one action row, and exactly one primary in it:

                unpaid  Mark as Paid is primary gold — it is the job
                paid    the Paid state is shown, and Mark as Delivered
                        becomes primary since it is the remaining step

              Cancel is always a restrained outline-destructive: red enough to
              read as danger, never heavy enough to look like the main action.

              None of the handlers changed. Mark as Paid still routes through
              the Phase 49 confirmation and Cancel still routes through the
              Phase 50 paid warning — this is presentation only. */}
          {(canDeliver || canCancel || canMarkAsPaid) && (
            <div className="ad-live-card__actions ad-live-card__actions--row">
              {canMarkAsPaid && (
                <Button
                  type="button"
                  size="md"
                  disabled={isUpdating}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkAsPaid();
                  }}
                >
                  {t("payment.markAsPaid", "Mark as Paid")}
                </Button>
              )}
              {canDeliver && (
                <Button
                  type="button"
                  variant={canMarkAsPaid ? "outline" : "primary"}
                  size="md"
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
                  variant="danger-outline"
                  size="md"
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

/* Phase 91 §10 — how long ago the order was placed.
   The card previously showed only an absolute wall-clock stamp ("Sep 11,
   10:09 PM"). On an operational board that is the wrong unit: nobody is asked
   "when was this placed", they are asked "how long has this table been
   waiting". Both are shown now — elapsed leads, the clock time stays as the
   quieter secondary reference.

   No new timer architecture (§10): the screen already re-reads orders every
   4 seconds, which re-renders this at a granularity far finer than the
   minutes it displays. */
/* Phase 97.8 §8 — elapsedMinutes and isDelayed moved to
   lib/operationalAttention.js, unchanged, and are imported at the top. The
   Overview needs the same verdicts and a second copy would drift. */

/* Under an hour reads as plain minutes; past that, hours and minutes, so a
   forgotten ticket does not render as "184 min". */
function formatElapsed(t, mins) {
  if (mins === null) return null;
  if (mins < 60) return t("admin.elapsedMinutes", "{n} min").replace("{n}", mins);
  return t("admin.elapsedHours", "{h}h {m}m")
    .replace("{h}", Math.floor(mins / 60))
    .replace("{m}", mins % 60);
}

/* Phase 91 §11 — is this order running late?
   Deliberately the SAME question the customer's timer asks: has the estimate
   frozen on the order at checkout been passed while the kitchen still has it.
   Reusing that definition means the guest's "Taking a little longer" and the
   operator's "Delayed" can never disagree about the same ticket.

   Only an order still in the kitchen can be late — a ready, delivered or
   canceled one has stopped waiting — and an order with no estimate (placed
   before Phase 26) is never labelled, because there is nothing to be late
   against and inventing a threshold would be fabricating a promise.

   The Kitchen board keeps its own three-tier model (normal / delayed /
   critical, Phase 71) untouched: §11 asks for that logic to stay separate,
   and Admin only needs the one restrained amber step. */
/* The rule itself now lives in lib/operationalAttention.js. */

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
