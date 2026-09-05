import iconSrc from "../../../assets/brand/pro-order-icon.png";

/**
 * BrandLoadingMark — Phase 83 / rebuilt in Phase 83.1 (Finding #3).
 *
 * The animated PRO·ORDER two-circle mark for the Customer main/system loading
 * state. Its use is deliberately rare (§0) — never an order-status icon, never
 * a Preparing/Ready/Received glyph, never a general-purpose spinner.
 *
 * ── WHAT CHANGED IN 83.1, AND WHY ────────────────────────────────────────
 *   Phase 83 hand-drew an SVG "inspired by" the logo: circles at chosen radii,
 *   eight ticks I picked, a crown I invented the proportions of, a fork with
 *   three tines I spaced by eye. It was close, and close is exactly the
 *   problem — it was a reconstruction presented as the brand mark.
 *
 *   This version animates the ACTUAL approved artwork. The authoritative
 *   source is:
 *
 *       src/assets/brand/pro-order-icon.png   (495x888, RGBA)
 *
 *   the same file src/components/brand/Logo.jsx has always rendered. There is
 *   no vector original anywhere in the project — that PNG is the master.
 *
 * ── HOW YOU ANIMATE A PNG WITHOUT REDRAWING IT ───────────────────────────
 *   The artwork is a gold shape on transparency: 68% of the image is fully
 *   transparent, and every internal detail — the gaps between the tick marks,
 *   the hole inside the dial, the plate's rings, the space between the fork's
 *   tines, the crossing at the waist — is an alpha hole, not a painted
 *   colour. That makes the alpha channel a perfect mask.
 *
 *   So both layers below are the SAME PNG used as a CSS mask. The silhouette
 *   is therefore the original artwork, pixel for pixel, at every size:
 *   nothing is redrawn, no proportion is chosen by me, and the geometry
 *   cannot drift from the brand (§10/§11).
 *
 *   What the mask replaces is only the artwork's internal gold SHADING, which
 *   is flattened to one colour. That is required rather than incidental: §13
 *   says the mark's colour must follow the restaurant's theme, so it cannot
 *   stay a fixed gold gradient when a venue picks green.
 *
 * ── THE MOTION (unchanged intent from Phase 83) ──────────────────────────
 *   A soft spark travels a figure-eight through the two circles, and because
 *   the layer carrying it is masked by the logo, it is only ever visible ON
 *   the mark — energy running through the artwork rather than a shape moving
 *   over it. The waypoints come from measuring the PNG's own silhouette
 *   (upper circle centred at 29.7% height, waist at 49.5%, lower circle at
 *   73%), so the path follows this logo rather than an idealised one.
 *
 *   Nothing scales, rotates, bounces or deforms. The static silhouette is the
 *   logo at every frame (§11).
 *
 * ── FUTURE MAIN TIMER (§12) ──────────────────────────────────────────────
 *   Not implemented here, and Tracking is untouched. This foundation already
 *   supports two of the three approved Timer behaviours — the infinity flow,
 *   and a localised highlight when energy reaches the plate — because both
 *   are properties of the travelling spark.
 *
 *   The third, a slowly rotating clock hand, cannot come from this file: a
 *   single flat mask has no way to move one part of the artwork independently
 *   of the rest. When the Timer unit starts it will need either a layered
 *   export (hand as its own asset) or a true vector original. Flagging that
 *   now is the honest outcome; faking it by redrawing the hand would put us
 *   straight back in the reconstruction this phase removed.
 *
 * @param {boolean} settling — loading has genuinely finished; the stylesheet
 *   eases the spark down and fades the mark (§11). The caller owns the
 *   timing, so this component never delays navigation.
 */
export default function BrandLoadingMark({ settling = false }) {
  return (
    <span
      className={`plm ${settling ? "plm--settling" : ""}`}
      /* The screen around it already announces loading via role="status";
         this is the decorative half of that message. */
      aria-hidden="true"
      /* The mask URL has to reach CSS from the bundler-hashed import, so it
         is handed over as a custom property rather than hardcoded in the
         stylesheet. Both layers read it. */
      style={{ "--plm-art": `url(${iconSrc})` }}
    >
      {/* The mark itself: the original silhouette, filled with the
          theme-derived brand colour. */}
      <span className="plm__art" />

      {/* The energy layer: same mask, so the spark inside is clipped to the
          artwork and reads as light travelling through the logo. */}
      <span className="plm__energy">
        <span className="plm__spark" />
      </span>
    </span>
  );
}
