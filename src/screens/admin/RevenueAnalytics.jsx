import { useMemo } from "react";
import {
  ChevronRight, Banknote, CreditCard, Wallet, TrendingUp, Receipt, Calculator,
} from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import {
  summarizeRevenueByHour,
  summarizeRevenueByDayKey,
  averageOrderValue,
  revenueDistribution,
} from "../../lib/dashboardStats.js";
import RollingValue from "../../components/ui/RollingValue.jsx";
import { listRangeKeys, formatDayKeyLabel } from "../../lib/revenuePeriods.js";
import { formatHourRange } from "../../i18n/dateFormat.js";
import { PeriodTypeStepper, PeriodNavigator } from "./RevenuePeriodControls.jsx";
import { TopItemsPanel, PeakTimesPanel } from "./RevenueMiniTables.jsx";
import RevenueReportCard from "./RevenueReportCard.jsx";
import { QaPreviewBadge, QaPreviewToggle } from "../../dev/QaPreviewBadge.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   RevenueAnalytics — Phase 100.1, recomposed in 100.2, given a lens in 111.0

   Phase 111.0 keeps the section exactly where it was: same card, same five
   zones, same tokens, same typography, same responsive thresholds. What
   changed is that it no longer only knows about today.

   ── WHAT THE PERIOD IS, AND WHAT IT IS NOT ───────────────────────────────
   Selecting Week or Month changes the RANGE, never the financial meaning.
   Total Revenue is still every non-canceled order's total, Collected is
   still the paid part of it, and Average Order Value is still that total
   over the orders that produced it. The same summarizeRevenue() that has
   always fed this section now receives a different slice of the same list.

   Phase 100.2's note said week and month selectors were absent because "the
   order store keeps no history". It does keep one — orders accumulate in
   localStorage and are never pruned — so the honest reason was that nothing
   had asked for the lens yet. A period with no orders now says so, which is
   itself information, rather than being hidden behind a disabled control.

   ── STILL DELIBERATELY ABSENT (§50) ──────────────────────────────────────
     • "vs yesterday", growth percentages, trend arrows. Those are
       comparisons, and comparisons belong to the future Reports work.
     • An "Other" payment bucket, for the reason Phase 100.1 gave.
   ═══════════════════════════════════════════════════════════════════════ */

/* Short forms for the compact surfaces; the full names do not fit. A method
   with no short form falls back to its full label rather than being dropped. */
const METHOD_SHORT_KEY = {
  cash_at_table: "payment.cashShort",
  card_at_table: "payment.cardShort",
  /* Phase 111.1 — the outstanding slice is not a payment method, but it is
     a legend row, so it needs the same short treatment as the two above. */
  pending_at_table: "payment.pendingAtTable",
};
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};
const METHOD_ICON = {
  cash_at_table: Banknote,
  card_at_table: CreditCard,
};

/* Two named tones, both derived from --gold. Anything else — a legacy id, or
   Online Payment were it ever enabled — takes the neutral tone rather than
   inventing a colour, and still renders with its own amount and share. */
const METHOD_TONE = {
  cash_at_table: "cash",
  card_at_table: "card",
  /* Phase 111.1 — the outstanding slice. Amber rather than another gold:
     it is the one part of the ring that is NOT money in hand, and the
     product already uses this tone for "in progress" elsewhere. */
  pending_at_table: "pending",
};

/* ── Ring geometry ────────────────────────────────────────────────────────
   Kept as module constants so the dash maths below reads as arithmetic
   rather than as magic numbers. The viewBox is square and the SVG scales
   with its container; only the ring is drawn in SVG, while the figure in the
   middle is ordinary HTML laid over it, so the text never scales with the
   artwork and stays readable at 390px. */
const RING_SIZE = 132;
const RING_RADIUS = 52;
const RING_STROKE = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/* A hairline of page colour between adjacent segments, so Cash and Card read
   as two arcs rather than one two-toned band. Only applied when there is
   actually more than one arc to separate. */
const RING_GAP = 2.5;

/** "09" — a stable two-digit hour for the axis and each bar's own title. */
function hourLabel(hour) {
  return String(hour).padStart(2, "0");
}

