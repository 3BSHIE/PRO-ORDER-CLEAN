import iconSrc from "../../assets/brand/pro-order-icon.png";

/**
 * BrandMarkStatic — Phase 84 (Unit 2, §4–§6).
 *
 * The small PRO·ORDER two-circle mark that sits in the Customer Menu's sticky
 * utility strip and acts as a "back to the menu" shortcut.
 *
 * ── STATIC, AND THAT IS THE POINT ────────────────────────────────────────
 *   It never animates. The animated mark is reserved for exactly two places —
 *   the main Loading state and the future Main Timer — and spending that
 *   motion on a utility button in a strip the guest sees for their whole
 *   session would spend the one gesture the brand has. This is a wayfinding
 *   control that happens to be the logo, not a brand moment.
 *
 * ── SAME ARTWORK AS PHASE 83.1 ───────────────────────────────────────────
 *   Same authoritative source — src/assets/brand/pro-order-icon.png, the
 *   495x888 master that Logo.jsx has always rendered — and the same CSS-mask
 *   technique, so the silhouette is the original artwork pixel for pixel and
 *   the fill follows --brand-mark. No second approximation of the logo exists
 *   in the codebase (§6).
 *
 *   It deliberately does NOT import BrandLoadingMark's markup or classes.
 *   That component is out of scope this phase (§10) and its stylesheet block
 *   carries the travelling spark; sharing a class would mean either editing
 *   it or inheriting motion this mark must not have. Three lines of mask CSS
 *   are repeated instead, which is the cheaper of the two risks.
 *
 * ── WHY <img> IS NOT USED ────────────────────────────────────────────────
 *   An <img> would paint the master's baked-in gold, which contradicts §37:
 *   the mark must carry the theme-derived brand colour so a restaurant on
 *   green does not get a gold PRO·ORDER glyph in its menu bar. The mask is
 *   what makes the artwork recolourable without redrawing it.
 *
 * @param {number} [size] — painted height in px. The 44x44 touch target comes
 *   from the button around it, not from the artwork, so the mark can stay
 *   visually small without becoming hard to hit (§6, §43).
 */
export default function BrandMarkStatic({ size = 22, className = "" }) {
  return (
    <span
      className={`po-mark ${className}`}
      style={{ "--po-mark-art": `url(${iconSrc})`, height: size }}
      aria-hidden="true"
    />
  );
}
