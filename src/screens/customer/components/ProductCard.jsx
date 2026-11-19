import { useState } from "react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { getLocalizedText } from "../../../lib/localizedContent.js";
import { formatItemCount } from "../../../i18n/counts.js";
import { PromoBadge, AttributeRow } from "../../../components/ProductLabels.jsx";
import { resolvePromoBadge, resolveAttributes } from "../../../lib/productLabels.js";
import { useImageAssetSrc } from "../../../lib/imageAssets.js";
import { fmtPrice } from "../../../lib/format.js";

/**
 * ProductCard — Phase 121.2. The guest menu's own card, lifted out of
 * CustomerMenuScreen so more than one surface can render it.
 *
 * Nothing here was rewritten. The components below are the file's previous
 * contents moved verbatim, because the point of the move is that the AI
 * waiter shows the SAME card the menu shows -- same markup, same class
 * names, same behaviour, same stylesheet -- rather than a second card that
 * looks like it for a while and then drifts.
 *
 * CustomerMenuScreen re-exports GroupedView, ItemGrid and productMonogram
 * from here, so Staff Ordering and the Admin menu screen keep importing
 * exactly what they imported before.
 */
/* ── Grouped view (All, no search) ─────────────────────────────────────── */
/* Phase 112.0 — exported so Staff Ordering renders the SAME product cards
   the guest sees. Nothing about this component changed; a second
   implementation of the menu is what the export exists to prevent. */
export function GroupedView({ items, categories, onOpen, customLabels }) {
  const { t, language } = useLanguage();
  return (
    <>
      {/* Receives the already visibility-filtered category list. */}
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.categoryId === cat.id);
        if (!catItems.length) return null;
        return (
          <section
            key={cat.id}
            id={`menu-cat-${cat.id}`}
            data-cat-id={cat.id}
            className="menu-cat-section anim-rise"
          >
            <div className="menu-cat-section__header">
              <h2 className="menu-cat-section__title">
                {cat.emoji} {getLocalizedText(cat.name, language)}
              </h2>
              <span className="menu-cat-section__count">
                {formatItemCount(t, catItems.length)}
              </span>
            </div>
            <ItemGrid items={catItems} onOpen={onOpen} customLabels={customLabels} />
          </section>
        );
      })}
    </>
  );
}

/* ── Flat item grid ─────────────────────────────────────────────────────── */
/* Phase 112.0 — exported for Staff Ordering, unchanged otherwise. */
export function ItemGrid({ items, onOpen, customLabels }) {
  return (
    <div className="menu-grid">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onOpen={onOpen} customLabels={customLabels} />
      ))}
    </div>
  );
}

/* ── Product card ───────────────────────────────────────────────────────── */
/**
 * @param {"default"|"ai-compact"} presentation
 *   Phase 121.7 — "ai-compact" is the AI Waiter's own presentation of this
 *   same card: the same markup, the same data, the same handlers, with a
 *   tighter set of the --ic-* custom properties Phase 119.0 already put on
 *   .item-card and a shorter image. It exists because a phone that can show
 *   a 230px card beside a conversation cannot show a 283px-tall one on a
 *   568px screen, and the owner's answer to that must not be a button the
 *   guest has to press before seeing the dish.
 *
 *   It is opt-in and it is passed down from exactly one place. The menu
 *   grid, search results, Product Details and the admin previews never pass
 *   it, so none of them changes by a pixel.
 */
