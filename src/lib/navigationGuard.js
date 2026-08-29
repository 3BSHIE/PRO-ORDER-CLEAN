/**
 * navigationGuard — Phase 59. A one-slot registry letting a screen that
 * holds unsaved work veto (or defer) an in-app navigation started somewhere
 * else in the Admin chrome.
 *
 * The problem it solves:
 *   Admin sub-pages are swapped by a single `adminPage` state value in
 *   App.jsx, so navigating unmounts the previous screen outright. The
 *   Product editor and its Phase 55 unsaved-changes guard live INSIDE
 *   AdminMenuItemsScreen, which means anything that sets adminPage from
 *   outside that tree destroys the draft without the guard ever running.
 *   Phase 59 adds exactly such a control — "View Call" on the staff-call
 *   alert, rendered up in AdminLayout — so it needs a way to ask first.
 *
 * Why a module-level slot rather than context:
 *   The asker (AdminLayout) is an ANCESTOR of the holder
 *   (AdminMenuItemsScreen). React context flows the wrong way for that, and
 *   threading a callback up through App.jsx would put editor-specific
 *   plumbing into the router. One slot is enough because only one Admin
 *   sub-page is mounted at a time, so two guards can never legitimately
 *   coexist.
 *
 * Scope, stated honestly: this is used by the Phase 59 alert's View Call
 * button only. The sidebar nav items still navigate straight away and still
 * discard a dirty draft silently — that is pre-existing Phase 55 behaviour,
 * not something this phase introduced, and widening it is a separate change.
 */

let activeGuard = null;

/**
 * Register the current screen's guard. Returns an unregister function
 * suitable for returning straight out of a useEffect.
 *
 * @param {(proceed: () => void) => boolean} guard
 *   Called with the navigation it is being asked to allow. Return true to
 *   TAKE OVER (navigation is now the guard's responsibility — it may call
 *   `proceed` later, or never). Return false to decline, in which case
 *   navigation happens immediately.
 * @returns {() => void}
 */
export function registerNavigationGuard(guard) {
  activeGuard = guard;
  return () => {
    /* Only clear the slot if it is still ours: during a screen swap React
       can mount the next screen's effect before running this cleanup, and
       blindly nulling would throw away the newcomer's guard. */
    if (activeGuard === guard) activeGuard = null;
  };
}

/**
 * Ask to navigate. Runs `proceed` immediately unless a registered guard
 * claims it.
 *
 * Failure is never allowed to strand the user: if a guard throws, the
 * navigation still happens rather than the button appearing dead.
 *
 * @param {() => void} proceed
 */
export function requestNavigation(proceed) {
  if (activeGuard) {
    try {
      if (activeGuard(proceed) === true) return; // guard owns it now
    } catch {
      // fall through — a broken guard must not make navigation impossible
    }
  }
  proceed();
}
