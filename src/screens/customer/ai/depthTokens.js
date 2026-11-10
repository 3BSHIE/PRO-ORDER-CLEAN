/**
 * depthTokens — Phase 121.4D, promoted to production in 121.5.
 *
 * The four numbers the depth carousel's geometry, its JavaScript and its CSS
 * all have to agree about. They live here, alone, because the comparison
 * phases showed what happens when two files hold the same constant: a
 * comment in each saying "must be changed together" is a comment doing a
 * module's job.
 *
 * stageGeometry.js needs the scale and the minimum offset to know the
 * hero's horizontal ceiling. DepthCarousel.jsx needs them to place the
 * recessed card. The stylesheet needs the scale and the opacity. Nothing
 * else reads them.
 *
 * ── WHY THESE VALUES ────────────────────────────────────────────────────
 * Phase 121.4D offered 0.88-0.94 scale and 0.65-0.80 opacity as starting
 * points; these are where measurement on a real 390px stage left them, and
 * the owner approved the result:
 *
 *   SCALE 0.91  — at 230px the recessed card comes out 21px shorter than
 *                 the hero, which is a legible step down without the stack
 *                 starting to look like playing cards.
 *   OPACITY .72 — the food photography stays readable as food. Lower and
 *                 the dish behind reads as unavailable rather than next,
 *                 which the approved design rules out. No blur, no dark
 *                 overlay, for the same reason.
 *   OFF_MIN 22  — the least offset at which the recessed card's edge is
 *                 unmistakably a second card and not a border artifact.
 *   OFF_MAX 96  — a tablet has width to spare and should show more of the
 *                 next recommendation. Past this the stack stops reading
 *                 as depth and starts reading as two cards side by side,
 *                 which is a different composition and not this one.
 */

/* The recessed card's scale, relative to the hero. */
export const DEPTH_SCALE = 0.91;
/* Its opacity. The hero is always 1. */
export const DEPTH_OPACITY = 0.72;
/* How far it sits to the side of the hero, in px: at least this much, and
   at most DEPTH_OFF_MAX where the stage is wide enough to show more. */
export const DEPTH_OFF_MIN = 22;
export const DEPTH_OFF_MAX = 96;
/* The share of the stage's spare width spent on the offset: enough on a
   phone to read as a second card, and straight to the maximum on a tablet,
   with no breakpoint between them.

   What the guest actually SEES past the hero's edge is not the offset — the
   recessed card is scaled about its own centre, so it loses half the
   difference back:  peek = offset - heroWidth x (1 - SCALE) / 2.
   At 390x844 that is 51.2 - 10.4 = 41px of the next dish, measured. 0.30
   gave 28px, which read as an edge rather than as a dish. */
export const DEPTH_OFF_SHARE = 0.4;

/* Cards further back than the neighbour are parked, invisible, at this
   scale — they exist so that bringing one forward is a transition of an
   element that was already laid out, never a mount. */
export const DEPTH_FAR_SCALE = 0.84;
export const DEPTH_FAR_OFF = 1.6;   /* x the near offset */

/* The approved 260-360ms band. 300 with the theme's own ease-out: the
   exchange is a position swap, and the eye follows it comfortably at 300
   while 360 starts to feel like the carousel is deciding. */
export const DEPTH_MS = 300;
/* While a finger is down the stack follows it this far, at most, so the
   gesture is answered before the threshold is crossed. A fraction rather
   than 1:1 — the cards are a stack, not a scroller, and a 1:1 follow
   promises a scroll the layout cannot deliver. */
export const DRAG_FOLLOW = 0.4;
export const DRAG_MAX = 36;
/* Past this much horizontal travel the release advances. 40px is the
   shipping app's own flick distance elsewhere and comfortably clear of the
   10px at which the gesture is claimed from the page. */
export const DRAG_COMMIT = 40;
