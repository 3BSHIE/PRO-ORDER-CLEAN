/**
 * useScrollToTopOnEnter — put a screen at the top of the page when the guest
 * ARRIVES on it, and never again while they are standing there.
 *
 * Phase 97.3 §1/§2.
 *
 * ── THE PROBLEM ───────────────────────────────────────────────────────────
 * This app routes with BrowserRouter and no <ScrollRestoration>, and React
 * Router v6 does not reset scroll on navigation. Nothing else in the app did
 * either, so the document simply kept whatever scrollY it had and the browser
 * clamped that value to the NEW page's maximum.
 *
 * Measured before the fix, at 390x844 with four cart lines: the menu was at
 * scrollY 2803, the cart page is 1288px tall, so the cart opened at 444 —
 * exactly its maximum scroll. The guest's first sight of their own cart was
 * the Total and the checkout button, with the "Your cart" heading 383px above
 * the top of the viewport and the first item 278px above it.
 *
 * It only bites when the destination is SHORTER than the origin and still
 * taller than the viewport, which is why a one-line cart never showed it: at
 * 844px tall its maximum scroll is 0, so the stale value clamped to 0 and the
 * page looked fine. That is what made the bug read as intermittent.
 *
 * ── WHY useLayoutEffect ───────────────────────────────────────────────────
 * It runs before paint, so the screen is painted at the top exactly once.
 * There is no jump to see and no timeout to guess at — the alternative,
 * a plain useEffect, paints the stale position first and then corrects it.
 *
 * ── WHY THE DEPENDENCY LIST IS EMPTY ──────────────────────────────────────
 * That empty list IS the scroll policy. It fires on MOUNT, and a mount is
 * precisely "the guest navigated here": each route renders a fresh element,
 * so menu -> cart, cart -> menu -> cart and a reload all mount again.
 *
 * It deliberately never fires again. Nothing snaps the guest back to the top
 * while they scroll their own cart, change a quantity, edit a line, switch
 * language, or open and close the payment sheet — the last of those is an
 * overlay that keeps the screen mounted, and useBodyScrollLock already
 * restores the position it borrowed.
 *
 * "auto", never "smooth": this is where the page STARTS, not a movement the
 * guest asked for. A smooth scroll here would animate on arrival from a
 * position they never saw.
 *
 * Applied per screen rather than once at the router, so it stays a decision
 * each surface makes: a global reset would silently change every other screen
 * in the app, including ones whose scroll position is worth keeping.
 */

import { useLayoutEffect } from "react";

export default function useScrollToTopOnEnter() {
  useLayoutEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      /* Older engines reject the options object — the two-argument form is
         universally supported and does the same thing. */
      window.scrollTo(0, 0);
    }
  }, []);
}
