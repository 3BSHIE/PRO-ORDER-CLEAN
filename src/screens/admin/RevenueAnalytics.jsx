import { useMemo } from "react";
import { ChevronRight, Banknote, CreditCard, Wallet, TrendingUp } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import {
  summarizeRevenueByHour,
  averageOrderValue,
  revenueMethodShares,
} from "../../lib/dashboardStats.js";

/* ═══════════════════════════════════════════════════════════════════════════
   RevenueAnalytics — Phase 100.1

   The Phase 100.0 Revenue Split card, grown into the Overview's strongest
   block. Everything it draws is derived from the SAME today-scoped order list
   the Revenue Today figure has always used, through the same
   dashboardStats.js functions. No metric here is estimated, compared against
   a period the product does not store, or invented to fill space.

   ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────
     • Week / Month period selectors. See the note in AdminDashboardScreen.
     • Trend arrows, "vs yesterday", growth percentages. The order store keeps
       no historical series, so every one of those would be fabricated.
     • An "Other" payment card. The method rows come from revenue.byMethod,
       which lists a method when it is enabled OR has real records — so no
       money can be hidden, and nothing is invented to make a third tile.
   ═══════════════════════════════════════════════════════════════════════ */

/* Short forms for the compact surfaces; the full labels are far too long
   here. A method with no short form falls back to its full name rather than
   being dropped. */
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

/* Two tones only, both existing tokens. Anything beyond Cash and Card — which
   cannot happen while Online Payment stays disabled, but would if a legacy
   record existed — takes the neutral tone rather than inventing a colour. */
const METHOD_TONE = {
  cash_at_table: "cash",
  card_at_table: "card",
};

/** "09" — a stable two-digit hour for the axis and the bar's own title. */
function hourLabel(hour) {
  return String(hour).padStart(2, "0");
}

/**
 * Hourly revenue, drawn as CSS bars rather than an SVG path.
 *
 * ── WHY BARS, AND WHY NOT SVG ────────────────────────────────────────────
 *   Bars, because hourly revenue is a set of discrete sums. A line or area
 *   between 14:00 and 15:00 draws values that were never earned, and the
 *   brief puts correctness ahead of the reference's aesthetic.
 *
 *   CSS rather than SVG, because a percentage-height div in a flex row is
 *   responsive for free: no viewBox to recompute, no preserveAspectRatio
 *   trade-off between distorted geometry and unreadable scaled text, and no
 *   chance of the drawing overflowing its container on a 390px screen. The
 *   axis labels stay real DOM text at a real font size in both themes.
 *
 * Reading it without a mouse (§14): the peak is printed above the chart as
 * text, so the one figure hover would reveal is already on screen for a
 * phone. The whole chart also carries a role="img" summary for screen
 * readers, and each column an ordinary title for desktop hover.
 */
