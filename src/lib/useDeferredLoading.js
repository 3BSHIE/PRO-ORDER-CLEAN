import { useEffect, useState } from "react";

/**
 * useDeferredLoading — Phase 83. Decides whether a loading state has lasted
 * long enough to be worth SHOWING.
 *
 * ── THE PROBLEM THIS EXISTS FOR ──────────────────────────────────────────
 *   A loader that appears for 40ms is worse than no loader: the guest sees a
 *   flash of brand mark and a layout jump, which reads as a glitch rather than
 *   as progress. The fix is not to slow anything down — it is to wait a beat
 *   before admitting that we are waiting at all. If the work finishes inside
 *   the threshold, the loader never mounts and the guest goes straight to the
 *   next screen (§10).
 *
 * ── AND WHAT IT DELIBERATELY IS NOT ──────────────────────────────────────
 *   This is not a minimum display time. It never holds a finished screen back
 *   so an animation can be admired, and it never delays navigation. The delay
 *   runs only while `pending` is genuinely true, and the moment `pending` goes
 *   false the answer is false — whether the timer had fired or not. There is
 *   no code path here that can make the application slower than the data it
 *   is waiting on (§10, §38).
 *
 * ── CURRENT BEHAVIOUR IN THIS BUILD ──────────────────────────────────────
 *   Every customer read today is synchronous localStorage, so callers pass
 *   `pending === false` on the very first render and this hook returns false
 *   forever: the loading screen does not mount and costs nothing. The hook and
 *   the screen exist so that when a real asynchronous restaurant/session/menu
 *   fetch lands, the loading experience is already correct and the route only
 *   has to supply a truthful `pending` flag (§37).
 *
 * @param {boolean} pending — is the underlying work genuinely still running?
 * @param {number} [delayMs] — how long to wait before showing the loader
 * @returns {boolean} whether the loading UI should be rendered
 */
export function useDeferredLoading(pending, delayMs = 600) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      /* Not waiting on anything — drop the loader immediately. This is the
         branch that runs in the current synchronous build. */
      setVisible(false);
      return undefined;
    }

    const id = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(id);
  }, [pending, delayMs]);

  return visible;
}
