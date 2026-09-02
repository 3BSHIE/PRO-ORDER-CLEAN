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
import { useStaffCalls } from "../../lib/useStaffCalls.js";
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
  pendingPayments: "admin.pendingPayments",
  staffCalls: "staff.staffCalls",
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

  /* Phase 75 §33/§35 — Cashier is a deliberately lighter operational role,
     not "Admin minus pages". The snapshot below is chosen for the job rather
     than mirrored from Admin. Nothing about permissions changes here: this
     only decides which four existing numbers are shown. */
  const isCashier = session.role === "cashier";

  /* The same live call list the nav badge already reads — one source, so the
     KPI and the badge can never disagree. */
  const { calls: staffCalls } = useStaffCalls(restaurant.slug);
  const openCallCount = useMemo(
    () => staffCalls.filter((c) => c.status === "open").length,
    [staffCalls]
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

  /* Phase 53 — status cards that are shortcuts into Live Orders.
     The values are the EXISTING filter keys from AdminLiveOrdersScreen's
     FILTER_TABS, which are just the order statuses, so no filtering logic is
     duplicated here - this only names a destination.

     The counts agree by construction: these five cards read allTimeStatuses,
     and Live Orders filters the same unscoped restaurant order list. The two
     "Today" cards are the only date-scoped ones, and they keep their Phase 30
     drill-downs instead.

     activeOrders is deliberately absent - see below. */
  const CARD_TO_ORDER_FILTER = {
    waitingPrep:  "received",
    preparing:    "preparing",
    readyToServe: "ready",
    completed:    "delivered",
    canceled:     "canceled",
  };

  /* Accessible names for the shortcuts. The visible label is a bare count and
     a noun ("4", "Preparing"), which tells a screen reader nothing about what
     activating it does. */
  const FILTER_CARD_ARIA = {
    waitingPrep:  ["admin.viewReceivedOrders",  "View received orders"],
    preparing:    ["admin.viewPreparingOrders", "View preparing orders"],
    readyToServe: ["admin.viewReadyOrders",     "View ready orders"],
    completed:    ["admin.viewDeliveredOrders", "View delivered orders"],
    canceled:     ["admin.viewCanceledOrders",  "View canceled orders"],
  };

  /* Phase 75 §2/§35 — the snapshot the operator sees first, and it differs by
     role because the two roles run different jobs.

     Admin gets the business read: volume, money, load, and whether anyone is
     waiting for a person. Cashier gets the counter read — §35 is explicit
     that revenue is NOT shown to Cashier just for symmetry with Admin, so it
     is swapped for Pending Payments, which is the number a cashier actually
     works from.

     Every value here already existed: pendingCount comes straight out of
     summarizeRevenue (the same calculation the Revenue drill-down uses) and
     the open-call count is the same list the nav badge already reads. No new
     metric is invented and no new business logic is introduced. */
  const KPI_CARDS = isCashier
    ? [
        { key: "activeOrders",     label: "Active Orders",     value: allTimeStatuses.active,   tone: "gold" },
        { key: "pendingPayments",  label: "Pending Payments",  value: todayRevenue.pendingCount, tone: "preparing" },
        { key: "staffCalls",       label: "Staff Calls",       value: openCallCount,            tone: "preparing" },
        { key: "ordersToday",      label: "Orders Today",      value: todayStatuses.total,      tone: "gold" },
      ]
    : [
        { key: "ordersToday",  label: "Orders Today",  value: todayStatuses.total,          tone: "gold" },
        { key: "revenueToday", label: "Revenue Today", value: fmtPrice(todayRevenue.total), tone: "gold" },
        { key: "activeOrders", label: "Active Orders", value: allTimeStatuses.active,       tone: "gold" },
        { key: "staffCalls",   label: "Staff Calls",   value: openCallCount,                tone: "preparing" },
      ];

  /* The per-status counts. These stay on the page — they are genuinely
     different numbers from the snapshot above, not duplicates — but they drop
     to a secondary row under their own heading so the dashboard has one
     obvious first-glance layer rather than eight equal cards (§10). */
  const STATUS_CARDS = [
    { key: "waitingPrep",  label: "Waiting Prep",  value: allTimeStatuses.received,  tone: "received" },
    { key: "preparing",    label: "Preparing",     value: allTimeStatuses.preparing, tone: "preparing" },
    { key: "readyToServe", label: "Ready to Serve",value: allTimeStatuses.ready,     tone: "ready" },
    { key: "completed",    label: "Completed",     value: allTimeStatuses.delivered, tone: "neutral" },
    { key: "canceled",     label: "Canceled",      value: allTimeStatuses.canceled,  tone: "canceled" },
  ];

  const recentOrders = useMemo(
    () =>
      [...restaurantOrders]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, RECENT_ORDERS_LIMIT),
    [restaurantOrders]
  );

  /* Phase 75 — one renderer for both rows. The KPI snapshot and the status
     row use identical card markup and identical interaction rules; only the
     extra class differs, which is what drives their different sizing. Two
     copies of this would be two places for the drill-down and filter-shortcut
     behaviour to drift apart. */
  function renderStatCard(stat, extraClass) {
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
          className={`card ad-stat ad-stat--interactive ${extraClass}`}
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

    /* Phase 53 — status cards navigate to Live Orders with their filter
       already applied. Rendered with the same button treatment the
       drill-down cards already use, so the two kinds of interactive
       card look and behave alike; a real <button> also gives Tab focus
       and Enter/Space for free, with no mouse-only handler. No
       aria-haspopup here - this navigates rather than opening a
       dialog. */
    const orderFilter = CARD_TO_ORDER_FILTER[stat.key];
    if (orderFilter) {
      const [ariaKey, ariaFallback] = FILTER_CARD_ARIA[stat.key];
      return (
        <button
          key={stat.key}
          type="button"
          className={`card ad-stat ad-stat--interactive ${extraClass}`}
          onClick={() => onNavigate("liveOrders", { ordersFilter: orderFilter })}
          aria-label={t(ariaKey, ariaFallback)}
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

    /* Still static: Active Orders. Live Orders has no "active" tab -
       its filters are All plus one per real status - and Active is the
       sum of Waiting Prep + Preparing + Ready. Sending it to "all"
       would show delivered and canceled orders too, which is not what
       the number counts, and inventing an active filter would be a new
       filtering system this phase is not for. Left alone deliberately. */
    return (
      <Card key={stat.key} className={`ad-stat ${extraClass}`}>
        <span className={`ad-stat__dot ad-stat__dot--${stat.tone}`} />
        <span className="ad-stat__value">{stat.value}</span>
        <span className="ad-stat__label">{label}</span>
      </Card>
    );
  }

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

      {/* ── KPI snapshot (Phase 75 §2) ────────────────────────────────────
          Moved above the operational controls. The dashboard previously
          opened with two full-width control cards, so the manager had to
          scroll past Busy Mode and Category Availability before seeing a
          single number. The four figures that answer "how is service going
          right now" come first. */}
      <div className="ad-kpis anim-rise">
        {KPI_CARDS.map((stat) => renderStatCard(stat, "ad-kpi"))}
      </div>

      {/* ── Operations (Phase 75 §5) ──────────────────────────────────────
          The two things a manager ACTS on, grouped under one heading so they
          read as controls rather than as more statistics. Both remain
          available to Admin and Cashier exactly as before; each card still
          decides internally which controls a given role gets. */}
      <div className="ad-section-bar anim-rise">
        <h2 className="ad-section-title">{t("admin.operations", "Operations")}</h2>
      </div>
      <div className="ad-ops anim-rise">
        <BusyModeCard
          restaurant={restaurant}
          session={session}
          onNotify={(message) => {
            setToastMessage(message);
            setToastVisible(true);
          }}
        />
        <CategoryVisibilityCard restaurant={restaurant} />
      </div>

      {/* ── Order status (Phase 75 §10) ───────────────────────────────────
          The per-status counts, kept but demoted: same data and the same
          Live-Orders shortcuts as before, now clearly secondary to the
          snapshot above so the page has one first-glance layer. */}
      <div className="ad-section-bar anim-rise">
        <h2 className="ad-section-title">{t("admin.orderStatus", "Order status")}</h2>
      </div>
      <div className="ad-stats ad-stats--secondary anim-rise">
        {STATUS_CARDS.map((stat) => renderStatCard(stat, ""))}
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
