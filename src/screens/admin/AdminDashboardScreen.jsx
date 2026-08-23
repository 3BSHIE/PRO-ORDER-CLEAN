import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import BusyModeCard from "./BusyModeCard.jsx";
import { getCustomerOrders } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";

const RECENT_ORDERS_LIMIT = 8;

const STATUS_LABEL = {
  received: "Received", preparing: "Preparing", ready: "Ready",
  delivered: "Delivered", canceled: "Canceled",
};
const STATUS_BADGE_TONE = {
  received: "received", preparing: "preparing", ready: "ready",
  delivered: "gold", canceled: "canceled",
};

/* Translation keys for each stat card's label, keyed by a stable id (added
   to each STAT_CARDS entry below as `key`). "preparing" and "canceled" reuse
   the existing status.* keys since their English text is identical. */
const STAT_LABEL_KEY = {
  ordersToday: "admin.ordersToday",
  revenueToday: "admin.revenueToday",
  activeOrders: "admin.activeOrders",
  waitingPrep: "admin.waitingPrep",
  preparing: "status.preparing",
  readyToServe: "admin.readyToServe",
  completed: "admin.completed",
  canceled: "status.canceled",
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

/* ═══════════════════════════════════════════════════════════════════════════
   AdminDashboardScreen — Phase 18

   Read-only overview: today's stats + recent orders from the same
   localStorage orders customerOrders.js already manages — no status-change
   controls here (that's out of scope for both this screen and Live Orders,
   which stays read-only too this phase).

   Now wrapped in AdminLayout (Phase 18) so the nav shell — Overview / Live
   Orders / coming-soon items — is shared with AdminLiveOrdersScreen instead
   of duplicated.

   Refreshes on mount, on window focus, and on a light interval, matching the
   same pattern used by the kitchen board and customer tracking/My Orders.

   NOT built yet: order action buttons (Delivered/Cancel), menu management,
   category management, tables/QR management, backend.
   ═══════════════════════════════════════════════════════════════════════ */

export default function AdminDashboardScreen({ restaurant, session, onSignOut, onNavigate }) {
  const [allOrders, setAllOrders] = useState(() => getCustomerOrders());
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
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

  const restaurantOrders = useMemo(
    () => allOrders.filter((o) => o.restaurantSlug === restaurant.slug),
    [allOrders, restaurant.slug]
  );

  const isToday = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  const ordersToday = restaurantOrders.filter((o) => isToday(o.createdAt));
  const revenueToday = ordersToday
    .filter((o) => o.status !== "canceled")
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const countByStatus = (status) => restaurantOrders.filter((o) => o.status === status).length;
  const activeCount = ["received", "preparing", "ready"].reduce(
    (sum, s) => sum + countByStatus(s),
    0
  );

  const STAT_CARDS = [
    { key: "ordersToday",  label: "Orders Today",  value: ordersToday.length,         tone: "gold" },
    { key: "revenueToday", label: "Revenue Today", value: fmtPrice(revenueToday),     tone: "gold" },
    { key: "activeOrders", label: "Active Orders", value: activeCount,                tone: "gold" },
    { key: "waitingPrep",  label: "Waiting Prep",  value: countByStatus("received"),  tone: "received" },
    { key: "preparing",    label: "Preparing",     value: countByStatus("preparing"), tone: "preparing" },
    { key: "readyToServe", label: "Ready to Serve",value: countByStatus("ready"),      tone: "ready" },
    { key: "completed",    label: "Completed",     value: countByStatus("delivered"), tone: "neutral" },
    { key: "canceled",     label: "Canceled",      value: countByStatus("canceled"),  tone: "canceled" },
  ];

  const recentOrders = useMemo(
    () =>
      [...restaurantOrders]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, RECENT_ORDERS_LIMIT),
    [restaurantOrders]
  );

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="overview"
      onNavigate={onNavigate}
    >
      <header className="ad-header anim-rise" style={{ animationDelay: "40ms" }}>
        <h1 className="ad-header__title">{t("admin.dashboardOverview", "Dashboard overview")}</h1>
        <p className="ad-header__subtitle">{t("admin.monitorActivity", "Monitor today's restaurant activity.")}</p>
      </header>

      {/* ── Busy Mode / service speed (Phase 26) ──────────────────────────
          Available to Admin AND Cashier; the card itself decides which
          controls each role gets. */}
      <div className="anim-rise" style={{ animationDelay: "60ms", marginBottom: 18 }}>
        <BusyModeCard
          restaurant={restaurant}
          session={session}
          onNotify={(message) => {
            setToastMessage(message);
            setToastVisible(true);
          }}
        />
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="ad-stats anim-rise" style={{ animationDelay: "80ms" }}>
        {STAT_CARDS.map((stat) => (
          <Card key={stat.key} className="ad-stat">
            <span className={`ad-stat__dot ad-stat__dot--${stat.tone}`} />
            <span className="ad-stat__value">{stat.value}</span>
            <span className="ad-stat__label">{t(STAT_LABEL_KEY[stat.key], stat.label)}</span>
          </Card>
        ))}
      </div>

      {/* ── Recent orders ─────────────────────────────────────────────────── */}
      <div className="ad-section-bar anim-rise" style={{ animationDelay: "120ms" }}>
        <h2 className="ad-section-title">{t("admin.recentOrders", "Recent orders")}</h2>
        {restaurantOrders.length > 0 && (
          <span className="ad-section-count">
            {t("admin.showing", "Showing")} {recentOrders.length} {t("common.of", "of")} {restaurantOrders.length}
          </span>
        )}
      </div>

      {recentOrders.length === 0 ? (
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <LineChart size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.noOrdersYetPeriod", "No orders yet.")}</h3>
          <p className="ad-empty__sub">{t("admin.ordersWillAppear", "Customer orders will appear here once placed.")}</p>
        </div>
      ) : (
        <div className="ad-orders anim-rise" style={{ animationDelay: "150ms" }}>
          {recentOrders.map((order) => {
            const paymentLabel =
              order.paymentStatus === "paid"
                ? t("payment.paid", "Paid")
                : t("payment.pendingAtTable", "Pending at table");
            const paymentMethodLabel = t(
              METHOD_LABEL_KEY[order.paymentMethod.id],
              order.paymentMethod.label
            );
            return (
              <Card key={order.orderId} className="ad-order">
                <div className="ad-order__top">
                  <div>
                    <p className="ad-order__id">{order.orderId}</p>
                    <p className="ad-order__meta">
                      {t("customer.yourTable", "Table")} #{order.tableNumber} &middot; {order.customerName}
                    </p>
                  </div>
                  <Badge tone={STATUS_BADGE_TONE[order.status] || "neutral"} dot>
                    {t(`status.${order.status}`, STATUS_LABEL[order.status] || order.status)}
                  </Badge>
                </div>
                <div className="ad-order__bottom">
                  <span className="ad-order__time">{formatTimestamp(order.createdAt)}</span>
                  <span className="ad-order__payment">
                    {paymentMethodLabel} &middot; {paymentLabel}
                  </span>
                  <span className="ad-order__total">{fmtPrice(order.total)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </AdminLayout>
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
