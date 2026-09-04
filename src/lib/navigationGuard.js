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
 *
 * Phase 60 update: that widening happened. Every in-app Admin page change now
 * routes through requestNavigation (see navigateAdmin in App.jsx), so the
 * sidebar, the dashboard shortcuts and sign-out all ask this module first.
 *
 * Phase 79.3 update: the module now also owns browser-exit protection, so a
 * refresh or tab close warns about the same drafts the in-app dialog covers.
 * TWO SURFACES, DELIBERATELY DIFFERENT:
 *   in-app navigation  → the screen's own branded PRO·ORDER Modal
 *                        ("Keep Editing" / "Discard Changes")
 *   browser exit       → the browser's own beforeunload confirmation, whose
 *                        wording no site can control
 * Nothing about the first was changed to add the second.
 */

let activeGuard = null;

/* ── Phase 79.3 — browser-exit protection ─────────────────────────────────
   The slot above only ever hears about navigation the Admin shell itself
   starts. A refresh, a tab close or a window close never reaches
   requestNavigation, so until this phase both guarded drafts — Settings and
   the Product editor — were lost silently on any of the three.

   The listener lives HERE rather than in either screen, for the same reason
   the guard slot does: there is one question ("does the currently registered
   Admin screen have unsaved work?") and it should have exactly one answer.
   Two screens each attaching their own beforeunload would be two answers,
   two lifecycles to keep in step, and two chances to leak a listener that
   outlives the draft it was protecting.

   `unloadAttached` mirrors whether the listener is currently on the window,
   so the add/remove calls stay balanced no matter how often a screen
   re-registers. addEventListener with the same reference is idempotent
   anyway; the flag is what makes the intent explicit and the state
   inspectable. */
const BEFORE_UNLOAD = "beforeunload";
let unloadAttached = false;

/**
 * The handler itself. Deliberately the standard incantation and nothing
 * more — see the note about custom text below.
 */
function handleBeforeUnload(event) {
  /* Browsers have not honoured custom text for a decade: the wording of the
     confirmation is the browser's, and every engine ignores whatever string
     is returned here. Attempting PRO·ORDER copy would be dead code that
     reads like a feature. preventDefault() is the modern trigger;
     returnValue and the returned string are what older Chrome and Safari
     still look for, so all three are set. */
  event.preventDefault();
  event.returnValue = "";
  return "";
}

/** Add or remove the listener so it matches `shouldWarn`, and only then. */
function syncUnloadListener(shouldWarn) {
  const next = !!shouldWarn;
  if (next === unloadAttached) return;
  try {
    if (next) window.addEventListener(BEFORE_UNLOAD, handleBeforeUnload);
    else window.removeEventListener(BEFORE_UNLOAD, handleBeforeUnload);
    unloadAttached = next;
  } catch {
    /* No window (non-browser test runner). In-app guarding is unaffected. */
  }
}

/** Whether a browser-exit warning is currently armed. Exposed for tests. */
export function isUnloadGuardActive() {
  return unloadAttached;
}

/**
 * Register the current screen's guard. Returns an unregister function
 * suitable for returning straight out of a useEffect.
 *
 * @param {(proceed: () => void) => boolean} guard
 *   Called with the navigation it is being asked to allow. Return true to
 *   TAKE OVER (navigation is now the guard's responsibility — it may call
 *   `proceed` later, or never). Return false to decline, in which case
 *   navigation happens immediately.
 * @param {boolean} [hasUnsavedWork=false]
 *   Whether this guard currently stands for work that would be LOST on a
 *   browser exit. Drives the beforeunload listener and nothing else — the
 *   in-app path still asks the guard itself.
 *
 *   This is read at registration time, so a screen must re-register when its
 *   dirtiness changes. Both current callers already do: their effects list
 *   `isDirty` in the dependency array, so React re-runs registration on every
 *   flip. A boolean is used rather than a predicate precisely so that
 *   requirement stays visible at the call site instead of hiding behind a
 *   closure that might capture a stale value.
 *
 *   Note this layer never computes dirtiness itself. Settings compares
 *   normalized settings fingerprints, the Product editor compares its own
 *   draft signature, and both keep their rules; this only consumes the answer.
 * @returns {() => void}
 */
export function registerNavigationGuard(guard, hasUnsavedWork = false) {
  activeGuard = guard;
  syncUnloadListener(hasUnsavedWork);
  return () => {
    /* Only clear the slot if it is still ours: during a screen swap React
       can mount the next screen's effect before running this cleanup, and
       blindly nulling would throw away the newcomer's guard.

       The same ownership test governs the listener, and for a sharper
       reason: if a newly-mounted dirty screen has already armed it, tearing
       it down here would leave that screen's draft unprotected while its
       guard is still registered. Only the owner disarms. */
    if (activeGuard === guard) {
      activeGuard = null;
      syncUnloadListener(false);
    }
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
