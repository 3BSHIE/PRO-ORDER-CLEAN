import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, PackageSearch, Info } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import CallStaffButton   from "./components/CallStaffButton.jsx";
import OrderFeedback     from "./components/OrderFeedback.jsx";
import StatusRoute        from "./components/StatusRoute.jsx";
import OrderTimer         from "./components/OrderTimer.jsx";
import OrderDetailsPanel  from "./components/OrderDetailsPanel.jsx";
import { getCustomerSession } from "../../lib/customerSession.js";
import { getOrderById } from "../../lib/customerOrders.js";
import { orderBelongsToSession } from "../../lib/customerIdentity.js";
import { useMenuData } from "../../lib/useMenuData.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import RestaurantIdentity from "./components/RestaurantIdentity.jsx";
import { resolveRestaurantDisplayName } from "../../lib/restaurantName.js";
import CustomerFooter     from "./components/CustomerFooter.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";

/* Phase 88 §6 — one concise sentence for the real current status.
 *
 * These replace the previous wording, which was vaguer in the two places it
 * mattered most. "Your order is ready and will be served soon" left it open
 * whether the guest was meant to go and collect it; §6 is explicit that Ready
 * must say a waiter is bringing it, so it now does. "Sent to the restaurant"
 * became "received and sent to the kitchen", which is the fact the guest
 * actually wants confirmed.
 *
 * Canceled keeps its own copy but is NOT rendered as a sentence — the
 * canceled notice below states it once (§13, no duplicate cancellation
 * copy). */
const STATUS_MESSAGE = {
  received:  "Your order has been received and sent to the kitchen.",
  preparing: "Your order is being prepared now.",
  ready:     "Your order is ready. A waiter is on the way to your table.",
  delivered: "Your order has been delivered to your table.",
  canceled:  "This order was canceled. Please contact the staff if you need help.",
};

const STATUS_BADGE_TONE = {
  received:  "received",
  preparing: "preparing",
  ready:     "ready",
  delivered: "gold",
  canceled:  "canceled",
};

/* Maps each order status to its translation key for the longer tracking message
   (STATUS_MESSAGE above is the English fallback source). */
