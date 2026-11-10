import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ItemCard } from "../components/ProductCard.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { getCharacter, characterName, withName } from "./characters.js";
import {
  DEPTH_SCALE, DEPTH_OFF_MIN, DEPTH_OFF_MAX, DEPTH_OFF_SHARE,
  DEPTH_FAR_SCALE, DEPTH_FAR_OFF, DRAG_FOLLOW, DRAG_MAX, DRAG_COMMIT,
} from "./depthTokens.js";

/* A stage wide enough to have spent the whole offset has width left over,
   and a tablet should use it rather than leave the sides empty: the card
   beyond the neighbour surfaces too, fainter again, so all three dishes are
   on screen at once. Derived from the measured offset
   rather than from a breakpoint — 390 and 430 never reach it, 768 does. */
const isWide = (off) => off >= DEPTH_OFF_MAX;

/**
 * DepthCarousel — Phase 121.4D, shipped in Phase 121.5.
 *
 * The owner's words: "Not a basic flat horizontal slider." The shipping
 * RecommendationCarousel is a scroll-snap track — three cards in a row, one
 * in view — and it is the right answer for Option A's narrow column. In a
 * vertical composition it wastes the one resource that composition has to
 * spare, which is WIDTH, and it gives the guest no sense that a second dish
 * is waiting.
 *
 * -- WHAT IS NEW AND WHAT IS NOT -----------------------------------------
 * The card is the guest menu's own ItemCard, imported: same
 * image, badges, attributes, description, price, out-of-stock treatment and
 * "+" action, and the same `onOpen` the menu hands to the real
 * ItemDetailsModal. The pagination row is the shipping `.airecs__dots`,
 * unchanged. The entrance is the shipping `.airecs` / `.airecs--in`
 * transition, unchanged, so the card still arrives on the approved
 * Suggesting choreography and the overlay's exit detection — which waits
 * for THIS element's opacity transition — keeps working untouched.
 *
 * What is new is one thing: the three cards are LAYERED instead of being in
 * a row, so the hero is the full width of the stage's budget and the next
 * dish shows from behind it.
 *
 * -- THE DEPTH MODEL ----------------------------------------------------
 * Every card has a relative depth `d = its index - the active index`:
 *
 *     d =  0   front, scale 1, no offset, opaque, interactive
 *     d = +-1  recessed to the side, scaled, muted, inert
 *     |d| > 1  parked further back, invisible, inert
 *
 * It is symmetric on purpose. The approved behaviour is that the outgoing card moves
 * away from the primary position, gradually becomes slightly smaller, moves
 * into the recessed depth layer, becomes visually muted" — which is exactly
 * what d going from 0 to -1 does — and that movement be natural in either
 * direction, which a one-sided stack cannot give. With three products and
 * the middle one active, all three are visible: one behind each side.
 *
 * Nothing mounts or unmounts when the active card changes, so bringing a
 * dish forward is a transition of an element the browser has already laid
 * out and decoded. That is also what keeps the character still: the
 * geometry does not depend on which card is active, so the character is not
 * re-placed, not re-posed and not remounted by a swipe.
 *
 * -- WHY THE RECESSED CARD IS INERT AND STILL SELECTABLE ----------------
 * Inactive cards must not expose misleading actionable controls
 * while visually behind the active card" and their descendants must not
 * take keyboard focus. So the real ItemCard inside a recessed layer is
 * `inert` and out of the accessibility tree — its "+" cannot be tapped or
 * reached — and a transparent sibling button on top of it selects that
 * card. Tapping the preview brings the dish forward; it does not add
 * anything to anything. That is the "distinct interaction" the section
 * asks for, and it is why the button is a SIBLING of the inert wrapper
 * rather than a child of it.
 */

/* Which i18n keys this uses: all three already exist for the shipping
   carousel, so the depth version adds no product copy. `recsPick` is the
   one new string and it falls back in English. */
