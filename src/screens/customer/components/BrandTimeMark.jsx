import iconSrc from "../../../assets/brand/pro-order-icon.png";

/**
 * BrandTimeMark — Phase 74 §12–§15, §18.
 *
 * The Estimated Time area's brand mark: the two stacked circles of the
 * PRO·ORDER symbol, showing ONE of them at a time.
 *
 *   phase="clock"  the upper stopwatch  — order in progress
 *   phase="serve"  the lower plate      — order ready to be served
 *
 * ASSET REALITY, and why this is built the way it is
 * ---------------------------------------------------
 * src/assets/brand/pro-order-icon.png is a RASTER PNG, 495×888, and the two
 * circles are a single composite image: an interlocking figure-8 of a
 * stopwatch above a plate with cutlery. The stopwatch's hand is painted into
 * those pixels — it is not a separable layer.
 *
 * §15 is explicit that brand accuracy outranks animation complexity, so
 * nothing here redraws the mark. The real asset is used as-is and simply
 * CLIPPED: a fixed-size window with overflow:hidden, containing the image at
 * exactly twice the window's height, pinned to its top edge (upper circle) or
 * its bottom edge (lower circle). Switching phase moves nothing but which
 * half is visible, so both states are pixel-authentic to the supplied logo.
 *
 * The clock motion (§14) is therefore NOT a rotating hand — rotating the hand
 * is impossible without repainting it, and rotating the whole upper circle
 * would swing the stopwatch's crown around the dial, which would read as a
 * broken logo. Instead a soft gold sweep passes slowly over the dial,
 * composited ON TOP of the untouched mark and masked to a circle over the
 * dial face. It is ambient brand motion, deliberately not a measurement:
 * one slow revolution every 10s, linear and continuous, with no tick, no
 * pulse and no relationship to the estimate (§16).
 *
 * The sweep is a decorative overlay, so it carries aria-hidden and is removed
 * wholesale under prefers-reduced-motion (see .brand-mark__sweep in CSS).
 *
 * @param {"clock"|"serve"} phase
 * @param {boolean} animated  run the ambient sweep (clock phase only)
 */
export default function BrandTimeMark({ phase = "clock", animated = false }) {
  const isClock = phase === "clock";
  return (
    <span
      className={`brand-mark brand-mark--${isClock ? "clock" : "serve"}`}
      aria-hidden="true"
    >
      <img className="brand-mark__img" src={iconSrc} alt="" draggable={false} />
      {isClock && animated && <span className="brand-mark__sweep" />}
    </span>
  );
}
