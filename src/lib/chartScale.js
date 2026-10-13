/**
 * chartScale — Phase 111.5
 *
 * The value axis, shared by the Revenue Report's printed chart and the live
 * Revenue Analytics chart.
 *
 * ── WHY IT MOVED HERE ───────────────────────────────────────────────────
 * Phase 111.4 wrote niceScale() inside RevenueReportPage because only the
 * report had an axis. Now both charts have one, and two charts that measure
 * the same money against two different ladders would be worse than no axis
 * at all. One implementation, one set of rules, both surfaces.
 */

/**
 * A value axis a reader can actually measure a bar against.
 *
 * ── WHY THE TOP IS NOT THE PEAK ──────────────────────────────────────────
 * Scaling bars to the tallest bar makes the chart's shape right and its
 * values unreadable: the top of the plot is some arbitrary 198.000, and a
 * tick there would be a number nobody chose. The axis therefore runs to a
 * ROUND number at or above the peak, picked from the 1 / 2 / 2.5 / 5 ladder
 * at the right order of magnitude, and the bars are scaled against THAT.
 * The shape is unchanged — every bar shrinks by the same factor — and now
 * every gridline is a figure worth printing.
 *
 * Four intervals is the target: enough to read a bar to a quarter of the
 * range, few enough to fit beside a compact plot.
 *
 * @param {number} max — the tallest bucket in the period
 * @param {number} [targetIntervals]
 * @returns {{top:number, ticks:Array<number>, decimals:number}}
 */
export function niceScale(max, targetIntervals = 4) {
  const peak = Number(max) || 0;
  if (peak <= 0) return { top: 0, ticks: [0], decimals: 0 };

  const rough = peak / targetIntervals;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const step =
    (normalized <= 1 ? 1
      : normalized <= 2 ? 2
        : normalized <= 2.5 ? 2.5
          : normalized <= 5 ? 5
            : 10) * magnitude;

  /* Round up to the next whole step so the tallest bar never pokes above the
     top gridline, and so the top tick is a number from the same ladder. */
  const top = Math.ceil(peak / step - 1e-9) * step;
  const ticks = [];
  for (let i = 0; i * step <= top + step * 1e-9; i += 1) {
    /* Re-rounded because repeated addition of 2.5 or 0.1 drifts, and a tick
       of 7.500000000000001 formats as readily as it compares badly. */
    ticks.push(Math.round(i * step * 1e6) / 1e6);
  }

  return { top, ticks, decimals: tickDecimals(ticks) };
}

/**
 * The fewest decimals that print every tick truthfully.
 *
 * Deriving this from the step's magnitude alone is not enough: a step of 2.5
 * is "at least 1", which would round the 2.5 and 7.5 ticks to 3 and 8 — an
 * axis whose own labels lie about where its lines are. Asking each tick
 * whether it survives the rounding is the only version that cannot do that.
 *
 * Capped at three places, which is what JOD is printed to everywhere else.
 */
export function tickDecimals(ticks) {
  for (let d = 0; d <= 3; d += 1) {
    if (ticks.every((tick) => Math.abs(Number(tick.toFixed(d)) - tick) < 1e-9)) return d;
  }
  return 3;
}

/**
 * One tick, as text.
 *
 * Western digits and no grouping, exactly as fmtPrice() prints every other
 * figure in the product — an axis that said "1,250" beside a total that said
 * "JOD 1250.000" would read as two different numbers.
 */
export function formatTick(value, decimals) {
  return (Number(value) || 0).toFixed(decimals);
}
