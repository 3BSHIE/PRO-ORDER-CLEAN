/**
 * BrandLoadingMark — Phase 83.
 *
 * The animated PRO·ORDER two-circle mark, drawn for exactly one job: the
 * Customer main/system loading state. Its use is deliberately rare (§0) — it
 * is not an order-status icon, not a Preparing/Ready/Received glyph, and not a
 * general-purpose spinner to sprinkle around the UI.
 *
 * ── WHERE THE GEOMETRY COMES FROM ────────────────────────────────────────
 *   Phase 74.1's BrandTimeMark already established the vector reading of the
 *   brand: two circles tangent at a shared waist, the upper a stopwatch and
 *   the lower a place setting, with one continuous path tracing both loops so
 *   the figure-eight is real geometry rather than a drawn infinity symbol.
 *   The same viewBox, the same centres, the same radii and the same flow path
 *   are reused here (§1) — this is the same object at a larger size, not a
 *   second interpretation of the logo.
 *
 *   What is added back, because this mark renders roughly twice the size of
 *   the tracking micro-mark: the stopwatch crown, a fuller tick ring, and the
 *   plate's fork and knife. BrandTimeMark dropped the cutlery for a good
 *   reason — at 34px it turned to mush — but the loading mark has the room,
 *   and the place setting is half of what the brand actually is.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────
 *   The clock hand does NOT rotate. A sweeping hand is approved brand motion
 *   for the future Main Timer unit, not for app loading (§1/§30), and running
 *   it here would both pre-empt that work and make this read as a countdown.
 *   The hand is drawn and static, because the stopwatch needs one to be a
 *   stopwatch.
 *
 * ── THE MOTION: INFINITY FLOW + ENERGY TRANSFER (§2) ─────────────────────
 *   One idea, expressed twice so it reads as transfer rather than decoration:
 *
 *     1. a bright comet travels the figure-eight continuously — out of the
 *        waist, around the stopwatch, back through the waist, around the
 *        plate, and on. Because it runs along the real path, the flow follows
 *        the mark's own geometry.
 *     2. each circle brightens as the comet passes through it, and dims again
 *        as it leaves. The two are phase-offset to match where the comet
 *        actually is, so the eye reads energy ARRIVING somewhere rather than
 *        two elements pulsing on their own schedule.
 *
 *   The upper loop is ~48% of the path and the lower ~52% (r 7 against r 7.6),
 *   which is where the 24% / 74% highlight peaks in the stylesheet come from.
 *
 *   No bounce, no scaling, no rotation, no flashing, no glow burst, no status
 *   colour — the whole animation is opacity plus one stroke-dashoffset, which
 *   is also why it stays on the compositor (§39).
 *
 * @param {boolean} settling — true once loading has genuinely finished; the
 *   stylesheet eases the flow down and fades the mark out (§11). The caller
 *   owns the timing, so this component never delays navigation.
 */
export default function BrandLoadingMark({ settling = false }) {
  return (
    <span
      className={`pl-mark ${settling ? "pl-mark--settling" : ""}`}
      /* The screen around it already announces loading to assistive tech via
         role="status"; this is the decorative half of that message. */
      aria-hidden="true"
    >
      <svg className="pl-mark__svg" viewBox="0 0 24 34" fill="none" focusable="false">
        {/* ── The figure-eight itself ──────────────────────────────────────
            Two arcs meeting at the waist (12, 17), swept in opposite
            directions so a single path traces both loops. Invisible as a
            line — it exists to carry the comet below.

            pathLength="100" normalises the dash maths so the stylesheet's
            dash values are percentages and survive any geometry nudge. */}
        <path
          className="pl-mark__flow"
          pathLength="100"
          d="M12 17 A7 7 0 1 1 11.99 17 A7.6 7.6 0 1 0 12.01 17"
        />

        {/* ── Upper circle — the stopwatch ─────────────────────────────── */}
        <g className="pl-mark__clock">
          {/* Crown. The one detail that turns a dial into a stopwatch, and
              the most recognisable silhouette cue in the whole mark. */}
          <path className="pl-mark__crown" d="M10.6 2.4 h2.8 M12 2.4 v1.1" />

          <circle className="pl-mark__clock-ring" cx="12" cy="10" r="7" />

          {/* Eight ticks — the four cardinals plus the diagonals. Twelve is
              what the logo carries and what turns to noise below ~60px; four
              (BrandTimeMark's choice) reads sparse at this size. */}
          <g className="pl-mark__ticks">
            <line x1="12" y1="4.3" x2="12" y2="5.5" />
            <line x1="12" y1="15.7" x2="12" y2="14.5" />
            <line x1="17.7" y1="10" x2="16.5" y2="10" />
            <line x1="6.3" y1="10" x2="7.5" y2="10" />
            <line x1="16.03" y1="5.97" x2="15.18" y2="6.82" />
            <line x1="7.97" y1="14.03" x2="8.82" y2="13.18" />
            <line x1="16.03" y1="14.03" x2="15.18" y2="13.18" />
            <line x1="7.97" y1="5.97" x2="8.82" y2="6.82" />
          </g>

          {/* Static hand, angled up-and-slightly-right as the logo's is.
              It does not move — see the note above. */}
          <g className="pl-mark__hand">
            <line x1="12" y1="10" x2="13.1" y2="5.6" />
            <circle className="pl-mark__pivot" cx="12" cy="10" r="0.95" />
          </g>
        </g>

        {/* ── Lower circle — the place setting ─────────────────────────── */}
        <g className="pl-mark__plate">
          <circle className="pl-mark__plate-ring" cx="12" cy="24.6" r="7.6" />

          {/* The plate: two concentric circles, exactly as the logo draws it. */}
          <circle className="pl-mark__dish" cx="12" cy="24.6" r="3.5" />
          <circle className="pl-mark__dish-inner" cx="12" cy="24.6" r="2.5" />

          {/* Fork and knife. Simplified to the silhouette the logo reads as at
              this scale: the fork keeps three tines because that is what makes
              it a fork rather than a second knife, and the knife keeps its
              tapered blade. Any more detail than this genuinely does turn to
              mush — that was Phase 74.1's finding and it still holds. */}
          <g className="pl-mark__cutlery">
            {/* fork */}
            <path className="pl-mark__fork-tines" d="M5.55 20.8 v2.1 M6.9 20.8 v2.1 M8.25 20.8 v2.1" />
            <path className="pl-mark__fork-neck" d="M5.55 22.9 h2.7" />
            <line className="pl-mark__fork-shaft" x1="6.9" y1="22.9" x2="6.9" y2="28.4" />
            {/* knife */}
            <path className="pl-mark__knife-blade" d="M17.1 20.9 q1.1 1.6 0 3.2" />
            <line className="pl-mark__knife-shaft" x1="17.1" y1="20.9" x2="17.1" y2="28.4" />
          </g>
        </g>
      </svg>
    </span>
  );
}
