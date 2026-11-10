import { aspectRatio } from "../../../vendor/zaatar-mascot/src/index.js";
import {
  HEADROOM, GAP, CANE_RISE, TIP_GAP, DOTS_ROW, STRIP,
  CARD_MAX, cardHeightFor, conversationGeometry,
} from "./useCharacterPlacement.js";
import { DEPTH_SCALE, DEPTH_OFF_MIN } from "./depthTokens.js";

/**
 * stageGeometry — Phase 121.5. The approved "B Refined" composition.
 *
 * The conversation above, the recommendation card above the character in one
 * stage below, the suggested questions and the composer under both. It is
 * the layout the owner selected after Phases 121.4, 121.4C and 121.4D, and
 * this file is the budget that makes it fit.
 *
 * ── THE ONE FACT THAT DECIDES EVERYTHING HERE ───────────────────────────
 * The real ItemCard's height GROWS WITH ITS WIDTH: a 4:3 image plus a body
 * of fixed line-count, so about 0.75px of height for every px of width plus
 * ~197. Measured, not assumed — see useCharacterPlacement's cardHeightFor,
 * which this file inverts from two samples rather than restating.
 *
 * Stacked vertically that means every pixel the card gains in width costs
 * three quarters of a pixel somewhere else. So this is a budget, spent in a
 * fixed order:
 *
 *   1. the conversation's floor — below two bubbles the upper region stops
 *      being a conversation and the layout has no reason to exist;
 *   2. the character's floor — the size at which the raised cane still
 *      reads as a gesture toward the card;
 *   3. the card takes everything left, capped at the width the menu's own
 *      grid already proves (CARD_MAX);
 *   4. any surplus goes back to the conversation first and the character
 *      second;
 *   5. where that cannot seat a card worth the space, the shipping strip.
 *
 * ── WHAT CHANGED FROM THE 121.4D PROTOTYPE ──────────────────────────────
 * The prototype hid the suggested-questions row (41.5px) whenever a dish
 * was on screen. The owner rejected that: they are a core interaction, not
 * spacing. They are permanently visible now, which means this solver is
 * handed a SMALLER scene than the prototype's measurements were taken in —
 * the row sits outside the scene, so its cost is already subtracted from
 * the height that arrives here. Nothing in this file has to know about it;
 * what it does have to do is spend what is left well, which is why the
 * surplus order above puts the conversation first.
 *
 * The height that pays for the row came from four measured trims rather
 * than from the card: the scene's own padding, the split gap, the compact
 * AI header, and the composer's bottom inset. See the stylesheet.
 *
 * ── LANDSCAPE ───────────────────────────────────────────────────────────
 * A landscape phone leaves roughly 144px of scene after the two headers,
 * the questions and the composer. No vertical arrangement divides that: the
 * 121.4D prototype produced a 20px conversation there, which the owner
 * called unacceptable and is. A short, WIDE panel gets the side-by-side
 * arrangement instead — the one the assistant shipped with, unchanged and
 * already proven — because its card spends WIDTH rather than height. That
 * is a fallback for a shape the stack cannot serve, not a second default.
 */

/* His BOX width per 1px of visible figure; the box carries transparent
   headroom above the hair for the raised cane. */
const FIG_W = aspectRatio / (1 - HEADROOM);

/* ── The conversation ───────────────────────────────────────────────────
   Two single-line bubbles, their gap and the log's padding: the floor below
   which the upper region cannot show a question and its answer together. */
const CHAT_FLOOR = 100;
/* About five single-line bubbles (5 x 37 + 4 x 7 + 4 = 217). Past this the
   conversation has stopped being the thing that needed protecting and the
   surplus is better spent on the character, which is what a tablet wants. */
const CHAT_COMFORT = 220;
/* Panels that cannot afford the floor at all. Reached only inside the strip
   fallback, never to buy a card. */
const CHAT_HARD = 64;

/* ── The character ──────────────────────────────────────────────────────
   104 is the size at which the raised cane still reads as a gesture toward
   the card; it has survived every phase since the comparison began. */
const FIGURE_RECS = 104;
/* The point below which "recognisable, expressive" has failed. Only the
   tightest card-bearing panels reach it. */