const TRACKING_MSG_KEY = {
  received:  "track.sentenceReceived",
  preparing: "track.sentencePreparing",
  ready:     "track.sentenceReady",
  delivered: "track.sentenceDelivered",
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
     • Phase 39 — order must BELONG to this session → else that same
       "Order not found" state, deliberately indistinguishable

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
  /* Phase 45 — live Settings drive the topbar identity's logo and name. The
     order's own frozen restaurantName stays the fallback, so an order placed
     before a rename still resolves to something sensible. */
  const { settings } = useSettingsData(restaurantSlug);
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

  /* ── Phase 39 — order ownership guard ──────────────────────────────────
     Until this phase the screen rendered whatever getOrderById returned, so
     a guest could edit the order id in the URL and read another table's
     order in full: customer name, items, total and payment state included.
     A valid session for *some* table was the only thing being checked.

     The order now has to belong to THIS session, using the same Phase 38
     helper that filters My Orders and gates the feedback form — so all three
     surfaces agree on ownership, and there is no second implementation to
     drift.

     Deriving it on every render rather than filtering once at load means the
     4s poll re-checks too.

     A missing order and someone else's order deliberately collapse into the
     same `null`, so both produce the identical "Order not found" state
     below. Distinguishing them would confirm to a probing guest that an id
     exists, which is exactly the leak this guard closes. */
  const visibleOrder = orderBelongsToSession(order, session) ? order : null;

  return (
    <>
      <Topbar
        left={
          <button type="button" className="cart-back-btn" onClick={onBackToMenu}>
            <ArrowLeft size={16} strokeWidth={2.2} /> {t("customer.menu", "Menu")}
          </button>
        }
        right={
          <RestaurantIdentity
            name={resolveRestaurantDisplayName(settings, order, restaurantSlug)}
            logoUrl={settings.logoUrl}
            variant="compact"
          />
        }
      />
      <main className="container">
        {visibleOrder ? (
          <TrackingView
            order={visibleOrder}
            restaurantSlug={restaurantSlug}
            table={table}
            session={session}
            onNotify={handleNotify}
          />
        ) : (
          <OrderNotFoundView onBackToMenu={onBackToMenu} />
        )}

        <CustomerFooter />
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
  const statusLabel = t(`status.${order.status}`, null) || order.status;
  const statusMsg = TRACKING_MSG_KEY[order.status]
    ? t(TRACKING_MSG_KEY[order.status], STATUS_MESSAGE[order.status])
    : t("orders.trackingFallbackMsg", "We're tracking your order.");

  return (
    /* Phase 88 §2 — a restrained entrance: opacity plus a few pixels of
       vertical motion, played once on mount. It replaces .anim-rise so the
       arrival from Confirmation feels continuous rather than like a second
       page load. No splash and no loader sit between the two screens; the
       order is already in hand when this renders. */
    <div className="track track--enter">
      {/* ── 1. compact restaurant / order context (§3) ──────────────────
          Everything identifying the order, in one block, once. The old
          screen spread the same four facts over four separate lines and
          then repeated them again inside the details card. */}
      <header className="track__context">
        <p className="track__rest">{order.restaurantName}</p>
        <p className="track__idline">
          <span>{t("customer.yourTable", "Table")} #{order.tableNumber}</span>
          <span className="track__sep" aria-hidden="true">·</span>
          {/* A bare Latin/numeric token inside Arabic copy, so it keeps its
              own direction exactly as prices and totals do (§17). */}
          <span className="track__order-id">{order.orderId}</span>
          <span className="track__sep" aria-hidden="true">·</span>
          <span className="track__who">{order.customerName}</span>
        </p>
        <Badge tone={STATUS_BADGE_TONE[order.status] || "neutral"} dot>
          {statusLabel}
        </Badge>
      </header>

      {isCanceled ? (
        /* Phase 74 §23, preserved wholesale by Phase 88 §13 — a warm-neutral
           notice with an information mark, not a red failure banner. The
           CANCELED pill above already carries the red semantic, so repeating
           it here in alarm colours would be double signalling, and a
           cancellation is frequently the restaurant's own action rather than
           a guest error. No status route and no timer for a canceled order:
           there is no journey left to draw and nothing left to count. */
        <div className="track__canceled" role="status">
          <span className="track__canceled-icon" aria-hidden="true">
            <Info size={20} strokeWidth={2} />
          </span>
          <span className="track__canceled-text">
            <span className="track__canceled-title">
              {t("orders.orderCanceledTitle", "Order canceled")}
            </span>
            <span className="track__canceled-help">
              {t("orders.canceledContactStaff", "Please contact staff if you need assistance.")}
            </span>
          </span>
        </div>
      ) : (
        <>
          {/* ── 2. the route (§4) ─────────────────────────────────────── */}
          <StatusRoute currentStatus={order.status} />

          {/* ── 3. one sentence for the real current status (§6) ───────
              role="status" so an advance arriving over the 4s poll is
              announced once, politely, rather than silently changing. */}
          <p className="track__sentence" role="status">{statusMsg}</p>

          {/* ── 4. the Main Timer (§7) ─────────────────────────────────
              Renders nothing at Ready/Delivered, and nothing for an order
              with no estimate. It decides that itself, from the order's
              real status — never from the clock. */}
          <OrderTimer order={order} />
        </>
      )}

      {/* ── 5. Call Staff (§14) ───────────────────────────────────────────
          Prominent and centered for EVERY status now, not only for a
          canceled order. §14 makes this deliberate: on a screen whose whole
          purpose is waiting, "fetch me a person" is the one action the guest
          may actually need, and it was previously a quiet inline pill unless
          something had already gone wrong. */}
      <div className="track__call-staff track__call-staff--prominent">
        <CallStaffButton
          restaurantSlug={restaurantSlug}
          tableId={table.id}
          tableNumber={table.tableNumber}
          customerName={session.customerName}
          variant="prominent"
          onNotify={onNotify}
        />
      </div>

      {/* ── Feedback (Phase 29, untouched) ───────────────────────────────
          Self-gating: renders only for a delivered order belonging to this
          session, and flips to read-only once submitted. */}
      <OrderFeedback order={order} session={session} />

      {/* ── 6. Order Details, secondary and collapsible (§15) ─────────── */}
      <OrderDetailsPanel
        order={order}
        renderLineItem={(line) => (
          <TrackingLineItem
            key={line.cartItemId}
            line={line}
            restaurantSlug={order.restaurantSlug}
          />
        )}
      >
        {order.statusHistory?.length > 0 && (
          <div className="odetails__history">
            <h4 className="odetails__history-title">
              {t("orders.orderUpdates", "Order updates")}
            </h4>
            <ul className="odetails__history-list">
              {order.statusHistory.map((entry, i) => (
                <li key={i} className="odetails__history-item">
                  <span className="odetails__history-dot" aria-hidden="true" />
                  <span className="odetails__history-label">
                    {STATUS_HISTORY_LABEL_KEY[entry.status]
                      ? t(STATUS_HISTORY_LABEL_KEY[entry.status], entry.label || entry.status)
                      : entry.label || entry.status}
                  </span>
                  <span className="odetails__history-time">{formatTimestamp(entry.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </OrderDetailsPanel>
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
