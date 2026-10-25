import { MENU_CHANGE_EVENT, getMenuItems, saveMenuItemsRaw } from "./menuData.js";
import { getLocalizedText, hasLocalizedText, trimLocalizedText } from "./localizedContent.js";

/**
 * productLabels — Phase 119.0. What a product is LABELLED, decided once.
 *
 * ── TWO CATEGORIES, KEPT APART ON PURPOSE ────────────────────────────────
 * A Promotional Badge is marketing: "Best Seller", "Chef's Pick". A product
 * has at most one, it is loud, and it sits in the corner of the photograph.
 * A Product Attribute is information: "Spicy", "Vegan". A product has as many
 * as are true, they are quiet, and they sit under the photograph.
 *
 * They are separate lists with separate rules and separate styling because
 * they answer different questions. Collapsing them into one "tags" array
 * would make the one-badge rule unenforceable and the visual hierarchy
 * arbitrary.
 *
 * ── WHAT IS STORED ON A PRODUCT ──────────────────────────────────────────
 *   promoBadge: "bestSeller" | "plbl_x7k2" | null
 *   attributes: ["spicy", "vegan", "plbl_m3q8"]
 *
 * Ids, never display text (§28). A restaurant renaming "House Special" to
 * "Kitchen Special" must not have to touch the twelve products carrying it,
 * and a product must not silently lose its label because a word changed.
 * Preset ids are fixed slugs; custom ids are minted with a "plbl_" prefix, so
 * the two namespaces cannot collide and resolution is a two-step lookup.
 *
 * ── PRESET NAMES ARE NOT MERCHANT CONTENT ────────────────────────────────
 * "Spicy" and "حار" ship with the product, so they live in the i18n layer and
 * follow the viewer's language like every other piece of system copy. Custom
 * labels ARE merchant content, so they are {en, ar} objects resolved through
 * localizedContent with its fallback chain — a venue that writes only Arabic
 * gets its Arabic label shown to an English guest rather than a blank chip.
 *
 * ── NOTHING HERE IS A CLAIM ──────────────────────────────────────────────
 * "Popular" and "Best Seller" are chosen by the restaurant. They are not
 * derived from sales, and this module computes no popularity — a badge that
 * silently ranked products would be a different feature with different
 * consequences. Dietary attributes are likewise the restaurant's statement
 * about its own recipes; PRO·ORDER verifies no ingredient and no allergen.
 */

/* ═══════════════════════════════════════════════ Presets ══════════════════
   Hue-driven so the ten read as one family rather than ten decisions. The
   stylesheet derives every colour from --lbl-h at a fixed saturation and
   lightness band, which is what guarantees a promotional badge is dark
   enough for white text whichever hue it carries (§9/§13). */

export const PROMO_BADGES = [
  { id: "popular",      key: "promoBadge.popular",      fallback: "Popular",       hue: 38  },
  { id: "bestSeller",   key: "promoBadge.bestSeller",   fallback: "Best Seller",   hue: 352 },
  { id: "new",          key: "promoBadge.new",          fallback: "New",           hue: 152 },
  { id: "limited",      key: "promoBadge.limited",      fallback: "Limited",       hue: 22  },
  { id: "seasonal",     key: "promoBadge.seasonal",     fallback: "Seasonal",      hue: 186 },
  { id: "chefsPick",    key: "promoBadge.chefsPick",    fallback: "Chef's Pick",   hue: 318 },
  { id: "recommended",  key: "promoBadge.recommended",  fallback: "Recommended",   hue: 224 },
  { id: "specialOffer", key: "promoBadge.specialOffer", fallback: "Special Offer", hue: 340 },
  { id: "exclusive",    key: "promoBadge.exclusive",    fallback: "Exclusive",     hue: 258 },
  { id: "signature",    key: "promoBadge.signature",    fallback: "Signature",     hue: 30  },
];