export function ItemCard({ item, onOpen, customLabels, presentation = "default" }) {
  const available = item.isAvailable;
  const { t, language } = useLanguage();
  /* Phase 119.0 — resolved from ids, with the legacy isPopular/isFeatured
     fallback living in productLabels so the card, the sheet and the editor's
     preview all answer this question identically. */
  const promoBadge = resolvePromoBadge(item, customLabels);
  const attributes = resolveAttributes(item, customLabels);
  const itemName = getLocalizedText(item.name, language);
  const itemDescription = getLocalizedText(item.description, language);
  const oosId = `oos-${item.id}`;

  /* Phase 44 — an unavailable card is not a control.
     It keeps its place in the menu and stays readable, but sheds role,
     tabIndex and both handlers entirely rather than guarding inside them.
     Spreading nothing is what actually removes it from the tab order and
     stops a screen reader announcing "button": leaving role="button" and
     merely ignoring the click would still promise an action that never
     happens. Opening the sheet only to say "you cannot order this" was the
     behavior this phase removes. */
  const cardInteraction = available
    ? {
        role: "button",
        tabIndex: 0,
        onClick: () => onOpen(item),
        onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && onOpen(item),
      }
    : {};

  return (
    <article
      className={`item-card ${available ? "item-card--available" : "item-card--unavailable"}${presentation === "ai-compact" ? " item-card--compact" : ""}`}
      {...cardInteraction}
    >
      {/* Phase 73 §10 — the category emoji is no longer used as a product
          image stand-in. It said nothing about the dish and rendered the same
          giant glyph across every item in a category. */}
      {/* Phase 97.7 — resolved once; alt text and the placeholder initial both
         need a string, never the localized object. */}
      <ItemImage src={item.imageUrl} alt={itemName} name={itemName} />

      {/* ── Phase 124.1 §3/§6 — every label the product carries, over the
          photograph, in ONE constrained row ───────────────────────────────
          Both groups used to be positioned absolutely and independently,
          which is why they could not be asked to share a width. They are now
          the two ends of a single flex row inset inside the image: the
          primary status takes the leading corner, the attributes take the
          trailing one, and the row — not a breakpoint — is what guarantees
          they can never reach each other or leave the image.

          It is a child of the CARD rather than of the image wrapper, so it
          sits in exactly the same place whether the product has a
          photograph, a broken one or none at all: the monogram panel fills
          the identical box and nothing was invented to hold the labels. */}
      <div className="item-card__labels">
        {/* Leading corner: ONE status at a time. The rule Phase 73 §7 and
            Phase 85 §8 settled is preserved exactly — an unavailable card
            shows Out of Stock INSTEAD of its promotion, never both, because
            the body is dimmed to .5 and a full-strength "Best Seller" on a
            faded card for something nobody can order is the wrong promise.
            Now an either/or in markup as well as in intent. */}
        {available ? (
          <PromoBadge label={promoBadge} className="item-card__promo" />
        ) : (
          /* Carries an id so the disabled "+" can point at it instead of
             repeating the wording — one source of truth for the status text,
             in whichever language is active. */
          <span className="item-card__oos-badge" id={oosId}>
            {t("common.outOfStock", "Out of Stock")}
          </span>
        )}

        {/* Trailing corner: what the dish IS, rather than how it is sold.
            Shown whether or not the product is available, because an
            allergen does not stop being true when the kitchen runs out.

            limit={2} is §4: at most two named attributes, then an accurate
            count. AttributeRow already measures real rendered widths and
            already falls back to one chip plus the indicator when two will
            not fit — reused rather than reimplemented, so Arabic, which is
            wider, narrows the row by measurement instead of by assumption. */}
        <AttributeRow labels={attributes} limit={2} className="item-card__attrs" />
      </div>

      {/* Body */}
      {/* ── Phase 124.1 §8 — the body now begins with the NAME, always ─────
          The attribute lane that used to open this block is gone: not
          hidden, not collapsed, not replaced by a spacer — moved onto the
          photograph above. That is what makes every product name in a grid
          row start at the same height again, whether the dish carries five
          attributes or none, without reserving a single pixel for the ones
          that carry none. The 22px the lane cost is returned to the image
          (see .item-card__img-wrap), so the card's outer height is exactly
          what it was before Phase 124.0 touched it. */}
      <div className="item-card__body">
        <p className="item-card__name">{itemName}</p>
        <p className="item-card__desc">{itemDescription}</p>
        <div className="item-card__foot">
          <span className="item-card__price">{fmtPrice(item.price)}</span>
          {/* Unchanged behavior for an available item: this opens Item
              Details, exactly as before, and never quick-adds. When the item
              is out of stock the button is disabled and describes itself by
              pointing at the badge, so assistive tech reads the name, then
              the status, then "dimmed" — the reason, not just the refusal. */}
          <button
            type="button"
            className="item-card__add"
            disabled={!available}
            onClick={(e) => {
              e.stopPropagation();
              if (available) onOpen(item);
            }}
            aria-label={
              available
                ? t("customer.openItem", "Open {name}").replace("{name}", itemName)
                : itemName
            }
            aria-describedby={available ? undefined : oosId}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Phase 73 §10 — initials for a product that has no photograph.
 *
 * Deterministic and content-derived: the same dish always yields the same
 * mark, so a menu looks composed rather than random, and nothing needs to be
 * stored or configured.
 *
 * Two words give two initials ("Rigatoni Pomodoro" -> RP). A single word
 * gives its first two letters ("Tiramisu" -> TI), which reads better than one
 * lonely glyph. Anything that yields nothing usable falls through to an empty
 * string and the CSS simply shows the textured panel — never a broken box.
 *
 * Intl-safe by construction: it slices whole code points rather than UTF-16
 * units, so an Arabic or accented name cannot be cut in half, and it never
 * assumes a Latin alphabet.
 */
/* Phase 108.0 §54 — exported, not moved. The Product Editor's live preview
   needs the SAME fallback the guest card uses; duplicating it would be a
   second definition free to drift. Nothing about this screen changes. */
export function productMonogram(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";

  const firstOf = (word) => Array.from(word)[0] ?? "";

  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join("").toLocaleUpperCase();
  }
  return (firstOf(words[0]) + firstOf(words[1])).toLocaleUpperCase();
}

/* ── Image with monogram fallback ───────────────────────────────────────── */
function ItemImage({ src, alt, name }) {
  /* Keyed on the source, not a boolean: an admin replacing a product's image
     reaches an already-open menu through the menu-change event, so a card
     that failed on the old picture has to be willing to try the new one. */
  const [failedSrc, setFailedSrc] = useState(null);
  /* Phase 115.0 — the stored value may be an "asset:<id>" reference to an
     image the restaurant uploaded from their device. The hook hands back a
     hosted URL unchanged and reads an uploaded one out of IndexedDB once,
     cached, so a menu of twenty products does not hit the database twenty
     times. A reference whose asset is not on this device resolves to null
     and falls through to the monogram below, which is the same fallback an
     absent image has always used. */
  const resolved = useImageAssetSrc(src);
  const useImg = resolved && failedSrc !== resolved;
  return (
    <div className="item-card__img-wrap">
      {useImg ? (
        <img
          className="item-card__img"
          src={resolved}
          alt={alt}
          loading="lazy"
          onError={() => setFailedSrc(resolved)}
        />
      ) : (
        /* aria-hidden: the product name is right below in real text, so
           announcing "RP" as well would only add noise. */
        <div className="item-card__mono-wrap" aria-hidden="true">
          <span className="item-card__mono">{productMonogram(name)}</span>
        </div>
      )}
    </div>
  );
}
