import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { translate } from "../../i18n/translate.js";
import { fmtPrice } from "../../lib/format.js";
import { formatPeriodLabel, formatDayKeyLabel, keyParts } from "../../lib/revenuePeriods.js";
import { formatHourRange } from "../../i18n/dateFormat.js";
import { isSafeImageSrc } from "../../lib/safeImage.js";
import { describeMetric } from "../../lib/revenueComparison.js";
import { niceScale, formatTick } from "../../lib/chartScale.js";
import { brandMarkDataUrl } from "../../lib/reportBrand.js";
import { QaPaperNotice, QaPaperWatermark } from "../../dev/QaPreviewBadge.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   RevenueReportPage — Phase 111.1

   ONE A4 page of the bilingual report, in one language.

   Rendered twice — English then Arabic — from the SAME model object, which
   is why the two pages cannot disagree about a single figure (§11.2). This
   component computes nothing; it formats.

   ── WHY IT TAKES A LANGUAGE INSTEAD OF READING ONE ──────────────────────
   The report is bilingual whatever the interface is set to, so neither page
   may follow useLanguage(). Each is handed its language and resolves its own
   strings, its own date formats and its own direction from it.

   ── PRINT FIRST ─────────────────────────────────────────────────────────
   The layout is designed for A4 and then shown on screen, not the other way
   round: fixed page box, white ground, dark text, hairline table rules. What
   the reader sees in the browser is what comes out of the printer, which is
   the only way the two-page guarantee can be checked without printing.
   ═══════════════════════════════════════════════════════════════════════ */

const STATUS_FALLBACK = {
  received: "Received", preparing: "Preparing", ready: "Ready",
  delivered: "Delivered", canceled: "Canceled",
};

/* The date and time a report was generated, on the RESTAURANT's clock.
   An invalid or missing zone falls back to Asia/Amman, the same chain
   businessDay.js uses — never to the device, which would put a different
   time on the same report depending on who printed it. */
function formatInRestaurantZone(date, timeZone, locale, options) {
  const opts = { ...options, timeZone: timeZone || "Asia/Amman" };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "Asia/Amman" }).format(date);
  }
}



const DELTA_ICON = { up: ArrowUp, down: ArrowDown, flat: Minus };

/**
 * One metric's movement, printed under the figure it belongs to.
 *
 * ── GREY IS A MEANING, NOT AN ABSENCE ────────────────────────────────────
 * Up is green and down is red for revenue, orders and average order value.
 * Pending keeps its arrow and loses its colour: more money still owed at the
 * table is not an achievement, and colouring it green would be the report
 * telling the owner something it does not know.
 *
 * ── AND IT HAS TO SURVIVE A BLACK AND WHITE PRINTER ──────────────────────
 * Every state is carried by text as well as by colour: a signed percentage,
 * a signed amount, or a word. The arrow and the tint are the quick read; the
 * sign is the record.
 */
function ReportDelta({ metric, kind, money, T }) {
  if (!metric) return null;
  const Icon = DELTA_ICON[metric.direction] || Minus;
  const { main, absolute } = describeMetric(metric, {
    kind,
    money,
    labels: {
      new: T("admin.comparisonNew", "New"),
      unchanged: T("admin.comparisonUnchanged", "Unchanged"),
      noBaseline: T("admin.comparisonNoBaseline", "No baseline"),
    },
  });

  return (
    <span className={`rep-delta rep-delta--${metric.tone}`}>
      <Icon size={9} strokeWidth={2.6} aria-hidden="true" />
      <span className="rep-delta__main" dir="ltr">{main}</span>
      {absolute && <span className="rep-delta__abs" dir="ltr">{absolute}</span>}
    </span>
  );
}

/**
 * The labels under the plot, mapped to bucket INDICES rather than spread
 * across the card.
 *
 * ── WHY INDICES AND NOT EVEN SPACING ─────────────────────────────────────
 * A label is a claim about a bar. Distributing five captions evenly across
 * the chart's width would put "12" wherever the twelfth of the width falls,
 * which is only the twelfth bucket by coincidence — and never is, once the
 * plot carries side padding or a month has 31 days. Each tick therefore
 * names the bucket it sits on and is centred on that bucket's own column.
 *
 *   day    five sparse hours — 00, 06, 12, 18, 23 — over all 24 bars
 *   week   all seven days, Sunday to Saturday, from the buckets' own keys
 *   month  the 1st, 7th, 14th, 21st, 28th and the real last day when it is
 *          clear of the 28th, so February is not given a 30th
 *
 * Nothing here chooses buckets; it only reads the ones the model already
 * built, so a label cannot describe a bar that is not there.
 */
