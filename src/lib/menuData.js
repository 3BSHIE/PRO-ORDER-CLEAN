/**
 * menuData — localStorage-backed menu (categories + items) storage for the
 * demo, replacing direct edits to src/data/mockMenu.js with a real Admin
 * Menu Management interface (Phase 21).
 *
 * Why localStorage (not a static import)?
 *   mockMenu.js's CATEGORIES/MENU_ITEMS remain the *seed* data — on first
 *   load in a browser, this module copies them into localStorage once, and
 *   every read/write after that goes through here instead. This mirrors the
 *   exact same pattern already used for orders (customerOrders.js): mock
 *   storage today, a real backend API swap tomorrow, callers unaffected.
 *
 * Restaurant isolation (Phase 21 architecture review):
 *   Every function below takes a `restaurantSlug` as its first argument and
 *   reads/writes a key scoped to that restaurant alone
 *   (`pro_order_menu_categories:<slug>` / `pro_order_menu_items:<slug>`).
 *   This demo only ships one restaurant (Lumière), but the storage layer
 *   itself must never assume that — editing Lumière's menu must be
 *   physically incapable of touching any other restaurant's data, the same
 *   way two tenants in a real multi-restaurant backend would each get their
 *   own row/partition. There is no shared "global menu" key.
 *
 * Live updates across screens:
 *   Every write dispatches a "pro-order-menu-change" CustomEvent carrying
 *   { restaurantSlug } in its detail (same architecture as the language
 *   system's "pro-order-language-change"). src/lib/useMenuData.js
 *   subscribes to it and only refreshes when the event's restaurantSlug
 *   matches the one it was called with, so the customer Menu screen, Item
 *   Details Modal, Cart, and Tracking all pick up Admin's edits to *their*
 *   restaurant immediately, without a page reload — and are never disturbed
 *   by an edit happening on a different restaurant's menu.
 *
 * What is intentionally NOT touched:
 *   Orders already placed store their own frozen snapshot of item name,
 *   price, and customizations at the moment of purchase (see
 *   src/lib/customerOrders.js) — editing or deleting a menu item here never
 *   rewrites historical order data, exactly like changing a payment
 *   method's label never rewrites past receipts.
 */

import { CATEGORIES as SEED_CATEGORIES, MENU_ITEMS as SEED_ITEMS } from "../data/mockMenu.js";

const CATEGORIES_KEY_PREFIX = "pro_order_menu_categories";
const ITEMS_KEY_PREFIX = "pro_order_menu_items";

export const MENU_CHANGE_EVENT = "pro-order-menu-change";

function categoriesKey(restaurantSlug) {
  return `${CATEGORIES_KEY_PREFIX}:${restaurantSlug}`;
}
function itemsKey(restaurantSlug) {
  return `${ITEMS_KEY_PREFIX}:${restaurantSlug}`;
}

