import { useEffect, useRef, useState } from "react";

/**
 * BrandTimeMark — Phase 74.1.
 *
 * A purpose-built animated micro-mark for the Estimated Time pill on
 * Tracking. NOT the corporate logo, and no longer derived from it: Phase 74
 * cropped the raster pro-order-icon.png in half and swept a gradient over the
 * dial, which meant the artwork could only ever show one circle at a time and
 * the "clock" never actually moved. This is a small vector symbol drawn for
 * this one slot, inspired by the two-circle identity rather than copying it.
 *
 * STRUCTURE — two stacked circular forms, tangent at a shared waist so they
 * read as a vertical figure-eight:
 *
 *   upper (cx 12, cy 10, r 7)     time / preparation — a minimal clock:
 *                                 outline, four tick marks, two hands
 *   lower (cx 12, cy 24.6, r 7.6) service / table — a plate: outline plus a
 *                                 concentric rim. Deliberately no fork and
 *                                 knife; at 34px they turned to mush (§10).
 *
 * The two circles are tangent at exactly (12, 17), which is what lets a
 * single continuous path trace both loops and gives the mark its infinity
 * reading without drawing an infinity symbol.
 *
 * MOTION, in strict order of prominence (§19 — this must stay subordinate to
 * the status pill, the connector sweep and the Ready ring):
 *
 *   1. the clock hands rotate, 9s per revolution
 *   2. a faint highlight travels the figure-eight path, 7s per loop
 *   3. on a genuine advance into Ready, the plate pulses once
 *
 * Nothing here is a countdown. The hands turn at a constant rate that has no
 * relationship to estimatedPrepMinutes, which this component never reads
 * (§5, §16).
 *
 * @param {"clock"|"serve"} phase   which half the mark emphasises
 * @param {boolean} animated        run the ambient motion (clock phase only)
 */
export default function BrandTimeMark({ phase = "clock", animated = false }) {
  const isServe = phase === "serve";

  /* §12 — the Ready pulse belongs to a real transition, not to arriving on an
     already-Ready screen. The first render only RECORDS the phase, so a
     refresh, a re-open, or a poll returning the same status all fall through
     without firing. Only a clock -> serve change on a mounted component
     counts. Same seeding rule the tracking stepper uses. */
  const prevPhaseRef = useRef(null);
  const seededRef = useRef(false);
  const [justServed, setJustServed] = useState(false);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (!seededRef.current) { seededRef.current = true; return; }
    if (prev === phase || phase !== "serve") return;

    setJustServed(true);
    const id = setTimeout(() => setJustServed(false), 460);
    return () => clearTimeout(id);
  }, [phase]);

  return (
    <span
      className={`brand-mark brand-mark--${isServe ? "serve" : "clock"} ${
        animated && !isServe ? "brand-mark--live" : ""
      } ${justServed ? "brand-mark--served" : ""}`}
      aria-hidden="true"
    >
      <svg className="brand-mark__svg" viewBox="0 0 24 34" fill="none" focusable="false">
        {/* The figure-eight itself: one continuous path made of two arcs that
            meet at the waist, the upper swept one way and the lower the
            other. It is invisible on its own — it exists to carry the
            travelling highlight below — but drawing the highlight along a
            real path is what makes the flow follow the mark's geometry
            instead of being a decorative squiggle laid over it.

            pathLength="100" normalises the dash maths, so the dash values
            below are percentages and stay correct if the geometry is ever
            nudged. */}
        <path
          className="brand-mark__flow"
          pathLength="100"
          d="M12 17 A7 7 0 1 1 11.99 17 A7.6 7.6 0 1 0 12.01 17"
        />

        {/* ── lower circle — plate / service ── */}
        <g className="brand-mark__plate">
          <circle className="brand-mark__plate-ring" cx="12" cy="24.6" r="7.6" />
          <circle className="brand-mark__plate-inner" cx="12" cy="24.6" r="3.6" />
        </g>

        {/* ── upper circle — clock ── */}
        <g className="brand-mark__clock">
          <circle className="brand-mark__clock-ring" cx="12" cy="10" r="7" />
          {/* Four ticks only. Twelve read as noise at this size. */}
          <g className="brand-mark__ticks">
            <line x1="12" y1="4.4" x2="12" y2="5.6" />
            <line x1="17.6" y1="10" x2="16.4" y2="10" />
            <line x1="12" y1="15.6" x2="12" y2="14.4" />
            <line x1="6.4" y1="10" x2="7.6" y2="10" />
          </g>
          {/* ONE hand, rotating about the dial centre.
              Two hands were tried first and read badly at this size: caught
              mid-rotation they formed an arbitrary caret rather than a clock,
              because at ~16px there is not enough room to tell an hour hand
              from a minute hand. A single sweeping hand is unambiguous, and
              it also echoes the brand mark's own stopwatch, which has one. */}
          <g className="brand-mark__hands">
            <line className="brand-mark__hand" x1="12" y1="10.4" x2="12" y2="5.4" />
            <circle className="brand-mark__pivot" cx="12" cy="10" r="1" />
          </g>
        </g>

        {/* §11 — one soft ring out of the plate on a real advance into Ready.
            Mounted only in the serve phase and animated only under
            --served, so it cannot loop. */}
        {isServe && (
          <circle className="brand-mark__ready-ring" cx="12" cy="24.6" r="7.6" />
        )}
      </svg>
    </span>
  );
}
