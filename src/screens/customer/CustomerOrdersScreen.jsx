import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, ClipboardList, Check } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import { resolveCustomerAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import PrepTimeEstimate   from "./components/PrepTimeEstimate.jsx";
import StarRating         from "../../components/ui/StarRating.jsx";
import CanceledPaymentNotice from "./components/CanceledPaymentNotice.jsx";
import { getCustomerSession } from "../../lib/customerSession.js";
import { getIdentityKey, orderBelongsToSession } from "../../lib/customerIdentity.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import RestaurantIdentity from "./components/RestaurantIdentity.jsx";
import CustomerFooter     from "./components/CustomerFooter.jsx";
import { useOrderFeedback } from "../../lib/useFeedback.js";
import { getCustomerOrders } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { formatItemCount } from "../../i18n/counts.js";
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
  /* Phase 93.1 — the session is read FIRST and handed to the resolver, so an
     already-established guest is recognised before the URL's token is judged.
     resolveCustomerAccess falls back to resolveTableAccess for everyone
     else, so first entry, a bad token and an inactive table all behave
     exactly as before. */
  const session = getCustomerSession();
  const result  = resolveCustomerAccess(restaurantSlug, qrToken, session);
  const { t } = useLanguage();

  /* Phase 93.1 — identity by tableId, not by token.
     The old comparison (session.qrToken === qrToken) made the entry
     credential the permanent key to the journey: regenerate the QR and the
     guest at the table stopped matching their own session. tableId is stable
     across regeneration and is exactly as strict — a session for one table
     still cannot satisfy another table's URL, because `result.table` is
     whichever table the URL actually resolved to.

     Sessions created before this phase may predate tableId; those fall back
     to the original token comparison rather than being locked out (§13). */
  const sessionMatchesTable = session
    ? session.tableId
      ? session.tableId === result.table?.id
      : session.qrToken === qrToken
    : false;

  const hasValidSession =
    result.ok &&
    session &&
    sessionMatchesTable &&
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
            /* Phase 90 §3 — resolveCustomerAccess carries the restaurant on the
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

  return (
    <OrdersShell
      restaurant={result.restaurant}
      table={result.table}
      session={session}
      onBackToMenu={onBackToMenu}
      onTrackOrder={onTrackOrder}
    />
  );
}

/* ── Orders shell — owns filtering, tabs, and the live-refreshing read ──── */
function OrdersShell({ restaurant, table, session, onBackToMenu, onTrackOrder }) {
  /* Phase 45 — for the restaurant's logo in the compact topbar identity. */
  const { settings } = useSettingsData(restaurant.slug);
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
     qrToken + customer identity must all match, so "My Orders" never leaks
     other guests' orders even though everything lives in one localStorage
     bucket.

     Phase 38 — the name half of that comparison now goes through the shared
     ownership helper, so a guest who lost their session and re-entered "omar"
     instead of "Omar" still finds their own orders. The table context is
     unchanged and still mandatory. The same helper backs the feedback
     ownership gate, so the two can never disagree.

     Destructured into primitives because getCustomerSession() hands back a
     fresh object every render — memoizing on the object itself would recompute
     on every single render. */
  const { restaurantSlug: sSlug, qrToken: sToken, tableNumber: sTable } = session;
  const sKey = getIdentityKey(session);

  const myOrders = useMemo(
    () =>
      allOrders.filter((o) =>
        orderBelongsToSession(o, {
          restaurantSlug: sSlug,
          qrToken: sToken,
          tableNumber: sTable,
          customerIdentityKey: sKey,
        })
      ),
    [allOrders, sSlug, sToken, sTable, sKey]
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
      {/* Phase 45 — restaurant identity replaces the PRO·ORDER mark, and the
          page's own restaurant eyebrow went with it so the name appears once
          per viewport rather than twice. */}
      <Topbar
        left={
          <button type="button" className="cart-back-btn" onClick={onBackToMenu}>
            <ArrowLeft size={16} strokeWidth={2.2} /> {t("customer.menu", "Menu")}
          </button>
        }
        right={
          <RestaurantIdentity
            /* Settings override first, matching every other customer surface —
               this screen was the one place still showing the raw seed name. */
            name={settings.name.trim() || restaurant.name}
            logoUrl={settings.logoUrl}
            variant="compact"
          />
        }
      />
      <main className="container">
        <header className="orders-header anim-rise">
          <p className="orders-header__table">{t("customer.yourTable", "Table")} #{table.tableNumber}</p>
          <h1 className="orders-header__greeting">
            {t("customer.greeting", "Hi,")} <i>{session.customerName}</i>
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

        <CustomerFooter />
      </main>
    </>
  );
}

/* ── Single order summary card ───────────────────────────────────────────── */
function OrderCard({ order, onTrackOrder }) {
  const { t } = useLanguage();
  const isCanceled = order.status === "canceled";
  const itemCount = order.items.reduce((sum, line) => sum + (line.quantity || 0), 0);

  /* Phase 89 §4 — the card's weight follows where the order actually is.
     A live order and a three-hour-old canceled one used to sit at identical
     visual strength, so a glance down the list told the guest nothing about
     which one still mattered. */
  const phase =
    isCanceled ? "canceled" : order.status === "delivered" ? "done" : "active";

  return (
    /* Two classes: the PHASE drives the card's weight, the STATUS supplies
       the --card-tone the active accent edge reads. Keeping them separate
       means the tone table stays next to the semantic colours in CSS rather
       than being duplicated per phase. */
    <Card className={`order-card order-card--${phase} order-card--${order.status}`}>
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

      {/* Phase 89 §3 — the facts a guest scans for, and only those: how many
          items, which table, and (for a canceled order) where the money
          stands.

          The payment METHOD and the "Pending at table" status came out. §3
          asks that this card not become a second Order Details, and those two
          are exactly that — they never change what the guest does next, and
          they were pushing the table number out of a line that had already
          grown to four segments. Both are one tap away on the order itself.

          The canceled notice stays: "was I charged?" is the one payment
          question that genuinely belongs on a summary card (Phase 36). */}
      <div className="order-card__meta">
        <span>{formatItemCount(t, itemCount)}</span>
        <span className="order-card__dot">&middot;</span>
        <span>
          {t("customer.yourTable", "Table")}{" "}
          <span className="order-card__table-num">#{order.tableNumber}</span>
        </span>
        {isCanceled && (
          <>
            <span className="order-card__dot">&middot;</span>
            <CanceledPaymentNotice order={order} variant="inline" />
          </>
        )}
      </div>

      {/* Phase 26 — compact variant; self-hides for finished orders and for
          orders placed before this phase, so the list stays uncluttered. */}
      <PrepTimeEstimate order={order} variant="inline" />

      {/* Phase 89 §5/§6 — the read-only rating readout that used to sit here
          moved INTO the action row as the "Rated" state. Two places on one
          card reporting the same rating was duplication, and §6 wants a
          single predictable row at the bottom. */}

      {/* Phase 74 §29–§32 — ONE action row per card, and the action matches
          where the order actually is in its life:

            active (received/preparing/ready)  Track order, primary
            delivered                          Rate your order, primary —
                                               rating is the valuable act now,
                                               and Track pointed at the same
                                               screen, so it is not repeated
            delivered + already rated          View order, secondary
            canceled                           View details, secondary — the
                                               tracking screen carries the
                                               cancellation notice, the payment
                                               position and the contextual Call
                                               Staff, so it has real value; it
                                               just must not look like a live
                                               order's gold CTA (§31)

          Every branch goes to the same destination; only its weight changes. */}
      <div className="order-card__bottom">
        <span className={`order-card__total ${isCanceled ? "order-card__total--void" : ""}`}>
          {fmtPrice(order.total)}
        </span>
        <OrderCardAction order={order} onTrackOrder={onTrackOrder} />
      </div>
    </Card>
  );
}

/* ── The single lifecycle-aware action for a My Orders card (§5, §6) ──────
   One row, one action, and the action is whatever is actually useful now:

     received / preparing / ready   Track order, PRIMARY — the order is live
                                    and where it is is the only open question
     delivered, not yet rated       Rate your order, PRIMARY — tracking has
                                    nothing left to say, and the rating is the
                                    one thing still worth the guest's time
     delivered, already rated       "Rated" — a state, not a button. Nothing
                                    is asked of the guest, and v1 does not
                                    allow editing a submitted rating, so
                                    offering something pressable here would
                                    promise an action that does not exist
     canceled                       View details, SECONDARY — the order screen
                                    carries the cancellation notice and the
                                    payment position, so it has real value, but
                                    a canceled order must not look like it is
                                    waiting for the guest to do something (§5)
   ── */
function OrderCardAction({ order, onTrackOrder }) {
  const { t } = useLanguage();
  const { feedback } = useOrderFeedback(order.restaurantSlug, order.orderId);
  const go = () => onTrackOrder(order.orderId);

  if (order.status === "canceled") {
    return (
      <Button size="sm" variant="outline" onClick={go}>
        {t("orders.viewDetails", "View details")}
      </Button>
    );
  }

  if (order.status === "delivered") {
    if (feedback) {
      /* Calm, complete, and inert. The stars carry the actual rating so the
         guest can see WHAT they said without opening anything, and the check
         says it landed. Not a button: there is nowhere for it to go. */
      return (
        <span className="order-card__rated">
          <Check size={13} strokeWidth={2.6} aria-hidden="true" />
          <span className="order-card__rated-label">{t("feedback.rated", "Rated")}</span>
          <StarRating
            readOnly
            size={12}
            name={`oc-rated-${order.orderId}`}
            label={t("feedback.foodQuality", "Food Quality")}
            value={feedback.foodRating}
          />
        </span>
      );
    }
    return (
      <Button size="sm" onClick={go}>
        {t("feedback.rateYourOrder", "Rate your order")}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={go}>
      {t("orders.trackOrder", "Track order")}
    </Button>
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