function HourlyRevenueChart({ buckets, peak, t }) {
  return (
    <div
      className="ad-chart"
      role="img"
      aria-label={t("admin.revenueThroughoutToday", "Revenue Throughout Today")}
    >
      {/* Three reference lines. Purely a reading aid, so it is hidden from
          assistive tech and carries no values of its own. */}
      <div className="ad-chart__grid" aria-hidden="true">
        <span /><span /><span />
      </div>

      <div className="ad-chart__bars">
        {buckets.map((bucket) => {
          /* peak is 0 only when the caller has already switched to the empty
             state, but the guard keeps this component safe on its own. An
             hour with takings always gets at least 2% so the smallest real
             amount is still visible rather than rounding away to nothing. */
          const ratio = peak > 0 ? bucket.total / peak : 0;
          const height = bucket.total > 0 ? `${Math.max(2, ratio * 100)}%` : "0%";
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
 * Props:
 *   revenue    — summarizeRevenue() over today's orders (unchanged calculation)
 *   orders     — that SAME today-scoped list, for the hourly buckets. Passing
 *                both rather than re-filtering here is deliberate: the chart
 *                and the total must be built from one list, not from two
 *                filters that could drift apart.
 *   timeZone   — the restaurant's IANA zone, for the hourly buckets
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
      <header className="ad-rev__head">
        <div className="ad-rev__heading">
          <h2 className="ad-rev__title" id="ad-rev-title">
            {t("admin.revenueAnalytics", "Revenue Analytics")}
          </h2>
          {/* The period is stated, not chosen. Today is the only scope this
              section can compute honestly, and saying so is better than a row
              of selectors that would show the same numbers three times. */}
          <p className="ad-rev__context">
            {t("admin.filterToday", "Today")}
          </p>
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

      <div className="ad-rev__grid">
        {/* ── Primary summary ──────────────────────────────────────────── */}
        <div className="ad-rev__primary">
          <span className="ad-rev__label">
            {t("admin.totalRevenue", "Total Revenue")}
          </span>
          <span className="ad-rev__total">{fmtPrice(revenue.total)}</span>

          {/* Two supporting metrics, not five. Both are exact counts or an
              exactly-defined ratio over the same orders the total covers. */}
          <div className="ad-rev__minis">
            <div className="ad-rev__mini">
              <span className="ad-rev__mini-label">
                {t("admin.paidOrdersCount", "Paid orders")}
              </span>
              <span className="ad-rev__mini-value">{revenue.paidCount}</span>
            </div>
            <div className="ad-rev__mini">
              <span className="ad-rev__mini-label">
                {t("admin.averageOrderValue", "Average order value")}
              </span>
              <span className="ad-rev__mini-value">
                {aov === null ? "—" : fmtPrice(aov)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Hourly chart ─────────────────────────────────────────────── */}
        <div className="ad-rev__chart-wrap">
          <div className="ad-rev__chart-head">
            <span className="ad-rev__chart-title">
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
            <HourlyRevenueChart buckets={hourly.buckets} peak={hourly.peak} t={t} />
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

      {/* ── Payment distribution + payment status ────────────────────────
          Phase 100.0's data-integrity insight, kept and made visual: Cash and
          Card are shares of COLLECTED, and Pending is a separate status, not
          a third method. The bar only ever represents collected money. */}
      <div className="ad-rev__foot">
        <div className="ad-rev__dist">
          <div className="ad-rev__dist-head">
            <span className="ad-rev__dist-label">
              {t("admin.collected", "Collected")}
            </span>
            <span className="ad-rev__dist-value">{fmtPrice(revenue.collected)}</span>
          </div>

          {hasCollected ? (
            <div
              className="ad-rev__bar"
              role="img"
              aria-label={methods
                .map((m) => `${shortLabel(t, m.id)} ${Math.round(m.share * 100)}%`)
                .join(", ")}
            >
              {methods
                .filter((method) => method.amount > 0)
                .map((method) => (
                  <span
                    key={method.id}
                    className={`ad-rev__bar-seg ad-rev__bar-seg--${METHOD_TONE[method.id] || "other"}`}
                    style={{ width: `${method.share * 100}%` }}
                  />
                ))}
            </div>
          ) : (
            <div className="ad-rev__bar ad-rev__bar--empty" aria-hidden="true" />
          )}

          <ul className="ad-rev__legend">
            {methods.map((method) => {
              const Icon = METHOD_ICON[method.id] || Wallet;
              return (
                <li className="ad-rev__legend-row" key={method.id}>
                  <span
                    className={`ad-rev__dot ad-rev__dot--${METHOD_TONE[method.id] || "other"}`}
                    aria-hidden="true"
                  />
                  <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
                  <span className="ad-rev__legend-label">{shortLabel(t, method.id)}</span>
                  <span className="ad-rev__legend-share">
                    {hasCollected ? `${Math.round(method.share * 100)}%` : "—"}
                  </span>
                  <span className="ad-rev__legend-value">{fmtPrice(method.amount)}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Payment status, stated as the arithmetic it is. */}
        <div className="ad-rev__status">
          <div className="ad-rev__status-row">
            <span className="ad-rev__status-label">
              <span className="ad-rev__dot ad-rev__dot--collected" aria-hidden="true" />
              {t("admin.collected", "Collected")}
            </span>
            <span className="ad-rev__status-value">{fmtPrice(revenue.collected)}</span>
          </div>
          <div className="ad-rev__status-row">
            <span className="ad-rev__status-label">
              <span className="ad-rev__dot ad-rev__dot--pending" aria-hidden="true" />
              {t("payment.pendingAtTable", "Pending at table")}
            </span>
            <span className="ad-rev__status-value">{fmtPrice(revenue.pending)}</span>
          </div>
          <div className="ad-rev__status-row ad-rev__status-row--total">
            <span className="ad-rev__status-label">
              {t("admin.totalRevenue", "Total Revenue")}
            </span>
            <span className="ad-rev__status-value">{fmtPrice(revenue.total)}</span>
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
