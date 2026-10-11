import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import { formatHourRange } from "../../i18n/dateFormat.js";

/* ═══════════════════════════════════════════════════════════════════════════
   RevenueMiniTables — Phase 111.0

   Top Selling Items and Peak Times, written once and rendered in both places
   that need them: the Revenue Analytics section and the Revenue Details
   overlay. Two copies of this markup would be two chances for the overlay to
   disagree with the card that opened it.

   ── WHY REAL TABLES ──────────────────────────────────────────────────────
   Three columns of numbers under three headings IS a table, and a screen
   reader announcing "Qty, 42" is the whole reason §15 asks for a column
   heading instead of writing "42 sold" into the row. A grid of divs would
   look identical and say nothing.

   ── DENSITY (§16) ────────────────────────────────────────────────────────
   Five rows and three rows respectively, each one line tall. The panels take
   the height of their content and no more; nothing here reserves space for
   rows that do not exist, which is what kept the old breakdown so tall.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Top 5 products for the selected period.
 *
 * The name column is the one that may truncate (§21): a dish can be called
 * anything, while Qty and Revenue are short and must stay fully readable.
 *
 * @param {Array<{itemId:string,name:string,qty:number,revenue:number}>} rows
 */
export function TopItemsPanel({ rows }) {
  const { t } = useLanguage();

  return (
    <div className="ad-rev__panel ad-mini">
      <div className="ad-rev__panel-head">
        <span className="ad-rev__panel-title">
          {t("admin.topSellingItems", "Top Selling Items")}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="ad-mini__empty">
          {t("admin.noSalesInPeriod", "No sales in this period yet.")}
        </p>
      ) : (
        <table className="ad-mini__table ad-mini__table--items">
          <thead>
            <tr>
              <th scope="col">{t("admin.colItem", "Item")}</th>
              <th scope="col" className="ad-mini__num">{t("admin.colQty", "Qty")}</th>
              <th scope="col" className="ad-mini__num">{t("admin.colRevenue", "Revenue")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.itemId}>
                {/* The product name is row-scoped so "Qty 42" is announced
                    against the dish it belongs to rather than on its own. */}
                <th scope="row" className="ad-mini__name" title={row.name}>
                  {row.name}
                </th>
                <td className="ad-mini__num">{row.qty}</td>
                <td className="ad-mini__num ad-mini__money">{fmtPrice(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Top 3 busiest hours for the selected period, by order count.
 *
 * @param {Array<{hour:number,orders:number}>} rows
 */
export function PeakTimesPanel({ rows }) {
  const { t, language } = useLanguage();

  return (
    <div className="ad-rev__panel ad-mini">
      <div className="ad-rev__panel-head">
        <span className="ad-rev__panel-title">
          {t("admin.peakTimes", "Peak Times")}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="ad-mini__empty">
          {t("admin.noOrdersInPeriod", "No orders in this period yet.")}
        </p>
      ) : (
        <table className="ad-mini__table ad-mini__table--peak">
          <thead>
            <tr>
              <th scope="col">{t("admin.colTime", "Time")}</th>
              <th scope="col" className="ad-mini__num">{t("admin.colOrders", "Orders")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.hour}>
                <th scope="row" className="ad-mini__name">
                  {formatHourRange(row.hour, language)}
                </th>
                <td className="ad-mini__num">{row.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