/**
 * The period's money as a ring: collected by method, plus what is still
 * owed at the table.
 *
 * ── WHY PENDING IS IN HERE (Phase 111.1) ─────────────────────────────────
 *   The ring used to draw collected revenue only, which meant a period
 *   where half the tables had not paid yet looked exactly like a period
 *   where everything was settled — the chart was a full circle either way.
 *   Drawing all three slices against Total Revenue makes the outstanding
 *   share visible at the size it actually is.
 *
 * ── WHY A RING, AND WHY SVG HERE BUT NOT FOR THE CHART ───────────────────
 *   The chart is a set of bars whose heights must stay truthful at any
 *   width, and CSS percentages do that with no viewBox to fight. A ring is
 *   one fixed square of artwork whose proportions never change, which is
 *   exactly the case SVG is good at: two stroke-dasharray arcs on one
 *   circle, no path maths, no library, and it scales cleanly to any size.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────
 *   The ring is aria-hidden. Every value it encodes — method, amount and
 *   share — is printed in the legend beside it as real text, so nothing is
 *   carried by colour or by arc length alone (§17).
 *
 * ── ZERO DATA ────────────────────────────────────────────────────────────
 *   With nothing collected, `segments` is empty and only the track is drawn.
 *   No NaN reaches an attribute, because share is already guarded to 0 by
 *   revenueMethodShares.
 */
function PaymentRing({ slices, total, t }) {
  const visible = slices.filter((slice) => slice.amount > 0);
  const gap = visible.length > 1 ? RING_GAP : 0;

  let cursor = 0;
  const segments = visible.map((method) => {
    const length = method.share * RING_CIRCUMFERENCE;
    const segment = {
      id: method.id,
      tone: METHOD_TONE[method.id] || "other",
      /* Never let the gap eat a tiny arc entirely — a method with real money
         in it must stay visible however small its share. */
      dash: Math.max(1, length - gap),
      offset: cursor,
    };
    cursor += length;
    return segment;
  });

  return (
    <div className="ad-ring-wrap">
      <svg
        className="ad-ring"
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* rotate -90 so the first arc starts at twelve o'clock rather than
            at three, which is where a stroked circle begins by default. */}
        <g transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}>
          <circle
            className="ad-ring__track"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
          />
          {segments.map((segment) => (
            <circle
              key={segment.id}
              className={`ad-ring__seg ad-ring__seg--${segment.tone}`}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={RING_STROKE}
              strokeDasharray={`${segment.dash} ${RING_CIRCUMFERENCE - segment.dash}`}
              strokeDashoffset={-segment.offset}
            />
          ))}
        </g>
      </svg>

      <div className="ad-ring__center">
        <span className="ad-ring__center-label">
          {t("admin.totalRevenue", "Total Revenue")}
        </span>
        <RollingValue className="ad-ring__center-value" value={fmtPrice(total)} />
      </div>
    </div>
  );
}

/**
 * One bar chart, fed either hours or days.
 *
 * ── WHY ONE COMPONENT FOR ALL THREE LENSES ───────────────────────────────
 *   A day of hours and a month of dates are the same drawing: N discrete
 *   sums, each a percentage of the tallest. Writing it twice would be two
 *   places for the peak rule or the 3% floor to drift apart. The caller
 *   supplies the columns and the axis ticks; this only draws them.
 *
 *   Still bars and still CSS, unchanged from Phase 100.1 in technique: bars
 *   because these are discrete sums and a line would draw values that were
 *   never earned, CSS because a percentage height in a flex row cannot
 *   overflow its container and keeps the axis as real text in both themes.
 *
 * @param {Array<{id:string|number,total:number,title:string,peak:boolean}>} columns
 * @param {number} peak — the tallest total, for scaling
 * @param {Array<string>} ticks — the handful of labels printed under the bars
 * @param {string} label — the chart's accessible name
 */
