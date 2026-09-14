import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Lock, Clock, Timer, AlertTriangle, Ban, ChefHat, History, Check } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import BrandMarkStatic from "../../components/brand/BrandMarkStatic.jsx";
import RestaurantIdentity from "../customer/components/RestaurantIdentity.jsx";
import Button  from "../../components/ui/Button.jsx";
import Card    from "../../components/ui/Card.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { getCustomerOrders, updateCustomerOrderStatus } from "../../lib/customerOrders.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { useKitchenAlertSettings } from "../../lib/useKitchenAlertSettings.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { playAlertSound } from "../../lib/alertSound.js";
import {
  getKitchenCancellations,
  recordKitchenCancellation,
  acknowledgeKitchenCancellation,
  KITCHEN_RELEVANT_STATUSES,
  KITCHEN_CANCELLATION_CHANGE_EVENT,
} from "../../lib/kitchenCancellations.js";

/* ── The board ───────────────────────────────────────────────────────────
   Exactly three operational states. Phase 96 §1 removed the fourth column:
   Canceled is not a place work sits, it is an event that interrupts work, and
   it is handled by the alert panel instead. Delivered never belonged here —
   it is the floor's job, not the kitchen's. */
const BOARD_COLUMNS = [
  { status: "received",  label: "Received",  tone: "received"  },
  { status: "preparing", label: "Preparing", tone: "preparing" },
  { status: "ready",     label: "Ready",     tone: "ready"     },
];

const ACTIVE_STATUSES = BOARD_COLUMNS.map((c) => c.status);

/* Valid forward transitions. Anything not listed has no kitchen-initiated
   action at all — which is what makes Ready an end state here (§11).

   historyLabel is written verbatim into order.statusHistory and later shown
   on the CUSTOMER tracking screen, so it stays plain English data regardless
   of the kitchen UI's language, exactly like order.paymentMethod.label. Only
   the button/toast text is translated live. */
const TRANSITIONS = {
  received:  { next: "preparing", historyLabel: "Kitchen started preparing", toast: "Order moved to Preparing", buttonLabel: "Start Preparing" },
  preparing: { next: "ready",     historyLabel: "Order marked ready",        toast: "Order marked Ready",       buttonLabel: "Mark Ready" },
};

const BUTTON_LABEL_KEY = {
  received:  "kitchen.startPreparing",
  preparing: "kitchen.markReady",
};
const TOAST_KEY = {
  received:  "kitchen.orderMovedToPreparingToast",
  preparing: "kitchen.orderMarkedReadyToast",
};
const EMPTY_MSG_KEY = {
  received:  "kitchen.noReceivedOrders",
  preparing: "kitchen.noPreparingOrders",
  ready:     "kitchen.noReadyOrders",
};

/* Portrait on a handheld gets tabs; everything else — landscape phone,
   landscape tablet, laptop, desktop — gets the three-column board.

   §22 states this as a GLOBAL rule, and the reason it is expressed as
   orientation rather than device is that the same iPad is both: turned one
   way it is a phone-shaped surface, turned the other it is a small desktop.
   The 1023px ceiling keeps a genuinely narrow desktop window on columns,
   since a mouse user resizing a window has not changed device. */
const PORTRAIT_QUERY = "(orientation: portrait) and (max-width: 1023px)";

