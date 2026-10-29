import { useLayoutEffect, useRef, useState } from "react";
import { aspectRatio, caneTip, figureTop } from "../../../vendor/zaatar-mascot/src/index.js";

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

/* ── Phase 121.3a — how far the raised cane reaches above his slot ────────
   The column reserves his IDLE figure, which starts 23.5% down the canvas.
   Suggesting is the one pose that breaks that line: the rig puts the raised
   cane's tip at y = 1.61% of the canvas, so when he points, the cane rises
   through the gap and — before this phase — straight across the product
   card's price row and its Add button.

   Both numbers come from the package's own rig rather than from a ruler, so
   re-exported artwork moves this on its own:

     CANE_RISE = (idle figure top) - (cane tip)   as a fraction of his box

   TIP_GAP is the only judgement call here: the breathing room left between
   the tip and the card's lower edge, so the gesture reaches toward the card
   without touching it. */
const CANE_RISE = Math.max(0, Math.min(figureTop.welcome, figureTop.idle, figureTop.thinking) - caneTip.y);
const TIP_GAP = 8;

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

/* ── Phase 121.3 §8 — the compact strip, and why it is a FIXED height ────
   121.2 reserved nothing on a short panel and showed nothing, which left a
   320x568 phone with no way to reach a recommendation at all. The owner's
   verdict: not acceptable as production behaviour.

   So a short panel now reserves exactly this — one 44px touch target above
   the character, always, whether or not there is anything to put in it —
   and the real cards open from it into a viewer that uses the whole scene.
   Reserving it unconditionally is the entire point: his height is still
   decided before anything knows whether a recommendation exists, so the
   mandatory rule survives the fallback.

   44 because that is the touch-target floor the rest of the app uses; at
   320x568 it costs the character nothing, because his size there is bound
   by the column's WIDTH, not by the height left over. */
const STRIP = 44;
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
 * Solves `card(L) + GAP + figure(L) = height` for the column width L — the
 * width at which the card and the character come out at comparable heights
 * and exactly fill the column — then clamps it to what the card is designed
 * for and to the conversation's share of the width.
 *
 * ── 121.3: figure(L), NOT box(L) ─────────────────────────────────────────
 * His canvas reserves 23.5% of its height above the hair as transparent
 * headroom for Suggesting's raised cane. Reserving that as LAYOUT, which is
 * what 121.2 did, put 88px of nothing between the bottom of the card and the
 * top of his head: the pair stopped reading as a pair.
 *
 * So the column now reserves only what is VISIBLE, `box * (1 - HEADROOM)`,
 * and the layer is allowed to overhang upward into the gap — the overhang is
 * transparent, so nothing is covered, and the card comes to rest a deliberate
 * 12px above his head instead of a third of a screen above it. He does not
 * move a pixel and does not change size: the column is bottom-aligned, so
 * shortening the slot moves the CARD down, not him. It also buys back about
 * 63px of height, which is enough to put a full card beside him at 1280x800
 * where 121.2 could show none.
 *
 * ── WHERE THEY WILL NOT BOTH FIT: THE 121.3 FALLBACK ─────────────────────
 * A real card at its narrowest proven width, 132px, is 294px tall. The
 * character needs about 1.85 times his width in height. Below roughly 390px
 * of scene height the two cannot share a column without one of them being
 * shrunk past what it is designed for — and this phase forbids shrinking
 * either, or rebuilding the card.
 *
 * 121.2 answered that by reserving nothing and showing nothing. 121.3
 * answers it by reserving the STRIP instead: the column keeps a compact,
 * always-present control, the character keeps the rest, and the real card —
 * the same shared component, untouched — opens from it across the whole
 * scene, where there is room for it at 250-400px wide. Nothing is hidden,
 * nothing is miniaturised, and the character does not shrink: at the widths
 * where this applies he is bound by the column's width, so the 44px costs
 * him nothing at all.
 */
/* His visible figure's height, from the width of his column. */
const FIGURE_PER_WIDTH = (1 - HEADROOM) / aspectRatio;
/* The slot the column reserves: visible figure only. */
const figureOf = (boxHeight) => boxHeight * (1 - HEADROOM);