/* Generates a short, collision-safe id for anything created through this
   module (categories, items, choice groups, choice options, paid add-ons).
   Doesn't need to be pretty or sequential — it's never shown to a customer,
   only ever used as a lookup key. */
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(MENU_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

/** Seed this restaurant's localStorage slot from mockMenu.js exactly once,
    if nothing is stored yet for it. Each restaurant gets its own copy of
    the seed data — editing one never touches another's key. */
function seedIfEmpty(restaurantSlug) {
  try {
    if (localStorage.getItem(categoriesKey(restaurantSlug)) === null) {
      localStorage.setItem(categoriesKey(restaurantSlug), JSON.stringify(SEED_CATEGORIES));
    }
    if (localStorage.getItem(itemsKey(restaurantSlug)) === null) {
      localStorage.setItem(itemsKey(restaurantSlug), JSON.stringify(SEED_ITEMS));
    }
  } catch {
    // localStorage unavailable — getCategories/getMenuItems fall back to seed data directly
  }
}

/** This restaurant's categories, sorted by sortOrder (never null — falls
    back to the seed list). */
export function getCategories(restaurantSlug) {
  seedIfEmpty(restaurantSlug);
  try {
    const raw = localStorage.getItem(categoriesKey(restaurantSlug));
    const list = raw ? JSON.parse(raw) : SEED_CATEGORIES;
    return [...list].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  } catch {
    return SEED_CATEGORIES;
  }
}

/** This restaurant's menu items (never null — falls back to the seed list). */
export function getMenuItems(restaurantSlug) {
  seedIfEmpty(restaurantSlug);
  try {
    const raw = localStorage.getItem(itemsKey(restaurantSlug));
    return raw ? JSON.parse(raw) : SEED_ITEMS;
  } catch {
    return SEED_ITEMS;
  }
}

function saveCategories(restaurantSlug, categories) {
  try {
    localStorage.setItem(categoriesKey(restaurantSlug), JSON.stringify(categories));
  } catch {
    // localStorage unavailable — fail silently, matches customerOrders.js's pattern
  }
  notifyChange(restaurantSlug);
}

function saveMenuItems(restaurantSlug, items) {
  try {
    localStorage.setItem(itemsKey(restaurantSlug), JSON.stringify(items));
  } catch {
    // localStorage unavailable — fail silently
  }
  notifyChange(restaurantSlug);
}

/* ═══════════════════════════════════════════ Categories ═══════════════════ */

/**
 * @param {string} restaurantSlug
 * @param {object} data — { name, emoji, imageUrl, isActive }
 * @returns {object} the created category
 */
export function createCategory(restaurantSlug, { name, emoji, imageUrl, isActive = true }) {
  const categories = getCategories(restaurantSlug);
  const maxSort = categories.reduce((max, c) => Math.max(max, c.sortOrder || 0), 0);
  const category = {
    id: genId("cat"),
    name: (name || "").trim(),
    emoji: (emoji || "").trim() || "🍽️",
    imageUrl: (imageUrl || "").trim() || null,
    sortOrder: maxSort + 1,
    isActive: !!isActive,
  };
  saveCategories(restaurantSlug, [...categories, category]);
  return category;
}

/**
 * @param {string} restaurantSlug
 * @param {string} categoryId
 * @param {object} patch — any subset of { name, emoji, imageUrl, isActive }
 * @returns {object|null} the updated category, or null if not found
 */
export function updateCategory(restaurantSlug, categoryId, patch) {
  const categories = getCategories(restaurantSlug);
  const idx = categories.findIndex((c) => c.id === categoryId);
  if (idx === -1) return null;

  const updated = { ...categories[idx], ...patch };
  const next = categories.map((c, i) => (i === idx ? updated : c));
  saveCategories(restaurantSlug, next);
  return updated;
}

/**
 * Deletes a category — but only if no menu item still references it, to
 * avoid silently orphaning products (they'd stop appearing in the grouped
 * customer menu with no obvious explanation). The caller (Admin UI) is
 * expected to move or delete those items first.
 *
 * @param {string} restaurantSlug
 * @param {string} categoryId
 * @returns {{ok: boolean, reason?: "not_found"|"has_items", itemCount?: number}}
 */
export function deleteCategory(restaurantSlug, categoryId) {
  const categories = getCategories(restaurantSlug);
  if (!categories.some((c) => c.id === categoryId)) {
    return { ok: false, reason: "not_found" };
  }

  const itemCount = getMenuItems(restaurantSlug).filter((i) => i.categoryId === categoryId).length;
  if (itemCount > 0) {
    return { ok: false, reason: "has_items", itemCount };
  }

  saveCategories(restaurantSlug, categories.filter((c) => c.id !== categoryId));
  return { ok: true };
}

/**
 * Reorders categories by assigning sortOrder 1..N in the order of the given
 * id list. Any category id not present in the list keeps its old sortOrder
 * and is left where it was (defensive — should not normally happen).
 * @param {string} restaurantSlug
 * @param {string[]} orderedIds
 */
export function reorderCategories(restaurantSlug, orderedIds) {
  const categories = getCategories(restaurantSlug);
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
  const next = orderedIds
    .filter((id) => byId[id])
    .map((id, i) => ({ ...byId[id], sortOrder: i + 1 }));
  // append any category ids missing from orderedIds (defensive), keeping their relative order
  const includedIds = new Set(orderedIds);
  const leftovers = categories.filter((c) => !includedIds.has(c.id));
  saveCategories(restaurantSlug, [...next, ...leftovers]);
}

/**
 * Swaps a category with its immediate neighbor (up = -1, down = +1) in
 * sortOrder — the simple, reliable reorder control the Admin UI uses
 * (up/down arrow buttons) instead of drag-and-drop.
 * @param {string} restaurantSlug
 * @param {string} categoryId
 * @param {-1|1} direction
 */
export function moveCategory(restaurantSlug, categoryId, direction) {
  const categories = getCategories(restaurantSlug); // already sorted by sortOrder
  const idx = categories.findIndex((c) => c.id === categoryId);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= categories.length) return; // already at an edge

  const reordered = [...categories];
  [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
  reorderCategories(restaurantSlug, reordered.map((c) => c.id));
}

/* ═══════════════════════════════════════════ Menu items ═══════════════════ */

/**
 * @param {string} restaurantSlug
 * @param {object} data — full item shape minus id (see mockMenu.js for the
 *   canonical shape): { categoryId, name, description, price, imageUrl,
 *   isAvailable, isFeatured, isPopular, sortOrder, removableIngredients,
 *   choices, paidAddOns }
 * @returns {object} the created item
 */
export function createMenuItem(restaurantSlug, data) {
  const items = getMenuItems(restaurantSlug);
  const sameCat = items.filter((i) => i.categoryId === data.categoryId);
  const maxSort = sameCat.reduce((max, i) => Math.max(max, i.sortOrder || 0), 0);

  const item = {
    id: genId("item"),
    categoryId: data.categoryId,
    name: (data.name || "").trim(),
    description: (data.description || "").trim(),
    price: Number(data.price) || 0,
    imageUrl: (data.imageUrl || "").trim() || null,
    isAvailable: data.isAvailable !== false,
    isFeatured: !!data.isFeatured,
    isPopular: !!data.isPopular,
    sortOrder: data.sortOrder != null ? Number(data.sortOrder) : maxSort + 1,
    removableIngredients: Array.isArray(data.removableIngredients) ? data.removableIngredients : [],
    choices: Array.isArray(data.choices) ? data.choices : [],
    paidAddOns: Array.isArray(data.paidAddOns) ? data.paidAddOns : [],
  };
  saveMenuItems(restaurantSlug, [...items, item]);
  return item;
}

/**
 * @param {string} restaurantSlug
 * @param {string} itemId
 * @param {object} patch — any subset of the item fields (see createMenuItem)
 * @returns {object|null} the updated item, or null if not found
 */
export function updateMenuItem(restaurantSlug, itemId, patch) {
  const items = getMenuItems(restaurantSlug);
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return null;

  const updated = { ...items[idx], ...patch };
  if (patch.price !== undefined) updated.price = Number(patch.price) || 0;
  if (patch.sortOrder !== undefined) updated.sortOrder = Number(patch.sortOrder) || 0;

  const next = items.map((i, idx2) => (idx2 === idx ? updated : i));
  saveMenuItems(restaurantSlug, next);
  return updated;
}

/**
 * Deletes a menu item. Never touches historical orders — their line items
 * are a frozen snapshot captured at purchase time (name/price/customizations
 * already copied in full), completely independent of the live catalog.
 * @param {string} restaurantSlug
 * @param {string} itemId
 * @returns {boolean} true if an item was removed
 */
export function deleteMenuItem(restaurantSlug, itemId) {
  const items = getMenuItems(restaurantSlug);
  const next = items.filter((i) => i.id !== itemId);
  if (next.length === items.length) return false;
  saveMenuItems(restaurantSlug, next);
  return true;
}

/* ═══════════════════════════════════════ Nested-structure id helpers ══════ */
/* Small helpers for the Admin item-editor form to generate ids for new
   choice groups / choice options / paid add-ons as the admin adds rows —
   these are plain functions (no storage side effects, no restaurant scoping
   needed) since the editor keeps a draft item in local component state
   until "Save" is clicked. */

export function genChoiceGroupId() {
  return genId("choice");
}
export function genChoiceOptionId() {
  return genId("opt");
}
export function genAddOnId() {
  return genId("ao");
}

/**
 * Demo-only helper: wipe one restaurant's menu customizations and re-seed
 * from mockMenu.js. Not wired into any customer-facing UI. Only clears the
 * given restaurant's keys — never touches any other restaurant's data.
 * @param {string} restaurantSlug
 */
export function resetMenuData(restaurantSlug) {
  try {
    localStorage.removeItem(categoriesKey(restaurantSlug));
    localStorage.removeItem(itemsKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
