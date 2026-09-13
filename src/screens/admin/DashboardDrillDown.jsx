import { ClipboardList, ChevronRight } from "lucide-react";
import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";

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

/**
 * DashboardDrillDown — the Revenue Today detail view.
 *
 * Phase 30 introduced this as a pair of drill-downs (Revenue and Orders).
 * Phase 95.1 removed the Orders one: Orders Today is now a KPI card that
 * NAVIGATES to Live Orders scoped to today, which is a better answer to
 * "which orders?" than a modal listing counts, and it let all four KPI cards
 * share one interaction language. Revenue is the one number whose useful
 * detail genuinely is a breakdown rather than a list, so it kept its modal.
 *
 * Uses the app's existing Modal (bottom sheet on mobile, centred dialog on
 * desktop) rather than introducing a drawer or a separate analytics surface.
 *
 * EVERYTHING HERE IS DERIVED, NOTHING IS INVENTED (§7). Every figure comes
 * from summarizeRevenue() over today's real orders: the method rows are the
 * actual payment methods those orders carry, and paid/pending counts are the
 * real paymentStatus split. No profit, no costs, no margins, no trends — this
 * explains today's takings and stops there.
 *
 * Values are passed in from the dashboard's live state, so an open detail
 * view keeps updating as the 4s order poll brings in new data.
 *
 * Both the modal and its destinations are operational, and Admin and Cashier
 * hold identical operational permissions, so nothing here can lead either
 * role somewhere they are not allowed to go.
 *
 * Props:
 *   detailKey  — "revenueToday" | null (null = closed)
 *   revenue    — summarizeRevenue() result for today's orders
 *   onClose    — () => void
 *   onNavigate — (adminPage, options?) => void
 */
export default function DashboardDrillDown({ detailKey, revenue, onClose, onNavigate }) {
  const { t } = useLanguage();
  if (detailKey !== "revenueToday") return null;

  /* Leaves the modal and lands on the matching Live Orders view. Closing
     first keeps the dialog from being left open behind the screen it
     navigated away from. */
  function goToOrders(ordersFilter) {
    onClose();
    onNavigate("liveOrders", ordersFilter ? { ordersFilter } : undefined);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("admin.revenueDetails", "Revenue Details")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close", "Close")}
          </Button>
          <Button icon={ClipboardList} onClick={() => goToOrders("today")}>
            {t("admin.viewInLiveOrders", "View in Live Orders")}
          </Button>
        </>
      }
    >
      {/* The scope is stated because the Overview genuinely mixes today-scoped
          and all-time cards, and this one is today-scoped. */}
      <p className="dd-scope">{t("admin.scopeToday", "Today's orders")}</p>

      <div className="dd">
        <div className="dd-total">
          <span className="dd-total__label">{t("admin.totalRevenue", "Total Revenue")}</span>
          <span className="dd-total__value">{fmtPrice(revenue.total)}</span>
        </div>

        <p className="dd-section">{t("admin.paymentBreakdown", "Payment Breakdown")}</p>
        <div className="dd-rows">
          {/* Method rows are money ALREADY COLLECTED, split by how it was
              taken. A method with no takings today still shows as zero when
              it is an enabled method, so a manager can see it was offered and
              simply not used — silence and zero are different facts. */}
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
              nothing uncollected can read as money in hand.

              §7 — this is the one row that is also a job: it is a list of
              tables that still owe money, so it navigates to exactly those
              orders. The method rows above deliberately do not: Live Orders
              has no payment-method filter, and adding one to make three more
              rows clickable would be the complex filter system §7 rules out. */}
          <button
            type="button"
            className="dd-row dd-row--pending dd-row--action"
            onClick={() => goToOrders("unpaid")}
          >
            <span className="dd-row__label">
              {t("payment.pendingAtTable", "Pending at table")}
              <span className="dd-row__count" title={t("admin.pendingOrdersCount", "Unpaid orders")}>
                {revenue.pendingCount}
              </span>
            </span>
            <span className="dd-row__value">{fmtPrice(revenue.pending)}</span>
            <ChevronRight className="dd-row__chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        {/* Order counts, so the money above can be read against the volume
            that produced it without opening a second view. */}
        <p className="dd-section">{t("admin.ordersToday", "Orders Today")}</p>
        <div className="dd-rows">
          <div className="dd-row">
            <span className="dd-row__label">{t("admin.countedOrders", "Counted orders")}</span>
            <span className="dd-row__value">{revenue.countedOrders}</span>
          </div>
          {revenue.canceledCount > 0 && (
            <div className="dd-row">
              <span className="dd-row__label">{t("status.canceled", "Canceled")}</span>
              <span className="dd-row__value">{revenue.canceledCount}</span>
            </div>
          )}
        </div>

        {revenue.canceledCount > 0 && (
          <p className="dd-note">
            {t("admin.canceledExcludedNote", "Canceled orders are excluded from revenue.")}
          </p>
        )}
      </div>
    </Modal>
  );
}
