import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * TableBadge — Phase 120.0. One table badge, two sizes.
 *
 * The Welcome screen has carried this badge since Phase 83.1 and the owner
 * approved how it looks. Phase 120.0 needs the same thing, smaller, in the
 * Customer Menu's expanded header — so the markup, the translated label and
 * the accessible name are shared from here rather than written twice and left
 * to drift.
 *
 * ── WHY THE HERO VARIANT KEEPS ITS OLD CLASS NAMES ───────────────────────
 * .cx-landing__table is not just a look. It is also a participant in the
 * Welcome exit choreography (.cx-landing--releasing / --leaving) and in the
 * desktop grid that places the badge in column 2. Renaming it would mean
 * re-pointing four other rules for no gain, so the hero variant emits exactly
 * the classes it always has and the Welcome screen is visually and
 * behaviourally untouched. Only the element's construction moved in here.
 *
 * ── THE NUMBER IS WHATEVER THE TABLE IS CALLED ───────────────────────────
 * Rendered as given, never parsed or padded, so a venue that names its tables
 * "Terrace 2" or "Bar" gets what it configured. The LTR isolation on the
 * number is the one thing applied to it, so Latin digits keep their order
 * inside Arabic copy.
 */

const CLASSES = {
  hero: { root: "cx-landing__table", word: "cx-landing__table-word", number: "cx-landing__table-number" },
  mini: { root: "menu-table-badge", word: "menu-table-badge__word", number: "menu-table-badge__number" },
};

export default function TableBadge({ number, variant = "hero", className = "" }) {
  const { t } = useLanguage();
  const c = CLASSES[variant] || CLASSES.hero;
  const word = t("customer.yourTable", "Table");

  return (
    /* One accessible name for the pair, so a screen reader says "Table 5"
       rather than reading an orphaned label and then a bare number. */
    <section className={`${c.root} ${className}`.trim()} aria-label={`${word} ${number}`}>
      <span className={c.word} aria-hidden="true">{word}</span>
      <span className={c.number} aria-hidden="true">{number}</span>
    </section>
  );
}
