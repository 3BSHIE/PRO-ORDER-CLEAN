import { ClipboardList, Wallet, ArrowUp, ArrowDown, Minus } from "lucide-react";
import Modal from "../../components/ui/Modal.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import { averageOrderValue, revenueDistribution } from "../../lib/dashboardStats.js";
import { describeMetric } from "../../lib/revenueComparison.js";
import { TopItemsPanel, PeakTimesPanel } from "./RevenueMiniTables.jsx";
import { QaPreviewBadge } from "../../dev/QaPreviewBadge.jsx";

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

const STATUS_FALLBACK = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
  canceled: "Canceled",
};

const DELTA_ICON = { up: ArrowUp, down: ArrowDown, flat: Minus };

/**
 * One metric's movement, as a subordinate line under the figure it belongs
 * to (Phase 111.4).
 *
 * ── WHY IT LIVES INSIDE THE CARD ─────────────────────────────────────────
 * A second block of five comparisons would be a second dashboard, and the
 * geometry Phase 111.2 settled — one full-width total over a balanced 2×2 —
 * is what makes this overlay readable. The delta is therefore a third line
 * in a card that already had two, which keeps every card the same height and
 * the grid exactly as it was.
 *
 * Colour says it quickly, text says it exactly: an arrow and a tint for the
 * glance, a signed percentage and a signed amount for the record. Pending
 * keeps the arrow and stays grey, because more money still owed at the table
 * is not good news dressed in green.
 */
function DeltaRow({ metric, kind, t }) {
  if (!metric) return null;
  const Icon = DELTA_ICON[metric.direction] || Minus;
  const described = describeMetric(metric, {
    kind,
    money: fmtPrice,
    labels: {
      new: t("admin.comparisonNew", "New"),
      unchanged: t("admin.comparisonUnchanged", "Unchanged"),
      noBaseline: t("admin.comparisonNoBaseline", "No baseline"),
    },
  });
  if (!described) return null;

  return (
    <span className={`dd2-delta dd2-delta--${described.tone}`}>
      <Icon size={11} strokeWidth={2.6} aria-hidden="true" />
      <span className="dd2-delta__main" dir="ltr">{described.main}</span>
      {described.absolute && (
        <span className="dd2-delta__abs" dir="ltr">{described.absolute}</span>
      )}
    </span>
  );
}

/**
 * DashboardDrillDown — Revenue Details.
 *
 * Phase 30 introduced this as a pair of drill-downs; Phase 95.1 left Revenue
 * as the only one, because it is the one number whose useful detail genuinely
 * is a breakdown rather than a list.
 *
 * ── WHAT PHASE 111.0 CHANGED, AND WHY ────────────────────────────────────
 * The interaction is untouched: same Modal (bottom sheet on mobile, centred
 * dialog on desktop), same open and close, no route, no drawer. The CONTENT
 * was the problem. It restated the section that opened it — one oversized
 * Total Revenue box, the same method rows, two counts — so the honest answer
 * to "why open this?" was "you get a bigger version of what you just read".
 *
 * It now answers a different question from the dashboard. The section says
 * how revenue is performing; this says where it came from:
 *
 *   • five compact figures instead of one enormous one
 *   • payment split with ORDERS and SHARE beside the amount, not amount alone
 *   • an order breakdown by status, which the section never shows
 *   • the period's top items and peak hours, which explain composition
 *
 * ── PERIOD (§25) ─────────────────────────────────────────────────────────
 * Everything here is the period the section is currently showing, handed in
 * already scoped and already summarised. Opening the overlay cannot show a
 * different week from the card it was opened from, because it does not
 * compute a scope of its own.
 *
 * ── NOTHING IS INVENTED (§7, still) ──────────────────────────────────────
 * Every figure derives from the same summarize* helpers the section uses over
 * the same filtered list. No profit, no costs, no margins, no trends.
 *
 * Both the modal and its destinations are operational, and Admin and Cashier
 * hold identical operational permissions, so nothing here can lead either
 * role somewhere they are not allowed to go.
 *
 * Props:
 *   detailKey   — "revenueToday" | null (null = closed)
 *   revenue     — summarizeRevenue() over the selected period
 *   topItems    — summarizeTopItems() over the same list
 *   peakTimes   — summarizePeakTimes() over the same list
 *   statusRows  — summarizeStatusRevenue() over the same list
 *   periodLabel — the formatted period, as the section prints it
 *   comparison  — buildComparison() against the preceding period (111.4)
 *   qaPreview   — DEV ONLY: true when these figures came from the QA fixture
 *   onClose     — () => void
 *   onNavigate  — (adminPage, options?) => void
 */