function xAxisTicks(model, buckets, language) {
  const count = buckets.length;
  if (count === 0) return [];

  if (model.chartKind === "hour") {
    return [0, 6, 12, 18, 23]
      .filter((hour) => hour < count)
      .map((hour) => ({ index: hour, label: String(hour).padStart(2, "0") }));
  }

  if (model.range.type === "week") {
    return buckets.map((bucket, index) => ({
      index,
      label: formatDayKeyLabel(bucket.id, "week", language),
    }));
  }

  /* The last day earns a tick only when it is at least two days clear of the
     28th; on a 29-day February it would otherwise sit on top of it. */
  const days = [1, 7, 14, 21, 28];
  if (count - 28 >= 2) days.push(count);
  return days
    .filter((day) => day <= count)
    .map((day) => ({
      index: day - 1,
      /* Read back off the bucket's own key rather than printed from the
         loop counter, so the number under a bar is that bar's date. */
      label: String(keyParts(buckets[day - 1].id).day),
    }));
}

/** A compact bar strip: the period's shape, not a second interactive chart. */
function ReportChart({ model, currency, language }) {
  const buckets = model.chartKind === "hour"
    ? model.chart.buckets.map((b) => ({ id: b.hour, total: b.total, peak: b.hour === model.chart.peakHour }))
    : model.chart.buckets.map((b) => ({ id: b.key, total: b.total, peak: b.key === model.chart.peakKey }));
  const { top, ticks, decimals } = niceScale(model.chart.peak || 0);
  const xTicks = xAxisTicks(model, buckets, language);

  return (
    <div className="rep-chart-wrap">
      {/* Each label is placed at the height its own value represents — the
          same fraction of the plot the bars are drawn to — so a label, the
          gridline beside it and a bar reaching it all mean one thing. */}
      <div className="rep-chart-scale" aria-hidden="true">
        {ticks.map((tick, i) => (
          <span
            className="rep-chart-scale__tick"
            key={tick}
            style={{ bottom: `${(i / Math.max(1, ticks.length - 1)) * 100}%` }}
          >
            {formatTick(tick, decimals)}
          </span>
        ))}
        {/* In the axis band rather than under it: the currency names the
            column of numbers above it and costs the page no height. */}
        <span className="rep-chart-unit">{currency}</span>
      </div>

      <div className="rep-chart" aria-hidden="true">
        <div className="rep-chart__grid">
          {ticks.map((tick) => <span key={tick} />)}
        </div>
        {/* Positioned on the bucket's own centre. inset-inline-start mirrors
            with the bars on the Arabic page, so the chronology never reverses
            away from its labels. */}
        <div className="rep-chart__xaxis" aria-hidden="true">
          {xTicks.map((tick) => (
            <span
              className="rep-chart__xtick"
              key={tick.index}
              style={{ insetInlineStart: `${((tick.index + 0.5) / buckets.length) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div className="rep-chart__bars">
          {buckets.map((bucket) => (
            <span className="rep-chart__col" key={bucket.id}>
              <span
                className={`rep-chart__bar${bucket.peak && bucket.total > 0 ? " rep-chart__bar--peak" : ""}`}
                /* Against the axis top, not the peak, so a bar's height and
                   the gridline beside it mean the same thing. The 2% floor
                   keeps a very small takings visible without lifting it to a
                   value it did not earn. */
                style={{ height: bucket.total > 0 && top > 0 ? `${Math.max(2, (bucket.total / top) * 100)}%` : "0%" }}
              />
            </span>
          ))}
        </div>
      </div>

    </div>
  );
}

/**
 * The PRO·ORDER lockup in the footer.
 *
 * ── WHOSE DOCUMENT IS THIS ───────────────────────────────────────────────
 * The restaurant's. Its name is the masthead at 16pt; this is 7pt at the
 * bottom of the page, which is the whole of the hierarchy argument. But a
 * financial document should say what produced it, so it says so once, in the
 * reader's language, with the real mark rather than a typographic stand-in.
 *
 * The mark arrives asynchronously because it is recoloured through a canvas
 * (see reportBrand.js). Until it does — and if it never does — the
 * attribution prints on its own rather than leaving a broken image behind.
 */
function ReportBrandLockup({ accent, T }) {
  const [mark, setMark] = useState(null);

  useEffect(() => {
    let cancelled = false;
    brandMarkDataUrl(accent).then((url) => { if (!cancelled) setMark(url); });
    return () => { cancelled = true; };
  }, [accent]);

  return (
    <span className="rep-foot__lockup">
      {mark && <img className="rep-foot__mark" src={mark} alt="" />}
      <span className="rep-foot__by">
        {T("admin.reportGeneratedByBrand", "Generated by PRO·ORDER")}
      </span>
    </span>
  );
}

export default function RevenueReportPage({
  language, model, restaurantName, logoUrl, currency, qaPreview, accent,
}) {
  /* DEV ONLY, and folded away entirely in a production build. A synthetic
     financial document must not be able to pass as a real one, so the page
     is marked twice: a wash across the sheet and a sentence under the
     masthead, both inside the printed area. */
  const isQa = import.meta.env.DEV && qaPreview === true;
  const isArabic = language === "ar";
  const T = (key, fallback) => translate(language, key, fallback);
  const locale = isArabic ? "ar" : "en";
  const periodLabel = formatPeriodLabel(model.range, language);

  const generatedDate = formatInRestaurantZone(model.generatedAt, model.timeZone, locale, {
    year: "numeric", month: "long", day: "numeric",
  });
  const generatedTime = formatInRestaurantZone(model.generatedAt, model.timeZone, locale, {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });

  const periodTypeLabel = T(
    model.range.type === "day" ? "admin.periodDay"
      : model.range.type === "week" ? "admin.periodWeek" : "admin.periodMonth",
    model.range.type
  );

  /* The exact boundaries, stated as dates rather than as a friendly range,
     because a financial document should say precisely which days it covers. */
  const boundary = (key) => {
    const { year, month, day } = keyParts(key);
    return formatInRestaurantZone(
      new Date(Date.UTC(year, month - 1, day, 12)), "UTC", locale,
      { year: "numeric", month: "short", day: "numeric" }
    );
  };

  /* Phase 112.2 — the caller resolves an uploaded asset to a data URL, which
     is what html2canvas can actually paint. */
  const hasLogo = isSafeImageSrc(logoUrl);
  const money = (n) => fmtPrice(n);

  /* ── Previous period (Phase 111.4) ───────────────────────────────────
     The comparison was computed once, over the lists frozen with this
     snapshot. This page only decides how to say it. */
  const comparison = model.comparison;
  const metrics = comparison?.metrics || {};
  const vsLabel = T(
    model.range.type === "day" ? "admin.vsPreviousDay"
      : model.range.type === "week" ? "admin.vsPreviousWeek"
        : "admin.vsPreviousMonth",
    model.range.type === "day" ? "vs previous day"
      : model.range.type === "week" ? "vs previous week" : "vs previous month"
  );
  const priorLabel = comparison?.priorRange
    ? formatPeriodLabel(comparison.priorRange, language)
    : null;
  const delta = (id, kind) => (
    <ReportDelta metric={metrics[id]} kind={kind} money={money} T={T} />
  );

  return (
    <section
      className="rep-page"
      lang={language}
      dir={isArabic ? "rtl" : "ltr"}
      /* The restaurant's own colour, already moved far enough to stay
         readable on white. A variable rather than a class, because the
         value belongs to the restaurant and not to the stylesheet. */
      style={accent ? { "--rep-accent": accent } : undefined}
    >
      {isQa && <QaPaperWatermark />}

      {/* ── A. Identity ──────────────────────────────────────────────── */}
      <header className="rep-head">
        <div className="rep-head__brand">
          {hasLogo && <img className="rep-head__logo" src={logoUrl} alt="" />}
          <div className="rep-head__names">
            {/* Phase 112.2c — no name, no heading. The report's own title
                below carries the document's identity, and no restaurant name
                is ever invented for a generated document. */}
            {restaurantName && <h1 className="rep-head__restaurant">{restaurantName}</h1>}
            <p className="rep-head__title">{T("admin.revenueReport", "Revenue Report")}</p>
          </div>
        </div>
        <dl className="rep-head__meta">
          <div><dt>{T("admin.reportPeriod", "Period")}</dt><dd>{periodTypeLabel} · {periodLabel}</dd></div>
          <div><dt>{T("admin.reportCovers", "Covers")}</dt><dd>{boundary(model.range.startKey)} – {boundary(model.range.endKey)}</dd></div>
          <div><dt>{T("admin.reportGeneratedOn", "Generated on")}</dt><dd>{generatedDate}</dd></div>
          <div><dt>{T("admin.reportGeneratedAt", "Generated at")}</dt><dd>{generatedTime}</dd></div>
          <div><dt>{T("admin.reportTimezone", "Timezone")}</dt><dd>{model.timeZone || "Asia/Amman"}</dd></div>
          <div><dt>{T("admin.reportCurrency", "Currency")}</dt><dd>{currency}</dd></div>
        </dl>
      </header>

      {isQa && <QaPaperNotice language={language} />}

      {/* ── B. Financial summary ─────────────────────────────────────── */}
      <h2 className="rep-h2">{T("admin.reportFinancialSummary", "Financial Summary")}</h2>
      <div className="rep-figures">
        <div className="rep-figure rep-figure--lead">
          <span className="rep-figure__label">{T("admin.totalRevenue", "Total Revenue")}</span>
          <span className="rep-figure__value">{money(model.revenue.total)}</span>
          {delta("total", "money")}
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("admin.collected", "Collected")}</span>
          <span className="rep-figure__value">{money(model.revenue.collected)}</span>
          {delta("collected", "money")}
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("payment.pendingAtTable", "Pending at table")}</span>
          <span className="rep-figure__value">{money(model.revenue.pending)}</span>
          {delta("pending", "money")}
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("admin.averageOrderValue", "Average order value")}</span>
          <span className="rep-figure__value">{model.aov === null ? "—" : money(model.aov)}</span>
          {delta("aov", "money")}
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("admin.countedOrders", "Counted orders")}</span>
          <span className="rep-figure__value">{model.countedOrders}</span>
          {delta("countedOrders", "count")}
        </div>
      </div>

      {/* What every delta above is measured against, said once. The period
          is named, not implied: "vs previous week" is a claim, and the
          reader is entitled to know which week. */}
      <p className="rep-vs">
        <span className="rep-vs__label">{vsLabel}</span>
        {priorLabel && comparison.coverage !== "none" && (
          <span className="rep-vs__period">{priorLabel}</span>
        )}
        {comparison?.coverage === "none" && (
          <span className="rep-vs__note">
            {T("admin.comparisonUnavailable", "No recorded orders before this period, so there is nothing to compare against.")}
          </span>
        )}
        {comparison?.coverage === "partial" && (
          <span className="rep-vs__note">
            {T("admin.comparisonPartial", "Records begin inside the previous period, so that comparison is based on partial history.")}
          </span>
        )}
      </p>

      <div className="rep-cols">
        {/* ── D. Payment distribution ────────────────────────────────── */}
        <section className="rep-block">
          <h2 className="rep-h2">{T("admin.paymentDistribution", "Payment Distribution")}</h2>
          <table className="rep-table">
            <thead>
              <tr>
                <th scope="col">{T("admin.colMethod", "Method")}</th>
                <th scope="col" className="rep-num">{T("admin.colOrders", "Orders")}</th>
                <th scope="col" className="rep-num">{T("admin.colRevenue", "Revenue")}</th>
                <th scope="col" className="rep-num">{T("admin.colShare", "Share")}</th>
              </tr>
            </thead>
            <tbody>
              {model.distribution.map((slice) => (
                <tr key={slice.id}>
                  <th scope="row">
                    {slice.kind === "pending"
                      ? T("payment.pendingAtTable", "Pending at table")
                      : T(`payment.${slice.id === "cash_at_table" ? "cashAtTable" : slice.id === "card_at_table" ? "cardAtTable" : "onlinePayment"}`, slice.id)}
                  </th>
                  <td className="rep-num">{slice.count}</td>
                  <td className="rep-num">{money(slice.amount)}</td>
                  <td className="rep-num">
                    {model.revenue.total > 0 ? `${slice.percent}%` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="rep-table__total">
                <th scope="row">{T("admin.totalRevenue", "Total Revenue")}</th>
                <td className="rep-num">{model.countedOrders}</td>
                <td className="rep-num">{money(model.revenue.total)}</td>
                <td className="rep-num">{model.revenue.total > 0 ? "100%" : "—"}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ── C. Order summary ───────────────────────────────────────── */}
        <section className="rep-block">
          <h2 className="rep-h2">{T("admin.orderBreakdown", "Order Breakdown")}</h2>
          <table className="rep-table">
            <thead>
              <tr>
                <th scope="col">{T("admin.colStatus", "Status")}</th>
                <th scope="col" className="rep-num">{T("admin.colOrders", "Orders")}</th>
                <th scope="col" className="rep-num">{T("admin.colRevenue", "Revenue")}</th>
              </tr>
            </thead>
            <tbody>
              {model.statusRows.map((row) => (
                <tr key={row.status}>
                  <th scope="row">{T(`status.${row.status}`, STATUS_FALLBACK[row.status] || row.status)}</th>
                  <td className="rep-num">{row.orders}</td>
                  <td className="rep-num">{row.revenue === null ? "—" : money(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rep-note">
            {T("admin.canceledExcludedNote", "Canceled orders are excluded from revenue.")}
          </p>
        </section>
      </div>

      {/* ── E. Sales performance ─────────────────────────────────────── */}
      <h2 className="rep-h2">
        {model.chartKind === "hour"
          ? T("admin.revenueByHour", "Revenue by hour")
          : T("admin.revenueByDay", "Revenue by day")}
      </h2>
      {model.revenue.total > 0 ? (
        <>
          <ReportChart model={model} currency={currency} language={language} />
          <p className="rep-chart__caption">
            {T("admin.peakHour", "Peak")}
            {": "}
            {model.chartKind === "hour"
              ? (model.chart.peakHour === null ? "—" : formatHourRange(model.chart.peakHour, language))
              : (model.chart.peakKey ? formatDayKeyLabel(model.chart.peakKey, model.range.type, language) : "—")}
            {" · "}
            {money(model.chart.peak)}
          </p>
        </>
      ) : (
        <p className="rep-empty">{T("admin.noRevenueInPeriod", "No revenue recorded in this period yet.")}</p>
      )}

      <div className="rep-cols">
        <section className="rep-block">
          <h2 className="rep-h2">{T("admin.topSellingItems", "Top Selling Items")}</h2>
          {model.topItems.length === 0 ? (
            <p className="rep-empty">{T("admin.noSalesInPeriod", "No sales in this period yet.")}</p>
          ) : (
            <table className="rep-table">
              <thead>
                <tr>
                  <th scope="col">{T("admin.colItem", "Item")}</th>
                  <th scope="col" className="rep-num">{T("admin.colQty", "Qty")}</th>
                  <th scope="col" className="rep-num">{T("admin.colRevenue", "Revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {model.topItems.map((row) => (
                  <tr key={row.itemId}>
                    <th scope="row" className="rep-name">{row.name}</th>
                    <td className="rep-num">{row.qty}</td>
                    <td className="rep-num">{money(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── F. Peak hours ──────────────────────────────────────────── */}
        <section className="rep-block">
          <h2 className="rep-h2">{T("admin.peakTimes", "Peak Times")}</h2>
          {model.peakTimes.length === 0 ? (
            <p className="rep-empty">{T("admin.noOrdersInPeriod", "No orders in this period yet.")}</p>
          ) : (
            <table className="rep-table">
              <thead>
                <tr>
                  <th scope="col">{T("admin.colTime", "Time")}</th>
                  <th scope="col" className="rep-num">{T("admin.colOrders", "Orders")}</th>
                </tr>
              </thead>
              <tbody>
                {model.peakTimes.map((row) => (
                  <tr key={row.hour}>
                    <th scope="row">{formatHourRange(row.hour, language)}</th>
                    <td className="rep-num">{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <footer className="rep-foot">
        {/* Stated rather than left to be discovered: the item table adds up to
            item takings, while Total Revenue is order totals and carries the
            service charge, so the two are not meant to match. */}
        <span className="rep-foot__note">
          {T("admin.reportItemNote", "Item revenue is line revenue and excludes order-level service charge.")}
        </span>
        <ReportBrandLockup accent={accent} T={T} />
      </footer>
    </section>
  );
}