const FIGURE_RECS_HARD = 88;
/* He must be significantly more prominent without a card than with one. A
   quarter smaller is a change the eye reads as deliberate; with no cap a
   tall tablet would hand him so much of the surplus that the card's arrival
   would barely move him. */
const FIGURE_SHRINK = 0.75;
/* Past this he crowds the card instead of supporting it. */
const FIGURE_RECS_MAX = 220;

/* With nothing above him. 0.42 is the share the earlier side-by-side layout
   gave his COLUMN, applied to the other axis, so the two compositions'
   no-recommendation states stay comparable. */
const STAGE_SHARE_PLAIN = 0.42;
const FIGURE_MIN_PLAIN = 108;
const FIGURE_MAX_PLAIN = 340;
/* Below this he is absent rather than small, so the conversation yields
   first. */
const FIGURE_HARD = 56;

/* ── When the hero is not a hero ────────────────────────────────────────
   CARD_MIN is a feasibility floor: 132px is a card the menu grid already
   draws on a 320px phone. It is not a quality bar, and on a short, WIDE
   panel the difference matters — measured at 1024x768 with only CARD_MIN
   guarding the result, the hero came out 141.7px with the conversation on
   its 100px floor: a desktop given a narrower card than a 430px phone gets,
   paid for with two thirds of the conversation. Below this the stack stands
   down and the strip takes over at the full width of the stage. */
const CARD_HERO_MIN = 180;

/* ── The smallest scene a vertical stack can divide at all ──────────────
   Floor conversation, the split gap, the stage gap, the strip and a
   recognisable figure. Below it the stack has nothing to offer and the
   side-by-side fallback takes over. Derived, so it tracks the constants
   above rather than naming a breakpoint. */
const VSTACK_MIN_H = CHAT_FLOOR + GAP + GAP + STRIP + FIGURE_RECS;

/* cardHeightFor bakes the pagination row into its answer. The card ALONE is
   that less DOTS_ROW; both are needed, because the dots are reserved only
   when there is more than one product. Affine, so two samples invert it
   exactly and no card constant is duplicated here. */
const CARD_ONLY_0 = cardHeightFor(0) - DOTS_ROW;
const CARD_PER_W = cardHeightFor(1) - cardHeightFor(0);
const cardOnly = (w) => CARD_ONLY_0 + CARD_PER_W * w;
const widthForCardOnly = (h) => (h - CARD_ONLY_0) / CARD_PER_W;

/* How far the raised cane rises above his figure, per px of figure. */
const K = CANE_RISE / (1 - HEADROOM);

/* How far the card must be raised so the cane reaches toward it instead of
   through it (121.3a, derived from the package's rig). The pagination row
   and the stage's gap already sit between them, so only the excess is a
   lift — and with no dots to reserve the lift grows by exactly what the
   dots row gave back, which is why the card does not change size between
   one product and three. */
const liftFor = (figure, dots) => Math.max(0, K * figure + TIP_GAP - dots - GAP);
/* Inverse: the figure whose figure + lift exactly spends `total`. */
const figureForTotal = (total, dots) => (total - TIP_GAP + dots + GAP) / (1 + K);

/** What he gets with nothing above him. */
function plainFigure(width, room) {
  const target = Math.min(room * STAGE_SHARE_PLAIN, width / FIG_W, FIGURE_MAX_PLAIN);
  /* A panel shorter than the floor wins, or he would push the composer off
     the bottom of the screen. */
  const cap = Math.max(Math.min(FIGURE_HARD, room), room - CHAT_HARD);
  return Math.max(0, Math.min(Math.max(FIGURE_MIN_PLAIN, target), cap));
}

/**
 * @param {number} width   the scene's measured inner width
 * @param {number} height  the scene's measured inner height
 * @param {{recs:boolean, count:number, splitGap:number}} state
 * @returns {{col,cardH,mascotH,lift,recs,chat,stack}}
 *
 * `stack` is the composition itself: true for the vertical stage, false for
 * the side-by-side fallback. The overlay renders one or the other from it.
 * In the stack, `col` is the HERO CARD's width and the stage centres him in
 * the full width; in the fallback it is his column, as it always was.
 * `cardH` is the whole region: card plus the pagination row when there is
 * one. `recs` is "inline" | "strip" | "none".
 */
