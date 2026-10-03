import { useMemo } from "react";
import {
  ChevronRight, Banknote, CreditCard, Wallet, TrendingUp, Receipt, Calculator,
} from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import {
  summarizeRevenueByHour,
  averageOrderValue,
  revenueMethodShares,
} from "../../lib/dashboardStats.js";

/* ═══════════════════════════════════════════════════════════════════════════
   RevenueAnalytics — Phase 100.1, recomposed in Phase 100.2

   Phase 100.2 is a VISUAL phase. Not one number, denominator, filter or
   rounding rule changed: the same three helpers over the same today-scoped
   order list produce the same figures as before. What changed is the
   composition — five zones on their own sub-surfaces instead of four stacked
   bands — plus a ring in place of the flat distribution line, a peak-aware
   chart, and status mini-cards.

   ── WHAT IS STILL DELIBERATELY ABSENT ────────────────────────────────────
     • Week / Month selectors. The order store keeps no history.
     • Trend arrows, "vs yesterday", growth percentages.
     • An "Other" payment bucket. Method rows come from revenue.byMethod,
       which lists a method when it is enabled OR has real records, so money
       can never be hidden and nothing is invented to fill a third tile.
   ═══════════════════════════════════════════════════════════════════════ */

/* Short forms for the compact surfaces; the full names do not fit. A method
   with no short form falls back to its full label rather than being dropped. */
const METHOD_SHORT_KEY = {
  cash_at_table: "payment.cashShort",
  card_at_table: "payment.cardShort",
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
 * Cash / Card distribution as a ring.
 *
 * ── WHY A RING, AND WHY SVG HERE BUT NOT FOR THE CHART ───────────────────
 *   The chart is 24 bars whose heights must stay truthful at any width, and
 *   CSS percentages do that with no viewBox to fight. A ring is one fixed
 *   square of artwork whose proportions never change, which is exactly the
 *   case SVG is good at: two stroke-dasharray arcs on one circle, no path
 *   maths, no library, and it scales cleanly to any size.
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
function PaymentRing({ methods, collected, t }) {
  const visible = methods.filter((method) => method.amount > 0);
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
          {t("admin.collected", "Collected")}
        </span>
        <span className="ad-ring__center-value">{fmtPrice(collected)}</span>
      </div>
    </div>
  );
}

/**
 * Hourly revenue, drawn as CSS bars rather than an SVG path.
 *
 * Unchanged from Phase 100.1 in both data and technique — bars because
 * hourly revenue is a set of discrete sums and a line would draw values that
 * were never earned, CSS because a percentage height in a flex row cannot
 * overflow its container and keeps the axis as real text in both themes.
 *
 * Phase 100.2 adds only emphasis: the peak hour is marked so the busiest
 * stretch is findable at a glance instead of having to be compared by eye.
 *
 * Reading it without a mouse (§5/§17): the peak is printed above the chart as
 * text, each column carries an ordinary title for desktop hover, and the
 * whole chart has a role="img" summary.
 */