/* How much of his natural column an inline card may cost him.
   ──────────────────────────────────────────────────────────────────────
   Measured, after the fallback was first written without it: on a 1280x800
   laptop the panel is 1038px wide and 547px tall, so a full card fits — by
   squeezing his column from the 230px the width would have given him to
   141px. He came out SMALLER on a desktop than on a 430px phone, which is
   precisely the complaint 121.2 was raised to fix.

   So the card has to earn its place. It is shown beside him only while it
   costs him no more than this; past it the strip wins and he keeps his
   size, with the real cards one tap away at 400px wide. 15% is what lets
   768x1024 keep its inline card (it costs 3%) while 1280x800 does not
   (it costs 39%). */
const MAX_COLUMN_LOSS = 0.15;

function conversationGeometry(width, height) {
  const byWidth = width * SIDE_SHARE;

  /* ── 1. His column when nothing but the strip is above him ──────────── */
  const free = Math.max(0, height - GAP - STRIP);
  const stripCol = clamp(CARD_MIN * 0.75, Math.min(byWidth, free / FIGURE_PER_WIDTH), CARD_MAX);

  /* ── 2. The column at which a real card and his figure exactly fill it ─ */
  const byHeight = (height - GAP - CARD_BODY - CARD_BORDER - DOTS_ROW + CARD_BORDER * CARD_IMAGE)
    / (CARD_IMAGE + FIGURE_PER_WIDTH);
  const cardCol = clamp(CARD_MIN, Math.min(byHeight, byWidth), CARD_MAX);

  if (byHeight >= CARD_MIN && byWidth >= CARD_MIN
      && cardCol >= stripCol * (1 - MAX_COLUMN_LOSS)) {
    const cardH = cardHeightFor(cardCol);
    /* Width-bound unless the column is taller than it is wide enough for. */
    const boxH = Math.min(cardCol / aspectRatio, (height - GAP - cardH) / (1 - HEADROOM));
    const figure = figureOf(boxH);

    /* ── 121.3a §2/§3 — raise the card into the room already there ───────
       The character's size and the mode decision above are EXACTLY what
       121.3 computed; the owner approved them and nothing here touches
       them. The lift is paid for out of the column's existing slack —
       which exists because the column reserves only his visible figure
       while the panel is taller than the pair needs — so the card moves
       up and he does not move at all.

       Where there is no slack the column is height-bound, meaning the card
       and his figure already fill it exactly. Then the lift is whatever
       fits, which is nothing, and the cane crosses the card's lower edge.
       Shrinking him to buy the room is what §3 forbids, so the limitation
       is reported rather than paid for. */
    const slack = Math.max(0, height - cardH - GAP - figure);
    const need = Math.max(0, CANE_RISE * boxH + TIP_GAP - DOTS_ROW - GAP);
    return {
      col: cardCol,
      cardH,
      mascotH: figure,
      lift: Math.min(slack, need),
      recs: "inline",
    };
  }

  const boxH = Math.min(stripCol / aspectRatio, free / (1 - HEADROOM));
  /* The strip is not a displayed product, so he does not point at it and
     there is nothing to lift (§6, short-screen fallback: do not redesign). */
  return { col: stripCol, cardH: STRIP, mascotH: figureOf(boxH), lift: 0, recs: "strip" };
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
  return { col, cardH: 0, mascotH: Math.min(col / aspectRatio, height), lift: 0, recs: "none" };
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
  /* No inset: the slot IS his FIGURE. An inset costs height as well as width
     — four pixels a side is fifteen pixels of figure at these proportions —
     and it opens a gap under the card that reads as a mistake.

     121.3: the slot is the visible figure, so the box is scaled back up by
     the headroom and allowed to overhang above it. Transparent pixels, so
     the card sitting 12px higher is not covered by anything. */
  const height = Math.min(slot.w / aspectRatio, slot.h / (1 - HEADROOM));
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
  const [recsMode, setRecsMode] = useState("none");
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
    vars.style.setProperty("--aichat-lift", `${geom.lift}px`);
    setRecsMode(geom.recs);

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

  return recsMode;
}
