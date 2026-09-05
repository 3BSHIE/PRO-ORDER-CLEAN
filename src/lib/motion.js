/**
 * motion — Phase 83. One place to ask whether the viewer wants animation.
 *
 * CSS already honours prefers-reduced-motion globally (global.css collapses
 * every animation and transition to ~0s). That is enough for anything purely
 * decorative, but not for logic: this app has two places where an animation's
 * DURATION is also a delay before something happens — the landing's exit
 * before the Menu route is pushed, and the loading mark's settle. Under
 * reduced motion those animations do not run, so waiting for them would be a
 * pause for nothing, and §12/§25 both require that navigation is never held
 * back by motion the viewer has switched off.
 *
 * Read at call time rather than cached: a viewer can change the OS setting
 * while the app is open, and this is cheap enough that there is no reason to
 * hold a stale answer.
 *
 * @returns {boolean} true when the viewer has asked for reduced motion
 */
export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    /* No matchMedia (non-browser test runner, very old engine) — assume full
       motion, which is the behaviour every screen had before this existed. */
    return false;
  }
}