function RevenueBarChart({ columns, peak, ticks, label }) {
  return (
    <div className="ad-chart" role="img" aria-label={label}>
      <div className="ad-chart__grid" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className="ad-chart__bars">
        {columns.map((column) => {
          /* peak is 0 only when the caller has already switched to the empty
             state; the guard keeps this component safe on its own. A column
             with takings always gets at least 3% so the smallest real amount
             stays visible rather than rounding away to nothing. */
          const ratio = peak > 0 ? column.total / peak : 0;
          const height = column.total > 0 ? `${Math.max(3, ratio * 100)}%` : "0%";
          return (
            <span key={column.id} className="ad-chart__col" title={column.title}>
              <span
                className="ad-chart__bar"
                style={{ height }}
                data-empty={column.total > 0 ? undefined : "true"}
                data-peak={column.peak ? "true" : undefined}
              />
            </span>
          );
        })}
      </div>

      <div className="ad-chart__axis" aria-hidden="true">
        {ticks.map((tick, i) => (
          <span key={`${tick}-${i}`}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * The few axis labels a month gets.
 *
 * Twenty-eight to thirty-one dates will not fit under the bars at any width
 * this product supports, and a wall of numbers is not an axis. Five ticks —
 * the 1st, three evenly spaced dates and the last — are enough to locate a
 * bar in the month, which is all the axis has to do.
 */
function monthTicks(dayKeys, type, language) {
  if (dayKeys.length <= 8) {
    return dayKeys.map((key) => formatDayKeyLabel(key, type, language));
  }
  const last = dayKeys.length - 1;
  const picks = [0, Math.round(last * 0.25), Math.round(last * 0.5), Math.round(last * 0.75), last];
  return [...new Set(picks)].map((i) => formatDayKeyLabel(dayKeys[i], type, language));
}

/**
 * Props
 *   revenue       — summarizeRevenue() over the SELECTED period's orders
 *   orders        — that same scoped list, for the chart buckets
 *   topItems      — summarizeTopItems() over it
 *   peakTimes     — summarizePeakTimes() over it
 *   timeZone      — the restaurant's IANA zone
 *   period        — { type, range, label, atCurrent, anchor, todayKey }
 *   onPeriodType  — (nextType) => void
 *   onPeriodStep  — (delta) => void
 *   onPickDate    — (dayKey) => void, from the calendar popover
 *   onOpenDetail  — opens the Revenue Details overlay on the same period
 *   onOpenReport  — opens the Revenue Report page on the same period
 *   qaPreview     — DEV ONLY: { available, active, setActive } from
 *                   useQaRevenuePreview. Absent in a production build, where
 *                   the two guards below fold to false and vanish.
 */
export default function RevenueAnalytics({
  revenue, orders, topItems, peakTimes, timeZone,
  period, onPeriodType, onPeriodStep, onPickDate, onOpenDetail, onOpenReport,
  qaPreview,
}) {
  const { t, language } = useLanguage();
  const isDay = period.type === "day";

  /* The day lens keeps the 24 fixed hourly buckets Phase 100.1 argued for;
     week and month bucket by business day over the keys the period itself
     defines, so a quiet Tuesday still occupies its place on the axis. */
  const dayKeys = useMemo(
    () => (isDay ? [] : listRangeKeys(period.range)),
    [isDay, period.range]
  );
  const hourly = useMemo(
    () => (isDay ? summarizeRevenueByHour(orders || [], timeZone) : null),
    [isDay, orders, timeZone]
  );
  const daily = useMemo(
    () => (isDay ? null : summarizeRevenueByDayKey(orders || [], timeZone, dayKeys)),
    [isDay, orders, timeZone, dayKeys]
  );

  const chart = isDay ? hourly : daily;
  const aov = averageOrderValue(revenue);
  const slices = revenueDistribution(revenue);

  const hasRevenue = revenue.total > 0;

  /* Columns and ticks, resolved once per render for whichever lens is on. */
  const columns = useMemo(() => {
    if (isDay) {
      return (hourly?.buckets || []).map((bucket) => ({
        id: bucket.hour,
        total: bucket.total,
        peak: bucket.total > 0 && bucket.hour === hourly.peakHour,
        title: `${hourLabel(bucket.hour)}:00 — ${fmtPrice(bucket.total)}`,
      }));
    }
    return (daily?.buckets || []).map((bucket) => ({
      id: bucket.key,
      total: bucket.total,
      peak: bucket.total > 0 && bucket.key === daily.peakKey,
      title: `${formatDayKeyLabel(bucket.key, period.type, language)} — ${fmtPrice(bucket.total)}`,
    }));
  }, [isDay, hourly, daily, period.type, language]);

  const ticks = useMemo(() => {
    if (isDay) return ["00", "06", "12", "18", "23"];
    return monthTicks(dayKeys, period.type, language);
  }, [isDay, dayKeys, period.type, language]);

  const chartTitle = isDay
    ? t("admin.revenueByHour", "Revenue by hour")
    : t("admin.revenueByDay", "Revenue by day");

  /* The peak readout above the chart, in the unit the lens is drawn in. */
  const peakLabel = isDay
    ? (hourly?.peakHour !== null && hourly?.peakHour !== undefined
        ? formatHourRange(hourly.peakHour, language)
        : null)
    : (daily?.peakKey
        ? formatDayKeyLabel(daily.peakKey, period.type, language)
        : null);

  /* ── Motion (Phase 111.1) ──────────────────────────────────────────────
     Nothing here is keyed any more. Phase 111.0 remounted this whole data
     area on every period change, which animated the card rather than the
     information and read as a replacement.

     Now the components stay mounted for the life of the section and only
     what changed moves: RollingValue swaps a figure in place, the bars
     transition their heights, and the ring transitions its arcs. The poll
     is silent for free — an unchanged value is not a change — and reduced
     motion is handled globally, where the stylesheet collapses every
     animation and transition to 0.001s. */

  return (
    <section className="ad-rev anim-rise" aria-labelledby="ad-rev-title">
      {/* ── A. Header ─────────────────────────────────────────────────── */}
      <header className="ad-rev__head">
        <div className="ad-rev__heading">
          <div className="ad-rev__title-row">
            <h2 className="ad-rev__title" id="ad-rev-title">
              {t("admin.revenueAnalytics", "Revenue Analytics")}
            </h2>
            {/* The figures below are the fixture's, not the restaurant's, and
                this is where that has to be said — beside the title, before
                any number is read. */}
            {import.meta.env.DEV && qaPreview?.active && <QaPreviewBadge />}
          </div>
          {/* Two steppers where the static "TODAY" caption used to sit: the
              lens, then the window it is pointed at. */}
          <div className="ad-rev__periods">
            <PeriodTypeStepper type={period.type} onChange={onPeriodType} />
            <PeriodNavigator
              label={period.label}
              atCurrent={period.atCurrent}
              onStep={onPeriodStep}
              type={period.type}
              anchor={period.anchor}
              todayKey={period.todayKey}
              onPickDate={onPickDate}
            />
          </div>
        </div>
        <div className="ad-rev__head-actions">
          {import.meta.env.DEV && qaPreview?.available && (
            <QaPreviewToggle active={qaPreview.active} onChange={qaPreview.setActive} />
          )}
          <button
            type="button"
            className="ad-rev__detail"
            onClick={onOpenDetail}
            aria-haspopup="dialog"
          >
            {t("admin.viewBreakdown", "View breakdown")}
            <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="ad-rev__data">
        {/* ── B + C. Primary summary and chart ────────────────────────── */}
        <div className="ad-rev__top">
          <div className="ad-rev__summary">
            <span className="ad-rev__label">
              {t("admin.totalRevenue", "Total Revenue")}
            </span>
            <RollingValue className="ad-rev__total" value={fmtPrice(revenue.total)} />

            {/* Two supporting metrics, not five. Both are an exact count or an
                exactly-defined ratio over the same orders the total covers. */}
            <div className="ad-rev__minis">
              <div className="ad-rev__mini">
                <span className="ad-rev__mini-icon" aria-hidden="true">
                  <Receipt size={13} strokeWidth={1.9} />
                </span>
                <span className="ad-rev__mini-text">
                  <span className="ad-rev__mini-label">
                    {t("admin.paidOrdersCount", "Paid orders")}
                  </span>
                  <RollingValue className="ad-rev__mini-value" value={String(revenue.paidCount)} />
                </span>
              </div>
              <div className="ad-rev__mini">
                <span className="ad-rev__mini-icon" aria-hidden="true">
                  <Calculator size={13} strokeWidth={1.9} />
                </span>
                <span className="ad-rev__mini-text">
                  <span className="ad-rev__mini-label">
                    {t("admin.averageOrderValue", "Average order value")}
                  </span>
                  <RollingValue
                    className="ad-rev__mini-value"
                    value={aov === null ? "—" : fmtPrice(aov)}
                  />
                </span>
              </div>
            </div>
          </div>

          <div className="ad-rev__panel">
            <div className="ad-rev__panel-head">
              <span className="ad-rev__panel-title">{chartTitle}</span>
              {hasRevenue && peakLabel && (
                <span className="ad-rev__peak">
                  <TrendingUp size={12} strokeWidth={2} aria-hidden="true" />
                  {t("admin.peakHour", "Peak")} {peakLabel}
                  <strong><RollingValue value={fmtPrice(chart.peak)} /></strong>
                </span>
              )}
            </div>

            {hasRevenue ? (
              <RevenueBarChart
                columns={columns}
                peak={chart.peak}
                ticks={ticks}
                label={chartTitle}
              />
            ) : (
              <p className="ad-rev__empty">
                {t("admin.noRevenueInPeriod", "No revenue recorded in this period yet.")}
              </p>
            )}

            {/* Only ever shown if money genuinely could not be placed on the
                clock. Silence here means the chart sums to the total above. */}
            {chart.unplaced > 0 && (
              <p className="ad-rev__note">
                {t("admin.revenueUnplaced", "Not shown on the chart:")}{" "}
                {fmtPrice(chart.unplaced)}
              </p>
            )}
          </div>
        </div>

        {/* ── D + E. Payment methods and revenue status ───────────────── */}
        <div className="ad-rev__bottom">
          <div className="ad-rev__panel">
            <div className="ad-rev__panel-head">
              <span className="ad-rev__panel-title">
                {t("admin.paymentMethodsSection", "Payment Methods")}
              </span>
            </div>

            <div className="ad-rev__pay-body">
              <PaymentRing slices={slices} total={revenue.total} t={t} />

              {/* The ring is decorative; this legend is where the values live. */}
              <ul className="ad-rev__legend">
                {slices.map((slice) => {
                  const Icon = METHOD_ICON[slice.id] || Wallet;
                  const tone = METHOD_TONE[slice.id] || "other";
                  return (
                    <li className="ad-rev__legend-row" key={slice.id}>
                      <span
                        className={`ad-rev__dot ad-rev__dot--${tone}`}
                        aria-hidden="true"
                      />
                      <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
                      <span className="ad-rev__legend-label">
                        {shortLabel(t, slice.id)}
                      </span>
                      <span className="ad-rev__legend-share">
                        <RollingValue
                          value={hasRevenue ? `${slice.percent}%` : "—"}
                        />
                      </span>
                      <RollingValue
                        className="ad-rev__legend-value"
                        value={fmtPrice(slice.amount)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Collected + Pending = Total, as three mini cards. Each carries a
              restrained semantic rail rather than a filled surface, so the
              block stays quiet beside the chart. */}
          <div className="ad-rev__status">
            <div className="ad-rev__stat ad-rev__stat--collected">
              <span className="ad-rev__stat-label">
                {t("admin.collected", "Collected")}
              </span>
              <RollingValue className="ad-rev__stat-value" value={fmtPrice(revenue.collected)} />
            </div>
            <div className="ad-rev__stat ad-rev__stat--pending">
              <span className="ad-rev__stat-label">
                {t("payment.pendingAtTable", "Pending at table")}
              </span>
              <RollingValue className="ad-rev__stat-value" value={fmtPrice(revenue.pending)} />
            </div>
            <div className="ad-rev__stat ad-rev__stat--total">
              <span className="ad-rev__stat-label">
                {t("admin.totalRevenue", "Total Revenue")}
              </span>
              <RollingValue className="ad-rev__stat-value" value={fmtPrice(revenue.total)} />
            </div>
          </div>
        </div>

        {/* ── F. What sold, and when (§15/§18) ─────────────────────────
            One final row that answers the two questions the money above
            raises — which dishes earned it, and when the pressure was. Both
            are compact tables that take the height of their rows. */}
        <div className="ad-rev__mini-row">
          <TopItemsPanel rows={topItems} />
          <PeakTimesPanel rows={peakTimes} />
          <RevenueReportCard onOpen={onOpenReport} />
        </div>
      </div>
    </section>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/* A legacy order can carry a method id the catalogue no longer knows — or
   none at all, which summarizeRevenue books under "unknown" so the money is
   still counted. Resolving the key FIRST and only calling t() when one exists
   keeps that case silent: passing an undefined key would render correctly but
   log a warning about an invalid translation key on every paint. */
function shortLabel(t, methodId) {
  const key = METHOD_SHORT_KEY[methodId] || METHOD_LABEL_KEY[methodId];
  return key ? t(key, methodId) : methodId;
}
