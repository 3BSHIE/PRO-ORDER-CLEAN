import { useLayoutEffect, useRef, useState } from "react";
import { aspectRatio, figureTop } from "../../../vendor/zaatar-mascot/src/index.js";

/**
 * useCharacterPlacement — Phase 121.1, re-measured in 121.2.
 *
 * ── WHY PHASE 121.0's TRANSITION WAS WORSE THAN THE APPROVED ONE ─────────
 * 121.0 made the character a GRID ITEM and FLIPped it: measure the old box,
 * let the grid resize it, animate the difference away. Three things were
 * wrong with that, and together they are the "less smooth" the owner saw.
 *
 * 1. It scaled the artwork UP. Welcome is the big state, so the FLIP applied
 *    scale = oldHeight / newHeight > 1 to an element the browser had already
 *    laid out at the SMALL size. The approved implementation never does this:
 *    it always renders at the LARGER box and scales DOWN, so the bitmap is
 *    only ever minified.
 * 2. The box changed shape, not just size, and a single uniform scale cannot
 *    describe that — so the transform and the figure's real movement
 *    disagreed and the eye caught the mismatch.
 * 3. Nothing guarded the move. A ResizeObserver firing as the new layout
 *    mounted could cut the animation short.
 *
 * The fix, from ZAATAR-LAB at 199c15d4: each layout renders an empty SLOT and
 * the character lives in one absolutely-positioned LAYER over a shared SCENE,
 * moved by a true box-to-box transform.
 *
 * ── WHAT 121.2 ADDED: THE CONVERSATION'S PROPORTIONS ─────────────────────
 * The hook now also decides how wide the character column is, because that
 * single number settles three things at once that CSS cannot reconcile on
 * its own:
 *
 *   · the real product card's height, which is a function of its width
 *     (a 4:3 image plus a body of fixed line-count);
 *   · the character's height, which is a function of his width;
 *   · whether the two together fit the panel at all.
 *
 * Deriving them here, from the measured scene, is what makes the mandatory
 * rule hold: HIS SIZE DOES NOT DEPEND ON WHETHER A CARD IS SHOWING. The
 * card's region is reserved from the viewport, once, and a recommendation
 * appears inside a box that was already that size.
 */

/* The top of the hair across the poses that can appear here. Above it the
   canvas is transparent headroom reserved for Suggesting's raised cane. */
const HEADROOM = Math.min(figureTop.welcome, figureTop.idle, figureTop.thinking);

const GAP = 12;     // px between the card region and the character

/* The carousel's pagination row, inside the reserved region and above the
   card. Measured, not estimated: a 6px dot, a 1px offset and the 6px gap
   that separates it from the track. Reserving it is not optional — without
   it the card is handed thirteen pixels less than it needs and the first
   thing to go is the bottom of the description. */
const DOTS_ROW = 13;

/* ── The real card's geometry, measured, not guessed ──────────────────────
   .item-card__img-wrap is aspect-ratio:4/3, and the body below it is a fixed
   stack: the attribute row, the name, a description clamped to two lines and
   the price row. Measured in the running menu at three widths:

     content width 130 -> image  97.5, card 279.5  (three-line name)
     content width 167 -> image 125.3, card 289.0  (two-line name)
     content width 228 -> image 171.2, card 316.8  (one-line name)

   which is image + 182 for a three-line name, image + 164 for two. The
   three-line figure is the one reserved, so the region is tall enough for
   the longest name in any menu at the narrowest width and NEVER has to be
   re-measured against the product inside it — if it did, swiping from a
   short name to a long one would move the character, which is the single
   thing this phase forbids. A card shorter than its region simply stretches
   into it, exactly as a card stretches to its row in .menu-grid. */
const CARD_IMAGE = 0.75;
const CARD_BODY = 182;
const CARD_BORDER = 2;
const cardHeightFor = (width) =>
  (width - CARD_BORDER) * CARD_IMAGE + CARD_BODY + CARD_BORDER + DOTS_ROW;

/* 132px is what .menu-grid itself gives a card on a 320px phone, so it is the
   narrowest the design is already proven at. 230px is what it gives at 768px;
   past that the card gains nothing and the conversation loses width. */
const CARD_MIN = 132;
const CARD_MAX = 230;

/* The conversation keeps at least 58% of the scene. Phase 121.1 gave it ~66%
   and the owner's verdict was that the character paid too much for it; this
   is the deliberate re-balance, not an accident of the grid. */
const SIDE_SHARE = 0.42;
/* Welcome has no card to fit, so the character may take half the width — or
   less, when the scene is short enough that half would be more than the
   height can use. */
