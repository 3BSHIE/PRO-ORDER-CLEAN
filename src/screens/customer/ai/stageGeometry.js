import { aspectRatio } from "../../../vendor/zaatar-mascot/src/index.js";
import {
  HEADROOM, GAP, CANE_RISE, TIP_GAP, DOTS_ROW, STRIP,
  CARD_MIN, CARD_MAX, cardHeightFor, conversationGeometry,
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
   paid for with two thirds of the conversation. Below this the DEFAULT
   presentation stands down — and, since Phase 121.7, hands over to the
   compact one rather than to a strip. */
const CARD_HERO_MIN = 180;

/* ── Phase 121.7 — the floors the compact tiers may fall back to ────────
   The owner's instruction is that the actual dish appears without a reveal
   interaction, and on a 360x640 or 320x568 phone that cannot be had at the
   comfortable floors above: measured, 320x568 has 342.5px of stage for a
   conversation, a card, a character and the gaps between them, and a
   132px compact card plus its pagination row is 218.7 of it.

   So these are smaller floors, used ONLY after the default presentation has
   failed, and they are the smallest compromise rather than a target: the
   solver still spends everything it can on the card first and hands the
   remainder back to the conversation and then the character. Two bubbles
   become roughly one and a half; he keeps a figure at which the raised cane
   still reads. Nothing is hidden behind a control. */
const CHAT_FLOOR_COMPACT = 72;
const CHAT_FLOOR_TIGHT = 56;
/* One bubble and its gap. The floor of the floor, reached only by the
   smallest screen this product supports: measured at 320x568 the stage has
   342.5px, and a 132px compact card with its pagination row is 218.7 of it
   before the gap, the character and the conversation are paid at all. */
const CHAT_FLOOR_LAST = 44;
const FIGURE_COMPACT = 80;
const FIGURE_TIGHT = 72;
/* Smaller than this and he is an icon rather than a waiter making a
   gesture. 320x568 is the only screen that asks for it. */
const FIGURE_LAST = 64;

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

/* ── Phase 121.7 — three presentations of the SAME card ─────────────────
   Each is `height = slope x width + fixed`, and every number below was
   MEASURED by rendering the real ItemCard with real menu products at 132,
   180 and 230px wide and reading the box back — not derived from the
   stylesheet and not assumed.

     default    0.750 x w + 184.0   4:3 image, three-line name reserve
     compact    0.625 x w + 138.6   16:10 image, two-line name, two-line desc
     compact-1  0.625 x w + 123.2   as above with a one-line description

   The slopes are the image's aspect; the fixed parts are the body. What the
   compact presentation buys is 62px at a 132px card, and that 62px is the
   whole reason a 360x640 phone can show a real dish instead of a button
   saying how many there are.

   The third is not a third design. It is the second with the description
   bounded to one line instead of two, through --ic-desc-lines, for the one
   tier of screen where two lines is the difference between a conversation
   and no conversation at all. The full description is a tap away in
   Product Details, which is where the bounded two-line treatment already
   sent it. */
const CARD_MODEL = {
  default: { slope: CARD_PER_W, fixed: CARD_ONLY_0, descLines: 2 },
  compact: { slope: 0.625, fixed: 138.6, descLines: 2 },
  "compact-1": { slope: 0.625, fixed: 123.2, descLines: 1 },
};
const cardOnly = (w, model = CARD_MODEL.default) => model.fixed + model.slope * w;
const widthForCardOnly = (h, model = CARD_MODEL.default) => (h - model.fixed) / model.slope;

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
    return {
      ...conversationGeometry(width, height),
      chat: null, stack: false, card: "default", descLines: 2,
    };
  }

  const plain = plainFigure(width, room);

  if (!recs) {
    return {
      col: plain * FIG_W, cardH: 0, mascotH: plain, lift: 0, recs: "none",
      card: "default", descLines: 2,
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

  /* One attempt: a presentation of the card, a conversation floor and a
     figure, solved for the widest card the rest of the stage leaves. */
  const solveWith = (card, chatFloor, wanted) => {
    const figure = Math.min(wanted, Math.max(FIGURE_HARD, figureCap));
    const lift = liftFor(figure, dots);
    const region = room - chatFloor - GAP - figure - lift;
    const model = CARD_MODEL[card];
    const w = Math.min(widthForCardOnly(region - dots, model), byDepth, width, CARD_MAX);
    return { card, model, chatFloor, figure, lift, w };
  };

  /* ── 1. the approved presentation, at the comfortable floors ──────────
     His comfortable size first; then, rather than give up the card, down to
     the point where the gesture stops reading — but never into the
     conversation's floor, and only in PORTRAIT, which is the shape this
     composition is for. Measured at 1280x800 without that condition: the
     second pass rescued a 184px hero by taking him to 88px and leaving the
     conversation on its floor, on a laptop. */
  /* ── What "this is a phone" means to the solver ───────────────────────
     Not the viewport's orientation: this function is handed the SCENE, and
     a scene is wide and short even on an upright phone — at 390x560 it
     measures 358x346.5, so a height-versus-width test called it landscape
     and skipped the compact presentation entirely, which is how the strip
     survived at the bottom of the range.

     The honest test is width, and the threshold is already named: two
     CARD_MAX cards side by side is the point at which a stage stops being
     a phone's and starts being a tablet's. Measured scenes: 288 at 320px,
     398 at 430px, 728 on a tablet, 976 on a laptop. A tablet and a desktop
     never need the compact card anyway — the approved one fits them — and
     a short wide desktop has the side-by-side composition instead. */
  const phone = width <= CARD_MAX * 2;
  let fit = solveWith("default", CHAT_FLOOR, Math.min(FIGURE_RECS, Math.max(FIGURE_RECS_HARD, figureCap)));
  if (fit.w < CARD_HERO_MIN && phone) {
    fit = solveWith("default", CHAT_FLOOR, FIGURE_RECS_HARD);
  }
  let ok = fit.w >= CARD_HERO_MIN;

  /* ── 2. Phase 121.7 — the compact presentation, not a reveal strip ────
     This is the change the owner asked for. Where the approved card does
     not fit, the stage used to show a count — "Suggested dishes (3)" — and
     wait to be tapped. It now shows the actual dish in the compact
     presentation of the same component instead, and only steps down a tier
     when the measured stage genuinely cannot hold the one above.

     Portrait only. A landscape phone has its own composition and a short
     wide desktop has the side-by-side one; neither is a place to start
     shrinking cards. */
  /* Always evaluated in portrait, even when the approved presentation
     already qualified: the comparison below is what keeps the boundary from
     running backwards, and it cannot compare against something that was
     never solved. */
  if (phone) {
    const tiers = [
      ["compact", CHAT_FLOOR_COMPACT, FIGURE_COMPACT],
      ["compact", CHAT_FLOOR_COMPACT, FIGURE_TIGHT],
      ["compact-1", CHAT_FLOOR_TIGHT, FIGURE_TIGHT],
      ["compact-1", CHAT_FLOOR_LAST, FIGURE_LAST],
    ];
    for (const [card, chatFloor, figure] of tiers) {
      const tier = solveWith(card, chatFloor, figure);
      if (tier.w >= CARD_MIN) {
        /* ── Why the approved presentation does not always win ──────────
           Measured while sweeping heights: at 390x760 the compact tier
           gave a 230px card and at 390x780 the default one qualified at
           201 and took over — so the card got NARROWER as the phone got
           TALLER. A boundary that runs backwards is a bug whichever side
           of it is prettier.

           So the default presentation is preferred, but only while it is
           at least as wide as what the compact one would give. At 390x844
           and up both reach CARD_MAX and the tie goes to the approved
           card, which is why nothing the owner has already accepted
           moves. */
        if (!ok || tier.w > fit.w + 0.5) { fit = tier; ok = true; }
        break;
      }
      /* Keep the best attempt so far, so a stage that cannot reach
         CARD_MIN at all still reports honest numbers rather than the
         first tier's. */
      if (!ok && tier.w > fit.w) fit = tier;
    }

    /* ── The last resort, before any thought of a strip ─────────────────
       Everything above asks "how wide a card fits if the conversation and
       the character keep this floor?". This asks the opposite: give the
       card the narrowest width the menu grid already proves, put the
       character on his hard floor, and hand the conversation whatever is
       left — even if that is very little.

       It is what keeps the cliff below the supported range. Measured by
       sweeping the solver: without it the strip returned at about 340px of
       stage, which is a 390x575 phone; with it the strip does not return
       until about 287px, which is no device this product supports. The
       surplus pass below then gives the conversation everything the card
       did not need, so this is a floor and not a target. */
    if (!ok) {
      const last = solveWith("compact-1", 0, FIGURE_HARD);
      if (last.w >= CARD_MIN) { fit = { ...last, w: CARD_MIN, chatFloor: 0 }; ok = true; }
    }
  }

  if (!ok) {
    /* Nothing above fits. On a portrait phone this is now unreachable at
       every size this product supports — it is the landscape and
       short-desktop path, where the card's width is spent out of the
       conversation's width rather than its height and the strip plus the
       full-scene viewer is the honest answer. */
    const avail = Math.max(0, room - GAP - STRIP);
    const figure = Math.min(plain, Math.max(Math.min(FIGURE_HARD, avail), avail - CHAT_FLOOR));
    return {
      col: Math.min(width, CARD_MAX), cardH: STRIP, mascotH: figure, lift: 0,
      recs: "strip", card: "default", descLines: 2,
      chat: Math.max(0, avail - figure), stack: true,
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
  const cardH = cardOnly(fit.w, fit.model) + dots;
  let chat = fit.chatFloor;
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

  return {
    col: fit.w, cardH, mascotH: figure, lift, recs: "inline",
    /* Which presentation of the shared card the stage has room for, and
       how many description lines it may show. The overlay hands both to
       the carousel; nothing else in the tree knows the difference. */
    card: fit.card, descLines: fit.model.descLines,
    chat, stack: true,
  };
}
