import { summarizeRevenue, averageOrderValue } from "./dashboardStats.js";
import { getBusinessDayKey } from "./businessDay.js";
import { getPeriodRange, shiftAnchor } from "./revenuePeriods.js";

/**
 * revenueComparison — Phase 111.4
 *
 * One comparison engine, read by the Revenue Report and by the Revenue
 * Breakdown overlay. Neither of them computes a delta of its own, for the
 * same reason the two report pages share one model: two accounting engines
 * eventually disagree, and a financial document that contradicts the screen
 * it was opened from is worse than no comparison at all.
 *
 * ── WHAT "PREVIOUS" MEANS ────────────────────────────────────────────────
 * The immediately preceding period of the SAME kind, never a rolling window:
 *
 *   day   → the previous business day (04:00 rollover, restaurant clock)
 *   week  → the preceding Sunday–Saturday week
 *   month → the preceding calendar month, whatever its length
 *
 * That is `shiftAnchor(anchor, type, -1)` through the same revenuePeriods
 * arithmetic the forward/back arrows already use, so the boundaries here are
 * the boundaries the manager steps through — including across months and
 * across a new year.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────
 * It will not invent a baseline. A previous period of zero and a previous
 * period that predates every order this browser has ever stored are
 * different facts, and both are different from "down 100%". The three are
 * reported as three different states.
 */

/** Growing a figure is good news; growing what is still owed is not. */
const NEUTRAL_METRICS = new Set(["pending"]);

/**
 * The first business day this browser holds any order for.
 *
 * The order store is never pruned, so its earliest record is the honest edge
 * of local history. A previous period that ends before this is not a quiet
 * month — it is a month nobody here has the data for, and saying so is the
 * difference between a report and a guess.
 *
 * @returns {string|null} a business-day key, or null when there are no orders
 */
export function historyStartKey(orders, timeZone) {
  let earliest = null;
  for (const order of orders || []) {
    /* createdAt, because that is the field filterOrdersToPeriod places on
       the clock. A second opinion about when an order happened is how two
       surfaces start disagreeing. */
    if (!order?.createdAt) continue;
    const key = getBusinessDayKey(timeZone, order.createdAt);
    if (!key) continue;
    if (earliest === null || key < earliest) earliest = key;
  }
  return earliest;
}

/**
 * How much of `range` local history can actually speak for.
 *
 * "full"    — the whole range sits inside recorded history
 * "partial" — history begins somewhere inside it
 * "none"    — the range ends before the first record this browser holds
 */
export function rangeCoverage(range, startKey) {
  if (!range) return "none";
  if (!startKey) return "none";
  if (range.endKey < startKey) return "none";
  if (range.startKey < startKey) return "partial";
  return "full";
}

/** The period immediately before this one, same kind. */
export function previousRange(range) {
  if (!range) return null;
  return getPeriodRange(shiftAnchor(range.anchor, range.type, -1), range.type);
}

/**
 * One metric's movement.
 *
 * @param {number|null} current
 * @param {number|null} previous
 * @param {string} id
 * @param {string} coverage — rangeCoverage() for the PREVIOUS range
 * @returns {{id:string, current:number|null, previous:number|null,
 *            delta:number|null, percent:number|null,
 *            direction:"up"|"down"|"flat",
 *            state:"ok"|"new"|"unavailable",
 *            tone:"positive"|"negative"|"neutral"}}
 */
export function compareMetric(id, current, previous, coverage) {
  const neutral = NEUTRAL_METRICS.has(id);
  const base = { id, current, previous, delta: null, percent: null };

  /* Nothing to compare against, and nothing that may be read as a decline. */
  if (coverage === "none" || previous === null || previous === undefined) {
    return { ...base, previous: null, direction: "flat", state: "unavailable", tone: "neutral" };
  }

  /* The CURRENT side can be absent too: average order value over no orders is
     not zero, it is undefined, and printing it as a 100% collapse would be a
     statement nobody made. */
  if (current === null || current === undefined) {
    return { ...base, current: null, direction: "flat", state: "unavailable", tone: "neutral" };
  }

  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const delta = round3(cur - prev);
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone = neutral || direction === "flat"
    ? "neutral"
    : direction === "up" ? "positive" : "negative";

  /* A percentage of nothing is not 100%, and it is certainly not Infinity.
     The absolute figure is still true, so it is what gets shown. */
  if (prev === 0) {
    if (cur === 0) {
      return { ...base, delta: 0, direction: "flat", state: "ok", tone: "neutral" };
    }
    return { ...base, delta, direction, state: "new", tone };
  }

  return {
    ...base,
    delta,
    percent: round1((delta / prev) * 100),
    direction,
    state: "ok",
    tone,
  };
}

