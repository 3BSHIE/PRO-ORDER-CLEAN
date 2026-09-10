import { useEffect, useState } from "react";
import BrandTimerMark from "./BrandTimerMark.jsx";
import { getTimerState, formatCountdown, TIMER_MODE } from "../../../lib/orderTimer.js";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * OrderTimer — Phase 88 (§7, §10–§12), reworked into a live countdown in
 * Phase 88.2 (§10, §11, §20).
 *
 * ══ WHY THERE IS NO BOX ══════════════════════════════════════════════════
 *   The old estimate was a bordered, tinted pill, and §7 asked for the
 *   opposite on purpose. A tinted box under the Status Route reads as a
 *   second status — which is exactly what happened in practice. Removing the
 *   container is what makes the separation legible; there is nothing for the
 *   eye to group it with. No semantic colour, in any mode: this is the
 *   restaurant's own Primary family throughout (§13, preserved).
 *
 * ══ THE COUNTDOWN IS DERIVED, NEVER STORED (§10) ═════════════════════════
 *   Nothing here decrements. Every render recomputes the remainder from the
 *   order's frozen createdAt + estimatedPrepMinutes against the current
 *   clock, so the number is a pure function of (order, now).
 *
 *   That is what makes it survive the guest leaving. Open the Menu, come back
 *   two minutes later, refresh the tab, restore it from the background — the
 *   timer shows the truth, because there was never any running state to lose
 *   or to drift. `now` below only controls how often the display REFRESHES;
 *   it can never itself become the source of the value.
 *
 * ══ TICKING, AND WHY IT STOPS ════════════════════════════════════════════
 *   One second while the countdown is genuinely running, and no interval at
 *   all in any other mode — a delivered order sitting open on a table must
 *   not hold a timer forever.
 *
 * ══ SCREEN READERS (§20) ═════════════════════════════════════════════════
 *   The MM:SS value is deliberately NOT in a live region. It changes every
 *   second, and announcing it every second would bury everything else on the
 *   screen. The section carries an accessible name so the value can be read
 *   on demand, and role="status" is reserved for the two things worth
 *   interrupting for: the order taking longer than estimated, and nothing
 *   else.
 */
export default function OrderTimer({ order }) {
  const { t } = useLanguage();

  const [now, setNow] = useState(() => Date.now());
  const state = getTimerState(order, now);
  const isActive = state.mode === TIMER_MODE.ACTIVE;

  useEffect(() => {
    if (!isActive) return undefined;   // nothing left to count
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  if (state.mode === TIMER_MODE.NONE) return null;

  /* Ready/Delivered: the status sentence above already says what is happening,
     and §11 is explicit that the countdown stops being a preparation timer the
     moment the STATUS says so — never because the arithmetic ran out. A
     stalled number beside "your order has been delivered" is noise, so the
     section steps aside rather than lingering as decoration. */
  if (state.mode === TIMER_MODE.SETTLED) return null;

  const overdue = state.mode === TIMER_MODE.OVERDUE;

  return (
    <section
      className={`otimer ${overdue ? "otimer--overdue" : ""}`}
      aria-label={t("track.timerRegion", "Estimated time")}
    >
      <span className="otimer__mark">
        <BrandTimerMark active={!overdue} settled={overdue} />
      </span>

      {overdue ? (
        /* The one thing worth announcing: the estimate has passed and the
           order is still in the kitchen. Polite, once. */
        <p className="otimer__value otimer__value--msg" role="status">
          {t("track.takingLonger", "Taking a little longer")}
        </p>
      ) : (
        /* No live region — see the note above. tabular-nums in the stylesheet
           stops the digits jittering as they change. */
        <p className="otimer__value otimer__value--count">
          {formatCountdown(state.remainingSeconds)}
        </p>
      )}

      <p className="otimer__label">
        {overdue
          ? t("track.takingLongerHelp", "Your order is still being prepared. Thank you for your patience.")
          : t("track.estimatedRemaining", "Estimated time remaining")}
      </p>
    </section>
  );
}