export default function DepthCarousel({
  items,
  onOpen,
  customLabels,
  visible = true,
}) {
  const { t, language } = useLanguage();
  const name = characterName(getCharacter(), t);
  const count = items.length;

  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [off, setOff] = useState(DEPTH_OFF_MIN);
  const stackRef = useRef(null);
  const heroRef = useRef(null);
  /* The live gesture, and whether it was claimed from the page. A ref, not
     state: it is read inside pointer handlers in the same task that set it,
     and re-rendering on every pointermove would be the "delayed or
     unresponsive swipe" the approved design rules out. */
  const gesture = useRef(null);
  const dragged = useRef(false);

  /* A new recommendation group starts at its first dish. */
  useEffect(() => { setIndex(0); }, [items]);
  /* Never leave the active index past the end of a shorter group. */
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  /* -- How far to the side the recessed card sits ------------------------
     Measured, not assumed. The hero's width is the geometry's answer
     (`--aichat-col`), the stack's width is the whole stage, and the offset
     is a share of the difference — so a phone lands on the minimum and a
     tablet, which should show more of the next dish, lands on
     the maximum, with no breakpoint between them.

     The second clamp is the one that matters for correctness: the scene
     clips, so the recessed card's outer edge has to stay inside the stage.
     refinedGeometry caps the hero's width with the same inequality, which
     is why it cannot bind here in practice — this is the belt to that
     file's braces, for a stage narrowed by something neither of them
     predicted. */
  const measure = useCallback(() => {
    const stack = stackRef.current;
    const hero = heroRef.current;
    if (!stack || !hero) return;
    const stackW = stack.clientWidth;
    const heroW = hero.offsetWidth;
    if (!stackW || !heroW) return;
    const want = Math.max(
      DEPTH_OFF_MIN,
      Math.min(DEPTH_OFF_MAX, (stackW - heroW) * DEPTH_OFF_SHARE),
    );
    const room = (stackW - heroW * DEPTH_SCALE) / 2;
    setOff(Math.max(0, Math.min(want, room)));
  }, []);

  useLayoutEffect(() => {
    measure();
    const stack = stackRef.current;
    if (!stack || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(stack);
    if (heroRef.current) ro.observe(heroRef.current);
    return () => ro.disconnect();
  }, [measure, count]);

  /* Arabic mirrors the STACK, not the artwork: for a right-to-left reader
     the dish waiting next belongs on the left. The mascot's own orientation
     is untouched — he lives in a `direction: ltr` layer that this component
     never touches. */
  const rtl = (typeof document !== "undefined"
    && document.documentElement.dir === "rtl") || language === "ar";
  const sign = rtl ? -1 : 1;

  const step = useCallback((delta) => {
    setIndex((i) => Math.min(count - 1, Math.max(0, i + delta)));
  }, [count]);

  /* -- The gesture ------------------------------------------------------
     `touch-action: pan-y` on the stack is what hands vertical gestures back
     to the page and the chat, so a finger that starts moving
     downward is never claimed here at all; the check below is the same rule
     for a mouse or trackpad, which have no touch-action. */
  const onPointerDown = (e) => {
    dragged.current = false;
    if (count < 2) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, claimed: false };
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.claimed) {
      /* Clearly vertical: let it go, for good. */
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        gesture.current = null;
        return;
      }
      if (Math.abs(dx) < 10) return;
      g.claimed = true;
      /* From here the card under the finger must not also receive a click
         when it lifts. */
      dragged.current = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not captured: the handlers below still see the move */ }
    }
    setDrag(Math.max(-DRAG_MAX, Math.min(DRAG_MAX, dx * DRAG_FOLLOW)));
  };

  const endGesture = (e) => {
    const g = gesture.current;
    gesture.current = null;
    setDrag(0);
    if (!g || !g.claimed || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    if (Math.abs(dx) < DRAG_COMMIT) return;
    /* Dragging the stack toward its leading edge brings the next dish
       forward, in both directions and both languages. */
    step(dx * sign < 0 ? 1 : -1);
  };

  const onPointerCancel = () => {
    gesture.current = null;
    setDrag(0);
  };

  /* A drag that ends on the hero must not open Product Details. Capture
     phase, so it is stopped before the card's own handler sees it; the flag
     is cleared by the next pointerdown rather than by a timer, so there is
     no window in which it is wrong. */
  const onClickCapture = (e) => {
    if (!dragged.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  /* Arrows move by one in reading order, exactly as the shipping carousel
     does, so Arabic gets Left as forward. Home and End are free. */
  const onKeyDown = (e) => {
    let delta = 0;
    if (e.key === "ArrowRight") delta = rtl ? -1 : 1;
    else if (e.key === "ArrowLeft") delta = rtl ? 1 : -1;
    else if (e.key === "Home") delta = -index;
    else if (e.key === "End") delta = count - 1 - index;
    else return;
    const next = Math.min(count - 1, Math.max(0, index + delta));
    if (next === index) return;
    e.preventDefault();
    setIndex(next);
  };

  if (count === 0) return null;

  return (
    /* The shipping wrapper, classes and all: its entrance transition is the
       approved one and the overlay's exit listener waits on its opacity. */
    <div
      className={`airecs aidepth${visible ? " airecs--in" : ""}`}
      aria-hidden={visible ? undefined : "true"}
      inert={visible ? undefined : ""}
    >
      <div
        className="aidepth__stack"
        ref={stackRef}
        role="group"
        tabIndex={0}
        aria-roledescription={t("ai.recsRole", "Suggested dishes")}
        aria-label={withName(t("ai.recsLabel", "Dishes {name} suggests"), name)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        data-dragging={drag !== 0 ? "1" : "0"}
        data-wide={isWide(off) ? "1" : "0"}
        data-active={index}
        style={{
          "--aidepth-drag": `${drag}px`,
          "--aidepth-off": `${off}px`,
          "--aidepth-scale": DEPTH_SCALE,
          "--aidepth-far-scale": DEPTH_FAR_SCALE,
          "--aidepth-far-off": `${off * DEPTH_FAR_OFF}px`,
          "--aidepth-sign": sign,
        }}
      >
        {items.map((item, i) => {
          const d = i - index;
          const near = Math.abs(d) === 1;
          const front = d === 0;
          /* Anything the guest can actually see gets a way to be chosen;
             a card parked invisibly behind does not, because a control
             over nothing is exactly the invisible-but-clickable product
             the approved design rules out. */
          const selectable = near || (isWide(off) && Math.abs(d) === 2);
          return (
            <div
              className={`aidepth__card${front ? " aidepth__card--front" : ""}`}
              key={item.id}
              ref={front ? heroRef : undefined}
              data-depth={front ? 0 : near ? Math.sign(d) : Math.sign(d) * 2}
              /* Front highest. Two per step so a near card is always above
                 a far one on the same side, whatever the group's length. */
              style={{ zIndex: 10 - Math.min(2, Math.abs(d)) * 2 }}
            >
              <div
                className="aidepth__real"
                aria-hidden={front ? undefined : "true"}
                inert={front ? undefined : ""}
              >
                <ItemCard item={item} onOpen={onOpen} customLabels={customLabels} />
              </div>
              {selectable && (
                <button
                  type="button"
                  className="aidepth__pick"
                  onClick={() => setIndex(i)}
                  aria-label={t("ai.recsGoTo", "Show dish {n}").replace("{n}", String(i + 1))}
                />
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        /* The shipping pagination row. Section 12: the selected dish must be
           identifiable without relying on movement, and under reduced
           motion this is what carries it, together with the recessed card's
           static scale and opacity — both of which are states, not
           animations, and are therefore still there when the transitions
           are not. */
        <div className="airecs__dots">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`airecs__dot ${i === index ? "airecs__dot--on" : ""}`}
              aria-current={i === index ? "true" : undefined}
              aria-label={t("ai.recsGoTo", "Show dish {n}").replace("{n}", String(i + 1))}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