function HourlyRevenueChart({ buckets, peak, peakHour, t }) {
  return (
    <div
      className="ad-chart"
      role="img"
      aria-label={t("admin.revenueThroughoutToday", "Revenue Throughout Today")}
    >
      <div className="ad-chart__grid" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className="ad-chart__bars">
        {buckets.map((bucket) => {
          /* peak is 0 only when the caller has already switched to the empty
             state; the guard keeps this component safe on its own. An hour
             with takings always gets at least 3% so the smallest real amount
             stays visible rather than rounding away to nothing. */
          const ratio = peak > 0 ? bucket.total / peak : 0;
          const height = bucket.total > 0 ? `${Math.max(3, ratio * 100)}%` : "0%";
          const isPeak = bucket.total > 0 && bucket.hour === peakHour;
          return (
            <span
              key={bucket.hour}
              className="ad-chart__col"
              title={`${hourLabel(bucket.hour)}:00 — ${fmtPrice(bucket.total)}`}
            >
              <span
                className="ad-chart__bar"
                style={{ height }}
                data-empty={bucket.total > 0 ? undefined : "true"}
                data-peak={isPeak ? "true" : undefined}
              />
            </span>
          );
        })}
      </div>

      {/* Four ticks, not twenty-four: enough to locate a bar in time without
          becoming a wall of numbers at 390px. */}
      <div className="ad-chart__axis" aria-hidden="true">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

/**
 * Props — unchanged from Phase 100.1.
 *   revenue      — summarizeRevenue() over today's orders
 *   orders       — that SAME today-scoped list, for the hourly buckets
 *   timeZone     — the restaurant's IANA zone
 *   onOpenDetail — opens the existing Revenue Today drill-down
 */
export default function RevenueAnalytics({ revenue, orders, timeZone, onOpenDetail }) {
  const { t } = useLanguage();

  const hourly = useMemo(
    () => summarizeRevenueByHour(orders || [], timeZone),
    [orders, timeZone]
  );
  const aov = averageOrderValue(revenue);
  const methods = revenueMethodShares(revenue);

  const hasRevenue = revenue.total > 0;
  const hasCollected = revenue.collected > 0;

  return (
    <section className="ad-rev anim-rise" aria-labelledby="ad-rev-title">
      {/* ── A. Header ─────────────────────────────────────────────────── */}
      <header className="ad-rev__head">
        <div className="ad-rev__heading">
          <h2 className="ad-rev__title" id="ad-rev-title">
            {t("admin.revenueAnalytics", "Revenue Analytics")}
          </h2>
          {/* The period is stated, not chosen: Today is the only scope this
              section can compute honestly. */}
          <p className="ad-rev__context">{t("admin.filterToday", "Today")}</p>
        </div>
        <button
          type="button"
          className="ad-rev__detail"
          onClick={onOpenDetail}
          aria-haspopup="dialog"
        >
          {t("admin.viewBreakdown", "View breakdown")}
          <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      {/* ── B + C. Primary summary and chart ──────────────────────────── */}
      <div className="ad-rev__top">
        <div className="ad-rev__summary">
          <span className="ad-rev__label">
            {t("admin.totalRevenue", "Total Revenue")}
          </span>
          <span className="ad-rev__total">{fmtPrice(revenue.total)}</span>

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
                <span className="ad-rev__mini-value">{revenue.paidCount}</span>
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
                <span className="ad-rev__mini-value">
                  {aov === null ? "—" : fmtPrice(aov)}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="ad-rev__panel">
          <div className="ad-rev__panel-head">
            <span className="ad-rev__panel-title">
              {t("admin.revenueThroughoutToday", "Revenue Throughout Today")}
            </span>
            {hasRevenue && hourly.peakHour !== null && (
              <span className="ad-rev__peak">
                <TrendingUp size={12} strokeWidth={2} aria-hidden="true" />
                {t("admin.peakHour", "Peak")} {hourLabel(hourly.peakHour)}:00
                <strong>{fmtPrice(hourly.peak)}</strong>
              </span>
            )}
          </div>

          {hasRevenue ? (
            <HourlyRevenueChart
              buckets={hourly.buckets}
              peak={hourly.peak}
              peakHour={hourly.peakHour}
              t={t}
            />
          ) : (
            <p className="ad-rev__empty">
              {t("admin.noRevenueToday", "No revenue recorded today yet.")}
            </p>
          )}

          {/* Only ever shown if money genuinely could not be placed on the
              clock. Silence here means the chart sums to the total above. */}
          {hourly.unplaced > 0 && (
            <p className="ad-rev__note">
              {t("admin.revenueUnplaced", "Not shown on the chart:")}{" "}
              {fmtPrice(hourly.unplaced)}
            </p>
          )}
        </div>
      </div>

      {/* ── D + E. Payment methods and revenue status ─────────────────── */}
      <div className="ad-rev__bottom">
        <div className="ad-rev__panel">
          <div className="ad-rev__panel-head">
            <span className="ad-rev__panel-title">
              {t("admin.paymentMethodsSection", "Payment Methods")}
            </span>
          </div>

          <div className="ad-rev__pay-body">
            <PaymentRing methods={methods} collected={revenue.collected} t={t} />

            {/* The ring is decorative; this legend is where the values live. */}
            <ul className="ad-rev__legend">
              {methods.map((method) => {
                const Icon = METHOD_ICON[method.id] || Wallet;
                const tone = METHOD_TONE[method.id] || "other";
                return (
                  <li className="ad-rev__legend-row" key={method.id}>
                    <span
                      className={`ad-rev__dot ad-rev__dot--${tone}`}
                      aria-hidden="true"
                    />
                    <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
                    <span className="ad-rev__legend-label">
                      {shortLabel(t, method.id)}
                    </span>
                    <span className="ad-rev__legend-share">
                      {hasCollected ? `${Math.round(method.share * 100)}%` : "—"}
                    </span>
                    <span className="ad-rev__legend-value">
                      {fmtPrice(method.amount)}
                    </span>
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
            <span className="ad-rev__stat-value">{fmtPrice(revenue.collected)}</span>
          </div>
          <div className="ad-rev__stat ad-rev__stat--pending">
            <span className="ad-rev__stat-label">
              {t("payment.pendingAtTable", "Pending at table")}
            </span>
            <span className="ad-rev__stat-value">{fmtPrice(revenue.pending)}</span>
          </div>
          <div className="ad-rev__stat ad-rev__stat--total">
            <span className="ad-rev__stat-label">
              {t("admin.totalRevenue", "Total Revenue")}
            </span>
            <span className="ad-rev__stat-value">{fmtPrice(revenue.total)}</span>
          </div>
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
