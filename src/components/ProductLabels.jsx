import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { Flame, Leaf, Sprout, Nut, WheatOff, MilkOff } from "lucide-react";
import { useLanguage } from "../i18n/useLanguage.js";
import { labelText } from "../lib/productLabels.js";

/**
 * ProductLabels — Phase 119.0. One definition of how a label LOOKS.
 *
 * The guest card, the Item Details sheet and the Admin editor's miniature
 * preview all render labels. Three copies of this markup would be three
 * places to drift, and the preview's whole job is to be trustworthy — so
 * there is one component per label kind and every surface imports it.
 *
 * ── THE DESIGN FAMILY ────────────────────────────────────────────────────
 * Every colour derives from one custom property, --lbl-h, at a saturation
 * and lightness fixed by the stylesheet. That is what makes ten different
 * labels read as one system instead of ten decisions: the hue varies, the
 * weight, height, padding, radius and type scale do not (§8).
 *
 * It is also what guarantees contrast. A promotional badge is always a solid
 * fill in the dark band of its hue with white text, so it stays legible on a
 * bright photograph, a dark photograph and no photograph at all, in both
 * appearances and under any restaurant theme (§9/§26). Nothing here reads a
 * theme token, which is deliberate: a badge sits on the merchant's own
 * photography, not on the page surface, so inheriting a brand colour would
 * trade a guarantee for a coincidence.
 */

const ICONS = { flame: Flame, leaf: Leaf, sprout: Sprout, nut: Nut, wheatOff: WheatOff, milkOff: MilkOff };

/** The hue, or the reserved custom treatment when there is no hue. */
function toneProps(label) {
  return label.custom ? undefined : { "--lbl-h": String(label.hue) };
}

/**
 * The promotional badge — solid, in the corner of the product's visual area.
 *
 * Positioning belongs to the surface, not to the badge, so this renders only
 * the chip and each surface places it (§10). The card puts it in the image's
 * top-end corner; the sheet puts it in the flow above the name.
 */
export function PromoBadge({ label, className = "" }) {
  const { t, language } = useLanguage();
  if (!label) return null;
  return (
    <span
      className={`plabel plabel--promo${label.custom ? " plabel--promo-custom" : ""} ${className}`.trim()}
      style={toneProps(label)}
    >
      {labelText(label, t, language)}
    </span>
  );
}

/** One attribute chip — quieter, tinted rather than filled (§11). */
export function AttributeChip({ label }) {
  const { t, language } = useLanguage();
  const Icon = label.icon ? ICONS[label.icon] : null;
  return (
    <span
      className={`plabel plabel--attr${label.custom ? " plabel--attr-custom" : ""}`}
      style={toneProps(label)}
    >
      {Icon && <Icon size={10} strokeWidth={2.4} aria-hidden="true" className="plabel__icon" />}
      <span className="plabel__text">{labelText(label, t, language)}</span>
    </span>
  );
}

/**
 * Every attribute, wrapped — for Item Details, where nothing is hidden (§13).
 */
export function AttributeList({ labels, className = "" }) {
  if (!labels || labels.length === 0) return null;
  return (
    <div className={`plabel-list ${className}`.trim()}>
      {labels.map((l) => <AttributeChip key={l.id} label={l} />)}
    </div>
  );
}

/**
 * How many of these chips actually fit on one line — measured, not guessed.
 *
 * ── WHY MEASURING IS THE ONLY HONEST ANSWER (§12) ────────────────────────
 * "Gluten-Free" and "خالٍ من الغلوتين" are the same attribute and nowhere
 * near the same width, and neither is predictable from its character count:
 * the restaurant's chosen font, the viewport, the appearance and the icon all
 * move it. A character-count rule would overflow in one language and waste
 * space in the other.
 *
 * ── HOW IT AVOIDS OSCILLATING ────────────────────────────────────────────
 * The naive version measures the visible row, hides a chip, and measures
 * again — which changes the thing being measured and can flip forever. So the
 * widths come from a SEPARATE row that always holds every candidate and never
 * changes with the outcome. It is absolutely positioned and visibility:hidden,
 * so it costs layout but no paint and occupies no space. One pass, no loop.
 *
 * The observer watches the container only, and the arithmetic is over at most
 * four numbers, so scrolling a long menu costs nothing: nothing recomputes
 * until a width actually changes.
 */
