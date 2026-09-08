import { useEffect, useState } from "react";
import BrandTimerMark from "./BrandTimerMark.jsx";
import { getTimerState, TIMER_MODE } from "../../../lib/orderTimer.js";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * OrderTimer — Phase 88 (§7, §10, §11, §12).
 *
 * The Main Timer: an open section on the page, not a card.
 *
 * ══ WHY THERE IS NO BOX ══════════════════════════════════════════════════
 *   The old PrepTimeEstimate was a bordered, tinted pill, and §7 asks for the
 *   opposite on purpose. A tinted box sitting under the Status Route reads as
 *   a second status — which is exactly what happened in practice: a blue
 *   "Received" badge above a coloured estimate pill made the estimate look
 *   like part of the status system. Removing the container is what makes the
 *   separation legible; there is nothing for the eye to group it with.
 *
 *   And no semantic colour, in any mode. The timer never turns amber for
 *   Preparing or green for Ready (§7). It is the restaurant's own Primary
 *   family throughout, which is also why it cannot be mistaken for a status.
 *
 * ══ HIERARCHY (§7) ═══════════════════════════════════════════════════════
 *   the animated mark, then the large remaining time, then a small label.
 *   The number sits BELOW the mark rather than inside its circles — §7 rules
 *   that out, and it is right to: the artwork's upper circle is a dial with
 *   its own hand, and putting "12 min" in it would produce a clock face
 *   showing two different times.
 *
 * ══ THE FOUR MODES ═══════════════════════════════════════════════════════
 *   ACTIVE   counting down; mark animates
 *   OVERDUE  the estimate ran out and the order is still in the kitchen.
 *            "Taking a little longer", motion settles, nothing turns red and
 *            the status route is not touched (§10)
 *   SETTLED  Ready or Delivered. The countdown is over by status, never by
 *            arithmetic; the mark goes still and the number gives way to the
 *            status sentence above it (§11, §12)
 *   NONE     canceled, or an order with no estimate — renders nothing
 */
export default function OrderTimer({ order }) {
  const { t } = useLanguage();

  /* A tick, not a clock: everything is recomputed from order.createdAt on
     each pass, so this only decides HOW OFTEN the display refreshes and can
     never itself drift. 5s is well under the one-minute display granularity
     and keeps the ACTIVE -> OVERDUE handover prompt without a per-second
     interval running behind a screen the guest may leave open for an hour. */
  const [now, setNow] = useState(() => Date.now());
  const state = getTimerState(order, now);
  const isActive = state.mode === TIMER_MODE.ACTIVE;

  useEffect(() => {
    if (!isActive) return undefined;      // nothing left to count
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [isActive]);

  if (state.mode === TIMER_MODE.NONE) return null;

  /* Ready/Delivered: the status sentence above already says what is happening
     and §11/§12 both say the timer stops being a prep countdown. Rendering a
     stalled number next to "your order has been delivered" would be noise, so
     the section steps aside entirely rather than lingering as decoration. */
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

      {/* role="status" so a change is announced once, politely. The mark
          itself is aria-hidden, so what reaches a screen reader is the two
          lines of text and nothing about the animation (§19). */}
      <p className="otimer__value" role="status">
        {overdue
          ? t("track.takingLonger", "Taking a little longer")
          /* {n} is substituted rather than concatenated so Arabic can place
             the number where it reads naturally instead of being forced into
             English word order. */
          : t("track.minutesRemaining", "{n} min").replace("{n}", state.remainingMinutes)}
      </p>

      <p className="otimer__label">
        {overdue
          ? t("track.takingLongerHelp", "Your order is still being prepared. Thank you for your patience.")
          : t("track.estimatedRemaining", "Estimated time remaining")}
      </p>
    </section>
  );
}
