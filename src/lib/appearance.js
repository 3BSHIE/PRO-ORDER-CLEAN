/**
 * appearance — applies the restaurant's chosen Appearance to the document
 * root, and nothing else.
 *
 * Phase 94.1 §27.
 *
 * ── WHY THE ROOT, AND NOT THE THEME WRAPPER ──────────────────────────────
 * Every other restaurant token (Primary, Secondary, the brand mark) rides on
 * the `.restaurant-theme` wrapper, which is `display:contents` and therefore
 * inherits into the whole tree beneath it. Appearance cannot: the token it
 * most needs to change is `--bg`, and that is read by `<body>` — an ancestor
 * of the wrapper, not a descendant. Setting it on the wrapper would repaint
 * the cards and leave the page behind them dark.
 *
 * So Appearance is a single `data-appearance` attribute on `<html>`, and the
 * light token block in global.css hangs off it. That keeps the rule §27 asks
 * for: restaurant configuration → theme variables → shared UI adapts, with no
 * `appearance === "light"` branching scattered through components.
 *
 * ── REFERENCE COUNTING ───────────────────────────────────────────────────
 * More than one themed surface can be mounted at once — the Settings screen
 * previews an unsaved appearance while RestaurantTheme is still applying the
 * saved one. Each caller gets a release function, and the attribute reverts
 * to whatever the remaining owner asked for rather than being cleared by
 * whichever unmounts first. The stack is LIFO: the most recent claim wins,
 * which makes the Settings preview override the saved value while it is open
 * and restore it exactly on unmount (§61).
 */

const ROOT_ATTRIBUTE = "data-appearance";

/* Claims, oldest first. The last entry owns the current appearance. */
const claims = [];
let nextClaimId = 1;

function paint() {
  try {
    const root = document.documentElement;
    if (!root) return;
    const top = claims[claims.length - 1];
    /* Dark is the product's default and lives in the bare `:root` block, so
       it is expressed by REMOVING the attribute rather than by setting
       another value. One source of truth for the dark palette. */
    if (!top || top.value === "dark") root.removeAttribute(ROOT_ATTRIBUTE);
    else root.setAttribute(ROOT_ATTRIBUTE, top.value);
  } catch {
    /* No document (non-browser test runner) — nothing to paint. */
  }
}

/**
 * Apply an appearance until the returned function is called.
 *
 * @param {"dark"|"light"} value
 * @returns {() => void} release
 */
export function applyAppearance(value) {
  const claim = { id: nextClaimId++, value };
  claims.push(claim);
  paint();
  return () => {
    const i = claims.findIndex((c) => c.id === claim.id);
    if (i !== -1) claims.splice(i, 1);
    paint();
  };
}

/** The appearance currently painted on the root. Reads the DOM, so it is the
    truth rather than a cached guess. */
export function currentAppearance() {
  try {
    return document.documentElement.getAttribute(ROOT_ATTRIBUTE) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
