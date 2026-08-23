import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LogOut, Clock, Timer, AlertTriangle } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import { getCustomerOrders, updateCustomerOrderStatus } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import { useKitchenAlertSettings } from "../../lib/useKitchenAlertSettings.js";
import { playAlertSound } from "../../lib/kitchenAlertSound.js";

/* Board columns, in display order. Each maps to exactly one order.status. */
const BOARD_COLUMNS = [
  { status: "received",  label: "Received",  tone: "received"  },
  { status: "preparing", label: "Preparing", tone: "preparing" },
  { status: "ready",     label: "Ready",      tone: "ready"     },
  { status: "canceled",  label: "Canceled",  tone: "canceled"  },
];

const ACTIVE_STATUSES = ["received", "preparing", "ready"];

/* Valid forward transitions this phase allows, and the statusHistory label
   + toast message that go with each. Anything not listed here (ready has no
   entry, canceled has no entry) has no kitchen-initiated action at all.

   NOTE: historyLabel below is written verbatim into order.statusHistory and
   later displayed on the *customer* tracking screen — it stays plain English
   data regardless of the kitchen UI's current language, exactly like
   order.paymentMethod.label. Only the button/toast text visible here on the
   kitchen board is translated live (via the *_KEY maps below), not this
   frozen historyLabel string. */
const TRANSITIONS = {
  received:  { next: "preparing", historyLabel: "Kitchen started preparing", toast: "Order moved to Preparing", buttonLabel: "Start Preparing" },
  preparing: { next: "ready",     historyLabel: "Order marked ready",        toast: "Order marked Ready",       buttonLabel: "Mark Ready" },
};

/* Translation keys for the live kitchen-facing button/toast text, keyed by
   the order's CURRENT status (not its next status). */
const BUTTON_LABEL_KEY = {
  received:  "kitchen.startPreparing",
  preparing: "kitchen.markReady",
};
const TOAST_KEY = {
  received:  "kitchen.orderMovedToPreparingToast",
  preparing: "kitchen.orderMarkedReadyToast",
};
/* Translation keys for each column's empty-state message. */
const EMPTY_MSG_KEY = {
  received:  "kitchen.noReceivedOrders",
  preparing: "kitchen.noPreparingOrders",
  ready:     "kitchen.noReadyOrders",
  canceled:  "kitchen.noCanceledOrders",
};
/* order.paymentMethod.label is captured verbatim in English at order-creation
   time (same as every other screen that displays it), so the kitchen board
   re-resolves a live translation from the stable id instead, with that
   frozen label as the fallback — identical pattern to the customer screens. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};

/* ═══════════════════════════════════════════════════════════════════════════
   KitchenBoardScreen — Phase 15

   What's new since Phase 14: each card in the Received/Preparing columns now
   has a single forward-only action button (Start Preparing / Mark Ready).
   Clicking it calls updateCustomerOrderStatus() — the same localStorage
   utility customer tracking/My Orders already read from — so those screens
   pick up the change automatically on their own next focus/interval refresh.

   Invalid transitions are structurally impossible: TRANSITIONS only defines
   received→preparing and preparing→ready, so "ready" and "canceled" orders
   render no button at all (ready shows a calm waiting message; canceled
   shows the existing red state). A per-order `updatingOrderId` guard also
   disables the button the instant it's clicked, preventing a double-click
   from firing two updates (updateCustomerOrderStatus itself is also
   idempotent — updating to the status the order is already in is a safe
   no-op, never appending a duplicate statusHistory entry).

   NOT built yet: audio alerts, admin dashboard, backend, station routing,
   smart sorting/aggregation, kitchen-initiated "delivered" status.
   ═══════════════════════════════════════════════════════════════════════ */

