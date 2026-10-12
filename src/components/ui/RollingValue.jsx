import { useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   RollingValue — Phase 111.1

   One number that changes without its card moving.

   ── WHAT THIS REPLACES ───────────────────────────────────────────────────
   Phase 111.0 animated the period change by putting a React key on the whole
   Revenue Analytics data area, so every value, the chart, the ring and both
   tables unmounted and re-entered together. It read as "a card was
   replaced", which is the opposite of what a lens change is: the same card,
   re-read against a different window.

   Here nothing unmounts. The label, the icon, the card and its border all
   stay exactly where they are, and only the digits move.

   ── THE MOVEMENT ─────────────────────────────────────────────────────────
   The outgoing value slides up and fades; the incoming value arrives from
   below and settles in the same place. The outgoing copy is taken OUT OF
   FLOW (absolute) for the length of the animation, so the element's size is
   governed by the incoming value alone and the row cannot jump to fit two
   numbers at once.

   ── WHAT COUNTS AS A CHANGE ──────────────────────────────────────────────
   The FORMATTED STRING, not the number behind it. The four-second order poll
   re-renders this component constantly with an identical "JOD 195.800"; an
   animation there would be motion with nothing to say. Comparing the text
   also means 195.8001 → 195.8002 is correctly silent.

   ── RAPID NAVIGATION ─────────────────────────────────────────────────────
   There is only ever one outgoing copy, and it is always the value that was
   on screen when the newest change arrived. Holding the arrow down does not
   stack animations; the latest selection wins, which is the one the reader
   is actually waiting for.

   ── ACCESSIBILITY ────────────────────────────────────────────────────────
   The outgoing copy is aria-hidden, so assistive technology is never told
   the number twice. Nothing here is a live region: these figures are read
   when the reader asks for them, and announcing every period step would turn
   browsing into a stream of interruptions. Under prefers-reduced-motion the
   stylesheet collapses the animation to an instant swap, which is why there
   is no second code path for it here.
 */
export default function RollingValue({ value, className = "", title }) {
  const text = value === null || value === undefined ? "" : String(value);
  const [shown, setShown] = useState(text);
  const [outgoing, setOutgoing] = useState(null);
  /* Bumped on every real change so the two spans remount and replay their
     animation even when the text happens to repeat an earlier value. */
  const [cycle, setCycle] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    setShown((previous) => {
      if (previous === text) return previous;
      setOutgoing(previous);
      setCycle((c) => c + 1);
      return text;
    });
  }, [text]);

  /* The outgoing copy is removed once its animation is over. Kept on a timer
     rather than on animationend because a reduced-motion user's animation
     may finish in under a millisecond, and because an interrupted animation
     never fires the event at all. */
  useEffect(() => {
    if (outgoing === null) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOutgoing(null), 340);
    return () => clearTimeout(timer.current);
  }, [outgoing, cycle]);

  return (
    <span className={`rollval ${className}`.trim()} title={title}>
      {outgoing !== null && (
        <span className="rollval__out" key={`out-${cycle}`} aria-hidden="true">
          {outgoing}
        </span>
      )}
      <span className="rollval__in" key={`in-${cycle}`}>
        {shown}
      </span>
    </span>
  );
}