export default function DashboardDrillDown({
  detailKey, revenue, topItems, peakTimes, statusRows, periodLabel, comparison,
  qaPreview, onClose, onNavigate,
}) {
  const { t } = useLanguage();
  if (detailKey !== "revenueToday") return null;

  const aov = averageOrderValue(revenue);
  /* Phase 111.1 — the SAME distribution the ring draws and the report
     prints: collected by method plus what is still owed, shared against
     Total Revenue. It used to share against Collected, which meant the
     overlay and the chart that opened it answered the same question with
     two different denominators. One basis across all three surfaces (§7.6).

     No filtering here either: summarizeRevenue already decides which
     methods exist — enabled, or disabled but with real records — so a
     method that was offered and simply not used still shows as zero, and
     money booked against an unknown id can never be hidden. */
  const slices = revenueDistribution(revenue);
  const hasRevenue = revenue.total > 0;

  /* Leaves the modal and lands on the matching Live Orders view. Closing
     first keeps the dialog from being left open behind the screen it
     navigated away from. */
  function goToOrders(ordersFilter) {
    onClose();
    onNavigate("liveOrders", ordersFilter ? { ordersFilter } : undefined);
  }

  /* Five figures, each one line. The old layout gave Total Revenue a box of
     its own the height of three rows; these all carry the same weight
     because the question here is composition, not headline. */
  /* Each card is compared with its OWN counterpart, which is why the metric
     id is carried here rather than inferred: this overlay prints Paid orders,
     and paid orders are not counted orders — one is the subset that has
     settled, the other is everything revenue was built from. Comparing one
     against the other's history would be a quietly wrong number. */
  const summary = [
    { key: "total", metric: "total", kind: "money", label: t("admin.totalRevenue", "Total Revenue"), value: fmtPrice(revenue.total), strong: true },
    { key: "collected", metric: "collected", kind: "money", label: t("admin.collected", "Collected"), value: fmtPrice(revenue.collected) },
    { key: "pending", metric: "pending", kind: "money", label: t("payment.pendingAtTable", "Pending at table"), value: fmtPrice(revenue.pending) },
    { key: "paid", metric: "paidCount", kind: "count", label: t("admin.paidOrdersCount", "Paid orders"), value: String(revenue.paidCount) },
    { key: "aov", metric: "aov", kind: "money", label: t("admin.averageOrderValue", "Average order value"), value: aov === null ? "—" : fmtPrice(aov) },
  ];

  const periodType = comparison?.type || "day";
  const vsLabel = t(
    periodType === "day" ? "admin.vsPreviousDay"
      : periodType === "week" ? "admin.vsPreviousWeek" : "admin.vsPreviousMonth",
    periodType === "day" ? "vs previous day"
      : periodType === "week" ? "vs previous week" : "vs previous month"
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={t("admin.revenueDetails", "Revenue Details")}
    >
      {/* The period this overlay describes, inherited from the section —
          and, when the section is on the fixture, the same notice it
          carries, because this overlay is read on its own. */}
      <p className="dd-period">
        {periodLabel}
        {import.meta.env.DEV && qaPreview && (
          <QaPreviewBadge className="qa-badge--overlay" />
        )}
      </p>

      <div className="dd2">
        {comparison && (
          <p className="dd2-vs">
            <span className="dd2-vs__label">{vsLabel}</span>
            {comparison.coverage === "none" && (
              <span className="dd2-vs__note">
                {t("admin.comparisonUnavailable", "No recorded orders before this period, so there is nothing to compare against.")}
              </span>
            )}
            {comparison.coverage === "partial" && (
              <span className="dd2-vs__note">
                {t("admin.comparisonPartial", "Records begin inside the previous period, so that comparison is based on partial history.")}
              </span>
            )}
          </p>
        )}

        <dl className="dd2-summary">
          {summary.map((row) => (
            <div
              className={`dd2-metric${row.strong ? " dd2-metric--strong" : ""}`}
              key={row.key}
            >
              <dt className="dd2-metric__label">{row.label}</dt>
              <dd className="dd2-metric__value">{row.value}</dd>
              {comparison && (
                <dd className="dd2-metric__delta">
                  <DeltaRow
                    metric={comparison.metrics[row.metric]}
                    kind={row.kind}
                    t={t}
                  />
                </dd>
              )}
            </div>
          ))}
        </dl>

        {/* ── Payment breakdown (§28) ──────────────────────────────────
            Amount alone could not say whether a method is used by many
            small orders or a few large ones; orders and share can. Share is
            of COLLECTED, the same denominator revenueMethodShares uses, so
            the rows add to 100% rather than to some fraction of the total
            with no visible reason. */}
        <section className="dd2-block">
          <h4 className="dd2-block__title">
            {t("admin.paymentDistribution", "Payment Distribution")}
          </h4>
          <table className="dd2-table">
            <thead>
              <tr>
                <th scope="col">{t("admin.colMethod", "Method")}</th>
                <th scope="col" className="dd2-num">{t("admin.colOrders", "Orders")}</th>
                <th scope="col" className="dd2-num">{t("admin.colRevenue", "Revenue")}</th>
                <th scope="col" className="dd2-num">{t("admin.colShare", "Share")}</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((slice) => (
                <tr key={slice.id}>
                  <th scope="row" className="dd2-label">
                    {slice.kind === "pending"
                      ? t("payment.pendingAtTable", "Pending at table")
                      : t(
                          METHOD_LABEL_KEY[slice.id],
                          METHOD_LABEL_FALLBACK[slice.id] || slice.id
                        )}
                  </th>
                  <td className="dd2-num">{slice.count}</td>
                  <td className="dd2-num dd2-money">{fmtPrice(slice.amount)}</td>
                  <td className="dd2-num">
                    {hasRevenue ? `${slice.percent}%` : "—"}
                  </td>
                </tr>
              ))}
              {/* The row that makes the basis unmistakable: these shares are
                  of Total Revenue, and they add up to it. */}
              <tr className="dd2-total-row">
                <th scope="row" className="dd2-label">
                  {t("admin.totalRevenue", "Total Revenue")}
                </th>
                <td className="dd2-num">{revenue.countedOrders}</td>
                <td className="dd2-num dd2-money">{fmtPrice(revenue.total)}</td>
                <td className="dd2-num">{hasRevenue ? "100%" : "—"}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ── Order breakdown (§29) ────────────────────────────────────
            The statuses the product already has, in its own order. Canceled
            prints a dash rather than 0.000: zero would claim those orders
            earned nothing, while the dash says they are not counted as
            revenue at all, which is the actual rule. */}
        <section className="dd2-block">
          <h4 className="dd2-block__title">
            {t("admin.orderBreakdown", "Order Breakdown")}
          </h4>
          <table className="dd2-table">
            <thead>
              <tr>
                <th scope="col">{t("admin.colStatus", "Status")}</th>
                <th scope="col" className="dd2-num">{t("admin.colOrders", "Orders")}</th>
                <th scope="col" className="dd2-num">{t("admin.colRevenue", "Revenue")}</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((row) => (
                <tr key={row.status} data-zero={row.orders === 0 ? "true" : undefined}>
                  <th scope="row" className="dd2-label">
                    {t(`status.${row.status}`, STATUS_FALLBACK[row.status] || row.status)}
                  </th>
                  <td className="dd2-num">{row.orders}</td>
                  <td className="dd2-num dd2-money">
                    {row.revenue === null ? "—" : fmtPrice(row.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* The same two panels the section shows, for the same period — here
            they explain what the money above was made of. */}
        <div className="dd2-minis">
          <TopItemsPanel rows={topItems} />
          <PeakTimesPanel rows={peakTimes} />
        </div>

        {/* ── Secondary actions (§32) ──────────────────────────────────
            Both destinations the old layout offered, kept as ordinary
            secondary buttons. The gold full-width CTA dominated a financial
            overlay whose job is reading, not navigating — and the unpaid
            route in particular was buried inside a table row, where nothing
            said it was a link. */}
        <div className="dd2-actions">
          <button type="button" className="dd2-action" onClick={() => goToOrders("today")}>
            <ClipboardList size={14} strokeWidth={2} aria-hidden="true" />
            {t("admin.viewInLiveOrders", "View in Live Orders")}
          </button>
          {revenue.pendingCount > 0 && (
            <button type="button" className="dd2-action" onClick={() => goToOrders("unpaid")}>
              <Wallet size={14} strokeWidth={2} aria-hidden="true" />
              {t("admin.viewUnpaidOrders", "View unpaid orders")}
              <span className="dd2-action__count">{revenue.pendingCount}</span>
            </button>
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