/* 0.54, not 0.5, because the owner's verdict on 121.1's welcome was that it
   wasted the screen. On a phone this is the binding constraint: "beside" caps
   his height at whatever his width allows, and his width is capped by the
   measure the greeting needs to stay readable. 0.54 leaves roughly 150px of
   greeting at 390px — about three words a line, which is the floor — and
   buys 46% more character than 121.1 had. */
const WELCOME_SHARE = 0.54;

const clamp = (lo, value, hi) => Math.max(lo, Math.min(value, hi));

/**
 * The conversation's proportions, from the scene's measured content box.
 *
 * Solves `card(L) + GAP + L / aspectRatio = height` for the column width L —
 * the width at which the card and the character come out at comparable
 * heights and exactly fill the column — then clamps it to what the card is
 * designed for and to the conversation's share of the width.
 *
 * ── WHERE THEY WILL NOT BOTH FIT ─────────────────────────────────────────
 * A real card at its narrowest proven width, 132px, is 281px tall. The
 * character needs about 1.85 times his width in height. Below roughly 715px
 * of panel, or 315px of panel width, those two cannot share a column without
 * one of them being shrunk past what it is designed for — and this phase
 * forbids shrinking either.
 *
 * So the region is not reserved at all there, and the caller renders no
 * card. That is a real limitation, not a workaround: the recommendation is
 * unavailable on a short panel. It keeps the mandatory rule intact — his
 * size still never changes with the cards, because there are none — and it
 * is what stops a 320x568 phone, or a 1280x800 laptop, ending up with both a
 * cramped card and a character smaller than Phase 121.1 left him.
 */
function conversationGeometry(width, height) {
  const byHeight = (height - GAP - CARD_BODY - CARD_BORDER - DOTS_ROW + CARD_BORDER * CARD_IMAGE)
    / (CARD_IMAGE + 1 / aspectRatio);
  const byWidth = width * SIDE_SHARE;

  if (byHeight < CARD_MIN || byWidth < CARD_MIN) {
    const bare = clamp(CARD_MIN * 0.75, Math.min(byWidth, height * aspectRatio), CARD_MAX);
    return { col: bare, cardH: 0, mascotH: Math.min(bare / aspectRatio, height), cards: false };
  }

  const col = clamp(CARD_MIN, Math.min(byHeight, byWidth), CARD_MAX);
  const cardH = cardHeightFor(col);
  /* Width-bound unless the column is taller than it is wide enough for. */
  const mascotH = Math.min(col / aspectRatio, height - GAP - cardH);
  return { col, cardH, mascotH, cards: true };
}

/**
 * Welcome: as large as half the scene allows, greeting beside him.
 *
 * The second term is the width at which his VISIBLE figure exactly fills the
 * height. His canvas carries 23.5% transparent headroom above the hair for
 * the raised cane, so the box may be a third taller than the space it sits
 * in and still show nothing above it — which is how he fills a desktop panel
 * top to bottom. Past that width the column would be reserving emptiness the
 * greeting could have used.
 */
function welcomeGeometry(width, height) {
  const col = Math.min(width * WELCOME_SHARE, (height / (1 - HEADROOM)) * aspectRatio);
  return { col, cardH: 0, mascotH: Math.min(col / aspectRatio, height), cards: false };
}

/** Welcome: centred in its slot, filling it, headroom allowed to overhang. */
function fitWelcome(slot) {
  const height = Math.min(slot.h / (1 - HEADROOM), slot.w / aspectRatio);
  const width = height * aspectRatio;
  return {
    left: slot.x + (slot.w - width) / 2,
    top: slot.y + slot.h - height,
    width,
    height,
  };
}

/**
 * Conversation: standing on the bottom of his slot.
 *
 * The slot's height is already the answer — conversationGeometry set it — so
 * this only fits the aspect ratio inside it. Phase 121.1's version computed
 * the recommendation zone here and grew him when no cards were showing; both
 * are gone, because both made his size depend on the cards.
 */
function fitActive(slot) {
  /* No inset: the slot IS his box. An inset costs height as well as width
     — four pixels a side is fifteen pixels of figure at these proportions —
     and it opens a gap under the card that reads as a mistake. */
  const height = Math.min(slot.w / aspectRatio, slot.h);
  const width = height * aspectRatio;
  return {
    left: slot.x + (slot.w - width) / 2,
    top: slot.y + slot.h - height,
    width,
    height,
  };
}

function apply(el, box) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

/** The transform that makes an element laid out at `from` appear at `to`. */
const mapBox = (from, to) =>
  `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`;

const sameBox = (a, b) =>
  ["left", "top", "width", "height"].every((k) => Math.abs(a[k] - b[k]) < 0.5);