/**
 * Compare one period's orders with the period before it.
 *
 * Both lists are already scoped by the caller — this module does not filter,
 * for the same reason revenueReport.js does not: there must be exactly one
 * place in the product that decides which orders belong to a period.
 *
 * @param {object} options
 * @param {Array<object>} options.currentOrders — the selected period's orders
 * @param {Array<object>} options.previousOrders — the preceding period's
 * @param {object} options.range — the selected period's range
 * @param {object} options.priorRange — the preceding period's range
 * @param {string} options.coverage — rangeCoverage() for priorRange
 * @returns {object} the comparison model both surfaces render
 */
export function buildComparison({
  currentOrders, previousOrders, range, priorRange, coverage = "full",
}) {
  const current = summarizeRevenue(currentOrders || []);
  const previous = summarizeRevenue(previousOrders || []);
  const currentAov = averageOrderValue(current);
  const previousAov = averageOrderValue(previous);

  /* AOV over no orders is not zero — there was no average. It is handed in as
     null so compareMetric reports it as a missing baseline rather than as a
     fall from nothing. */
  const metricsList = [
    compareMetric("total", current.total, previous.total, coverage),
    compareMetric("collected", current.collected, previous.collected, coverage),
    compareMetric("pending", current.pending, previous.pending, coverage),
    compareMetric("countedOrders", current.countedOrders, previous.countedOrders, coverage),
    compareMetric("paidCount", current.paidCount, previous.paidCount, coverage),
    compareMetric("aov", currentAov, previousAov, coverage),
  ];

  const metrics = {};
  for (const metric of metricsList) metrics[metric.id] = metric;

  return {
    type: range?.type || "day",
    range: range || null,
    priorRange: priorRange || null,
    coverage,
    previousRevenue: previous,
    metrics,
  };
}

/* U+2212, the real minus sign: a hyphen beside a digit at 7pt reads as a
   dash in the middle of a word. */
export const MINUS = "−";

/** "+12.5%" / "−3%" / "0%" — one decimal only where it carries information. */
export function formatPercent(percent) {
  const rounded = Math.abs(percent) < 10
    ? Math.round(percent * 10) / 10
    : Math.round(percent);
  const text = String(Math.abs(rounded));
  if (rounded > 0) return `+${text}%`;
  if (rounded < 0) return `${MINUS}${text}%`;
  return "0%";
}

/** "+JOD 73.400" / "−2" — the sign is what survives a black and white print. */
export function formatSigned(value, format) {
  const magnitude = format(Math.abs(value));
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `${MINUS}${magnitude}`;
  return magnitude;
}

/**
 * What a metric's movement SAYS — shared by the report and the Breakdown so
 * the same figure is never described two ways.
 *
 * @param {object} metric — from buildComparison().metrics
 * @param {object} options
 * @param {"money"|"count"} options.kind
 * @param {(n:number)=>string} options.money
 * @param {{new:string, unchanged:string, noBaseline:string}} options.labels
 * @returns {{direction:string, tone:string, main:string, absolute:string|null}}
 */
export function describeMetric(metric, { kind, money, labels }) {
  if (!metric) return null;
  const format = kind === "money" ? money : (n) => String(Math.round(n));
  const base = { direction: metric.direction, tone: metric.tone };

  /* Nothing to measure against. Not a fall, not a rise — unknown, and said
     as a word rather than as a number nobody can check. */
  if (metric.state === "unavailable") {
    return { ...base, main: labels.noBaseline, absolute: null };
  }
  /* A rise from zero has no percentage: 100% of nothing is nothing. The
     whole figure IS the increase, so that is what gets printed. */
  if (metric.state === "new") {
    return { ...base, main: labels.new, absolute: formatSigned(metric.delta, format) };
  }
  if (metric.direction === "flat") {
    return { ...base, main: labels.unchanged, absolute: null };
  }
  return {
    ...base,
    main: formatPercent(metric.percent),
    absolute: formatSigned(metric.delta, format),
  };
}

/* Counts must stay integers; money keeps the three decimals JOD is printed
   with, so a delta can be added back to the previous figure and land exactly
   on the current one. */
function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
