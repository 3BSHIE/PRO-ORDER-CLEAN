import bodySrc from "../../../assets/brand/pro-order-mark-body.png";
import handSrc from "../../../assets/brand/pro-order-mark-hand.png";

/**
 * BrandTimerMark — Phase 88 (§8, §9).
 *
 * The animated PRO·ORDER mark for the Main Timer. This is the ONLY place in
 * the customer experience that animates the brand besides the system loading
 * state, and it is the only one that needs the clock hand to actually move.
 *
 * ══ WHY THIS REPLACES BrandTimeMark ══════════════════════════════════════
 *   BrandTimeMark was a hand-drawn SVG: circles at chosen radii, four ticks
 *   picked by eye, a plate with "deliberately no fork and knife". It was an
 *   approximation presented as the logo — precisely what §8 rules out, and
 *   the same mistake Phase 83.1 had already corrected once for the loading
 *   mark. It is retired here rather than patched.
 *
 * ══ THE PROBLEM PHASE 83.1 LEFT OPEN ═════════════════════════════════════
 *   83.1 animated the real artwork by using the PNG's alpha as a CSS mask.
 *   That works beautifully for a travelling spark, and its own notes flagged
 *   the limit: "a single flat mask has no way to move one part of the artwork
 *   independently of the rest... it will need either a layered export or a
 *   true vector original."
 *
 *   There is no vector original. So the layers were DERIVED FROM THE MASTER,
 *   not drawn:
 *
 *     src/assets/brand/pro-order-icon.png   495x888, the authoritative art
 *       -> connected-component analysis of its alpha channel finds 18 solid
 *          shapes: the chassis, the plate, fork, knife, 11 tick marks, two
 *          dots, and one 2,820px tapered needle sitting on a round hub in the
 *          middle of the dial — the clock hand.
 *       -> that component (dilated 2px to carry its anti-aliased fringe, which
 *          provably steals no pixel from any neighbour) is written out as
 *          pro-order-mark-hand.png, and its complement as
 *          pro-order-mark-body.png.
 *
 *   Both files are white pixels carrying the ORIGINAL alpha, at the original
 *   495x888, so they register perfectly when stacked. Their alphas sum back
 *   to the master's alpha with ZERO mismatching pixels across all 439,560 —
 *   the split is lossless, and nothing in this mark was redrawn, re-measured
 *   or re-proportioned.
 *
 *   The hand's hub is centred at (247.5, 263.5) in master pixels = exactly
 *   (50%, 29.673%) of the canvas. The x landing on 50.000% is the artwork's
 *   own confirmation that the dial is centred; 29.673% independently matches
 *   the "upper circle centred at 29.7% of the height" that Phase 83.1
 *   measured from the silhouette. That percentage is the transform-origin in
 *   the stylesheet, which is why the hand pivots on its real rivet rather
 *   than near it.
 *
 * ══ WHAT MOVES, AND WHAT MUST NOT ════════════════════════════════════════
 *   hand   — rotates slowly and continuously while the timer is active.
 *            Ambient, NOT a countdown: it never reads the remaining minutes,
 *            because a hand racing a deadline would make the mark a second
 *            timer competing with the real one (§7).
 *   energy — a soft spark travels the figure-eight, clipped to the body mask
 *            so it is only ever visible ON the artwork. Waypoints are the
 *            ones 83.1 measured from this silhouette.
 *   glow   — the lower circle brightens briefly as the energy arrives there,
 *            and only then (§8).
 *   plate, fork, knife, ring, crown, ticks — never move. They are in the body
 *            layer, which carries no transform at all.
 *
 *   The mark never bounces, never pulses on Ready, and never takes a semantic
 *   status colour: it follows --brand-mark, the deeper Primary derived by
 *   src/lib/theme.js, in every state (§9, §11).
 *
 * @param {boolean} active  — the countdown is genuinely running.
 * @param {boolean} settled — Ready/Delivered/overdue: motion eases to a stop
 *   and the mark stands still. Not a separate look, just stillness (§10-§12).
 */
export default function BrandTimerMark({ active = false, settled = false }) {
  return (
    <span
      className={`btm ${active ? "btm--active" : ""} ${settled ? "btm--settled" : ""}`}
      /* Bundler-hashed URLs have to reach CSS somehow; custom properties are
         how, exactly as BrandLoadingMark does it. */
      style={{ "--btm-body": `url(${bodySrc})`, "--btm-hand": `url(${handSrc})` }}
      /* Decorative. The timer's own text carries the meaning, and §19 asks
         that animated ornament stay quiet for screen readers. */
      aria-hidden="true"
    >
      {/* Everything except the hand: crown, button, ring, all ticks, the
          figure-eight ribbon, plate, fork, knife. Static by definition. */}
      <span className="btm__body" />

      {/* The hand alone, pivoting on its own hub. */}
      <span className="btm__hand" />

      {/* Energy, masked by the body so it cannot spill outside the artwork. */}
      <span className="btm__energy">
        <span className="btm__spark" />
      </span>

      {/* The lower circle's response as energy reaches it. */}
      <span className="btm__glow" />
    </span>
  );
}
