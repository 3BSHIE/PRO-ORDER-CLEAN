import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, ClipboardList } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import { getCustomerSession } from "../../lib/customerSession.js";
import { getCustomerOrders } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";

const STATUS_LABEL = {
  received:  "Received",
  preparing: "Preparing",
  ready:     "Ready",
  delivered: "Delivered",
  canceled:  "Canceled",
};
const STATUS_BADGE_TONE = {
  received:  "received",
  preparing: "preparing",
  ready:     "ready",
  delivered: "gold",
  canceled:  "canceled",
};
const STATUS_SHORT_MESSAGE = {
  received:  "Sent to the restaurant.",
  preparing: "The kitchen is preparing it.",
  ready:     "Ready — will be served soon.",
  delivered: "Delivered. Enjoy!",
  canceled:  "This order was canceled.",
};

/* Filter tabs: which order.status values count toward each tab */
const FILTER_TABS = [
  { key: "active",    label: "Active",    statuses: ["received", "preparing", "ready"] },
  { key: "completed",  label: "Completed", statuses: ["delivered"] },
  { key: "canceled",  label: "Canceled",  statuses: ["canceled"] },
  { key: "all",       label: "All",       statuses: null }, // null = no filter
];
const FILTER_TAB_KEY = {
  active: "orders.active",
  completed: "orders.completed",
  canceled: "status.canceled",
  all: "common.all",
};
const SHORT_MSG_KEY = {
  received: "orders.shortMsgReceived",
  preparing: "orders.shortMsgPreparing",
  ready: "orders.shortMsgReady",
  delivered: "orders.shortMsgDelivered",
  canceled: "orders.shortMsgCanceled",
};
/* order.paymentMethod.label is captured verbatim in English at order-creation
   time, so we re-resolve a live translation from the stable id instead, with
   that frozen label as the fallback — same pattern as the other order screens. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};

/* ═══════════════════════════════════════════════════════════════════════════
   CustomerOrdersScreen — Phase 12

   Guards (same pattern as every other customer screen):
     • QR token must be valid → else InvalidView
     • Customer session must exist → else redirect to onboarding

   Shows every order that matches the current restaurant/table/qrToken/
   customerName combination — this keeps the demo's "My Orders" scoped to
   what a guest at this table actually placed, without needing real auth.

   Read-only: no status-update controls, matching the tracking screen.
   Live-refreshes from localStorage on mount, on window focus, and on a
   light interval, so orders updated by a future Kitchen/Admin screen (in
   another tab) appear here without the customer doing anything.

   NOT built yet: admin dashboard, kitchen board, backend,
   customer status-update controls, feedback/rating.
   ═══════════════════════════════════════════════════════════════════════ */

export default function CustomerOrdersScreen({
  restaurantSlug,
  qrToken,
  onHome,
  onBackToMenu,
  onBackToAccess,
  onTrackOrder,
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
    <OrdersShell
      restaurant={result.restaurant}
      table={result.table}
      qrToken={qrToken}
      session={session}
      onBackToMenu={onBackToMenu}
      onTrackOrder={onTrackOrder}
    />
  );
}

/* ── Orders shell — owns filtering, tabs, and the live-refreshing read ──── */
function OrdersShell({ restaurant, table, qrToken, session, onBackToMenu, onTrackOrder }) {
  const [allOrders, setAllOrders] = useState(() => getCustomerOrders());
  const [activeTab, setActiveTab] = useState("all");
  const { t } = useLanguage();

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

  /* Restrict to this exact table/session's orders — restaurant + table +
     qrToken + customerName must all match, so the demo's "My Orders" never
     leaks other guests' orders even though everything lives in one
     localStorage bucket. */
  const myOrders = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          o.restaurantSlug === restaurant.slug &&
          o.tableNumber    === table.tableNumber &&
          o.qrToken        === qrToken &&
          o.customerName   === session.customerName
      ),
    [allOrders, restaurant.slug, table.tableNumber, qrToken, session.customerName]
  );

  const activeTabDef = FILTER_TABS.find((tab) => tab.key === activeTab);
  const visibleOrders = useMemo(
    () =>
      myOrders
        .filter((o) => !activeTabDef.statuses || activeTabDef.statuses.includes(o.status))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), // newest first
    [myOrders, activeTabDef]
  );

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
        <header className="orders-header anim-rise">
          <p className="orders-header__rest">{restaurant.name}</p>
          <p className="orders-header__table">{t("customer.yourTable", "Table")} #{table.tableNumber}</p>
          <h1 className="orders-header__greeting">
            Hi, <i>{session.customerName}</i>
          </h1>
          <h2 className="orders-header__title">{t("customer.myOrders", "My Orders")}</h2>
        </header>

        {myOrders.length === 0 ? (
          <EmptyOrdersView onBackToMenu={onBackToMenu} />
        ) : (
          <>
            <div className="orders-tabs anim-rise" style={{ animationDelay: "60ms" }}>
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`orders-tab ${activeTab === tab.key ? "orders-tab--active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {t(FILTER_TAB_KEY[tab.key], tab.label)}
                </button>
              ))}
            </div>

            {visibleOrders.length === 0 ? (
              <p className="orders-tab-empty">{t("orders.noOrdersInCategory", "No orders in this category yet.")}</p>
            ) : (
              <div className="orders-list anim-rise" style={{ animationDelay: "100ms" }}>
                {visibleOrders.map((order) => (
                  <OrderCard key={order.orderId} order={order} onTrackOrder={onTrackOrder} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

/* ── Single order summary card ───────────────────────────────────────────── */
function OrderCard({ order, onTrackOrder }) {
  const { t } = useLanguage();
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
    <Card className="order-card">
      <div className="order-card__top">
        <div>
          <p className="order-card__id">{order.orderId}</p>
          <p className="order-card__time">{formatTimestamp(order.createdAt)}</p>
        </div>
        <Badge tone={STATUS_BADGE_TONE[order.status] || "neutral"} dot>
          {t(`status.${order.status}`, STATUS_LABEL[order.status] || order.status)}
        </Badge>
      </div>

      <p className="order-card__msg">
        {SHORT_MSG_KEY[order.status] ? t(SHORT_MSG_KEY[order.status], STATUS_SHORT_MESSAGE[order.status]) : ""}
      </p>

      <div className="order-card__meta">
        <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
        <span className="order-card__dot">&middot;</span>
        <span>{paymentMethodLabel}</span>
        <span className="order-card__dot">&middot;</span>
        <span>{paymentLabel}</span>
      </div>

      <div className="order-card__bottom">
        <span className="order-card__total">{fmtPrice(order.total)}</span>
        <Button size="sm" onClick={() => onTrackOrder(order.orderId)}>
          {t("orders.trackOrder", "Track order")}
        </Button>
      </div>
    </Card>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyOrdersView({ onBackToMenu }) {
  const { t } = useLanguage();
  return (
    <div className="orders-empty anim-rise">
      <span className="orders-empty__icon">
        <ClipboardList size={30} strokeWidth={1.7} />
      </span>
      <h2 className="orders-empty__title">{t("orders.noOrdersYet", "You don't have any orders yet.")}</h2>
      <p className="orders-empty__sub">
        {t("orders.trackHereMsg", "Once you place an order, you'll be able to track it here.")}
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
