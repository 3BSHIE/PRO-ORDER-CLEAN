import { useEffect, useRef, useState } from "react";

/**
 * useVirtualKeyboard — Phase 121.6. Is a software keyboard covering the
 * bottom of the screen, and by how much?
 *
 * ── WHY NOT `input:focus` ────────────────────────────────────────────────
 * Because focus is not the question. On a phone the two come apart
 * constantly and in both directions:
 *
 *   · an iPad with a Smart Keyboard focuses the field and shows nothing;
 *   · Mobile Safari keeps focus after the guest taps the keyboard's own
 *     dismiss key, so the field is still focused over an empty screen;
 *   · a desktop user clicking the field has no keyboard to make room for;
 *   · the browser's own toolbar slides in and out while nothing is focused
 *     at all, which resizes the visual viewport exactly as a keyboard does.
 *
 * So focus is used only as a CORROBORATING signal. What actually decides it
 * is how much of the layout viewport has been taken away at the bottom.
 *
 * ── THE MEASUREMENT ──────────────────────────────────────────────────────
 * Two browsers, two behaviours, and the difference matters because getting
 * it wrong means compensating twice:
 *
 *   OVERLAY (iOS Safari, and Chrome since the `resizes-visual` default):
 *     the LAYOUT viewport keeps its height and the VISUAL viewport shrinks.
 *     A position:fixed panel is laid out against the layout viewport, so its
 *     lower edge ends up behind the keyboard and has to be lifted.
 *
 *         inset = documentElement.clientHeight
 *                 - (visualViewport.height + visualViewport.offsetTop)
 *
 *   RESIZE (older Android Chrome, `resizes-content`):
 *     the layout viewport itself shrinks. `inset` is then ~0 and the panel
 *     is ALREADY above the keyboard — lifting it again would open a gap the
 *     height of the keyboard. So the inset is reported as zero and the
 *     keyboard is recognised from the shrink instead.
 *
 *         shrink = (tallest innerHeight seen unfocused) - innerHeight
 *
 * `open` is true when either signal clears MIN_KEYBOARD and something
 * editable has focus. `inset` — the number the layout actually uses — comes
 * only from the overlay measurement, which is what keeps the two cases from
 * being added together.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────
 * It never reports open on a device whose primary pointer is not coarse. A
 * desktop browser resized by its own toolbar, or a window dragged shorter,
 * must not put the assistant into a typing layout; the brief is explicit,
 * and there is no keyboard to make room for there anyway.
 *
 * Nothing here is a perfect keyboard detector, because the platform exposes
 * none. Where the signals are ambiguous it reports CLOSED, so the failure
 * mode is the approved layout rather than a collapsed one.
 */

/* Roughly twice the tallest browser toolbar and well under the shortest
   software keyboard. Measured keyboards run 260-340px on the phones this
   product targets; Safari's toolbar is 44-96px. */
const MIN_KEYBOARD = 120;

const isEditable = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || el.isContentEditable === true;
};

/**
 * @param {boolean} active  measure only while the assistant is on screen
 * @returns {{open:boolean, inset:number, coarse:boolean}}
 */
export function useVirtualKeyboard(active) {
  const [state, setState] = useState({ open: false, inset: 0 });
  /* The tallest innerHeight seen in this orientation while nothing was
     focused. Reset on rotation, because a rotated phone is a different
     screen and a baseline from the other one would read as a keyboard. */
  const baseline = useRef(0);

  /* A ref rather than state: it is read inside the measurement and must not
     cause a render of its own. */
  const coarse = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(pointer: coarse)");
    coarse.current = mq.matches;
    const sync = () => { coarse.current = mq.matches; };
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      /* Leaving the assistant must not leave the layout in typing mode. */
      setState((prev) => (prev.open || prev.inset ? { open: false, inset: 0 } : prev));
      return undefined;
    }

    const vv = window.visualViewport || null;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const focused = isEditable(document.activeElement);
      const innerH = window.innerHeight || 0;

      if (!focused) {
        /* Only ever grows while the field is idle, so a keyboard can never
           become the baseline it is measured against. */
        baseline.current = Math.max(baseline.current, innerH);
      }

      const layoutH = document.documentElement.clientHeight || innerH;
      const inset = vv
        ? Math.max(0, Math.round(layoutH - (vv.height + vv.offsetTop)))
        : 0;
      const shrink = baseline.current ? Math.max(0, baseline.current - innerH) : 0;

      const open = coarse.current
        && focused
        && Math.max(inset, shrink) >= MIN_KEYBOARD;

      setState((prev) => {
        /* The lift is the overlay-mode measurement alone. In resize mode it
           is already zero, which is the whole point: the panel has been
           made shorter by the browser and must not also be moved up. */
        const next = { open, inset: open ? inset : 0 };
        return prev.open === next.open && prev.inset === next.inset ? prev : next;
      });
    };

    /* Coalesced to one measurement per frame. visualViewport fires resize
       AND scroll continuously while an iOS keyboard animates in, and
       re-rendering on each of them is what produces the flicker and the
       open/close oscillation the brief rules out. */
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    const onRotate = () => {
      baseline.current = 0;
      schedule();
    };

    measure();
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", onRotate);
    /* Focus moves are not themselves proof of anything, but they change one
       of the three inputs, so the answer has to be recomputed. A keyboard
       that opens 300ms after the tap is caught by the viewport events; a
       field blurred while the keyboard is still sliding away is caught
       here. */
    document.addEventListener("focusin", schedule, true);
    document.addEventListener("focusout", schedule, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", onRotate);
      document.removeEventListener("focusin", schedule, true);
      document.removeEventListener("focusout", schedule, true);
    };
  }, [active]);

  return { open: state.open, inset: state.inset, coarse: coarse.current };
}