function useFittedCount(containerRef, measureRef, total, hasOverflowChip) {
  const [count, setCount] = useState(total);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const measureRow = measureRef.current;
    if (!container || !measureRow) return;

    const available = container.clientWidth;
    if (!available) return;

    const children = Array.from(measureRow.children);
    /* The measurement row ALWAYS ends with the indicator, whether or not one
       will be displayed, so it is always the last child and never one of the
       chips. Treating it as a chip when no overflow was expected measured a
       "+3" as if it were an attribute. */
    const chips = children.slice(0, -1);
    const overflowChip = children[children.length - 1];
    if (chips.length === 0) return;

    const style = getComputedStyle(container);
    const gap = parseFloat(style.columnGap || style.gap || "0") || 0;

    const widths = chips.map((c) => c.getBoundingClientRect().width);
    const overflowWidth = overflowChip ? overflowChip.getBoundingClientRect().width : 0;

    /* Try the whole set first — but only when the whole set is genuinely all
       there is. With more attributes than the limit allows, an indicator is
       required however the measurement turns out, so its width can never be
       skipped: doing that fitted three chips into a row that then had to grow
       by 23px to take the "+1" as well, and the clipping hid the very count
       it had just promised. */
    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1);
    if (!hasOverflowChip && totalWidth <= available) { setCount(chips.length); return; }

    /* Otherwise something will be hidden either way, so the indicator is
       certain to be shown and its width is reserved from the start — which is
       what stops a "+2" being promised in a row it cannot fit in. */
    let used = overflowWidth;
    let fitted = 0;
    for (const w of widths) {
      const next = used + w + (fitted === 0 && !hasOverflowChip ? 0 : gap);
      if (next > available) break;
      used = next;
      fitted += 1;
    }
    /* Never an empty row: one chip is shown even in a column too narrow for
       it, and the stylesheet truncates it rather than letting it overflow. */
    setCount(Math.max(1, fitted));
  }, [containerRef, measureRef, total, hasOverflowChip]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure, containerRef]);

  /* Fonts land after first layout and change every width; re-measuring once
     they are ready costs one pass and prevents a row measured in the fallback
     face staying wrong. */
  useLayoutEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return undefined;
    let alive = true;
    document.fonts.ready.then(() => { if (alive) measure(); });
    return () => { alive = false; };
  }, [measure]);

  return count;
}

/**
 * The card's attribute row: at most three, fewer when they do not fit.
 *
 * The slot is rendered even when empty so that a product with attributes and
 * one without keep their names at the same height across a grid row — the
 * reason the original badge slot was unconditional, preserved here (§12).
 */
export function AttributeRow({ labels, limit = 3, className = "" }) {
  const { t, language } = useLanguage();
  const containerRef = useRef(null);
  const measureRef = useRef(null);

  const candidates = labels.slice(0, limit);
  /* Anything past the limit is already hidden, so an indicator is needed
     whatever the measurement decides. */
  const hasOverflowChip = labels.length > candidates.length;
  const fitted = useFittedCount(containerRef, measureRef, candidates.length, hasOverflowChip);

  if (labels.length === 0) return <div className={`plabel-row ${className}`.trim()} aria-hidden="true" />;

  const shown = candidates.slice(0, fitted);
  const hiddenCount = labels.length - shown.length;
  const hiddenNames = labels.slice(shown.length).map((l) => labelText(l, t, language)).join(", ");

  return (
    <div className={`plabel-row ${className}`.trim()} ref={containerRef}>
      {/* Measurement only: always the full candidate set plus the indicator,
          so its widths never depend on what is currently displayed. */}
      <div className="plabel-row__gauge" aria-hidden="true">
        <div className="plabel-row__measure" ref={measureRef}>
          {candidates.map((l) => <AttributeChip key={l.id} label={l} />)}
          <span className="plabel plabel--more">+{labels.length}</span>
        </div>
      </div>

      {shown.map((l) => <AttributeChip key={l.id} label={l} />)}
      {hiddenCount > 0 && (
        <span
          className="plabel plabel--more"
          title={hiddenNames}
          aria-label={t("attribute.andMore", "And {n} more").replace("{n}", String(hiddenCount))}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}