/**
 * The legacy designation, kept resolvable but NOT offered.
 *
 * Phase 73 gave products two merchandising flags, isPopular and isFeatured,
 * and the guest card rendered "Popular" or "Featured" from them. "Popular"
 * has an approved successor in the ten above. "Featured" does not — and §7
 * forbids both dropping the designation and quietly changing its meaning, so
 * inventing a mapping to "Recommended" was not an option either: that is a
 * different word making a different promise to the guest.
 *
 * It therefore survives as a compatibility preset. It renders exactly the
 * string it always rendered, through the same customer.featured key, so a
 * legacy product looks today precisely as it looked yesterday. It is absent
 * from PROMO_BADGES, so the picker never offers it; it appears there only
 * while a product still carries it, marked as legacy, so that saving an
 * untouched product cannot silently erase it either.
 */
export const LEGACY_FEATURED = {
  id: "featured", key: "customer.featured", fallback: "Featured", hue: 44, legacy: true,
};

export const PRODUCT_ATTRIBUTES = [
  { id: "spicy",         key: "attribute.spicy",         fallback: "Spicy",         hue: 8,   icon: "flame"    },
  { id: "extraSpicy",    key: "attribute.extraSpicy",    fallback: "Extra Spicy",   hue: 358, icon: "flame"    },
  { id: "vegetarian",    key: "attribute.vegetarian",    fallback: "Vegetarian",    hue: 142, icon: "leaf"     },
  { id: "vegan",         key: "attribute.vegan",         fallback: "Vegan",         hue: 158, icon: "sprout"   },
  { id: "glutenFree",    key: "attribute.glutenFree",    fallback: "Gluten-Free",   hue: 40,  icon: "wheatOff" },
  { id: "containsNuts",  key: "attribute.containsNuts",  fallback: "Contains Nuts", hue: 26,  icon: "nut"      },
  { id: "dairyFree",     key: "attribute.dairyFree",     fallback: "Dairy-Free",    hue: 205, icon: "milkOff"  },
  { id: "sugarFree",     key: "attribute.sugarFree",     fallback: "Sugar-Free",    hue: 178, icon: null       },
  { id: "highProtein",   key: "attribute.highProtein",   fallback: "High Protein",  hue: 268, icon: null       },
  { id: "caffeineFree",  key: "attribute.caffeineFree",  fallback: "Caffeine-Free", hue: 220, icon: null       },
];

/** The two kinds, named once so callers never pass a bare string. */
export const LABEL_KIND = { PROMO: "promo", ATTRIBUTE: "attribute" };

const PROMO_BY_ID = new Map(
  [...PROMO_BADGES, LEGACY_FEATURED].map((b) => [b.id, b])
);
const ATTRIBUTE_BY_ID = new Map(PRODUCT_ATTRIBUTES.map((a) => [a.id, a]));

/* ═══════════════════════════════════ Custom label storage ═════════════════
   Per restaurant, in localStorage, beside the menu it labels. One key holds
   both kinds: they are created, listed and deleted in the same places, and a
   single record keeps a rename atomic across the pair.

   Restaurant isolation is structural, not a filter — one restaurant's labels
   live under that restaurant's own key and are never read from another's
   (§6). There is no backend and nothing here syncs between devices. */

const LABELS_KEY_PREFIX = "pro_order_product_labels";
const EMPTY = { promo: [], attribute: [] };

function labelsKey(restaurantSlug) {
  return `${LABELS_KEY_PREFIX}:${restaurantSlug}`;
}