export function useCharacterPlacement({ sceneRef, layerRef, slot, mode, motion, reducedMotion }) {
  /* Only the caller's rendering decision lives in state; the geometry itself
     is written straight to the DOM below, so the layout is correct in the
     same frame rather than one render later. */
  const [cardsFit, setCardsFit] = useState(false);
  const [resizeTick, setResizeTick] = useState(0);
  const lastKey = useRef(motion.key);
  const placed = useRef(false);
  const animation = useRef(null);

  useLayoutEffect(() => {
    if (!slot || !sceneRef.current) return undefined;
    const observer = new ResizeObserver(() => setResizeTick((t) => t + 1));
    observer.observe(sceneRef.current);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slot, sceneRef]);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const layer = layerRef.current;
    if (!scene || !layer || !slot) return;
    const sceneRect = scene.getBoundingClientRect();
    /* Closed overlay: keep the last placement rather than collapsing to zero,
       so reopening does not animate out of nowhere. */
    if (!sceneRect.width) return;

    /* ── 1. Decide the column, and write it before anything is measured ──
       Padding does not move an absolutely positioned child when the box has
       no border, so the layer's coordinates below stay in the scene's own
       border-box space whatever this padding is. */
    const pad = getComputedStyle(scene);
    const innerW = sceneRect.width - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const innerH = sceneRect.height - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
    const geom = mode === "welcome"
      ? welcomeGeometry(innerW, innerH)
      : conversationGeometry(innerW, innerH);

    /* On the PANEL, not the scene. The composer and the suggested questions
       are siblings of the scene, not children of it, and on a wide panel
       they are inset by the column width so they line up under the thread —
       which they cannot do if the number only exists further down the tree.
       They were falling back to the 38% placeholder and landing a hundred
       pixels adrift. */
    const vars = scene.closest(".aichat__panel") || scene;
    vars.style.setProperty("--aichat-col", `${geom.col}px`);
    vars.style.setProperty("--aichat-card-h", `${geom.cardH}px`);
    vars.style.setProperty("--aichat-mascot-h", `${geom.mascotH}px`);
    setCardsFit(geom.cards);

    /* Reading the slot now forces the layout those three properties just
       invalidated, so what comes back is the column as it will be painted. */
    const slotRect = slot.getBoundingClientRect();
    if (!slotRect.width) return;

    const rect = {
      x: slotRect.left - sceneRect.left,
      y: slotRect.top - sceneRect.top,
      w: slotRect.width,
      h: slotRect.height,
    };
    const box = mode === "welcome" ? fitWelcome(rect) : fitActive(rect);

    const keyChanged = lastKey.current !== motion.key;
    lastKey.current = motion.key;

    /* A resize that lands mid-move — the incoming layout's observer fires
       once on mount — must not cut the move short.

       `animation.current.layer === layer` is what makes this safe across a
       close and reopen. Without it the record outlived the panel: the guest
       closed the assistant, the portal took the layer with it, and on reopen
       this read a finished move against a brand-new element that had never
       been positioned — so it returned early and left the character at zero
       by zero. He simply was not there. */
    if (
      !keyChanged
      && animation.current
      && animation.current.layer === layer
      && sameBox(animation.current.target, box)
    ) return;

    /* Where he actually is on screen right now, mid-animation included. */
    const visual = layer.getBoundingClientRect();
    const from = {
      left: visual.left - sceneRect.left,
      top: visual.top - sceneRect.top,
      width: visual.width,
      height: visual.height,
    };
    animation.current?.cancel();
    animation.current = null;

    if (!keyChanged || !placed.current || reducedMotion || !from.width || box.width < 1) {
      apply(layer, box);
      placed.current = box.width >= 1;
      return;
    }

    /* Always a downscale: render at whichever box is larger and scale toward
       the other, so the artwork is never magnified beyond its own size. */
    const options = { duration: motion.ms, easing: "cubic-bezier(0.45, 0, 0.2, 1)", fill: "forwards" };
    layer.style.transformOrigin = "0 0";
    let run;
    if (box.width <= from.width) {
      apply(layer, from);
      run = layer.animate([{ transform: "none" }, { transform: mapBox(from, box) }], options);
    } else {
      apply(layer, box);
      run = layer.animate([{ transform: mapBox(box, from) }, { transform: "none" }], options);
    }
    const record = { target: box, layer, cancel: () => run.cancel() };
    animation.current = record;
    run.finished
      .then(() => {
        apply(layer, box);
        run.cancel();
        /* The move is over; the guard above has nothing left to protect. */
        if (animation.current === record) animation.current = null;
      })
      .catch(() => {});
  }, [resizeTick, slot, mode, motion.key, motion.ms, reducedMotion, sceneRef, layerRef]);

  return cardsFit;
}
