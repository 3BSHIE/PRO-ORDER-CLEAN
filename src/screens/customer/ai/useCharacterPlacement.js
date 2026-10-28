import { useLayoutEffect, useRef, useState } from "react";
import { aspectRatio, caneTip, figureTop } from "../../../vendor/zaatar-mascot/src/index.js";

/**
 * useCharacterPlacement — Phase 121.1. Zaatar's position, measured not laid out.
 *
 * ── WHY PHASE 121.0's TRANSITION WAS WORSE THAN THE APPROVED ONE ─────────
 * 121.0 made the character a GRID ITEM and FLIPped it: measure the old box,
 * let the grid resize it, animate the difference away. Three things were
 * wrong with that, and together they are the "less smooth" the owner saw.
 *
 * 1. It scaled the artwork UP. Welcome is the big state, so the FLIP applied
 *    scale = oldHeight / newHeight > 1 to an element the browser had already
 *    laid out at the SMALL size. For 650ms of travel the guest was looking at
 *    a magnified small image, which is exactly the "temporarily scale up
 *    beyond the intended artwork size" this phase forbids. The approved
 *    implementation never does this: it always renders at the LARGER box and
 *    scales DOWN, so the bitmap is only ever minified.
 *
 * 2. The box changed shape, not just size. Measured at 768px the container
 *    went 260x579 to 200x673 — narrower AND taller. A single uniform scale
 *    cannot describe that, so the transform and the figure's real movement
 *    disagreed and the eye caught the mismatch.
 *
 * 3. Nothing guarded the move. A ResizeObserver firing as the new layout
 *    mounted, or a second phase change, could cut the animation short.
 *
 * ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────
 * The approved architecture, adapted: each layout renders an empty SLOT and
 * the character lives in one absolutely-positioned LAYER over a shared
 * SCENE. The layer is never inside either layout, so swapping layouts cannot
 * unmount, resize or reflow it — the hook measures the slot, fits the
 * character's own aspect ratio into it, and moves the layer there.
 *
 * Because the layer's box is set explicitly, the transform is a true
 * box-to-box map, and the downscale-only rule keeps the artwork sharp.
 * Reading the layer's CURRENT visual rect means an interrupted move
 * continues from where it actually is rather than snapping back.
 *
 * Geometry and choreography follow ZAATAR-LAB's useCharacterPlacement at
 * 199c15d4, which is the approved reference this phase names.
 */

/* The top of the hair across the poses that can appear here. Above it the
   canvas is transparent headroom reserved for Suggesting's raised cane, so
   on the welcome screen it may overlap whatever sits above the slot. */
const HEADROOM = Math.min(figureTop.welcome, figureTop.idle, figureTop.thinking);

const SIDE = 4;     // px clear of the column edges
const BOTTOM = 6;   // px below the shoes
const TOP = 8;      // px above the recommendation zone
const GAP = 12;     // px between the recommendation zone and the cane tip
const CARDS_MIN = 150;   // smallest recommendation area worth reserving
const CARDS_MAX = 260;
const GROWTH_CAP = 1.15; // with no recommendations he may grow at most this much

/** Welcome: as large as the slot allows, feet on its bottom edge. */
function fitWelcome(slot) {
  const height = Math.min(slot.h / (1 - HEADROOM), slot.w / aspectRatio);
  const width = height * aspectRatio;
  return {
    box: { left: slot.x + (slot.w - width) / 2, top: slot.y + slot.h - height, width, height },
    zone: null,
  };
}

/**
 * Conversation: sized to the character column, leaving the cane tip clear of
 * the recommendation zone when one is being reserved.
 *
 * The growth cap is what stops him ballooning to fill a tall empty column
 * while no card exists — §3's "avoid large empty spaces".
 */
function fitActive(slot, showCards) {
  const byWidth = (slot.w - SIDE * 2) / aspectRatio;
  const withCards = Math.min(
    byWidth,
    (slot.h - BOTTOM - TOP - GAP - CARDS_MIN) / (1 - caneTip.y)
  );
  const height = showCards
    ? withCards
    : Math.min(byWidth, slot.h - BOTTOM - TOP, Math.max(withCards, 0) * GROWTH_CAP || byWidth);
  const width = height * aspectRatio;
  const left = slot.x + (slot.w - width) / 2;
  const top = slot.y + slot.h - BOTTOM - height;

  const zoneBottom = top - slot.y + caneTip.y * height - GAP;
  const zoneHeight = Math.min(zoneBottom - TOP, CARDS_MAX);
  return {
    box: { left, top, width, height },
    zone: zoneHeight > 0
      ? { top: zoneBottom - zoneHeight, height: zoneHeight, tipX: left - slot.x + caneTip.x * width }
      : null,
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

const sameZone = (a, b) =>
  a === b ||
  (a && b && ["top", "height", "tipX"].every((k) => Math.abs(a[k] - b[k]) < 0.5));

export function useCharacterPlacement({ sceneRef, layerRef, slot, mode, showCards, motion, reducedMotion }) {
  const [zone, setZone] = useState(null);
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
    const slotRect = slot.getBoundingClientRect();
    /* Closed overlay: keep the last placement rather than collapsing to zero,
       so reopening does not animate out of nowhere. */
    if (!sceneRect.width || !slotRect.width) return;

    const rect = {
      x: slotRect.left - sceneRect.left,
      y: slotRect.top - sceneRect.top,
      w: slotRect.width,
      h: slotRect.height,
    };
    const { box, zone: nextZone } = mode === "welcome" ? fitWelcome(rect) : fitActive(rect, showCards);
    setZone((prev) => (sameZone(prev, nextZone) ? prev : nextZone));

    const keyChanged = lastKey.current !== motion.key;
    lastKey.current = motion.key;

    /* A resize that lands mid-move — the incoming layout's observer fires
       once on mount — must not cut the move short. */
    if (!keyChanged && animation.current && sameBox(animation.current.target, box)) return;

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
    animation.current = { target: box, cancel: () => run.cancel() };
    run.finished
      .then(() => {
        apply(layer, box);
        run.cancel();
      })
      .catch(() => {});
  }, [resizeTick, slot, mode, showCards, motion.key, motion.ms, reducedMotion, sceneRef, layerRef]);

  return zone;
}