function useCompactPortrait() {
  const read = () => {
    try {
      return window.matchMedia(PORTRAIT_QUERY).matches;
    } catch {
      return false;
    }
  };
  /* The value is READ FRESH on every render rather than mirrored into state.
     Events are still subscribed below so a rotation repaints instantly, but
     they are an optimisation, not the source of truth: some embedded and
     emulated browsers resize the viewport without emitting resize or
     matchMedia change at all, and a board left in the wrong composition is a
     bad failure — it either hides two thirds of the work behind tabs on a
     wide screen, or squeezes three columns onto a phone. The board already
     re-renders on its 1s clock, so even with no event whatsoever the layout
     self-corrects within a second. */
  const [, forceRender] = useState(0);

  useEffect(() => {
    /* Re-read rather than trusting the event payload, and listen on three
       signals rather than one. A tablet being turned fires orientationchange;
       a window being dragged fires resize; matchMedia's own change event
       covers the rest. Some embedded/emulated browsers deliver only a subset,
       and a board stuck in the wrong composition is a bad failure — it either
       hides two thirds of the work or squeezes three columns onto a phone. */
    const sync = () => forceRender((n) => n + 1);

    let mq;
    try {
      mq = window.matchMedia(PORTRAIT_QUERY);
      mq.addEventListener("change", sync);
    } catch {
      mq = null;
    }
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      if (mq) mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return read();
}

/* ═══════════════════════════════════════════════════════════════════════════
   KitchenBoardScreen — Phase 96 (Unit 14)

   A live preparation board and nothing else: no money, no payment state, no
   customer contact, no management links. Everything on a ticket is something
   a cook acts on.

   The board is derived entirely from the shared order records. It stores no
   status of its own — the single exception is the cancellation ledger, which
   exists because a cancelled order stops being visible anywhere in Kitchen
   the moment it is cancelled, and somebody still has to be told.
   ═══════════════════════════════════════════════════════════════════════ */

export default function KitchenBoardScreen({ restaurant, session, onSignOut }) {
  const [allOrders, setAllOrders] = useState(() => getCustomerOrders());
  /* ONE board-level clock driving every card's timer. A per-card interval
     would mean N timers fighting for the main thread on a busy board; this is
     a single 1s tick that cards read as a plain prop. */
  const [now, setNow] = useState(() => Date.now());
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const { t } = useLanguage();
  const { settings: alertSettings } = useKitchenAlertSettings(restaurant.slug);
  const { settings: restaurantSettings } = useSettingsData(restaurant.slug);
  const isCompactPortrait = useCompactPortrait();
  const [activeTab, setActiveTab] = useState("received");

  const timeZone = restaurantSettings.timeZone;

  const refresh = useCallback(() => {
    setAllOrders(getCustomerOrders());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    const refreshInterval = setInterval(refresh, 4000);
    /* Separate, faster tick so timers advance every second between full data
       refreshes, without hitting localStorage that often. `now` is
       deliberately NOT a dependency of the grouping useMemo below, so a tick
       re-renders cards but never re-filters or re-sorts the board. */
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

  /* ── Cancellation ledger ───────────────────────────────────────────────
     Kept in component state and refreshed from its own change event, so an
     acknowledgment updates the panel immediately rather than on the next
     4s poll. */
  const [cancellations, setCancellations] = useState(() =>
    getKitchenCancellations(restaurant.slug, timeZone)
  );
  const reloadCancellations = useCallback(() => {
    setCancellations(getKitchenCancellations(restaurant.slug, timeZone));
  }, [restaurant.slug, timeZone]);

  useEffect(() => {
    reloadCancellations();
    window.addEventListener(KITCHEN_CANCELLATION_CHANGE_EVENT, reloadCancellations);
    return () => window.removeEventListener(KITCHEN_CANCELLATION_CHANGE_EVENT, reloadCancellations);
  }, [reloadCancellations]);

  const pendingCancellations = useMemo(
    () => cancellations.filter((c) => !c.acknowledgedAt),
    [cancellations]
  );
  const acknowledgedCancellations = useMemo(
    () => cancellations.filter((c) => c.acknowledgedAt),
    [cancellations]
  );

  /* Group + sort once per render rather than once per column.
     FIFO everywhere (§2): the oldest ticket in a state is the one that has
     been waiting longest, and that is the only ordering a kitchen should
     have to reason about. Delay styling shouts; it never reorders. */
  const ordersByStatus = useMemo(() => {
    const groups = {};
    for (const col of BOARD_COLUMNS) {
      groups[col.status] = restaurantOrders
        .filter((o) => o.status === col.status)
        .sort((a, b) => statusSortTime(a, col.status) - statusSortTime(b, col.status));
    }
    return groups;
  }, [restaurantOrders]);

  const activeCount = ACTIVE_STATUSES.reduce(
    (sum, status) => sum + (ordersByStatus[status]?.length || 0),
    0
  );

  /* ── Audio ─────────────────────────────────────────────────────────────
     Settings are read through a ref so changing the volume cannot re-run
     detection and re-evaluate arrivals. */
  const alertSettingsRef = useRef(alertSettings);
  useEffect(() => {
    alertSettingsRef.current = alertSettings;
  }, [alertSettings]);

  function playPurpose(soundKey) {
    const s = alertSettingsRef.current;
    if (!s.soundEnabled) return;
    playAlertSound(s[soundKey], s.volume);
  }

  /* ── New-order alert (§13) ─────────────────────────────────────────────
     "Alert once, only for an order that genuinely arrived while this board
     was already open."

       seenReceivedRef  every order id ever observed in "received". An id in
                        here can never alert again, so a 4s poll, a refocus,
                        a language switch or a re-render replays nothing.
       hasSeededRef     the FIRST pass after mount only records what was
                        already waiting and returns silently — which is what
                        stops a burst of alerts when a kitchen opens to a
                        backlog.
       status filter    only "received" is considered, so preparing→ready and
                        any admin-side transition is structurally incapable
                        of making a sound. */
  const seenReceivedRef = useRef(new Set());
  const hasSeededRef = useRef(false);

  useEffect(() => {
    const receivedIds = restaurantOrders
      .filter((o) => o.status === "received")
      .map((o) => o.orderId);

    if (!hasSeededRef.current) {
      receivedIds.forEach((id) => seenReceivedRef.current.add(id));
      hasSeededRef.current = true;
      return;
    }

    const arrived = receivedIds.filter((id) => !seenReceivedRef.current.has(id));
    if (arrived.length === 0) return;

    // Mark as seen BEFORE playing, so a throw could never cause a replay.
    arrived.forEach((id) => seenReceivedRef.current.add(id));

    /* One alert per detection cycle, not one per order: two tickets landing
       in the same 4s window would smear into noise. The board still shows
       both immediately. */
    playPurpose("soundType");
  }, [restaurantOrders]);

  /* ── External cancellation detection (§15/§16/§44) ─────────────────────
     Derived from each order's OWN history rather than from transitions this
     board happened to witness. That is the whole point: a cancellation that
     arrives while the screen is locked, or while nobody is looking, must
     still produce an alert. recordKitchenCancellation is idempotent by
     orderId, so re-scanning every poll creates each record exactly once.

     Sound is suppressed on the first pass after mount, for the same reason
     the new-order alert seeds silently: a refresh must not replay a backlog
     (§16). The alert itself is still created, so nothing is lost — it is the
     noise that is skipped, never the information. */
  const cancelSeededRef = useRef(false);

  useEffect(() => {
    const canceled = restaurantOrders.filter((o) => o.status === "canceled");
    let created = 0;

    for (const order of canceled) {
      const priorStatus = priorKitchenStatus(order);
      /* Only a ticket the kitchen still had work on. One cancelled after it
         was already Ready, or never cooked, raises nothing. */
      if (!KITCHEN_RELEVANT_STATUSES.includes(priorStatus)) continue;
      if (recordKitchenCancellation(restaurant.slug, order, priorStatus, timeZone)) created += 1;
    }

    if (created > 0) reloadCancellations();

    if (!cancelSeededRef.current) {
      cancelSeededRef.current = true;
      return;
    }
    if (created > 0) playPurpose("canceledSoundType");
  }, [restaurantOrders, restaurant.slug, timeZone, reloadCancellations]);

  /* ── One-shot entrance bookkeeping (§13/§43) ───────────────────────────
     Mirrors the audio seeding rule and for the same reason: a board that
     already has ten tickets must not animate all ten when the kitchen opens,
     refreshes or regains focus. After the first pass a ticket is either
     genuinely NEW (an id never seen) or MOVED (its status changed). Both
     mount into their column, which is where the entrance plays; nothing
     travels across the board. Marks clear on a timer so a later poll cannot
     replay them. */
  const prevStatusRef = useRef(new Map());
  const boardSeededRef = useRef(false);
  const [enterKinds, setEnterKinds] = useState({});

  useEffect(() => {
    const prev = prevStatusRef.current;
    const next = new Map();
    const kinds = {};

    for (const order of restaurantOrders) {
      next.set(order.orderId, order.status);
      if (!boardSeededRef.current) continue;
      const before = prev.get(order.orderId);
      if (before === undefined) kinds[order.orderId] = "new";
      else if (before !== order.status) kinds[order.orderId] = "moved";
    }

    prevStatusRef.current = next;
    boardSeededRef.current = true;

    if (Object.keys(kinds).length === 0) return undefined;
    setEnterKinds(kinds);
    const clear = setTimeout(() => setEnterKinds({}), 900);
    return () => clearTimeout(clear);
  }, [restaurantOrders]);

  /* ── Advance one ticket (§11/§12) ──────────────────────────────────────
     Double-activation is refused two ways: the button is disabled for this
     order the instant it is pressed, and updateCustomerOrderStatus is itself
     idempotent (moving an order to the status it already holds appends no
     duplicate history). No confirmation, no undo, no spinner — the write is
     synchronous, and a fake loading state for localStorage would be theatre.

     The shape is already what a backend needs: identify the order, attempt
     the transition, and act on the RESULT rather than assuming success. When
     this becomes a request, the failure branch is where a retry goes. */
  function handleAdvance(order) {
    const transition = TRANSITIONS[order.status];
    if (!transition || updatingOrderId === order.orderId) return;

    setUpdatingOrderId(order.orderId);
    const updated = updateCustomerOrderStatus(order.orderId, transition.next, transition.historyLabel);

    if (updated) {
      /* Optimistic local update so the card moves columns immediately rather
         than waiting for the next 4s poll. */
      setAllOrders((prev) => prev.map((o) => (o.orderId === order.orderId ? updated : o)));
      setToastMessage(t(TOAST_KEY[order.status], transition.toast));
      setToastVisible(true);
    }

    setUpdatingOrderId(null);
  }

  function handleAcknowledge(orderId) {
    if (acknowledgeKitchenCancellation(restaurant.slug, orderId)) reloadCancellations();
  }

  const restaurantName = restaurantSettings.name?.trim() || restaurant.name;

  return (
    <>
      <Topbar
        className="topbar--kitchen"
        left={
          <div className="kb-identity">
            <BrandMarkStatic size={20} className="kb-identity__mark" />
            <span className="kb-identity__divider" aria-hidden="true" />
            {/* §27 — the shared component, so a missing or broken logo URL
                degrades to name-only instead of a broken-image glyph. */}
            <RestaurantIdentity
              name={restaurantName}
              logoUrl={restaurantSettings.logoUrl}
              variant="compact"
            />
          </div>
        }
        center={<span className="kb-topbar-title">{t("kitchen.kitchenBoard", "Kitchen board")}</span>}
        right={
          <div className="kb-topbar-right">
            <LanguageSwitcher variant="compact" className="kb-lang-switcher" />
            {/* §26 — no staff name and no role. This is a shared device; the
                person at the pass is not "signed in" in any personal sense. */}
            <Button variant="outline" size="sm" icon={Lock} onClick={onSignOut}>
              {t("kitchen.lockKitchen", "Lock Kitchen")}
            </Button>
          </div>
        }
      />

      <main className="container container--kb">
        <header className="kb-header anim-rise">
          <div className="kb-header__counts">
            <span className="kb-header__active">
              {activeCount}{" "}
              {t(
                activeCount !== 1 ? "kitchen.activeOrders" : "kitchen.activeOrder",
                activeCount !== 1 ? "active orders" : "active order"
              )}
            </span>
          </div>
          {/* §19 — quiet by design once everything is acknowledged. A standing
              red badge over settled history would train staff to ignore red. */}
          {acknowledgedCancellations.length > 0 && (
            <button
              type="button"
              className="kb-history-btn"
              onClick={() => setHistoryOpen(true)}
            >
              <History size={14} strokeWidth={2.2} aria-hidden="true" />
              {t("kitchen.recentlyCanceled", "Recently Canceled")} ({acknowledgedCancellations.length})
            </button>
          )}
        </header>

        {/* §17 — above the board, never over it. The board stays usable while
            this is on screen; a modal would stop service to deliver news. */}
        {pendingCancellations.length > 0 && (
          <CancellationAlerts
            records={pendingCancellations}
            onAcknowledge={handleAcknowledge}
          />
        )}

        {activeCount === 0 ? (
          <div className="kb-empty-all anim-rise">
            <span className="kb-empty-all__icon">
              <ChefHat size={30} strokeWidth={1.7} />
            </span>
            <p className="kb-empty-all__title">{t("kitchen.noActiveOrders", "No active orders")}</p>
          </div>
        ) : isCompactPortrait ? (
          <PortraitBoard
            ordersByStatus={ordersByStatus}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            now={now}
            updatingOrderId={updatingOrderId}
            enterKinds={enterKinds}
            onAdvance={handleAdvance}
          />
        ) : (
          <div className="kb-columns">
            {BOARD_COLUMNS.map((col) => (
              <BoardColumn
                key={col.status}
                column={col}
                orders={ordersByStatus[col.status] || []}
                now={now}
                updatingOrderId={updatingOrderId}
                enterKinds={enterKinds}
                onAdvance={handleAdvance}
              />
            ))}
          </div>
        )}
      </main>

      {historyOpen && (
        <RecentlyCanceledModal
          records={acknowledgedCancellations}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <Toast visible={toastVisible} message={toastMessage} onDone={() => setToastVisible(false)} />
    </>
  );
}

/* ── Portrait: one status at a time, chosen by tab (§24) ─────────────────── */
function PortraitBoard({ ordersByStatus, activeTab, onTabChange, now, updatingOrderId, enterKinds, onAdvance }) {
  const { t } = useLanguage();
  const column = BOARD_COLUMNS.find((c) => c.status === activeTab) || BOARD_COLUMNS[0];
  const orders = ordersByStatus[column.status] || [];

  return (
    <>
      {/* The tab strip follows the document direction, so Arabic reads
          Received → Preparing → Ready right-to-left without any reversed
          array: the order of the journey is the order of the language (§25). */}
      <div className="kb-tabs anim-rise" role="tablist">
        {BOARD_COLUMNS.map((col) => {
          const count = ordersByStatus[col.status]?.length || 0;
          const isActive = col.status === activeTab;
          return (
            <button
              key={col.status}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`kb-tab ${isActive ? "kb-tab--active" : ""}`}
              onClick={() => onTabChange(col.status)}
            >
              <span className={`kb-column__dot kb-column__dot--${col.tone}`} aria-hidden="true" />
              <span className="kb-tab__label">{t(`status.${col.status}`, col.label)}</span>
              <span className="kb-tab__count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="kb-column__body">
        {orders.length === 0 ? (
          <p className="kb-column__empty">{t(EMPTY_MSG_KEY[column.status], "No orders here")}</p>
        ) : (
          orders.map((order) => (
            <KitchenOrderCard
              key={order.orderId}
              order={order}
              now={now}
              isUpdating={updatingOrderId === order.orderId}
              enterKind={enterKinds[order.orderId]}
              onAdvance={() => onAdvance(order)}
            />
          ))
        )}
      </div>
    </>
  );
}

/* ── One board column (landscape + desktop) ──────────────────────────────── */
function BoardColumn({ column, orders, now, updatingOrderId, enterKinds, onAdvance }) {
  const { t } = useLanguage();
  return (
    <section className="kb-column">
      <div className="kb-column__header">
        <span className={`kb-column__dot kb-column__dot--${column.tone}`} aria-hidden="true" />
        <h2 className="kb-column__title">{t(`status.${column.status}`, column.label)}</h2>
        <span className="kb-column__count">{orders.length}</span>
      </div>

      {/* No overflow and no max-height: the column grows and the PAGE scrolls,
          so staff are never trapped in three separate scroll positions (§21). */}
      <div className="kb-column__body">
        {orders.length === 0 ? (
          <p className="kb-column__empty">{t(EMPTY_MSG_KEY[column.status], "No orders here")}</p>
        ) : (
          orders.map((order) => (
            <KitchenOrderCard
              key={order.orderId}
              order={order}
              now={now}
              isUpdating={updatingOrderId === order.orderId}
              enterKind={enterKinds[order.orderId]}
              onAdvance={() => onAdvance(order)}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* ── Persistent cancellation alerts (§17/§18) ────────────────────────────── */
function CancellationAlerts({ records, onAcknowledge }) {
  const { t } = useLanguage();
  return (
    <section className="kb-cancels anim-rise" role="alert" aria-live="polite">
      <div className="kb-cancels__head">
        <Ban size={15} strokeWidth={2.4} aria-hidden="true" />
        <span className="kb-cancels__count">
          {records.length === 1
            ? t("kitchen.oneCancellationNeedsAttention", "1 cancellation needs attention")
            : t("kitchen.cancellationsNeedAttention", "{n} cancellations need attention").replace(
                "{n}",
                records.length
              )}
        </span>
      </div>

      <div className="kb-cancels__list">
        {records.map((record) => (
          <div className="kb-cancel" key={record.orderId}>
            <div className="kb-cancel__main">
              <p className="kb-cancel__title">
                {/* The word CANCELED carries the meaning, so the red is
                    reinforcement rather than the message itself (§37). */}
                <span className="kb-cancel__flag">{t("status.canceled", "Canceled")}</span>
                <span className="kb-cancel__table">
                  {t("customer.yourTable", "Table")} {record.tableNumber}
                </span>
              </p>
              <p className="kb-cancel__meta">
                {record.orderId} · {formatClock(record.canceledAt)}
              </p>

              {/* §17 — being told it was ALREADY COOKING is the difference
                  between "never mind" and "stop the pan now". */}
              <p
                className={`kb-cancel__state ${
                  record.priorStatus === "preparing" ? "kb-cancel__state--preparing" : ""
                }`}
              >
                {record.priorStatus === "preparing"
                  ? t("kitchen.wasAlreadyPreparing", "Was already being prepared")
                  : t("kitchen.wasWaitingToStart", "Had not been started")}
              </p>

              {record.items?.length > 0 && (
                <ul className="kb-cancel__items">
                  {record.items.map((line, i) => (
                    <li key={`${record.orderId}-${i}`}>
                      <span className="kb-cancel__qty">{line.quantity}×</span> {line.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button
              variant="outline"
              size="md"
              icon={Check}
              onClick={() => onAcknowledge(record.orderId)}
            >
              {t("kitchen.acknowledge", "Acknowledge")}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Recently Canceled — read-only history for this business day (§19) ───── */
function RecentlyCanceledModal({ records, onClose }) {
  const { t } = useLanguage();
  return (
    <Modal
      open
      onClose={onClose}
      title={t("kitchen.recentlyCanceled", "Recently Canceled")}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t("common.close", "Close")}
        </Button>
      }
    >
      <p className="dd-scope">{t("kitchen.todayOnly", "This business day only")}</p>
      <div className="kb-history">
        {records.map((record) => (
          <div className="kb-history__row" key={record.orderId}>
            <div className="kb-history__head">
              <span className="kb-history__table">
                {t("customer.yourTable", "Table")} {record.tableNumber}
              </span>
              <span className="kb-history__time">{formatClock(record.canceledAt)}</span>
            </div>
            <p className="kb-history__meta">
              {record.orderId} ·{" "}
              {record.priorStatus === "preparing"
                ? t("kitchen.wasAlreadyPreparing", "Was already being prepared")
                : t("kitchen.wasWaitingToStart", "Had not been started")}
            </p>
            {record.items?.length > 0 && (
              <p className="kb-history__items">
                {record.items.map((l) => `${l.quantity}× ${l.name}`).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ── One kitchen ticket ──────────────────────────────────────────────────── */
function KitchenOrderCard({ order, now, isUpdating, onAdvance, enterKind }) {
  const transition = TRANSITIONS[order.status];
  const isReady = order.status === "ready";
  const { t } = useLanguage();

  const timer = resolveTimer(order, now);
  const urgency = resolveTimerUrgency(order, timer);
  const isDelayed = urgency !== "normal";

  return (
    /* enterKind drives a ONE-SHOT entrance. A card changing status unmounts
       from one column and mounts in the other, so the destination mount is the
       natural hook: no card travels across the board and staff never lose a
       ticket they were reading. */
    <Card
      className={`kb-card ${isDelayed ? "kb-card--delayed" : ""} ${
        enterKind ? `kb-card--enter kb-card--enter-${enterKind}` : ""
      }`}
    >
      <div className="kb-card__top">
        <div className="kb-card__ident">
          {/* §3 — the table is the headline. A cook reads this from the pass,
              several feet away, and everything else on the ticket is detail
              they only need once they have found the right ticket. */}
          <p className="kb-card__table">
            {t("customer.yourTable", "Table")} {order.tableNumber}
          </p>
          <p className="kb-card__id">{order.orderId}</p>
        </div>

        {timer && (
          <div className="kb-card__timer-wrap">
            {isReady ? (
              /* §10 — a Ready ticket is no longer late, it is waiting. The
                 preparation clock stops and a different one starts, so amber
                 and red cannot follow a ticket the kitchen has finished. */
              <span className="kb-timer kb-timer--ready">
                <Clock size={12} strokeWidth={2.3} aria-hidden="true" />
                {t("kitchen.readyForMinutes", "Ready for {n} min").replace(
                  "{n}",
                  Math.floor(timer.elapsedMs / 60000)
                )}
              </span>
            ) : (
              <>
                <span className={`kb-timer kb-timer--${urgency}`}>
                  <Timer size={12} strokeWidth={2.3} aria-hidden="true" />
                  {formatTimer(timer.elapsedMs)}
                </span>
                {isDelayed && (
                  <span className={`kb-delayed ${urgency === "critical" ? "kb-delayed--critical" : ""}`}>
                    <AlertTriangle size={11} strokeWidth={2.4} aria-hidden="true" />
                    {t("kitchen.delayed", "Delayed")}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="kb-card__items">
        {order.items.map((line) => (
          <KitchenLineItem key={line.cartItemId} line={line} />
        ))}
      </div>

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
          <Clock size={14} strokeWidth={2} aria-hidden="true" />
          <span>{t("kitchen.waitingForPickup", "Waiting for pickup / service")}</span>
        </div>
      )}
    </Card>
  );
}

/* ── One item line ───────────────────────────────────────────────────────── */
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
          {/* §5 — a removal is an instruction NOT to do something, and it
              reads the same as an add-on if it is styled the same. It gets a
              struck-through marker and the word "NO" spelled out, so the
              meaning survives a greyscale screen and a colour-blind cook. */}
          {hasRemovals && (
            <p className="kb-item__custom-row kb-removal">
              <span className="kb-removal__label">
                <Ban size={11} strokeWidth={2.6} aria-hidden="true" />
                {t("kitchen.removeLabel", "NO")}
              </span>
              <span className="kb-removal__value">{line.selectedRemovals.join(", ")}</span>
            </p>
          )}

          {Object.entries(choicesByGroup).map(([groupName, options]) => (
            <p className="kb-item__custom-row" key={groupName}>
              <span className="kb-item__custom-label">{groupName}:</span> {options.join(", ")}
            </p>
          ))}

          {hasAddOns && (
            <p className="kb-item__custom-row">
              <span className="kb-item__custom-label">{t("common.extrasLabel", "Extras")}:</span>{" "}
              {line.selectedPaidAddOns.map((a) => a.name).join(", ")}
            </p>
          )}

          {/* §6 — notes are preparation-critical, so they are never clamped,
              collapsed or hidden behind "show more". They get their own
              surface and a label, which is what separates them from ordinary
              modifier text without shouting over the item name. */}
          {hasNotes && (
            <p className="kb-note">
              <span className="kb-note__label">{t("common.noteLabel", "Note")}</span>
              <span className="kb-note__text">{line.notes}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/* When did this order reach the given status? Read from the statusHistory the
   order already carries — nothing is written to order data to support timers.
   Falls back to updatedAt for any order whose history predates a status. */
function statusReachedAt(order, status) {
  const entry = order.statusHistory?.find((e) => e.status === status);
  return entry?.at || order.updatedAt || null;
}

/* FIFO key for a column: the moment the ticket ENTERED that state. For
   Received that is the order's creation; for Preparing and Ready it is when
   the kitchen moved it, so "oldest in this state first" is literally true
   rather than an approximation via creation time (§2). */
function statusSortTime(order, status) {
  const at = status === "received" ? order.createdAt : statusReachedAt(order, status);
  const ms = new Date(at || order.createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/* The state a cancelled order was in immediately before it was cancelled —
   the last history entry that is not itself the cancellation. This is what
   tells a cook whether food is currently on the heat (§17/§45). */
export function priorKitchenStatus(order) {
  const history = order?.statusHistory;
  if (!Array.isArray(history) || history.length === 0) return null;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].status !== "canceled") return history[i].status;
  }
  return null;
}

/**
 * How long this ticket has been running, and whether that number is still
 * moving. Derived purely from timestamps + the board clock — no stored timer
 * state anywhere.
 *
 *   received / preparing → elapsed since the order was RECEIVED, still
 *                          running. Starting preparation does not reset it
 *                          (§8): the guest has been waiting since they
 *                          ordered, not since the kitchen got to it.
 *   ready                → time since it was marked ready, still running,
 *                          because "Ready for 12 min" is the useful number
 *                          for a plate sitting under the pass (§10).
 *
 * @returns {{running: boolean, elapsedMs: number}|null}
 */
function resolveTimer(order, now) {
  if (order.status === "ready") {
    const readyAt = statusReachedAt(order, "ready");
    const readyMs = readyAt ? new Date(readyAt).getTime() : NaN;
    if (Number.isNaN(readyMs)) return null;
    return { running: true, elapsedMs: Math.max(0, now - readyMs) };
  }

  const startMs = new Date(order.createdAt).getTime();
  if (Number.isNaN(startMs)) return null;
  return { running: true, elapsedMs: Math.max(0, now - startMs) };
}

/**
 * How late is this ticket, in three steps.
 *
 * Built on the frozen order.estimatedPrepMinutes the guest was quoted at
 * checkout, so kitchen and customer are judged against one number.
 *
 *   normal    elapsed <= estimate         calm
 *   delayed   estimate < elapsed < 150%   amber
 *   critical  elapsed >= 150% of estimate red
 *
 * §9 — an order with no estimate, a zero, a negative or a non-integer gets
 * "normal" and therefore no delay styling at all. Inventing a fallback of
 * "about fifteen minutes" would manufacture lateness that nobody promised,
 * and a red ticket that means nothing is worse than no colour.
 *
 * Ready tickets are excluded before this is called (§10).
 */
function resolveTimerUrgency(order, timer) {
  if (!timer || order.status === "ready") return "normal";
  const estimate = order.estimatedPrepMinutes;
  if (!Number.isInteger(estimate) || estimate <= 0) return "normal";

  const estimateMs = estimate * 60000;
  if (timer.elapsedMs >= estimateMs * 1.5) return "critical";
  if (timer.elapsedMs > estimateMs) return "delayed";
  return "normal";
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

/* Wall-clock time of a cancellation. Deliberately the device's locale-free
   24h rendering: a kitchen reads a clock, not a date. */
function formatClock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
