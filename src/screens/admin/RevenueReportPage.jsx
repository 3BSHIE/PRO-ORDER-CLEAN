import { translate } from "../../i18n/translate.js";
import { fmtPrice } from "../../lib/format.js";
import { formatPeriodLabel, formatDayKeyLabel, keyParts } from "../../lib/revenuePeriods.js";
import { formatHourRange } from "../../i18n/dateFormat.js";
import { isSafeImageUrl } from "../../lib/safeImage.js";

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

/** A compact bar strip: the period's shape, not a second interactive chart. */
function ReportChart({ model, language }) {
  const buckets = model.chartKind === "hour"
    ? model.chart.buckets.map((b) => ({ id: b.hour, total: b.total }))
    : model.chart.buckets.map((b) => ({ id: b.key, total: b.total }));
  const peak = model.chart.peak || 0;

  return (
    <div className="rep-chart" aria-hidden="true">
      {buckets.map((bucket) => (
        <span className="rep-chart__col" key={bucket.id}>
          <span
            className="rep-chart__bar"
            style={{ height: bucket.total > 0 ? `${Math.max(4, (bucket.total / peak) * 100)}%` : "0%" }}
          />
        </span>
      ))}
    </div>
  );
}

export default function RevenueReportPage({
  language, model, restaurantName, logoUrl, currency,
}) {
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

  const hasLogo = isSafeImageUrl(logoUrl);
  const money = (n) => fmtPrice(n);

  return (
    <section className="rep-page" lang={language} dir={isArabic ? "rtl" : "ltr"}>
      {/* ── A. Identity ──────────────────────────────────────────────── */}
      <header className="rep-head">
        <div className="rep-head__brand">
          {hasLogo && <img className="rep-head__logo" src={logoUrl} alt="" />}
          <div className="rep-head__names">
            <h1 className="rep-head__restaurant">{restaurantName}</h1>
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

      {/* ── B. Financial summary ─────────────────────────────────────── */}
      <h2 className="rep-h2">{T("admin.reportFinancialSummary", "Financial Summary")}</h2>
      <div className="rep-figures">
        <div className="rep-figure rep-figure--lead">
          <span className="rep-figure__label">{T("admin.totalRevenue", "Total Revenue")}</span>
          <span className="rep-figure__value">{money(model.revenue.total)}</span>
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("admin.collected", "Collected")}</span>
          <span className="rep-figure__value">{money(model.revenue.collected)}</span>
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("payment.pendingAtTable", "Pending at table")}</span>
          <span className="rep-figure__value">{money(model.revenue.pending)}</span>
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("admin.averageOrderValue", "Average order value")}</span>
          <span className="rep-figure__value">{model.aov === null ? "—" : money(model.aov)}</span>
        </div>
        <div className="rep-figure">
          <span className="rep-figure__label">{T("admin.countedOrders", "Counted orders")}</span>
          <span className="rep-figure__value">{model.countedOrders}</span>
        </div>
      </div>

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
          <ReportChart model={model} language={language} />
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
        <span>{T("admin.reportItemNote", "Item revenue is line revenue and excludes order-level service charge.")}</span>
        <span className="rep-foot__brand">PRO·ORDER</span>
      </footer>
    </section>
  );
}
