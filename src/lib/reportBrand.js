import markSrc from "../assets/brand/pro-order-icon.png";
import { isValidHexColor, readableInkOn, DEFAULT_PRIMARY_COLOR } from "./theme.js";

/**
 * reportBrand — Phase 111.4
 *
 * The two things the printed report needs from the brand system: a colour it
 * can actually use on paper, and the real PRO·ORDER mark in that colour.
 *
 * ── WHY THE ACCENT IS RESOLVED IN JS ────────────────────────────────────
 * Everywhere else the restaurant's primary arrives as --gold, a variable
 * tuned for the app's near-black surfaces. The report is white paper in both
 * themes, and a primary that reads beautifully on charcoal can be invisible
 * on white. readableInkOn() is the product's existing safeguard for exactly
 * this case — a theme colour rendered ON a neutral surface — so the accent is
 * the restaurant's own colour moved the minimum distance that keeps it at
 * 4.5:1 against the page. A pale yellow brand darkens just enough to be seen;
 * a deep navy is left alone.
 *
 * ── WHY THE MARK IS RE-PAINTED ONTO A CANVAS ────────────────────────────
 * The product already recolours this artwork with a CSS mask (see
 * BrandMarkStatic and .po-mark): same silhouette, fill from the theme. The
 * mask is the right technique on screen and the wrong one here, because the
 * PDF is produced by html2canvas, which does not implement CSS masks — the
 * lockup would come out as a solid rectangle.
 *
 * So the same idea is carried out with the one operation that survives
 * rasterisation: the master PNG is drawn to a canvas, `source-in` replaces
 * every opaque pixel with the accent, and the result is an ordinary <img>.
 * The artwork is still the shipped master, pixel for pixel — nothing here
 * redraws or approximates the logo.
 */

/** Keyed by colour: one canvas per accent, not one per render. */
const cache = new Map();

/** The restaurant's primary, guaranteed legible on a white page. */
export function reportAccentColor(primaryColor) {
  const primary = isValidHexColor(primaryColor) ? primaryColor.trim() : DEFAULT_PRIMARY_COLOR;
  return readableInkOn(primary, "#ffffff", 4.5);
}

/**
 * The PRO·ORDER mark as a data URL, filled with `color`.
 *
 * @param {string} color
 * @returns {Promise<string|null>} null when the canvas is unavailable or the
 *   artwork cannot be read — the caller then prints the wordmark alone rather
 *   than a broken image.
 */
export function brandMarkDataUrl(color) {
  const key = String(color || "").toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const job = new Promise((resolve) => {
    if (typeof document === "undefined") { resolve(null); return; }
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(image, 0, 0);
        /* Keep the alpha, replace the colour: the silhouette is the master's,
           the fill is the restaurant's. */
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = markSrc;
  });

  cache.set(key, job);
  return job;
}
