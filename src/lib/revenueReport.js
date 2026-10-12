import {
  summarizeRevenue,
  summarizeTopItems,
  summarizePeakTimes,
  summarizeStatusRevenue,
  summarizeRevenueByHour,
  summarizeRevenueByDayKey,
  averageOrderValue,
  revenueDistribution,
} from "./dashboardStats.js";
import { listRangeKeys } from "./revenuePeriods.js";

/**
 * revenueReport — Phase 111.1
 *
 * One model, built once, read by both language pages.
 *
 * ── WHY THIS IS A MODULE AND NOT A COMPONENT ────────────────────────────
 * The report is printed in English and in Arabic, and §11.2 requires the two
 * pages to agree about every figure. The only way to guarantee that is for
 * there to be nothing to disagree about: both pages render THIS object, and
 * neither of them can compute a total of its own.
 *
 * ── THE SNAPSHOT ────────────────────────────────────────────────────────
 * The order array is captured when the reader presses View Report and is
 * never re-filtered here. The four-second poll on the dashboard keeps
 * producing new arrays; this one keeps pointing at the list that existed at
 * that moment, so a report cannot change its own totals while someone is
 * reading or printing it.
 *
 * ── THE SAME ARITHMETIC AS THE DASHBOARD ────────────────────────────────
 * Every figure comes from the summarize* helpers the Revenue Analytics
 * section already uses, over the list the section already filtered. There is
 * no second business-day interpretation in this file — it does not know what
 * a business day is, which is precisely what stops it inventing one.
 *
 * @param {object} snapshot
 * @param {Array<object>} snapshot.orders — already scoped to the period
 * @param {object} snapshot.range — from revenuePeriods.getPeriodRange
 * @param {string} snapshot.timeZone
 * @param {Date}   snapshot.generatedAt
 * @returns {object} the complete report model
 */
export function buildRevenueReport({ orders, range, timeZone, generatedAt }) {
  const list = orders || [];
  const revenue = summarizeRevenue(list);
  const isDay = range?.type === "day";
  const dayKeys = isDay ? [] : listRangeKeys(range);

  const chart = isDay
    ? summarizeRevenueByHour(list, timeZone)
    : summarizeRevenueByDayKey(list, timeZone, dayKeys);

  const statusRows = summarizeStatusRevenue(list);
  const completed = statusRows.find((row) => row.status === "delivered")?.orders || 0;

  return {
    range,
    timeZone,
    generatedAt,

    revenue,
    aov: averageOrderValue(revenue),
    distribution: revenueDistribution(revenue),

    statusRows,
    /* Stated separately because the report calls them out in prose: the
       orders revenue is built from, and the ones deliberately left out. */
    countedOrders: revenue.countedOrders,
    canceledOrders: revenue.canceledCount,
    completedOrders: completed,

    topItems: summarizeTopItems(list, 5),
    peakTimes: summarizePeakTimes(list, timeZone, 3),

    chart,
    chartKind: isDay ? "hour" : "day",
    dayKeys,
  };
}

/**
 * A short plain-text summary of a report, for the Share action.
 *
 * Deliberately text and not a link: a PRO-ORDER admin route is private and
 * would be useless — or worse, confusing — to whoever receives it (§12.3).
 * This carries the figures themselves, which is what someone asking for
 * "the numbers for last week" actually wants in a message.
 */
export function reportShareText(model, { restaurantName, periodLabel, money, strings }) {
  const lines = [
    `${restaurantName} — ${strings.title}`,
    `${strings.period}: ${periodLabel}`,
    "",
    `${strings.total}: ${money(model.revenue.total)}`,
    `${strings.collected}: ${money(model.revenue.collected)}`,
    `${strings.pending}: ${money(model.revenue.pending)}`,
    `${strings.orders}: ${model.countedOrders}`,
    `${strings.aov}: ${model.aov === null ? "—" : money(model.aov)}`,
  ];
  return lines.join("\n");
}
