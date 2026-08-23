import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, ChevronRight } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import BusyModeCard from "./BusyModeCard.jsx";
import CategoryVisibilityCard from "./CategoryVisibilityCard.jsx";
import DashboardDrillDown from "./DashboardDrillDown.jsx";
import { getCustomerOrders } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import {
  filterToday,
  summarizeRevenue,
  summarizeOrderStatuses,
} from "../../lib/dashboardStats.js";

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
  /* Which drill-down is open, by card key; null = none. */
  const [openDetail, setOpenDetail] = useState(null);
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

  /* Phase 30 — every number below now comes from src/lib/dashboardStats.js,
     the single calculation path shared with the drill-down modals. The values
     are identical to what this screen computed inline before; the point of
     the move is that a card and its breakdown can no longer disagree.

     Scope is unchanged and deliberately mixed, exactly as since Phase 18:
     the two "Today" cards are today-scoped, every status count is all-time. */
  const ordersToday = useMemo(() => filterToday(restaurantOrders), [restaurantOrders]);

  /* Today-scoped — drives the Revenue Today and Orders Today cards and both
     drill-downs. */
  const todayRevenue = useMemo(() => summarizeRevenue(ordersToday), [ordersToday]);
  const todayStatuses = useMemo(() => summarizeOrderStatuses(ordersToday), [ordersToday]);

  /* All-time — drives the five status cards and Active Orders, matching the
     pre-existing behaviour of those cards. */
  const allTimeStatuses = useMemo(
    () => summarizeOrderStatuses(restaurantOrders),
    [restaurantOrders]
  );

  /* Which cards open a detail view. A card is listed here only when the
     breakdown tells the reader something the dashboard does not already show:

       revenueToday — a single figure that silently mixes money collected with
                      money still owed; the split is genuinely new information.
       ordersToday  — today's volume broken out by status, which appears
                      nowhere else (the status cards are all-time).

     Everything else stays static on purpose:
       activeOrders — its breakdown is Waiting Prep + Preparing + Ready to
                      Serve, which are literally the next three cards on the
                      same screen. A modal would restate what is already
                      visible.
       waitingPrep / preparing / readyToServe / completed / canceled —
                      atomic single-status counts. The only useful "detail" is
                      the list of those orders, which Live Orders already
                      provides with per-status filter tabs; duplicating it
                      here would be a second orders screen, not a drill-down. */
  const INTERACTIVE_CARDS = ["revenueToday", "ordersToday"];

  const STAT_CARDS = [
    { key: "ordersToday",  label: "Orders Today",  value: todayStatuses.total,           tone: "gold" },
    { key: "revenueToday", label: "Revenue Today", value: fmtPrice(todayRevenue.total),  tone: "gold" },
    { key: "activeOrders", label: "Active Orders", value: allTimeStatuses.active,        tone: "gold" },
    { key: "waitingPrep",  label: "Waiting Prep",  value: allTimeStatuses.received,      tone: "received" },
    { key: "preparing",    label: "Preparing",     value: allTimeStatuses.preparing,     tone: "preparing" },
    { key: "readyToServe", label: "Ready to Serve",value: allTimeStatuses.ready,          tone: "ready" },
    { key: "completed",    label: "Completed",     value: allTimeStatuses.delivered,     tone: "neutral" },
    { key: "canceled",     label: "Canceled",      value: allTimeStatuses.canceled,      tone: "canceled" },
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

      {/* ── Category visibility (Phase 28) ────────────────────────────────
          Operational on/off for Admin AND Cashier. Full Category Management
          (add/rename/delete/reorder/image/schedule) remains Admin-only in
          its own screen — this card can only flip one boolean. */}
      <div className="anim-rise" style={{ animationDelay: "70ms", marginBottom: 18 }}>
        <CategoryVisibilityCard restaurant={restaurant} />
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="ad-stats anim-rise" style={{ animationDelay: "80ms" }}>
        {STAT_CARDS.map((stat) => {
          const label = t(STAT_LABEL_KEY[stat.key], stat.label);
          const isInteractive = INTERACTIVE_CARDS.includes(stat.key);

          /* Interactive cards render as real <button>s carrying the same
             `card ad-stat` classes, so they look identical to the static ones
             while being keyboard-focusable and announced as buttons. */
          if (isInteractive) {
            return (
              <button
                key={stat.key}
                type="button"
                className="card ad-stat ad-stat--interactive"
                onClick={() => setOpenDetail(stat.key)}
                aria-haspopup="dialog"
              >
                <span className={`ad-stat__dot ad-stat__dot--${stat.tone}`} />
                <span className="ad-stat__value">{stat.value}</span>
                <span className="ad-stat__label">{label}</span>
                <ChevronRight
                  className="ad-stat__chevron"
                  size={14}
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
              </button>
            );
          }

          return (
            <Card key={stat.key} className="ad-stat">
              <span className={`ad-stat__dot ad-stat__dot--${stat.tone}`} />
              <span className="ad-stat__value">{stat.value}</span>
              <span className="ad-stat__label">{label}</span>
            </Card>
          );
        })}
      </div>

      {/* Detail views read the live summaries above, so an open modal keeps
          updating as the 4s poll picks up new orders and payment changes. */}
      <DashboardDrillDown
        detailKey={openDetail}
        revenue={todayRevenue}
        statuses={todayStatuses}
        onClose={() => setOpenDetail(null)}
        onNavigate={onNavigate}
      />

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
