import { useLayoutEffect } from "react";

/**
 * useBodyScrollLock — Phase 41.
 *
 * Freezes the page behind an open customer modal/sheet and puts the guest
 * back on exactly the same pixel when it closes.
 *
 * Why the fixed-body technique rather than `overflow:hidden` on <body>:
 *   overflow:hidden alone is the tempting one-liner, and it does not hold on
 *   mobile Safari — the page keeps scrolling under the sheet, and once the
 *   modal's own content hits its end the momentum bleeds into the page
 *   behind it. Taking the body out of flow is the behavior that actually
 *   works on a phone, which is the only place this bug matters. The cost is
 *   that the document collapses to zero scroll, so the position has to be
 *   captured and restored by hand — that is what the rest of this file is.
 *
 * Reference counted on purpose. If two overlays are ever open at once,
 * closing the top one must not unlock the page while the other is still up,
 * and only the last one out restores the scroll position. The counter also
 * makes the hook safe under StrictMode, which mounts effects, tears them
 * down and mounts them again in development: the count returns to where it
 * started and the saved position is simply re-read.
 *
 * Scope: customer surfaces only. The shared components/ui/Modal.jsx is used
 * by five Admin screens and the HomeScreen component kit, so it is
 * deliberately left alone.
 *
 * @param {boolean} active — lock while true, release when false/unmounted
 */
export function useBodyScrollLock(active) {
  useLayoutEffect(() => {
    if (!active) return undefined;
    lock();
    return unlock;
  }, [active]);
}

/* Module-level, because the lock is a property of the document, not of any
   one component instance. */
let lockCount = 0;
let savedScrollY = 0;
let savedStyle = null;

function lock() {
  /* Another overlay already has the page frozen — join it, change nothing.
     Re-applying would clobber savedScrollY with the fixed body's 0. */
  if (lockCount++ > 0) return;

  const body = document.body;
  savedScrollY = window.scrollY;

  savedStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingLeft: body.style.paddingLeft,
    paddingRight: body.style.paddingRight,
  };

  /* Layout stability: taking the body out of flow removes the classic
     desktop scrollbar, and a centred container would otherwise slide
     sideways by half its width. Replace it with padding on whichever edge
     it occupied.

     The edge is MEASURED, not inferred from direction. Which side a
     viewport scrollbar sits on in an RTL document is engine-specific — this
     app's own RTL pages keep it on the right — so reading `direction` and
     assuming "RTL means left" compensates the wrong edge and doubles the
     shift instead of cancelling it. Comparing the root's border box against
     the viewport observes the truth wherever the code runs: a gap on the
     left means the scrollbar is on the left.

     On touch devices there is no classic scrollbar, the width is 0, and
     this whole block is a no-op — mobile gains no stray spacing. */
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) {
    const scrollbarOnLeft = document.documentElement.getBoundingClientRect().left > 0.5;
    const edge = scrollbarOnLeft ? "paddingLeft" : "paddingRight";
    const computed = getComputedStyle(body);
    const current = parseFloat(scrollbarOnLeft ? computed.paddingLeft : computed.paddingRight) || 0;
    body.style[edge] = `${current + scrollbarWidth}px`;
  }

  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

function unlock() {
  /* Still held by another overlay — leave the page frozen. */
  if (--lockCount > 0) return;
  if (lockCount < 0) lockCount = 0; // defensive; never expected

  const body = document.body;
  if (savedStyle) {
    /* Restore the exact inline values that were there before, so a style the
       app set for its own reasons survives a modal round-trip. */
    Object.assign(body.style, savedStyle);
    savedStyle = null;
  }

  /* Undo the negative `top` in the same frame the styles come back, before
     the browser paints, so the page never flashes at the top. */
  window.scrollTo(0, savedScrollY);
}