export function stageGeometry(width, height, { recs, count, splitGap }) {
  const room = Math.max(0, height - splitGap);

  /* ── The landscape fallback ──────────────────────────────────────────
     Short AND wide: there is no vertical division of this panel that keeps
     a conversation, a product and a character, so the arrangement changes
     rather than the numbers. Portrait never reaches here, whatever its
     size — a 320x568 phone has 382px of scene and takes the stack with a
     strip in it, which is the composition the owner approved. */
  if (room < VSTACK_MIN_H && width > height) {
    return { ...conversationGeometry(width, height), chat: null, stack: false };
  }

  const plain = plainFigure(width, room);

  if (!recs) {
    return {
      col: plain * FIG_W, cardH: 0, mascotH: plain, lift: 0, recs: "none",
      chat: Math.max(0, room - plain), stack: true,
    };
  }

  const dots = count > 1 ? DOTS_ROW : 0;
  /* Never larger than he was with no card above him, and never more than
     three quarters of it, so the arrival always reads as a change. */
  const figureCap = Math.min(FIGURE_RECS_MAX, FIGURE_SHRINK * plain);
  /* The hero's horizontal ceiling. The recessed card is scaled and offset
     and the scene clips, so recessed half-width + offset must not exceed
     the stage's half-width. On a phone this never binds — a 230px hero on a
     358px stage leaves 128px of slack and the recessed card needs about 77
     — which is exactly why depth is the right shape for this composition
     and a side-by-side peek is not. */
  const byDepth = (width - 2 * DEPTH_OFF_MIN) / DEPTH_SCALE;

  const solve = (figure) => {
    const lift = liftFor(figure, dots);
    const region = room - CHAT_FLOOR - GAP - figure - lift;
    const w = Math.min(widthForCardOnly(region - dots), byDepth, width, CARD_MAX);
    return { figure, lift, w };
  };

  /* His comfortable size first; then, rather than give up the card, down to
     the point where the gesture stops reading — but never into the
     conversation's floor, and only in PORTRAIT, which is the shape this
     composition is for. Measured at 1280x800 without that condition: the
     second pass rescued a 184px hero by taking him to 88px and leaving the
     conversation on its floor, on a laptop. */
  let fit = solve(Math.min(FIGURE_RECS, Math.max(FIGURE_RECS_HARD, figureCap)));
  if (fit.w < CARD_HERO_MIN && height >= width) {
    fit = solve(Math.min(FIGURE_RECS_HARD, Math.max(FIGURE_HARD, figureCap)));
  }

  if (fit.w < CARD_HERO_MIN) {
    /* Either no real card at all, or none worth the conversation it would
       cost. The shipping fallback, unchanged in behaviour — but at the full
       width of the stage, which on a short phone is about twice what the
       old side-by-side column gave it. */
    const avail = Math.max(0, room - GAP - STRIP);
    const figure = Math.min(plain, Math.max(Math.min(FIGURE_HARD, avail), avail - CHAT_FLOOR));
    return {
      col: Math.min(width, CARD_MAX), cardH: STRIP, mascotH: figure, lift: 0,
      recs: "strip", chat: Math.max(0, avail - figure), stack: true,
    };
  }

  /* ── The surplus, and the order it is spent in ────────────────────────
     The card is often capped — by CARD_MAX, or by the stage's width — long
     before the budget runs out. It goes to the CONVERSATION first, up to
     comfort, because that is the region the owner's second priority names;
     then to the CHARACTER, up to his cap, which is what a tablet wants;
     then back to the conversation, because the stage must not be left
     holding space nobody asked for. */
  let figure = fit.figure;
  let lift = fit.lift;
  const cardH = cardOnly(fit.w) + dots;
  let chat = CHAT_FLOOR;
  let spare = room - chat - GAP - figure - lift - cardH;

  if (spare > 0.5) {
    const toChat = Math.min(spare, Math.max(0, CHAT_COMFORT - chat));
    chat += toChat;
    spare -= toChat;
  }
  if (spare > 0.5 && figureCap > figure) {
    const before = figure + lift;
    figure = Math.max(figure, Math.min(figureCap, figureForTotal(before + spare, dots)));
    lift = liftFor(figure, dots);
    spare -= (figure + lift) - before;
  }
  if (spare > 0.5) chat += spare;

  return { col: fit.w, cardH, mascotH: figure, lift, recs: "inline", chat, stack: true };
}