export default function KitchenBoardScreen({ restaurant, session, onSignOut, onHome }) {
  const [allOrders, setAllOrders] = useState(() => getCustomerOrders());
  /* Phase 27 — ONE board-level clock driving every card's prep timer. A
     per-card interval would mean N timers fighting for the main thread on a
     busy board; this is a single 1s tick that cards read as a plain prop. */
  const [now, setNow] = useState(() => Date.now());
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const { t } = useLanguage();
  const { settings: alertSettings } = useKitchenAlertSettings(restaurant.slug);

  const refresh = useCallback(() => {
    setAllOrders(getCustomerOrders());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    const refreshInterval = setInterval(refresh, 4000);
    /* Separate, faster tick so the prep timers advance every second between
       full data refreshes, without hitting localStorage that often. Note
       `now` is deliberately NOT a dependency of the grouping useMemo below,
       so a tick re-renders cards but never re-filters/re-sorts the board. */
    const tickInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(refreshInterval);
      clearInterval(tickInterval);
    };
  }, [refresh]);

  const restaurantOrders = useMemo(
    () => allOrders.filter((o) => o.restaurantSlug === restaurant.slug),
    [allOrders, restaurant.slug]
  );
  const activeCount = restaurantOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;

  /* Group + sort once per render instead of once per board column — each
     column previously re-filtered and re-sorted the same restaurantOrders
     array from scratch on every render. */
  const ordersByStatus = useMemo(() => {
    const groups = {};
    for (const col of BOARD_COLUMNS) {
      groups[col.status] = restaurantOrders
        .filter((o) => o.status === col.status)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // oldest first
    }
    return groups;
  }, [restaurantOrders]);

  /* ── Phase 27: new-order audio alert ───────────────────────────────────
     The rule is "alert once, only for an order that genuinely arrived while
     this board was already open". Three pieces enforce that:

       seenReceivedRef  — every order id this board has ever observed in
                          "received". An id in here can never alert again, so
                          a 4s poll, a tab refocus, or a re-render replays
                          nothing.
       hasSeededRef     — the FIRST pass after mount only records what was
                          already on the board and returns without playing.
                          That's what stops the burst of alerts when a
                          kitchen opens the screen to a backlog of orders.
       status filter    — only "received" is ever considered, so
                          preparing→ready and any admin-side delivered/
                          canceled transition are structurally incapable of
                          making a sound.

     Settings are read through a ref so that changing volume/sound type
     doesn't re-run this effect (which would re-evaluate arrivals). */
  const seenReceivedRef = useRef(new Set());
  const hasSeededRef = useRef(false);
  const alertSettingsRef = useRef(alertSettings);

  useEffect(() => {
    alertSettingsRef.current = alertSettings;
  }, [alertSettings]);

  useEffect(() => {
    const receivedIds = restaurantOrders
      .filter((o) => o.status === "received")
      .map((o) => o.orderId);

    if (!hasSeededRef.current) {
      // First look at the board: remember the backlog silently.
      receivedIds.forEach((id) => seenReceivedRef.current.add(id));
      hasSeededRef.current = true;
      return;
    }

    const arrivedIds = receivedIds.filter((id) => !seenReceivedRef.current.has(id));
    if (arrivedIds.length === 0) return;

    // Mark as seen BEFORE playing, so a throw could never cause a replay.
    arrivedIds.forEach((id) => seenReceivedRef.current.add(id));

    const { soundEnabled, soundType, volume } = alertSettingsRef.current;
    if (!soundEnabled) return;

    /* One alert per detection cycle, not one per order: if two tickets land
       in the same 4s window, overlapping tones would just smear into noise.
       The visual board still shows both immediately. */
    playAlertSound(soundType, volume);
  }, [restaurantOrders]);

  /* Advance a single order to its next valid status. Guards against
     double-clicks by disabling the button for this order until the update
     (synchronous here, but written defensively) completes. */
  function handleAdvance(order) {
    const transition = TRANSITIONS[order.status];
    if (!transition || updatingOrderId === order.orderId) return;

    setUpdatingOrderId(order.orderId);

    const updated = updateCustomerOrderStatus(order.orderId, transition.next, transition.historyLabel);

    if (updated) {
      // Optimistic local update so the card moves columns immediately,
      // without waiting for the next 4s poll.
      setAllOrders((prev) => prev.map((o) => (o.orderId === order.orderId ? updated : o)));
      setToastMessage(t(TOAST_KEY[order.status], transition.toast));
      setToastVisible(true);
    }

    setUpdatingOrderId(null);
  }

  return (
    <>
      <Topbar
        left={<Logo variant="icon" size="nav" />}
        right={
          <div className="kb-topbar-right">
            <span className="kb-topbar-rest">{restaurant.name}</span>
            <Button variant="outline" size="sm" icon={LogOut} onClick={onSignOut}>
              {t("common.signOut", "Sign out")}
            </Button>
          </div>
        }
      />
      <main className="container container--kb">
        <header className="kb-header anim-rise">
          <div>
            <h1 className="kb-header__title">{t("kitchen.kitchenBoard", "Kitchen board")}</h1>
            <p className="kb-header__greeting">
              {t("kitchen.signedInAs", "Signed in as")} <i>{session.name}</i>
            </p>
          </div>
          <Badge tone="gold">
            {activeCount} {t(activeCount !== 1 ? "kitchen.activeOrders" : "kitchen.activeOrder", activeCount !== 1 ? "active orders" : "active order")}
          </Badge>
        </header>

        <div className="kb-columns">
          {BOARD_COLUMNS.map((col) => {
            const columnOrders = ordersByStatus[col.status] || [];

            return (
              <div key={col.status} className="kb-column">
                <div className="kb-column__header">
                  <span className={`kb-column__dot kb-column__dot--${col.tone}`} />
                  <h2 className="kb-column__title">{t(`status.${col.status}`, col.label)}</h2>
                  <span className="kb-column__count">{columnOrders.length}</span>
                </div>

                <div className="kb-column__body">
                  {columnOrders.length === 0 ? (
                    <p className="kb-column__empty">{t(EMPTY_MSG_KEY[col.status], `No ${col.label.toLowerCase()} orders`)}</p>
                  ) : (
                    columnOrders.map((order) => (
                      <KitchenOrderCard
                        key={order.orderId}
                        order={order}
                        now={now}
                        isUpdating={updatingOrderId === order.orderId}
                        onAdvance={() => handleAdvance(order)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </>
  );
}

/* ── Single kitchen order card ───────────────────────────────────────────── */
function KitchenOrderCard({ order, now, isUpdating, onAdvance }) {
  const transition = TRANSITIONS[order.status];
  const isCanceled = order.status === "canceled";
  const isReady    = order.status === "ready";
  const { t } = useLanguage();
  const paymentMethodLabel = t(
    METHOD_LABEL_KEY[order.paymentMethod.id],
    order.paymentMethod.label
  );

  const timer = resolveTimer(order, now);
  const isDelayed = isOrderDelayed(order, timer);

  return (
    <Card className={`kb-card ${isDelayed ? "kb-card--delayed" : ""}`}>
      <div className="kb-card__top">
        <div>
          <p className="kb-card__id">{order.orderId}</p>
          <p className="kb-card__meta">
            {t("customer.yourTable", "Table")} #{order.tableNumber} &middot; {order.customerName}
          </p>
        </div>

        {/* Prep timer — replaces the old coarse "2m ago" label with the live
            mm:ss elapsed time this phase calls for. Same slot, same styling
            language; it freezes for finished/canceled tickets. */}
        {timer && (
          <div className="kb-card__timer-wrap">
            <span
              className={`kb-timer ${timer.running ? "" : "kb-timer--final"} ${
                isDelayed ? "kb-timer--delayed" : ""
              }`}
            >
              <Timer size={12} strokeWidth={2.3} />
              {formatTimer(timer.elapsedMs)}
            </span>
            {isDelayed && (
              <span className="kb-delayed">
                <AlertTriangle size={11} strokeWidth={2.4} />
                {t("kitchen.delayed", "Delayed")}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="kb-card__items">
        {order.items.map((line) => (
          <KitchenLineItem key={line.cartItemId} line={line} />
        ))}
      </div>

      <div className="kb-card__bottom">
        <span className="kb-card__payment">{paymentMethodLabel}</span>
        <span className="kb-card__total">{fmtPrice(order.total)}</span>
      </div>

      {/* ── Action area — the only part that changed this phase ──────────── */}
      {transition && (
        <div className="kb-card__action">
          <Button
            full
            size="md"
            variant={order.status === "received" ? "primary" : "ready"}
            disabled={isUpdating}
            onClick={onAdvance}
          >
            {t(BUTTON_LABEL_KEY[order.status], transition.buttonLabel)}
          </Button>
        </div>
      )}

      {isReady && (
        <div className="kb-card__waiting">
          <Clock size={14} strokeWidth={2} />
          <span>{t("kitchen.waitingForPickup", "Waiting for pickup / service")}</span>
        </div>
      )}

      {isCanceled && (
        <div className="kb-card__canceled-note">{t("orders.canceledBanner", "This order was canceled.")}</div>
      )}
    </Card>
  );
}

/* ── One item line within a kitchen card ─────────────────────────────────── */
function KitchenLineItem({ line }) {
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
    <div className="kb-item">
      <p className="kb-item__head">
        <span className="kb-item__qty">{line.quantity}×</span>
        <span className="kb-item__name">{line.name}</span>
      </p>
      {(hasRemovals || hasChoices || hasAddOns || hasNotes) && (
        <div className="kb-item__custom">
          {hasRemovals && (
            <p className="kb-item__custom-row">
              <span className="kb-item__custom-label">{t("customer.noPrefix", "No")}:</span>{" "}
              {line.selectedRemovals.join(", ")}
            </p>
          )}
          {Object.entries(choicesByGroup).map(([groupName, options]) => (
            <p className="kb-item__custom-row" key={groupName}>
              <span className="kb-item__custom-label">{groupName}:</span>{" "}
              {options.join(", ")}
            </p>
          ))}
          {hasAddOns && (
            <p className="kb-item__custom-row">
              <span className="kb-item__custom-label">{t("common.extrasLabel", "Extras")}:</span>{" "}
              {line.selectedPaidAddOns.map((a) => a.name).join(", ")}
            </p>
          )}
          {hasNotes && (
            <p className="kb-item__custom-row kb-item__custom-row--note">
              <span className="kb-item__custom-label">{t("common.noteLabel", "Note")}:</span> {line.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/* When did this order reach the given status? Read from the statusHistory
   the order already carries — nothing is written to order data to support
   timers, which the phase explicitly forbids. Falls back to updatedAt for
   any order whose history predates a status (defensive only). */
function statusReachedAt(order, status) {
  const entry = order.statusHistory?.find((e) => e.status === status);
  return entry?.at || order.updatedAt || null;
}

/**
 * How long this ticket has been cooking, and whether that number is still
 * moving. Derived purely from timestamps + the board clock — no stored
 * timer state anywhere.
 *
 *   received / preparing → runs live against `now`
 *   ready               → frozen at the moment it was marked ready, i.e. the
 *                         total time the kitchen actually took
 *   canceled            → frozen at cancellation; nothing keeps counting for
 *                         a ticket nobody is cooking
 *
 * @returns {{running: boolean, elapsedMs: number}|null}
 */
function resolveTimer(order, now) {
  const startMs = new Date(order.createdAt).getTime();
  if (Number.isNaN(startMs)) return null;

  const isFinished = order.status === "ready" || order.status === "canceled";
  let endMs = now;

  if (isFinished) {
    const stoppedAt = statusReachedAt(order, order.status);
    const stoppedMs = stoppedAt ? new Date(stoppedAt).getTime() : NaN;
    endMs = Number.isNaN(stoppedMs) ? now : stoppedMs;
  }

  return { running: !isFinished, elapsedMs: Math.max(0, endMs - startMs) };
}

/**
 * Delayed = still being worked on, and past the estimate the guest was given
 * at checkout (Phase 26's frozen order.estimatedPrepMinutes).
 *
 * Only ACTIVE tickets are flagged: "Delayed" on a card is a call to action,
 * and a ready or canceled ticket has no action left. Orders created before
 * Phase 26 carry no estimate, so they simply show a plain timer with no
 * comparison — exactly as the phase requires.
 */
function isOrderDelayed(order, timer) {
  if (!timer || !timer.running) return false;
  const estimate = order.estimatedPrepMinutes;
  if (!Number.isInteger(estimate)) return false;
  return timer.elapsedMs > estimate * 60000;
}

/** mm:ss, widening to h:mm:ss only once an hour has passed. */
function formatTimer(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
