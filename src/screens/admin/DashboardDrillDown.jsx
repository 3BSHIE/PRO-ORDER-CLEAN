import { ClipboardList } from "lucide-react";
import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import { ALL_STATUSES } from "../../lib/dashboardStats.js";

/* Payment method labels resolve from the same stable ids the rest of the app
   uses, so a method reads identically here, on the kitchen board, and on the
   customer's receipt. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};
const METHOD_LABEL_FALLBACK = {
  cash_at_table: "Cash at the table",
  card_at_table: "Card / Visa at the table",
  online_payment: "Online payment",
};

const STATUS_TONE = {
  received: "received",
  preparing: "preparing",
  ready: "ready",
  delivered: "gold",
  canceled: "canceled",
};
const STATUS_FALLBACK = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
  canceled: "Canceled",
};

/**
 * DashboardDrillDown — Phase 30 detail views for the two Overview cards that
 * have a genuinely useful breakdown behind them.
 *
 * Uses the app's existing Modal (bottom sheet on mobile, centred dialog on
 * desktop) rather than introducing a drawer or a separate analytics surface.
 *
 * Everything rendered here is passed in from the dashboard's live state, so
 * an open detail view keeps updating as the 4s order poll brings in new data
 * — no snapshot is taken at open time.
 *
 * Both drill-downs are operational (orders / payments), which both Admin and
 * Cashier are permitted to see. The one action offered — "View in Live
 * Orders" — points at a page both roles can reach, so nothing here can lead a
 * Cashier somewhere they are not allowed to go.
 *
 * Props:
 *   detailKey  — "revenueToday" | "ordersToday" | null (null = closed)
 *   revenue    — summarizeRevenue() result for the scoped orders
 *   statuses   — summarizeOrderStatuses() result for the scoped orders
 *   onClose    — () => void
 *   onNavigate — (adminPage:string) => void, for the Live Orders action
 */
export default function DashboardDrillDown({
  detailKey,
  revenue,
  statuses,
  onClose,
  onNavigate,
}) {
  const { t } = useLanguage();
  if (!detailKey) return null;

  const isRevenue = detailKey === "revenueToday";

  const title = isRevenue
    ? t("admin.revenueDetails", "Revenue Details")
    : t("admin.orderBreakdown", "Order Breakdown");

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close", "Close")}
          </Button>
          <Button
            icon={ClipboardList}
            onClick={() => {
              onClose();
              onNavigate("liveOrders");
            }}
          >
            {t("admin.viewInLiveOrders", "View in Live Orders")}
          </Button>
        </>
      }
    >
      {/* Every drill-down states the scope of the card it came from, because
          the Overview genuinely mixes today-scoped and all-time cards. */}
      <p className="dd-scope">
        {isRevenue
          ? t("admin.scopeToday", "Today's orders")
          : t("admin.scopeToday", "Today's orders")}
      </p>

      {isRevenue ? <RevenueDetail revenue={revenue} /> : <OrdersDetail statuses={statuses} />}
    </Modal>
  );
}

/* ── Revenue breakdown ───────────────────────────────────────────────────── */
function RevenueDetail({ revenue }) {
  const { t } = useLanguage();

  return (
    <div className="dd">
      <div className="dd-total">
        <span className="dd-total__label">{t("admin.totalRevenue", "Total Revenue")}</span>
        <span className="dd-total__value">{fmtPrice(revenue.total)}</span>
      </div>

      {/* Collected — money actually taken, split by method. */}
      <p className="dd-section">{t("admin.paymentBreakdown", "Payment Breakdown")}</p>
      <div className="dd-rows">
        {revenue.byMethod.map((method) => (
          <div className="dd-row" key={method.id}>
            <span className="dd-row__label">
              {t(METHOD_LABEL_KEY[method.id], METHOD_LABEL_FALLBACK[method.id] || method.id)}
              {/* Bare count, deliberately: "2 Order" is wrong in English and
                  Arabic pluralisation is more complex still, so the row label
                  carries the meaning and the badge carries only the number. */}
              <span className="dd-row__count" title={t("admin.paidOrdersCount", "Paid orders")}>
                {method.count}
              </span>
            </span>
            <span className="dd-row__value">{fmtPrice(method.amount)}</span>
          </div>
        ))}

        <div className="dd-divider" />

        <div className="dd-row dd-row--strong">
          <span className="dd-row__label">
            {t("admin.collected", "Collected")}
            <span className="dd-row__count" title={t("admin.paidOrdersCount", "Paid orders")}>
              {revenue.paidCount}
            </span>
          </span>
          <span className="dd-row__value">{fmtPrice(revenue.collected)}</span>
        </div>

        {/* Pending is shown separately and never folded into Collected, so
            nothing uncollected can read as money in hand. */}
        <div className="dd-row dd-row--pending">
          <span className="dd-row__label">
            {t("payment.pendingAtTable", "Pending at table")}
            <span className="dd-row__count" title={t("admin.pendingOrdersCount", "Unpaid orders")}>
              {revenue.pendingCount}
            </span>
          </span>
          <span className="dd-row__value">{fmtPrice(revenue.pending)}</span>
        </div>
      </div>

      {revenue.canceledCount > 0 && (
        <p className="dd-note">
          {t(
            "admin.canceledExcludedNote",
            "Canceled orders are excluded from revenue."
          )}{" "}
          <span className="dd-note__count">{revenue.canceledCount}</span>
        </p>
      )}
    </div>
  );
}

/* ── Order status breakdown ──────────────────────────────────────────────── */
function OrdersDetail({ statuses }) {
  const { t } = useLanguage();

  return (
    <div className="dd">
      <div className="dd-total">
        <span className="dd-total__label">{t("admin.ordersToday", "Orders Today")}</span>
        <span className="dd-total__value">{statuses.total}</span>
      </div>

      <p className="dd-section">{t("admin.orderBreakdown", "Order Breakdown")}</p>
      <div className="dd-rows">
        {ALL_STATUSES.map((status) => (
          <div className="dd-row" key={status}>
            <span className="dd-row__label">
              <Badge tone={STATUS_TONE[status]} dot>
                {t(`status.${status}`, STATUS_FALLBACK[status])}
              </Badge>
            </span>
            <span className="dd-row__value">{statuses[status]}</span>
          </div>
        ))}

        <div className="dd-divider" />

        <div className="dd-row dd-row--strong">
          <span className="dd-row__label">{t("admin.activeOrders", "Active Orders")}</span>
          <span className="dd-row__value">{statuses.active}</span>
        </div>
        <div className="dd-row dd-row--strong">
          <span className="dd-row__label">{t("admin.completedOrders", "Completed Orders")}</span>
          <span className="dd-row__value">{statuses.completed}</span>
        </div>
      </div>
    </div>
  );
}
