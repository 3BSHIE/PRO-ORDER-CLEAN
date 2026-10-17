/**
 * fontLoader — Phase 116.0. Webfonts fetched when a restaurant actually
 * needs them, instead of all of them for everybody.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Until this phase every font lived in one @import at the top of
 * global.css, which was fine while there were four families. Phase 116.0
 * takes the presets to ten, and an @import of ten families would mean every
 * guest of every restaurant downloading nine faces to look at one. §10 rules
 * that out, and it would be the wrong trade anyway: these are phone menus.
 *
 * So the original four stay in the stylesheet — they are the app's own
 * typography, needed on the very first paint of every surface including
 * Admin and Kitchen, and loading them any later would only add a flash —
 * and everything ADDED here is fetched on demand. A restaurant on the
 * default pairing therefore downloads exactly what it downloaded before
 * this phase: nothing new.
 *
 * ── WHY LINK AND NOT @import ─────────────────────────────────────────────
 * An injected <link rel="stylesheet"> does not block rendering the way a
 * nested @import does, and Google Fonts serves these with display=swap, so
 * text paints immediately in the fallback and reflows once when the face
 * arrives. The alternative — waiting on the font — is a blank menu on a slow
 * connection, which is worse than a moment of the wrong serif.
 *
 * ── FAILURE IS NOT A FAILURE ─────────────────────────────────────────────
 * If the request never completes the stack simply falls through to the next
 * entry, which is why every stack in theme.js ends in real device fonts.
 * Nothing here throws, nothing retries, and no menu waits on it.
 */

/* Families already in global.css's @import. Asking for one of these is a
   no-op: the stylesheet has them before this module ever runs. */
const PRELOADED = new Set([
  "Playfair Display",
  "DM Sans",
  "DM Serif Display",
  "Inter",
]);

/* Weights to request per family. The app uses 400–700 for text and 500–700
   for display, and asking for a narrower range than the CSS uses is how a
   heading ends up synthetically emboldened by the browser. */
const WEIGHTS = "wght@400;500;600;700";

/* One <link> per family, ever. The set is keyed by family name rather than
   by URL so a second caller asking for the same face in a different order
   cannot produce a duplicate request. */
const requested = new Set();

function familyParam(family) {
  /* Google Fonts wants '+' for spaces in the family name. */
  return `${family.replace(/ /g, "+")}:${WEIGHTS}`;
}

/**
 * Ensure these families are being fetched. Safe to call on every render:
 * families already requested, already in the base stylesheet, or not
 * strings are skipped.
 *
 * @param {string[]} families
 */
export function ensureFontsLoaded(families) {
  if (typeof document === "undefined") return;

  const pending = (Array.isArray(families) ? families : []).filter(
    (family) =>
      typeof family === "string" &&
      family.trim() !== "" &&
      !PRELOADED.has(family) &&
      !requested.has(family)
  );
  if (pending.length === 0) return;

  for (const family of pending) requested.add(family);

  try {
    /* One request for the whole batch rather than one per family: the
       endpoint accepts repeated family parameters, and a single round trip
       is the difference that matters on a phone. */
    const href =
      "https://fonts.googleapis.com/css2?" +
      pending.map((family) => `family=${familyParam(family)}`).join("&") +
      "&display=swap";

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    /* So a failed fetch is visibly a font problem in the network panel and
       nothing else, and so a future audit can find these. */
    link.dataset.proOrderFonts = pending.join(",");
    document.head.appendChild(link);
  } catch {
    /* A font that cannot be requested is a font the stack falls through —
       never a reason to interrupt anything. The families stay marked as
       requested so a render loop cannot retry this every frame. */
  }
}
