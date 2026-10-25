import { useState, useEffect, useCallback } from "react";
import { getCategories, getMenuItems, MENU_CHANGE_EVENT } from "./menuData.js";
import { getCustomLabels } from "./productLabels.js";

/**
 * useMenuData — React hook giving any component the live categories/items
 * list for ONE restaurant, automatically re-rendering whenever Admin Menu
 * Management writes a change (create/update/delete/reorder category or
 * item) *for that same restaurant*.
 *
 * Restaurant isolation (Phase 21 architecture review): every menu change
 * event carries { restaurantSlug } in its detail. This hook ignores any
 * event whose restaurantSlug doesn't match the one it was called with, so
 * a customer/admin screen open on one restaurant is never re-rendered (or
 * confused) by an edit happening on a different restaurant's menu.
 *
 * Phase 119.0 — the restaurant's own custom badges and attributes ride
 * along. They are menu data by every meaningful test: restaurant-scoped,
 * stored beside the items that reference them, and changed by the same Admin
 * screens that fire MENU_CHANGE_EVENT. Reading them here means one read per
 * screen instead of one per product card, and means a label renamed in the
 * editor reaches an open guest menu through the machinery that already
 * exists.
 *
 * @param {string} restaurantSlug
 * @returns {{ categories: object[], items: object[], customLabels: object,
 *             refresh: () => void }}
 */
export function useMenuData(restaurantSlug) {
  const [categories, setCategories] = useState(() => getCategories(restaurantSlug));
  const [items, setItems] = useState(() => getMenuItems(restaurantSlug));
  const [customLabels, setCustomLabels] = useState(() => getCustomLabels(restaurantSlug));

  const refresh = useCallback(() => {
    setCategories(getCategories(restaurantSlug));
    setItems(getMenuItems(restaurantSlug));
    setCustomLabels(getCustomLabels(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();
    function handleMenuChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }
    window.addEventListener(MENU_CHANGE_EVENT, handleMenuChange);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(MENU_CHANGE_EVENT, handleMenuChange);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, restaurantSlug]);

  return { categories, items, customLabels, refresh };
}