function genLabelId() {
  return `plbl_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(MENU_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    /* no window — nothing is listening anyway */
  }
}

/** One restaurant's custom labels, always both kinds, never null. */
export function getCustomLabels(restaurantSlug) {
  try {
    const raw = localStorage.getItem(labelsKey(restaurantSlug));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      promo: Array.isArray(parsed?.promo) ? parsed.promo : [],
      attribute: Array.isArray(parsed?.attribute) ? parsed.attribute : [],
    };
  } catch {
    return EMPTY;
  }
}

function saveCustomLabels(restaurantSlug, next) {
  try {
    localStorage.setItem(labelsKey(restaurantSlug), JSON.stringify(next));
  } catch {
    /* storage unavailable — same silent failure the rest of the data layer uses */
  }
  notifyChange(restaurantSlug);
}

/**
 * Create a shared custom label.
 *
 * @returns {{ok:true, label:object} | {ok:false, reason:string}}
 *   "empty_name" when neither language carries text — a chip with nothing in
 *   it is not a label, and the fallback chain has nothing to fall back to.
 */
export function createCustomLabel(restaurantSlug, kind, name) {
  const trimmed = trimLocalizedText(name);
  if (!hasLocalizedText(trimmed)) return { ok: false, reason: "empty_name" };

  const store = getCustomLabels(restaurantSlug);
  const list = store[kind] || [];
  const label = { id: genLabelId(), name: trimmed };
  saveCustomLabels(restaurantSlug, { ...store, [kind]: [...list, label] });
  return { ok: true, label };
}

/**
 * Rename a shared custom label IN PLACE.
 *
 * The id is deliberately untouched (§4/§28): every product referencing this
 * label keeps referencing it, so the new wording appears on all of them at
 * once without a single product record being written. That is the whole
 * reason products store ids rather than text.
 */
export function updateCustomLabel(restaurantSlug, kind, id, name) {
  const trimmed = trimLocalizedText(name);
  if (!hasLocalizedText(trimmed)) return { ok: false, reason: "empty_name" };

  const store = getCustomLabels(restaurantSlug);
  const list = store[kind] || [];
  if (!list.some((l) => l.id === id)) return { ok: false, reason: "not_found" };

  saveCustomLabels(restaurantSlug, {
    ...store,
    [kind]: list.map((l) => (l.id === id ? { ...l, name: trimmed } : l)),
  });
  return { ok: true };
}

/**
 * How many of this restaurant's products currently carry a label.
 *
 * Read for the deletion confirmation, so the manager is told the real blast
 * radius before anything happens rather than after (§6).
 */
export function countProductsUsingLabel(restaurantSlug, kind, id) {
  const items = getMenuItems(restaurantSlug);
  if (kind === LABEL_KIND.PROMO) {
    return items.filter((i) => i.promoBadge === id).length;
  }
  return items.filter((i) => Array.isArray(i.attributes) && i.attributes.includes(id)).length;
}

/**
 * Delete a shared custom label and every product reference to it.
 *
 * Cascade, approved explicitly by the owner (§6). The alternative — leaving
 * products pointing at a label that no longer exists — is the orphan this
 * phase is required to avoid, and resolution would silently drop the chip
 * anyway, so the reference would be a lie kept in storage.
 *
 * Products are rewritten through saveMenuItemsRaw, which writes the stored
 * list unchanged apart from the field being edited. Going through
 * getMenuItems + saveMenuItems would persist read-time normalization across
 * every product in the catalogue, producing a diff on records nobody touched
 * — the exact trap Phase 95.2 documented. ONLY products that actually carry
 * the label are rewritten; the rest are passed through by identity.
 *
 * Prices, availability, categories, customization and order history are not
 * touched here. Deleting a label deletes a label.
 */
export function deleteCustomLabel(restaurantSlug, kind, id) {
  const store = getCustomLabels(restaurantSlug);
  const list = store[kind] || [];
  if (!list.some((l) => l.id === id)) return { ok: false, reason: "not_found" };

  saveCustomLabels(restaurantSlug, { ...store, [kind]: list.filter((l) => l.id !== id) });

  let removedFrom = 0;
  saveMenuItemsRaw(restaurantSlug, (items) =>
    items.map((item) => {
      if (kind === LABEL_KIND.PROMO) {
        if (item.promoBadge !== id) return item;
        removedFrom += 1;
        return { ...item, promoBadge: null };
      }
      if (!Array.isArray(item.attributes) || !item.attributes.includes(id)) return item;
      removedFrom += 1;
      return { ...item, attributes: item.attributes.filter((a) => a !== id) };
    })
  );

  return { ok: true, removedFrom };
}

/* ═══════════════════════════════════════════════ Resolution ═══════════════ */

/**
 * The promotional badge a product should DISPLAY, or null.
 *
 * ── THE COMPATIBILITY RULE, IN ONE PLACE (§7) ────────────────────────────
 * `promoBadge` is authoritative the moment the field exists, INCLUDING when
 * it is explicitly null: a manager who cleared the badge meant it, and
 * falling back to a legacy flag there would resurrect a badge they removed.
 *
 * Only a product that has never been saved since this phase — no promoBadge
 * key at all — is read through the old flags, using the precedence the card
 * has always applied:
 *
 *     isPopular                 -> "popular"
 *     !isPopular && isFeatured  -> "featured"  (the legacy preset above)
 *
 * Nothing is written back. A guest opening the menu must not rewrite the
 * merchant's catalogue, so this is a read-time derivation exactly like the
 * localized-text fallback, and a legacy product stays legacy in storage until
 * someone actually edits it.
 *
 * @returns {{id:string, hue:number, custom:boolean, legacy:boolean,
 *            key?:string, fallback?:string, name?:object}|null}
 */
export function resolvePromoBadge(item, customLabels) {
  const raw = initialPromoBadge(item);
  if (!raw) return null;

  const preset = PROMO_BY_ID.get(raw);
  if (preset) return { ...preset, custom: false, legacy: !!preset.legacy };

  const custom = (customLabels?.promo || []).find((l) => l.id === raw);
  /* A reference whose label is gone resolves to nothing rather than to a
     blank chip. Cascade deletion means this should not happen; surviving it
     gracefully is what keeps an old menu from crashing (§28). */
  if (!custom) return null;
  return { id: custom.id, name: custom.name, hue: null, custom: true, legacy: false };
}

/**
 * Every attribute a product should display, in the order it was selected.
 *
 * Selection order is the stored order and the stored order is what renders
 * (§12): the manager decides which attributes matter most by choosing them
 * first, and a card that re-sorted them would make the three visible ones
 * unpredictable between products.
 */
/**
 * The badge id a product currently holds — the rule above, on its own.
 *
 * The Product Editor needs the same answer to seed its picker that the card
 * needs to render, and two copies of "authoritative unless the key is
 * absent" would be two places for the compatibility rule to drift.
 */
export function initialPromoBadge(item) {
  if (item?.promoBadge !== undefined) return item.promoBadge || null;
  if (item?.isPopular) return "popular";
  if (item?.isFeatured) return "featured";
  return null;
}

export function resolveAttributes(item, customLabels) {
  const ids = Array.isArray(item?.attributes) ? item.attributes : [];
  const out = [];
  for (const id of ids) {
    const preset = ATTRIBUTE_BY_ID.get(id);
    if (preset) { out.push({ ...preset, custom: false }); continue; }
    const custom = (customLabels?.attribute || []).find((l) => l.id === id);
    if (custom) out.push({ id: custom.id, name: custom.name, hue: null, icon: null, custom: true });
    /* Missing custom label: dropped, for the same reason as above. */
  }
  return out;
}

/**
 * One label's text, in the viewer's language.
 *
 * A preset goes through t(), because its wording ships with the product. A
 * custom label goes through the localized-content fallback chain, because its
 * wording is the merchant's and may exist in only one language (§4/§5/§7).
 */
export function labelText(label, t, language) {
  if (!label) return "";
  if (label.custom) return getLocalizedText(label.name, language);
  return t(label.key, label.fallback);
}
